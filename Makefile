MAKEFLAGS += --no-print-directory

CLUSTER_NAME = transcendence
ENV ?= dev

all: help

dev: generate-env-dev cluster install-nginx-ingress build load-images
	@$(MAKE) deploy ENV=dev
	@$(MAKE) setup-tls status

prod: generate-env-prod cluster install-nginx-ingress build load-images
	@$(MAKE) deploy ENV=prod
	@$(MAKE) setup-tls status

generate-env-dev:
	@bash scripts/generate-env.sh dev

generate-env-prod:
	@bash scripts/generate-env.sh prod

install-deps:
	@echo "Installing backend dependencies..."
	@cd backend && npm install
	@echo "Backend dependencies installed successfully!"

cluster:
	@echo "Creating kind cluster..."
	@if kind get clusters | grep -q $(CLUSTER_NAME); then \
		echo "Cluster already exists"; \
	else \
		kind create cluster --name $(CLUSTER_NAME) --config kind-config.yaml; \
		echo "Kind cluster created successfully!"; \
	fi

install-nginx-ingress:
	@bash scripts/setup-nginx-ingress.sh

build:
	@echo "Building Docker images..."
	@docker build -t transcendence-postgres:latest ./postgres
	@docker build -t transcendence-frontend:latest ./frontend
	@docker build -t transcendence-backend:latest ./backend
	@echo "Docker images built successfully!"

load-images:
	@echo "Loading images to kind cluster..."
	@kind load docker-image transcendence-postgres:latest --name $(CLUSTER_NAME)
	@kind load docker-image transcendence-backend:latest --name $(CLUSTER_NAME)
	@kind load docker-image transcendence-frontend:latest --name $(CLUSTER_NAME)
	@echo "Images loaded successfully!"

