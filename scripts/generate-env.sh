#!/bin/bash

set -euo pipefail

ENVIRONMENT="${1:-dev}"

if [ "$ENVIRONMENT" = "prod" ] || [ "$ENVIRONMENT" = "production" ]; then
    NODE_ENV="production"
elif [ "$ENVIRONMENT" = "dev" ] || [ "$ENVIRONMENT" = "development" ]; then
    NODE_ENV="development"
else
    echo "ERROR: Invalid environment '$ENVIRONMENT'. Use 'dev' or 'prod'"
    exit 1
fi

echo "Generating secrets for $NODE_ENV environment..."

DB_PASSWORD=$(openssl rand -base64 32)

cat > .env << EOF
PORT=3000
NODE_ENV=$NODE_ENV

DB_HOST=transcendence-postgres
DB_PORT=5432

POSTGRES_USER=transcendence
POSTGRES_PASSWORD=$DB_PASSWORD
POSTGRES_DB=transcendence
EOF
chmod 600 .env

cat > k8s/postgres/postgres-secret.yaml << EOF
apiVersion: v1
kind: Secret
metadata:
  name: postgres-secret
  namespace: transcendence
type: Opaque
stringData:
  POSTGRES_USER: transcendence
  POSTGRES_PASSWORD: $DB_PASSWORD
  POSTGRES_DB: transcendence
EOF
chmod 600 k8s/postgres/postgres-secret.yaml

echo "Created .env (NODE_ENV=$NODE_ENV) and postgres-secret.yaml"
