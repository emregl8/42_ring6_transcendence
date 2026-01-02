#!/bin/bash

set -euo pipefail

NODE_ENV="development"
echo "Generating secrets..."

DB_PASSWORD=$(openssl rand -base64 32)

cat >.env <<EOF
PORT=3000
NODE_ENV=$NODE_ENV

DB_HOST=postgres
DB_PORT=5432

POSTGRES_USER=transcendence
POSTGRES_PASSWORD=$DB_PASSWORD
POSTGRES_DB=transcendence

ALLOWED_ORIGINS=https://transcendence.local
DB_SSL_ENABLED=true
DB_SSL_REJECT_UNAUTHORIZED=true
DB_SSL_CA_PATH=/etc/postgres-ca/ca.crt
EOF
chmod 600 .env

echo "Created .env (NODE_ENV=$NODE_ENV)"
echo "Secrets will be stored in Vault"
