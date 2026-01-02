#!/bin/bash

set -e

umask 077

NAMESPACE="transcendence"
PODS=("vault-0" "vault-1" "vault-2")
VAULT_KEYS_FILE=".vault-keys.json"

if [ -f "${VAULT_KEYS_FILE}" ]; then
	CURRENT_PERM=$(stat -c '%a' "${VAULT_KEYS_FILE}" 2>/dev/null || stat -f '%A' "${VAULT_KEYS_FILE}" 2>/dev/null)
	if [ "$CURRENT_PERM" != "600" ]; then
		echo "ERROR: ${VAULT_KEYS_FILE} has insecure permissions ($CURRENT_PERM). Setting to 600..."
		chmod 600 "${VAULT_KEYS_FILE}"
	fi
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/vault-helpers.sh"

echo "Waiting for Vault pods to be ready..."
for pod in "${PODS[@]}"; do
	kubectl wait --for=condition=ready pod/${pod} -n ${NAMESPACE} --timeout=120s
done

echo "Checking Vault-0 status..."
INIT_STATUS=$(exec_vault "${NAMESPACE}" "${PODS[0]}" "VAULT_CACERT=/vault/tls/ca.crt vault status -format=json" 2>/dev/null | jq -r '.initialized' || echo "false")

get_json_value() {
	field="$1"
	jq -r "$field" "${VAULT_KEYS_FILE}" 2>/dev/null | tr -d '\r\n'
}

if [ "$INIT_STATUS" = "true" ]; then
	if [ ! -f "${VAULT_KEYS_FILE}" ]; then
		echo "ERROR: Vault is initialized but keys file not found!"
		exit 1
	fi
else
	exec_vault "${NAMESPACE}" "${PODS[0]}" "VAULT_CACERT=/vault/tls/ca.crt vault operator init -key-shares=5 -key-threshold=3 -format=json" >${VAULT_KEYS_FILE}
	chmod 600 ${VAULT_KEYS_FILE}
	echo "Vault initialized. Keys saved to ${VAULT_KEYS_FILE}"
fi

if [ ! -f "${VAULT_KEYS_FILE}" ]; then
	ROOT_TOKEN=""
	ADMIN_TOKEN=""
else
	ROOT_TOKEN=$(get_json_value '.root_token // empty')
	ADMIN_TOKEN=$(get_json_value '.admin_token // empty')
fi

echo "Creating/updating Kubernetes secret for auto-unseal..."
UNSEAL_KEY_1=$(get_json_value '.unseal_keys_b64[0] // empty')
UNSEAL_KEY_2=$(get_json_value '.unseal_keys_b64[1] // empty')
UNSEAL_KEY_3=$(get_json_value '.unseal_keys_b64[2] // empty')

if [ -n "$UNSEAL_KEY_1" ] && [ -n "$UNSEAL_KEY_2" ] && [ -n "$UNSEAL_KEY_3" ]; then
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
		--dry-run=client -o yaml | kubectl apply -f -

	rm -rf "$TMP_UNSEAL_DIR"
else
	echo "Unseal keys not present locally"
fi
echo "Unseal keys stored in Kubernetes secret: vault-unseal-keys"

echo "Ensuring Vault is unsealed..."
if [ -n "$UNSEAL_KEY_1" ] && [ -n "$UNSEAL_KEY_2" ] && [ -n "$UNSEAL_KEY_3" ]; then
	exec_vault "${NAMESPACE}" "${PODS[0]}" "VAULT_CACERT=/vault/tls/ca.crt vault operator unseal '$UNSEAL_KEY_1'" >/dev/null
	exec_vault "${NAMESPACE}" "${PODS[0]}" "VAULT_CACERT=/vault/tls/ca.crt vault operator unseal '$UNSEAL_KEY_2'" >/dev/null
	exec_vault "${NAMESPACE}" "${PODS[0]}" "VAULT_CACERT=/vault/tls/ca.crt vault operator unseal '$UNSEAL_KEY_3'" >/dev/null
	echo "Vault-0 is unsealed."
else
	echo "ERROR: Unseal keys not found!"
	exit 1
fi

echo "Waiting for DNS propagation and Raft initialization..."
sleep 5

