#!/bin/bash

set -Eeuo pipefail

NAMESPACE="transcendence"
VAULT_POD="vault-0"
VAULT_KEYS_FILE=".vault-keys.json"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_FILE="$PROJECT_ROOT/.env"

source "${SCRIPT_DIR}/vault-helpers.sh"

if [ ! -f "${ENV_FILE}" ]; then
	echo "ERROR: .env file not found at $ENV_FILE" >&2
	exit 1
fi

VAULT_TOKEN=$(get_admin_token "${NAMESPACE}" "${VAULT_POD}" "${VAULT_KEYS_FILE}") || {
	echo "ERROR: Valid admin token not available." >&2
	exit 1
}

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

if [ -z "$POSTGRES_USER" ] || [ -z "$POSTGRES_PASSWORD" ] || [ -z "$POSTGRES_DB" ]; then
	echo "ERROR: Missing required database variables in $ENV_FILE" >&2
	exit 1
fi

vault_kv_put "${NAMESPACE}" "${VAULT_POD}" "${VAULT_TOKEN}" "secret/database/postgres" \
	"POSTGRES_USER=\"${POSTGRES_USER}\"" \
	"POSTGRES_PASSWORD=\"${POSTGRES_PASSWORD}\"" \
	"POSTGRES_DB=\"${POSTGRES_DB}\""

echo "Storing application configuration in Vault..."
APP_VARS=$(parse_env_file "${ENV_FILE}" | grep -E '^(JWT_SECRET|OAUTH_42_CLIENT_ID|OAUTH_42_CLIENT_SECRET|REFRESH_TOKEN_PEPPER)=')
JWT_SECRET=$(echo "$APP_VARS" | grep '^JWT_SECRET=' | cut -d= -f2-)
OAUTH_42_CLIENT_ID=$(echo "$APP_VARS" | grep '^OAUTH_42_CLIENT_ID=' | cut -d= -f2-)
OAUTH_42_CLIENT_SECRET=$(echo "$APP_VARS" | grep '^OAUTH_42_CLIENT_SECRET=' | cut -d= -f2-)
REFRESH_TOKEN_PEPPER=$(echo "$APP_VARS" | grep '^REFRESH_TOKEN_PEPPER=' | cut -d= -f2-)

vault_kv_put "${NAMESPACE}" "${VAULT_POD}" "${VAULT_TOKEN}" "secret/application/config" \
	"JWT_SECRET=\"${JWT_SECRET}\"" \
	"OAUTH_42_CLIENT_ID=\"${OAUTH_42_CLIENT_ID}\"" \
	"OAUTH_42_CLIENT_SECRET=\"${OAUTH_42_CLIENT_SECRET}\"" \
	"REFRESH_TOKEN_PEPPER=\"${REFRESH_TOKEN_PEPPER}\""

echo "Secrets stored in Vault successfully!"