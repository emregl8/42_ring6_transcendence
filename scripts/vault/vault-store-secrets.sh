#!/bin/bash

set -e

NAMESPACE="transcendence"
VAULT_POD="vault-0"
VAULT_KEYS_FILE=".vault-keys.json"
ENV_FILE=".env"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/vault-helpers.sh"

if [ ! -f "${ENV_FILE}" ]; then
	echo "ERROR: .env file not found."
	exit 1
fi

VAULT_TOKEN=$(get_admin_token "${NAMESPACE}" "${VAULT_POD}" "${VAULT_KEYS_FILE}")
if [ $? -ne 0 ]; then
	echo "ERROR: Valid admin token not available."
	exit 1
fi

parse_env_file() {
	local file="$1"
	grep -v '^#' "$file" | grep -v '^[[:space:]]*$' | while IFS='=' read -r key value; do
		key=$(echo "$key" | xargs)
		value=$(echo "$value" | xargs | sed 's/^["'"'"']//' | sed 's/["'"'"']$//')
		echo "${key}=${value}"
	done
}

echo "Storing database secrets in Vault..."
DB_VARS=$(parse_env_file "${ENV_FILE}" | grep -E '^POSTGRES_')
POSTGRES_USER=$(echo "$DB_VARS" | grep '^POSTGRES_USER=' | cut -d= -f2-)
POSTGRES_PASSWORD=$(echo "$DB_VARS" | grep '^POSTGRES_PASSWORD=' | cut -d= -f2-)
POSTGRES_DB=$(echo "$DB_VARS" | grep '^POSTGRES_DB=' | cut -d= -f2-)
vault_kv_put "${NAMESPACE}" "${VAULT_POD}" "${VAULT_TOKEN}" "secret/database/postgres" \
	"POSTGRES_USER=\"${POSTGRES_USER}\"" \
	"POSTGRES_PASSWORD=\"${POSTGRES_PASSWORD}\"" \
	"POSTGRES_DB=\"${POSTGRES_DB}\""

echo "Storing application configuration in Vault..."
APP_VARS=$(parse_env_file "${ENV_FILE}" | grep -E '^(DB_HOST|DB_PORT|NODE_ENV|ALLOWED_ORIGINS)=')
DB_HOST=$(echo "$APP_VARS" | grep '^DB_HOST=' | cut -d= -f2-)
DB_PORT=$(echo "$APP_VARS" | grep '^DB_PORT=' | cut -d= -f2-)
NODE_ENV=$(echo "$APP_VARS" | grep '^NODE_ENV=' | cut -d= -f2-)
ALLOWED_ORIGINS=$(echo "$APP_VARS" | grep '^ALLOWED_ORIGINS=' | cut -d= -f2-)
vault_kv_put "${NAMESPACE}" "${VAULT_POD}" "${VAULT_TOKEN}" "secret/application/config" \
	"DB_HOST=\"${DB_HOST}\"" \
	"DB_PORT=\"${DB_PORT}\"" \
	"NODE_ENV=\"${NODE_ENV}\"" \
	"ALLOWED_ORIGINS=\"${ALLOWED_ORIGINS}\""

echo "Secrets stored in Vault successfully!"