deploy:
	@if [ "$(ENV)" = "prod" ] || [ "$(ENV)" = "production" ]; then \
		echo "Deploying to Kubernetes (PRODUCTION mode)..."; \
		CONFIGMAP=backend-configmap-prod.yaml; \
	else \
		echo "Deploying to Kubernetes (DEVELOPMENT mode)..."; \
		CONFIGMAP=backend-configmap-dev.yaml; \
	fi; \
	cat k8s/namespace/namespace.yaml | docker exec -i transcendence-control-plane kubectl apply -f -; \
	sleep 2; \
	for file in k8s/postgres/*.yaml; do cat "$$file" | docker exec -i transcendence-control-plane kubectl apply -f - || true; done; \
	cat k8s/backend/$$CONFIGMAP | docker exec -i transcendence-control-plane kubectl apply -f -; \
	for file in k8s/backend/*.yaml; do \
		if [ "$$(basename $$file)" != "backend-configmap-dev.yaml" ] && [ "$$(basename $$file)" != "backend-configmap-prod.yaml" ]; then \
			cat "$$file" | docker exec -i transcendence-control-plane kubectl apply -f - || true; \
		fi; \
	done; \
	for file in k8s/frontend/*.yaml; do cat "$$file" | docker exec -i transcendence-control-plane kubectl apply -f - || true; done; \
	echo "Applying security policies..."; \
	cat k8s/security/network-policy.yaml | docker exec -i transcendence-control-plane kubectl apply -f -; \
	cat k8s/security/custom-headers-configmap.yaml | docker exec -i transcendence-control-plane kubectl apply -f -; \
	echo "Installing cert-manager..."; \
	curl -fsSL https://github.com/cert-manager/cert-manager/releases/download/v1.19.2/cert-manager.yaml | docker exec -i transcendence-control-plane kubectl apply -f -; \
	docker exec transcendence-control-plane kubectl wait --for=condition=ready pod -l app.kubernetes.io/instance=cert-manager -n cert-manager --timeout=120s 2>/dev/null || echo "Waiting for cert-manager..."; \
	sleep 5; \
	echo "Deploying ingress..."; \
	for file in k8s/ingress/*.yaml; do cat "$$file" | docker exec -i transcendence-control-plane kubectl apply -f - || true; done

setup-tls:
	@bash scripts/setup-tls-certificate.sh

clean:
	@echo "Cleaning up Kubernetes resources and cluster..."
	@docker exec transcendence-control-plane kubectl delete namespace transcendence --ignore-not-found=true 2>/dev/null || true
	@kind delete cluster --name $(CLUSTER_NAME) 2>/dev/null || true
	@echo "Cleanup complete!"

delete-cluster:
	@echo "Deleting kind cluster..."
	@kind delete cluster --name $(CLUSTER_NAME)

fclean: clean
	@echo "Removing Docker images..."
	@docker rmi transcendence-postgres:latest transcendence-backend:latest transcendence-frontend:latest 2>/dev/null || true
	@echo "Removing generated files..."
	@rm -f .env k8s/postgres/postgres-secret.yaml
	@echo "Removing node_modules..."
	@rm -rf backend/node_modules frontend/node_modules
	@rm -rf	.env
	@echo "Full clean complete!"

stop:
	@docker exec transcendence-control-plane kubectl scale deployment/backend --replicas=0 -n transcendence 2>/dev/null || true
	@docker exec transcendence-control-plane kubectl scale deployment/frontend --replicas=0 -n transcendence 2>/dev/null || true
	@docker exec transcendence-control-plane kubectl scale statefulset/postgres --replicas=0 -n transcendence 2>/dev/null || true
	@$(MAKE) status

start:
	@docker exec transcendence-control-plane kubectl scale deployment/backend --replicas=2 -n transcendence
	@docker exec transcendence-control-plane kubectl scale deployment/frontend --replicas=2 -n transcendence
	@docker exec transcendence-control-plane kubectl scale statefulset/postgres --replicas=1 -n transcendence
	@$(MAKE) status

status:
	@bash -c 'while true; do \
		clear; \
		echo "╔════════════════════════════════════════════════════╗"; \
		echo "║              42 LMS - CLUSTER STATUS               ║"; \
		echo "╠════════════════════════════════════════════════════╣"; \
		bc=0; fc=0; \
		docker exec transcendence-control-plane kubectl get pods -n transcendence 2>/dev/null | tail -n +2 | while IFS= read -r line; do \
			status=$$(echo "$$line" | awk "{print \$$3}"); \
			name=$$(echo "$$line" | awk "{print \$$1}"); \
			ready=$$(echo "$$line" | awk "{print \$$2}"); \
			restarts=$$(echo "$$line" | awk "{print \$$4}"); \
			if echo "$$name" | grep -q "backend"; then \
				bc=$$((bc + 1)); \
				short_name="backend-$$bc"; \
			elif echo "$$name" | grep -q "frontend"; then \
				fc=$$((fc + 1)); \
				short_name="frontend-$$fc"; \
			elif echo "$$name" | grep -q "postgres"; then \
				short_name="postgres"; \
			else \
				short_name="$$name"; \
			fi; \
			if [ "$$ready" = "1/1" ]; then \
				ready_icon="✓"; \
			else \
				ready_icon="✗"; \
			fi; \
			if [ "$$status" = "Running" ]; then \
				printf "║ ✅ %-15s %-2s %-18s   🔄 %-2s    ║\n" "$$short_name" "$$ready_icon" "$$status" "$$restarts"; \
			elif [ "$$status" = "Pending" ] || [ "$$status" = "ContainerCreating" ]; then \
				printf "║ ⏳ %-15s %-2s %-18s   🔄 %-2s    ║\n" "$$short_name" "$$ready_icon" "$$status" "$$restarts"; \
			else \
				printf "║ ❌ %-15s %-2s %-18s   🔄 %-2s    ║\n" "$$short_name" "$$ready_icon" "$$status" "$$restarts"; \
			fi; \
		done || echo "║ ⚠️  No pods found                                  ║"; \
		echo "╠════════════════════════════════════════════════════╣"; \
		echo "║  CTRL+C to exit  │  Refreshing every 3 seconds     ║"; \
		echo "╚════════════════════════════════════════════════════╝"; \
		sleep 3; \
	done'

logs-backend:
	@docker exec transcendence-control-plane kubectl logs -n transcendence -l app=backend --tail=100 -f

logs-frontend:
	@docker exec transcendence-control-plane kubectl logs -n transcendence -l app=frontend --tail=100 -f

logs-postgres:
	@docker exec transcendence-control-plane kubectl logs -n transcendence -l app=postgres --tail=100 -f

rebuild-backend:
	@echo "Rebuilding backend..."
	@docker build -t transcendence-backend:latest ./backend
	@kind load docker-image transcendence-backend:latest --name $(CLUSTER_NAME)
	@docker exec transcendence-control-plane kubectl delete pod -l app=backend -n transcendence
	@echo "Backend rebuilt and restarted"
	@$(MAKE) status

rebuild-frontend:
	@echo "Rebuilding frontend..."
	@docker build -t transcendence-frontend:latest ./frontend
	@kind load docker-image transcendence-frontend:latest --name $(CLUSTER_NAME)
	@docker exec transcendence-control-plane kubectl delete pod -l app=frontend -n transcendence
	@echo "Frontend rebuilt and restarted"
	@$(MAKE) status

rebuild-postgres:
	@echo "Rebuilding postgres..."
	@docker build -t transcendence-postgres:latest ./postgres
	@kind load docker-image transcendence-postgres:latest --name $(CLUSTER_NAME)
	@docker exec transcendence-control-plane kubectl delete pod -l app=postgres -n transcendence
	@echo "Postgres rebuilt and restarted"
	@$(MAKE) status

shell-backend:
	@docker exec -it transcendence-control-plane kubectl exec -it -n transcendence $$(docker exec transcendence-control-plane kubectl get pod -n transcendence -l app=backend -o jsonpath='{.items[0].metadata.name}') -- sh

shell-frontend:
	@docker exec -it transcendence-control-plane kubectl exec -it -n transcendence $$(docker exec transcendence-control-plane kubectl get pod -n transcendence -l app=frontend -o jsonpath='{.items[0].metadata.name}') -- sh

shell-postgres:
	@docker exec -it transcendence-control-plane kubectl exec -it -n transcendence $$(docker exec transcendence-control-plane kubectl get pod -n transcendence -l app=postgres -o jsonpath='{.items[0].metadata.name}') -- psql -U transcendence

help:
	@echo "╔════════════════════════════════════════════════════╗"
	@echo "║                 MAKEFILE COMMANDS                  ║"
	@echo "╠════════════════════════════════════════════════════╣"
	@echo "║ 🚀 DEPLOYMENT                                      ║"
	@echo "║   make dev      - Deploy in development mode       ║"
	@echo "║   make prod     - Deploy in production mode        ║"
	@echo "╠════════════════════════════════════════════════════╣"
	@echo "║ 🎮 CONTROL                                         ║"
	@echo "║   make start    - Start all pods                   ║"
	@echo "║   make stop     - Stop all pods                    ║"
	@echo "║   make status   - Live cluster status              ║"
	@echo "╠════════════════════════════════════════════════════╣"
	@echo "║ 🔧 REBUILD                                         ║"
	@echo "║   make install-deps      - Install backend deps    ║"
	@echo "║   make rebuild-backend   - Rebuild backend         ║"
	@echo "║   make rebuild-frontend  - Rebuild frontend        ║"
	@echo "║   make rebuild-postgres  - Rebuild postgres        ║"
	@echo "╠════════════════════════════════════════════════════╣"
	@echo "║ 📋 LOGS & DEBUG                                    ║"
	@echo "║   make logs-backend   - Stream backend logs        ║"
	@echo "║   make logs-frontend  - Stream frontend logs       ║"
	@echo "║   make logs-postgres  - Stream postgres logs       ║"
	@echo "║   make shell-backend  - Backend shell access       ║"
	@echo "║   make shell-frontend - Frontend shell access      ║"
	@echo "║   make shell-postgres - Postgres psql access       ║"
	@echo "╠════════════════════════════════════════════════════╣"
	@echo "║ 🧹 CLEANUP                                         ║"
	@echo "║   make clean    - Delete namespace and cluster     ║"
	@echo "║   make fclean   - Full cleanup                     ║"
	@echo "╚════════════════════════════════════════════════════╝"

.PHONY: all dev prod generate-env-dev generate-env-prod install-deps cluster install-nginx-ingress \
	build load-images deploy setup-tls stop start clean delete-cluster fclean status \
	logs-backend logs-frontend logs-postgres \
	rebuild-backend rebuild-frontend rebuild-postgres \
	shell-backend shell-frontend shell-postgres help
