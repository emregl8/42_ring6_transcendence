MAKEFLAGS += --no-print-directory
CLUSTER_NAME = transcendence

all: help

dev:
	@./scripts/dev.sh

stop:
	@docker exec transcendence-control-plane kubectl scale deployment/backend --replicas=0 -n transcendence 2>/dev/null || true
	@docker exec transcendence-control-plane kubectl scale deployment/frontend --replicas=0 -n transcendence 2>/dev/null || true
	@docker exec transcendence-control-plane kubectl scale statefulset/postgres --replicas=0 -n transcendence 2>/dev/null || true
	@docker exec transcendence-control-plane kubectl scale statefulset/vault --replicas=0 -n transcendence 2>/dev/null || true
	@$(MAKE) status

start:
	@docker exec transcendence-control-plane kubectl scale statefulset/vault --replicas=1 -n transcendence
	@sleep 10
	@docker exec transcendence-control-plane kubectl scale deployment/backend --replicas=2 -n transcendence
	@docker exec transcendence-control-plane kubectl scale deployment/frontend --replicas=2 -n transcendence
	@docker exec transcendence-control-plane kubectl scale statefulset/postgres --replicas=1 -n transcendence
	@$(MAKE) status

status:
	@./scripts/status.sh

logs-backend:
	@docker exec transcendence-control-plane kubectl logs -n transcendence -l app=backend --tail=100 -f

logs-frontend:
	@docker exec transcendence-control-plane kubectl logs -n transcendence -l app=frontend --tail=100 -f

logs-postgres:
	@docker exec transcendence-control-plane kubectl logs -n transcendence -l app=postgres --tail=100 -f

logs-vault:
	@docker exec transcendence-control-plane kubectl logs -n transcendence -l app=vault --tail=100 -f

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

shell-vault:
	@docker exec -it transcendence-control-plane kubectl exec -it -n transcendence vault-0 -- sh

clean:
	@echo "Cleaning up Kubernetes resources and cluster..."
	@docker exec transcendence-control-plane kubectl delete namespace transcendence --ignore-not-found=true --timeout=60s 2>/dev/null || true
	@docker exec transcendence-control-plane kubectl delete pvc --all -n transcendence 2>/dev/null || true
	@kind delete cluster --name $(CLUSTER_NAME) 2>/dev/null || true
	@echo "Cleanup complete!"

fclean: clean
	@echo "Removing Docker images..."
	@docker rmi transcendence-postgres:latest transcendence-backend:latest transcendence-frontend:latest 2>/dev/null || true
	@echo "Removing generated files..."
	@rm -f .env .vault-keys.json
	@echo "Removing node_modules..."
	@rm -rf backend/node_modules frontend/node_modules
	@echo "Full clean complete!"

help:
	@echo "╔════════════════════════════════════════════════════╗"
	@echo "║                 MAKEFILE COMMANDS                  ║"
	@echo "╠════════════════════════════════════════════════════╣"
	@echo "║ 🚀 DEPLOYMENT                                      ║"
	@echo "║   make dev      - Deploy cluster                   ║"
	@echo "╠════════════════════════════════════════════════════╣"
	@echo "║ 🎮 CONTROL                                         ║"
	@echo "║   make start        - Start all pods               ║"
	@echo "║   make stop         - Stop all pods                ║"
	@echo "║   make status       - Live cluster status          ║"
	@echo "╠════════════════════════════════════════════════════╣"
	@echo "║ 🔧 MAINTENANCE                                     ║"
	@echo "║   make install-deps      - Install backend deps    ║"
	@echo "║   make rebuild-backend   - Rebuild backend         ║"
	@echo "║   make rebuild-frontend  - Rebuild frontend        ║"
	@echo "║   make rebuild-postgres  - Rebuild postgres        ║"
	@echo "╠════════════════════════════════════════════════════╣"
	@echo "║ 📋 LOGS & DEBUG                                    ║"
	@echo "║   make logs-backend   - Stream backend logs        ║"
	@echo "║   make logs-frontend  - Stream frontend logs       ║"
	@echo "║   make logs-postgres  - Stream postgres logs       ║"
	@echo "║   make logs-vault     - Stream vault logs          ║"
	@echo "║   make shell-backend  - Backend shell access       ║"
	@echo "║   make shell-frontend - Frontend shell access      ║"
	@echo "║   make shell-postgres - Postgres psql access       ║"
	@echo "║   make shell-vault    - Vault shell access         ║"
	@echo "╠════════════════════════════════════════════════════╣"
	@echo "║ 🧹 CLEANUP                                         ║"
	@echo "║   make clean    - Delete namespace and cluster     ║"
	@echo "║   make fclean   - Full cleanup                     ║"
	@echo "╚════════════════════════════════════════════════════╝"

.PHONY: all dev stop start clean fclean status \
	logs-backend logs-frontend logs-postgres logs-vault \
	rebuild-backend rebuild-frontend rebuild-postgres \
	shell-backend shell-frontend shell-postgres shell-vault help
