#!/bin/bash

set -Eeuo pipefail

umask 077

NAMESPACE="transcendence"
PODS=("vault-0")
VAULT_KEYS_FILE=".vault-keys.json"

if [[ -f "${VAULT_KEYS_FILE}" ]]; then
	CURRENT_PERM=$(stat -c '%a' "${VAULT_KEYS_FILE}" 2>/dev/null || stat -f '%A' "${VAULT_KEYS_FILE}" 2>/dev/null)
	if [[ "$CURRENT_PERM" != "600" ]]; then
		echo "ERROR: ${VAULT_KEYS_FILE} has insecure permissions ($CURRENT_PERM). Setting to 600..." >&2
		chmod 600 "${VAULT_KEYS_FILE}"
	fi
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/vault-helpers.sh"

for pod in "${PODS[@]}"; do
	kubectl wait --for=condition=ready pod/${pod} -n ${NAMESPACE} --timeout=120s
done

INIT_STATUS=$(exec_vault "${NAMESPACE}" "${PODS[0]}" "VAULT_CACERT=/vault/tls/ca.crt vault status -format=json || true" 2>/dev/null | jq -r '.initialized' || echo "false")

get_json_value() {
	field="$1"
	jq -r "$field" "${VAULT_KEYS_FILE}" 2>/dev/null | tr -d '\r\n'
	return $?
}

if [[ "$INIT_STATUS" == "true" ]] && [[ ! -f "${VAULT_KEYS_FILE}" ]]; then
	echo "ERROR: Vault is initialized but keys file is missing!" >&2
	exit 1
fi

if [[ "$INIT_STATUS" == "false" ]]; then
	exec_vault "${NAMESPACE}" "${PODS[0]}" "VAULT_CACERT=/vault/tls/ca.crt vault operator init -key-shares=5 -key-threshold=3 -format=json" >${VAULT_KEYS_FILE}
	chmod 600 ${VAULT_KEYS_FILE}
	echo "Vault initialized."
fi

ROOT_TOKEN=$(get_json_value '.root_token // empty')
ADMIN_TOKEN=$(get_json_value '.admin_token // empty')

UNSEAL_KEY_1=$(get_json_value '.unseal_keys_b64[0] // empty')
UNSEAL_KEY_2=$(get_json_value '.unseal_keys_b64[1] // empty')
UNSEAL_KEY_3=$(get_json_value '.unseal_keys_b64[2] // empty')

if [[ -n "$UNSEAL_KEY_1" ]] && [[ -n "$UNSEAL_KEY_2" ]] && [[ -n "$UNSEAL_KEY_3" ]]; then
	TMP_UNSEAL_DIR=$(mktemp -d)
	chmod 700 "$TMP_UNSEAL_DIR"
	printf '%s' "$UNSEAL_KEY_1" >"$TMP_UNSEAL_DIR/key-1"
	printf '%s' "$UNSEAL_KEY_2" >"$TMP_UNSEAL_DIR/key-2"
	printf '%s' "$UNSEAL_KEY_3" >"$TMP_UNSEAL_DIR/key-3"
	chmod 600 "$TMP_UNSEAL_DIR/key-1" "$TMP_UNSEAL_DIR/key-2" "$TMP_UNSEAL_DIR/key-3"

	kubectl create secret generic vault-unseal-keys \
		-n ${NAMESPACE} \
		--from-file=key-1="$TMP_UNSEAL_DIR/key-1" \
		--from-file=key-2="$TMP_UNSEAL_DIR/key-2" \
		--from-file=key-3="$TMP_UNSEAL_DIR/key-3" \
		--dry-run=client -o yaml | kubectl apply -f - >/dev/null

	rm -rf "$TMP_UNSEAL_DIR"
fi

if [[ -z "$UNSEAL_KEY_1" ]] || [[ -z "$UNSEAL_KEY_2" ]] || [[ -z "$UNSEAL_KEY_3" ]]; then
	echo "ERROR: Unseal keys not found in ${VAULT_KEYS_FILE}!" >&2
	exit 1
fi

exec_vault "${NAMESPACE}" "${PODS[0]}" "VAULT_CACERT=/vault/tls/ca.crt vault operator unseal '$UNSEAL_KEY_1'" >/dev/null
exec_vault "${NAMESPACE}" "${PODS[0]}" "VAULT_CACERT=/vault/tls/ca.crt vault operator unseal '$UNSEAL_KEY_2'" >/dev/null
exec_vault "${NAMESPACE}" "${PODS[0]}" "VAULT_CACERT=/vault/tls/ca.crt vault operator unseal '$UNSEAL_KEY_3'" >/dev/null

