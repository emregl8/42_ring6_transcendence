#!/bin/bash

set -e

NAMESPACE="transcendence"
VAULT_POD="vault-0"
VAULT_KEYS_FILE=".vault-keys.json"
ENV_FILE=".env"

if [[ ! -f "${VAULT_KEYS_FILE}" ]]; then
    echo "ERROR: Vault keys file not found"
    exit 1
fi
VAULT_TOKEN=$(cat ${VAULT_KEYS_FILE} | jq -r '.admin_token')
exec_vault() {
    kubectl exec -n "${NAMESPACE}" "${VAULT_POD}" -- sh -c "export VAULT_TOKEN='${VAULT_TOKEN}' VAULT_ADDR='https://127.0.0.1:8200' VAULT_CACERT='/vault/tls/ca.crt' && $*"
}

get_env_val() {
    grep "^$1=" "${ENV_FILE}" | cut -d= -f2- | tr -d '"' | tr -d "'" | tr -d '\r' | sed 's/[[:space:]]*$//'
}

echo "Storing secrets..."

DB_USER=$(get_env_val "POSTGRES_USER")
DB_PASS=$(get_env_val "POSTGRES_PASSWORD")
DB_NAME=$(get_env_val "POSTGRES_DB")

exec_vault "vault kv put secret/database/postgres POSTGRES_USER='$DB_USER' POSTGRES_PASSWORD='$DB_PASS' POSTGRES_DB='$DB_NAME'"

JWT=$(get_env_val "JWT_SECRET")
CLIENT_ID=$(get_env_val "OAUTH_42_CLIENT_ID")
CLIENT_SECRET=$(get_env_val "OAUTH_42_CLIENT_SECRET")
PEPPER=$(get_env_val "REFRESH_TOKEN_PEPPER")
R_PASS=$(get_env_val "REDIS_PASSWORD")

exec_vault "vault kv put secret/application/config JWT_SECRET='$JWT' OAUTH_42_CLIENT_ID='$CLIENT_ID' OAUTH_42_CLIENT_SECRET='$CLIENT_SECRET' REFRESH_TOKEN_PEPPER='$PEPPER' REDIS_PASSWORD='$R_PASS'"

echo "Done!"
