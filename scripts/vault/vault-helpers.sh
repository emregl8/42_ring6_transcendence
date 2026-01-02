#!/bin/bash

get_vault_token() {
	local VAULT_KEYS_FILE="${1:-.vault-keys.json}"

	if [ ! -f "${VAULT_KEYS_FILE}" ]; then
		echo "ERROR: Vault keys file not found: ${VAULT_KEYS_FILE}" >&2
		return 1
	fi
	ADMIN_TOKEN=$(cat ${VAULT_KEYS_FILE} | jq -r '.admin_token')
	if [ -z "$ADMIN_TOKEN" ] || [ "$ADMIN_TOKEN" = "null" ]; then
		echo "ERROR: Admin token not found in ${VAULT_KEYS_FILE}" >&2
		return 1
	fi

	echo "$ADMIN_TOKEN"
}

exec_vault() {
	local namespace="$1" pod="$2"
	shift 2
	kubectl exec -n "$namespace" "$pod" -- sh -c "$*"
}

exec_vault_with_token() {
	local namespace="$1" pod="$2" token="$3"
	shift 3
	kubectl exec -n "$namespace" "$pod" -- sh -c "VAULT_TOKEN='$token' VAULT_CACERT=/vault/tls/ca.crt $*"
}

validate_token() {
	local namespace="$1" pod="$2" token="$3"
	if [ -z "$token" ]; then
		return 1
	fi
	exec_vault_with_token "$namespace" "$pod" "$token" "vault token lookup -format=json" >/dev/null 2>&1
}

get_admin_token() {
	local namespace="$1" pod="$2" keys_file="$3"
	local token

	token=$(get_vault_token "$keys_file" 2>/dev/null || true)

	if [ -z "$token" ] || ! validate_token "$namespace" "$pod" "$token"; then
		token=$(kubectl -n "$namespace" get secret vault-admin-token -o jsonpath='{.data.token}' 2>/dev/null | base64 -d || true)
	fi

	if [ -z "$token" ] || ! validate_token "$namespace" "$pod" "$token"; then
		return 1
	fi

	echo "$token"
}

vault_exec_cmd() {
	local namespace="$1" pod="$2" token="$3"
	shift 3
	exec_vault_with_token "$namespace" "$pod" "$token" "$*"
}

vault_kv_put() {
	local namespace="$1" pod="$2" token="$3" path="$4"
	shift 4
	vault_exec_cmd "$namespace" "$pod" "$token" "vault kv put $path $*"
}

vault_kv_get() {
	local namespace="$1" pod="$2" token="$3" path="$4"
	vault_exec_cmd "$namespace" "$pod" "$token" "vault kv get -format=json $path"
}

vault_write() {
	local namespace="$1" pod="$2" token="$3" path="$4"
	shift 4
	vault_exec_cmd "$namespace" "$pod" "$token" "vault write $path $*"
}

vault_policy_write() {
	local namespace="$1" pod="$2" token="$3" policy_name="$4" policy_content="$5"
	exec_vault_with_token "$namespace" "$pod" "$token" "vault policy write $policy_name - <<EOF
$policy_content
EOF"
}