if [[ -z "$ROOT_TOKEN" ]]; then
	echo "ERROR: Root token not found in ${VAULT_KEYS_FILE}!" >&2
	exit 1
fi

exec_vault_with_token "${NAMESPACE}" "${PODS[0]}" "$ROOT_TOKEN" "vault secrets enable -path=secret kv-v2" 2>/dev/null || true
exec_vault_with_token "${NAMESPACE}" "${PODS[0]}" "$ROOT_TOKEN" "vault auth enable kubernetes" 2>/dev/null || true
exec_vault_with_token "${NAMESPACE}" "${PODS[0]}" "$ROOT_TOKEN" "vault audit enable file file_path=/vault/data/vault-audit.log" 2>/dev/null || true

exec_vault_with_token "${NAMESPACE}" "${PODS[0]}" "$ROOT_TOKEN" "vault policy write admin-policy - <<EOF
path \"secret/*\" {
  capabilities = [\"create\", \"read\", \"update\", \"delete\", \"list\"]
}

path \"sys/policies/acl/*\" {
  capabilities = [\"create\", \"read\", \"update\", \"delete\", \"list\"]
}

path \"auth/kubernetes/config\" {
  capabilities = [\"create\", \"read\", \"update\"]
}

path \"auth/kubernetes/role/*\" {
  capabilities = [\"create\", \"read\", \"update\", \"delete\", \"list\"]
}

path \"sys/audit\" {
  capabilities = [\"create\", \"read\", \"update\", \"delete\", \"list\"]
}

path \"sys/audit/*\" {
  capabilities = [\"create\", \"read\", \"update\", \"delete\", \"list\"]
}

path \"auth/token/renew\" {
  capabilities = [\"update\"]
}

path \"auth/token/lookup-self\" {
  capabilities = [\"read\"]
}

path \"sys/health\" {
  capabilities = [\"read\"]
}

path \"sys/seal-status\" {
  capabilities = [\"read\"]
}
EOF"

ADMIN_TOKEN_RESPONSE=$(exec_vault_with_token "${NAMESPACE}" "${PODS[0]}" "$ROOT_TOKEN" "vault token create -orphan -policy=admin-policy -period=30m -display-name='vault-admin-token' -format=json" 2>/dev/null)

if [[ $? -ne 0 ]]; then
	echo "ERROR: Failed to create admin token!" >&2
	exit 1
fi

ADMIN_TOKEN=$(echo "$ADMIN_TOKEN_RESPONSE" | jq -r '.auth.client_token')

if [[ -z "$ADMIN_TOKEN" ]] || [[ "$ADMIN_TOKEN" == "null" ]]; then
	echo "ERROR: Admin token creation failed!" >&2
	exit 1
fi

jq --arg token "$ADMIN_TOKEN" '.admin_token = $token' ${VAULT_KEYS_FILE} >${VAULT_KEYS_FILE}.tmp && mv ${VAULT_KEYS_FILE}.tmp ${VAULT_KEYS_FILE}

kubectl create secret generic vault-admin-token \
	-n ${NAMESPACE} \
	--from-literal=token="${ADMIN_TOKEN}" \
	--dry-run=client -o yaml | kubectl apply -f - >/dev/null

ADMIN_TEST=$(exec_vault_with_token "${NAMESPACE}" "${PODS[0]}" "$ADMIN_TOKEN" "vault token lookup -format=json" 2>&1)
if echo "$ADMIN_TEST" | grep -q "error"; then
	echo "ERROR: Admin token validation failed; root token will not be revoked" >&2
	echo "$ADMIN_TEST" >&2
	exit 1
fi

exec_vault_with_token "${NAMESPACE}" "${PODS[0]}" "$ROOT_TOKEN" "vault token revoke -self" >/dev/null
jq 'del(.root_token) | del(.unseal_keys_b64) | del(.unseal_keys_hex) | .root_token_revoked = true | .root_token_revoked_at = (now | strftime("%Y-%m-%dT%H:%M:%SZ"))' ${VAULT_KEYS_FILE} >${VAULT_KEYS_FILE}.tmp && mv ${VAULT_KEYS_FILE}.tmp ${VAULT_KEYS_FILE}