for pod_idx in 1 2; do
	pod="${PODS[$pod_idx]}"
	echo "Joining $pod to Raft cluster..."
	INITIALIZED=$(exec_vault "${NAMESPACE}" "$pod" "VAULT_CACERT=/vault/tls/ca.crt vault status -format=json" 2>/dev/null | jq -r '.initialized' || echo "false")

	if [ "$INITIALIZED" = "false" ] && [ -n "$UNSEAL_KEY_1" ]; then
		echo "$pod joining cluster..."
		sleep 5
		exec_vault "${NAMESPACE}" "$pod" "VAULT_ADDR=https://127.0.0.1:8200 VAULT_CACERT=/vault/tls/ca.crt vault operator raft join -leader-ca-cert=@/vault/tls/ca.crt -leader-client-cert=@/vault/tls/tls.crt -leader-client-key=@/vault/tls/tls.key https://vault-0.vault-internal:8200"
		echo "$pod joined cluster."
		sleep 5
	fi

	if [ -n "$UNSEAL_KEY_1" ] && [ -n "$UNSEAL_KEY_2" ] && [ -n "$UNSEAL_KEY_3" ]; then
		echo "Unsealing $pod..."
		exec_vault "${NAMESPACE}" "$pod" "VAULT_CACERT=/vault/tls/ca.crt vault operator unseal '$UNSEAL_KEY_1'" >/dev/null
		exec_vault "${NAMESPACE}" "$pod" "VAULT_CACERT=/vault/tls/ca.crt vault operator unseal '$UNSEAL_KEY_2'" >/dev/null
		exec_vault "${NAMESPACE}" "$pod" "VAULT_CACERT=/vault/tls/ca.crt vault operator unseal '$UNSEAL_KEY_3'" >/dev/null
		echo "$pod unsealed successfully."
	fi
done

echo ""
echo "Verifying all pods are unsealed..."
for pod in "${PODS[@]}"; do
	echo "$pod status:"
	exec_vault "${NAMESPACE}" "$pod" "VAULT_CACERT=/vault/tls/ca.crt vault status" || true
	echo ""
done

if [ -z "$ADMIN_TOKEN" ] && [ -z "$ROOT_TOKEN" ]; then
	echo "ERROR: No admin token available and root token is not present!"
	exit 1
fi

if [ -n "$ROOT_TOKEN" ]; then
	echo "Enabling KV v2 secrets engine..."
	exec_vault_with_token "${NAMESPACE}" "${PODS[0]}" "$ROOT_TOKEN" "vault secrets enable -path=secret kv-v2" 2>/dev/null || echo "KV v2 engine already enabled."

	echo "Enabling Kubernetes authentication..."
	exec_vault_with_token "${NAMESPACE}" "${PODS[0]}" "$ROOT_TOKEN" "vault auth enable kubernetes" 2>/dev/null || echo "Kubernetes auth already enabled."

	echo "Creating admin policy..."
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
  capabilities = [\"read\", \"list\"]
}

path \"sys/audit/*\" {
  capabilities = [\"create\", \"read\", \"update\", \"delete\"]
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
else
	echo "Root token not available. Cannot create admin policy."
fi

echo "Creating admin token..."
if [ -z "$ADMIN_TOKEN" ]; then
	if [ -z "$ROOT_TOKEN" ]; then
		echo "ERROR: Cannot create admin token without root token!"
		exit 1
	fi
	ADMIN_TOKEN_RESPONSE=$(exec_vault_with_token "${NAMESPACE}" "${PODS[0]}" "$ROOT_TOKEN" "vault token create -orphan -policy=admin-policy -period=30m -display-name='vault-admin-token' -format=json" 2>/dev/null)

	if [ $? -ne 0 ]; then
		echo "ERROR: Failed to create admin token!"
		exit 1
	fi

	ADMIN_TOKEN=$(echo "$ADMIN_TOKEN_RESPONSE" | jq -r '.auth.client_token')

	if [ -z "$ADMIN_TOKEN" ] || [ "$ADMIN_TOKEN" = "null" ]; then
		echo "ERROR: Admin token creation failed!"
		exit 1
	fi
	echo "Admin token created successfully"

	echo "Storing admin token..."
	jq --arg token "$ADMIN_TOKEN" '.admin_token = $token' ${VAULT_KEYS_FILE} >${VAULT_KEYS_FILE}.tmp && mv ${VAULT_KEYS_FILE}.tmp ${VAULT_KEYS_FILE}
else
	echo "Admin token already present in keys file"
fi

echo "Creating Kubernetes Secret for admin token..."
kubectl create secret generic vault-admin-token \
	-n ${NAMESPACE} \
	--from-literal=token="${ADMIN_TOKEN}" \
	--dry-run=client -o yaml | kubectl apply -f -

if [ -n "$ROOT_TOKEN" ]; then
	echo "Verifying admin token before revoking root token..."
	ADMIN_TEST=$(exec_vault_with_token "${NAMESPACE}" "${PODS[0]}" "$ADMIN_TOKEN" "vault token lookup -format=json" 2>&1)
	if echo "$ADMIN_TEST" | grep -q "error"; then
		echo "ERROR: Admin token validation failed; root token will not be revoked"
		echo "$ADMIN_TEST"
		exit 1
	fi

	echo "Revoking root token..."
	exec_vault_with_token "${NAMESPACE}" "${PODS[0]}" "$ROOT_TOKEN" "vault token revoke -self" >/dev/null

	echo "Redacting sensitive fields from local keys file..."
	jq 'del(.root_token) | del(.unseal_keys_b64) | del(.unseal_keys_hex) | .root_token_revoked = true | .root_token_revoked_at = (now | strftime("%Y-%m-%dT%H:%M:%SZ"))' ${VAULT_KEYS_FILE} >${VAULT_KEYS_FILE}.tmp && mv ${VAULT_KEYS_FILE}.tmp ${VAULT_KEYS_FILE}
fi
echo "Vault initialization completed."
