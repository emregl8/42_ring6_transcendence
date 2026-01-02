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

echo "Configuring Kubernetes authentication..."
KUBERNETES_HOST="https://kubernetes.default.svc"

exec_vault "${NAMESPACE}" "${VAULT_POD}" "VAULT_TOKEN=${VAULT_TOKEN} VAULT_CACERT=/vault/tls/ca.crt vault write auth/kubernetes/config kubernetes_host='${KUBERNETES_HOST}' kubernetes_ca_cert=@/var/run/secrets/kubernetes.io/serviceaccount/ca.crt"

echo "Creating Vault policy for backend..."
POLICY='path "secret/data/database/*" {
  capabilities = ["read", "list"]
}

path "secret/data/application/*" {
  capabilities = ["read", "list"]
}'
vault_policy_write "${NAMESPACE}" "${VAULT_POD}" "${VAULT_TOKEN}" "backend-policy" "$POLICY"

echo "Creating Kubernetes auth role for backend..."
vault_write "${NAMESPACE}" "${VAULT_POD}" "${VAULT_TOKEN}" "auth/kubernetes/role/backend" \
	"bound_service_account_names=backend" \
	"bound_service_account_namespaces=${NAMESPACE}" \
	"policies=backend-policy" \
	"ttl=24h"

echo "Enabling audit logging..."
vault_exec_cmd "${NAMESPACE}" "${VAULT_POD}" "${VAULT_TOKEN}" "vault audit enable file file_path=/vault/data/audit.log" || echo "Warning: Audit logging setup failed"

echo "Kubernetes authentication configured!"
