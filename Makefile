MAKEFLAGS += --no-print-directory
NAMESPACE = transcendence

all: help

dev:
	@./scripts/dev.sh

stop:
	@kubectl scale deployment/backend --replicas=0 -n $(NAMESPACE) 2>/dev/null || true
	@kubectl scale deployment/frontend --replicas=0 -n $(NAMESPACE) 2>/dev/null || true
	@kubectl scale statefulset/postgres --replicas=0 -n $(NAMESPACE) 2>/dev/null || true
	@kubectl scale statefulset/vault --replicas=0 -n $(NAMESPACE) 2>/dev/null || true
	@kubectl scale statefulset/redis --replicas=0 -n $(NAMESPACE) 2>/dev/null || true
	@$(MAKE) status

start:
	@kubectl scale statefulset/vault --replicas=1 -n $(NAMESPACE)
	@sleep 10
	@kubectl scale statefulset/postgres --replicas=1 -n $(NAMESPACE)
	@kubectl scale statefulset/redis --replicas=1 -n $(NAMESPACE)
	@kubectl scale deployment/backend --replicas=1 -n $(NAMESPACE)
	@kubectl scale deployment/frontend --replicas=1 -n $(NAMESPACE)
	@$(MAKE) status

status:
	@./scripts/status.sh

logs-backend:
	@kubectl logs -n $(NAMESPACE) -l app=backend --tail=100 -f

logs-frontend:
	@kubectl logs -n $(NAMESPACE) -l app=frontend --tail=100 -f

logs-postgres:
	@kubectl logs -n $(NAMESPACE) -l app=postgres --tail=100 -f

logs-vault:
	@kubectl logs -n $(NAMESPACE) -l app=vault --tail=100 -f

logs-redis:
	@kubectl logs -n $(NAMESPACE) -l app=redis --tail=100 -f

fix:
	@if [ ! -d "backend/node_modules" ]; then \
		echo "Installing backend dependencies..."; \
		cd backend && npm install; \
	fi
	@echo "Running lint fix..."
	@cd backend && npm run lint:fix
	@echo "Running prettier format..."
	@cd backend && npm run format

rebuild-backend:
	@echo "Rebuilding backend..."
	@docker build -t transcendence-backend:latest ./backend
	@docker save transcendence-backend:latest | sudo k3s ctr images import -
	@kubectl delete pod -l app=backend -n $(NAMESPACE)
	@echo "Backend rebuilt and restarted"

rebuild-frontend:
	@echo "Rebuilding frontend..."
	@docker build -t transcendence-frontend:latest ./frontend
	@docker save transcendence-frontend:latest | sudo k3s ctr images import -
	@kubectl delete pod -l app=frontend -n $(NAMESPACE)
	@echo "Frontend rebuilt and restarted"

rebuild-postgres:
	@echo "Rebuilding postgres..."
	@docker build -t transcendence-postgres:latest ./postgres
	@docker save transcendence-postgres:latest | sudo k3s ctr images import -
	@kubectl delete pod -l app=postgres -n $(NAMESPACE)
	@echo "Postgres rebuilt and restarted"
	@$(MAKE) status

shell-backend:
	@kubectl exec -it -n $(NAMESPACE) $$(kubectl get pod -n $(NAMESPACE) -l app=backend -o jsonpath='{.items[0].metadata.name}') -- sh

shell-frontend:
	@kubectl exec -it -n $(NAMESPACE) $$(kubectl get pod -n $(NAMESPACE) -l app=frontend -o jsonpath='{.items[0].metadata.name}') -- sh

shell-postgres:
	@kubectl exec -it -n $(NAMESPACE) $$(kubectl get pod -n $(NAMESPACE) -l app=postgres -o jsonpath='{.items[0].metadata.name}') -- psql -U transcendence

shell-vault:
	@kubectl exec -it -n $(NAMESPACE) vault-0 -- sh

