#!/bin/bash

set -e

NAMESPACE="transcendence"
VAULT_POD="vault-0"
VAULT_KEYS_FILE=".vault-keys.json"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/vault-helpers.sh"

VAULT_TOKEN=$(get_admin_token "${NAMESPACE}" "${VAULT_POD}" "${VAULT_KEYS_FILE}")
if [ $? -ne 0 ]; then
	echo "ERROR: Valid admin token not available."
	exit 1
fi

echo "Fetching database credentials from Vault..."
DB_SECRETS=$(vault_kv_get "${NAMESPACE}" "${VAULT_POD}" "${VAULT_TOKEN}" "secret/database/postgres")

POSTGRES_USER=$(printf '%s' "$DB_SECRETS" | jq -r '.data.data.POSTGRES_USER')
POSTGRES_PASSWORD=$(printf '%s' "$DB_SECRETS" | jq -r '.data.data.POSTGRES_PASSWORD')
POSTGRES_DB=$(printf '%s' "$DB_SECRETS" | jq -r '.data.data.POSTGRES_DB')

echo "Creating Kubernetes postgres-secret from Vault..."
kubectl create secret generic postgres-secret \
	--from-literal=POSTGRES_USER="${POSTGRES_USER}" \
	--from-literal=POSTGRES_PASSWORD="${POSTGRES_PASSWORD}" \
	--from-literal=POSTGRES_DB="${POSTGRES_DB}" \
	--namespace=${NAMESPACE} \
	--dry-run=client -o yaml | kubectl apply -f - >/dev/null

echo "Fetching application config from Vault..."
APP_SECRETS=$(vault_kv_get "${NAMESPACE}" "${VAULT_POD}" "${VAULT_TOKEN}" "secret/application/config")
REDIS_PASSWORD=$(printf '%s' "$APP_SECRETS" | jq -r '.data.data.REDIS_PASSWORD')

if [ -z "$REDIS_PASSWORD" ] || [ "$REDIS_PASSWORD" = "null" ]; then
    echo "Warning: REDIS_PASSWORD not found in Vault, skipping redis-secret creation."
else
    echo "Creating Kubernetes redis-secret from Vault..."
    kubectl create secret generic redis-secret \
        --from-literal=REDIS_PASSWORD="${REDIS_PASSWORD}" \
        --namespace=${NAMESPACE} \
        --dry-run=client -o yaml | kubectl apply -f - >/dev/null
fi

echo "Kubernetes Secrets created successfully!"