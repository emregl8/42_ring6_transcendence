#!/bin/bash

set -Eeuo pipefail

export KUBECONFIG=${KUBECONFIG:-$HOME/.kube/config}

NAMESPACE="${NAMESPACE:-transcendence}"
POD_NAME="${POD_NAME:-postgres-0}"

echo ""
echo "Waiting for postgres pod to be ready..."
if ! kubectl wait --for=condition=ready pod/"$POD_NAME" -n "$NAMESPACE" --timeout=60s; then
    echo "Error: Pod $POD_NAME is not ready in namespace $NAMESPACE" >&2
    exit 1
fi

echo "Getting database credentials from secret..."
if ! kubectl get secret postgres-secret -n "$NAMESPACE" &>/dev/null; then
    echo "ERROR: Secret postgres-secret not found in namespace $NAMESPACE" >&2
    exit 1
fi

POSTGRES_USER=$(kubectl get secret postgres-secret -n "$NAMESPACE" -o jsonpath='{.data.POSTGRES_USER}' | base64 -d) || {
    echo "ERROR: Failed to decode POSTGRES_USER from secret" >&2
    exit 1
}
POSTGRES_PASSWORD=$(kubectl get secret postgres-secret -n "$NAMESPACE" -o jsonpath='{.data.POSTGRES_PASSWORD}' | base64 -d) || {
    echo "ERROR: Failed to decode POSTGRES_PASSWORD from secret" >&2
    exit 1
}
POSTGRES_DB=$(kubectl get secret postgres-secret -n "$NAMESPACE" -o jsonpath='{.data.POSTGRES_DB}' | base64 -d) || {
    echo "ERROR: Failed to decode POSTGRES_DB from secret" >&2
    exit 1
}

if [[ -z "$POSTGRES_USER" ]] || [[ -z "$POSTGRES_PASSWORD" ]] || [[ -z "$POSTGRES_DB" ]]; then
    echo "ERROR: Database credentials are empty" >&2
    exit 1
fi

echo ""
echo "Creating/Updating database schema..."

SQL_SCRIPT="
BEGIN;

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    intra_42_id VARCHAR NOT NULL UNIQUE,
    username VARCHAR NOT NULL UNIQUE,
    email VARCHAR NOT NULL UNIQUE,
    first_name VARCHAR,
    last_name VARCHAR,
    avatar VARCHAR,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_intra_42_id ON users(intra_42_id);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

CREATE TABLE IF NOT EXISTS refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token_hash VARCHAR NOT NULL UNIQUE,
    user_id UUID NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked BOOLEAN DEFAULT false,
    replaced_by VARCHAR,
    user_agent VARCHAR,
    ip_address VARCHAR,
    CONSTRAINT fk_refresh_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_refresh_token_hash ON refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_token_user ON refresh_tokens(user_id);

COMMIT;
"

if ! echo "$SQL_SCRIPT" | kubectl exec -i -n "$NAMESPACE" "$POD_NAME" -- env PGPASSWORD="$POSTGRES_PASSWORD" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1; then
    echo "ERROR: Failed to execute SQL script" >&2
    exit 1
fi

echo "Database schema setup completed successfully!"