clean:
	@echo "Force stopping all workloads..."
	@kubectl delete deployment,statefulset,pod,job,daemonset --all -n $(NAMESPACE) --ignore-not-found=true --force --grace-period=0 --wait=false >/dev/null 2>&1 || true
	@echo "Cleaning up secrets and certs..."
	@kubectl delete secret --all -n $(NAMESPACE) --ignore-not-found=true --wait=false >/dev/null 2>&1 || true
	@kubectl delete certificate --all -n $(NAMESPACE) --ignore-not-found=true --wait=false >/dev/null 2>&1 || true
	@kubectl delete clusterissuer selfsigned-issuer --ignore-not-found=true --wait=false >/dev/null 2>&1 || true
	@echo "Cleaning up PVCs..."
	@kubectl get pvc -n $(NAMESPACE) -o name 2>/dev/null | xargs -r -I {} kubectl patch {} -n $(NAMESPACE) -p '{"metadata":{"finalizers":[]}}' --type=merge >/dev/null 2>&1 || true
	@kubectl delete pvc --all -n $(NAMESPACE) --ignore-not-found=true --force --grace-period=0 --wait=false >/dev/null 2>&1 || true
	@echo "Deleting namespace..."
	@kubectl delete namespace $(NAMESPACE) --ignore-not-found=true --wait=false >/dev/null 2>&1 || true
	@echo "Waiting for namespace to disappear..."
	@for i in $$(seq 1 30); do \
		if ! kubectl get ns $(NAMESPACE) >/dev/null 2>&1; then echo "Namespace deleted."; break; fi; \
		kubectl patch ns $(NAMESPACE) -p '{"metadata":{"finalizers":[]}}' --type=merge >/dev/null 2>&1 || true; \
		kubectl delete ns $(NAMESPACE) --ignore-not-found=true --grace-period=0 --force >/dev/null 2>&1 || true; \
		sleep 2; \
	done
	@echo "Cleanup complete!"

fclean: clean
	@echo "Removing Docker images..."
	@docker rmi transcendence-postgres:latest transcendence-backend:latest transcendence-frontend:latest redis:7-alpine 2>/dev/null || true
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
	@echo "║   make dev      - Deploy to k3s                    ║"
	@echo "╠════════════════════════════════════════════════════╣"
	@echo "║ 🎮 CONTROL                                         ║"
	@echo "║   make start        - Start all pods               ║"
	@echo "║   make stop         - Stop all pods                ║"
	@echo "║   make status       - Live cluster status          ║"
	@echo "╠════════════════════════════════════════════════════╣"
	@echo "║ 🔧 MAINTENANCE                                     ║"
	@echo "║   make rebuild-backend   - Rebuild backend         ║"
	@echo "║   make rebuild-frontend  - Rebuild frontend        ║"
	@echo "║   make rebuild-postgres  - Rebuild postgres        ║"
	@echo "╠════════════════════════════════════════════════════╣"
	@echo "║ 📋 LOGS & DEBUG                                    ║"
	@echo "║   make logs-backend   - Stream backend logs        ║"
	@echo "║   make logs-frontend  - Stream frontend logs       ║"
	@echo "║   make logs-postgres  - Stream postgres logs       ║"
	@echo "║   make logs-vault     - Stream vault logs          ║"
	@echo "║   make logs-redis     - Stream redis logs          ║"
	@echo "║   make shell-backend  - Backend shell access       ║"
	@echo "║   make shell-frontend - Frontend shell access      ║"
	@echo "║   make shell-postgres - Postgres psql access       ║"
	@echo "║   make shell-vault    - Vault shell access         ║"
	@echo "╠════════════════════════════════════════════════════╣"
	@echo "║ ✨ QUALITY                                         ║"
	@echo "║   make fix            - Lint fix + format          ║"
	@echo "╠════════════════════════════════════════════════════╣"
	@echo "║ 🧹 CLEANUP                                         ║"
	@echo "║   make clean    - Delete namespace                 ║"
	@echo "║   make fclean   - Full cleanup                     ║"
	@echo "╚════════════════════════════════════════════════════╝"

.PHONY: all dev stop start clean fclean status \
	logs-backend logs-frontend logs-postgres logs-vault logs-redis \
	fix rebuild-backend rebuild-frontend rebuild-postgres \
	shell-backend shell-frontend shell-postgres shell-vault help
