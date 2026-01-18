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

echo "Creating Kubernetes Secret from Vault..."
kubectl create secret generic postgres-secret \
	--from-literal=POSTGRES_USER="${POSTGRES_USER}" \
	--from-literal=POSTGRES_PASSWORD="${POSTGRES_PASSWORD}" \
	--from-literal=POSTGRES_DB="${POSTGRES_DB}" \
	--namespace=${NAMESPACE} \
	--dry-run=client -o yaml | kubectl apply -f - >/dev/null

echo "Kubernetes Secret created successfully!"
