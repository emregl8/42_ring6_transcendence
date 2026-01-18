#!/bin/bash

set -euo pipefail

NODE_ENV="development"
echo "Generating secrets..."

DB_PASSWORD=$(openssl rand -base64 32)
JWT_SECRET=$(openssl rand -base64 48 | tr -d '\n')
REFRESH_TOKEN_PEPPER=$(openssl rand -base64 48 | tr -d '\n')

cat >.env <<EOF
POSTGRES_USER=transcendence
POSTGRES_PASSWORD=$DB_PASSWORD
POSTGRES_DB=transcendence

OAUTH_42_CLIENT_ID=change_me
OAUTH_42_CLIENT_SECRET=change_me

JWT_SECRET=$JWT_SECRET

REFRESH_TOKEN_PEPPER=$REFRESH_TOKEN_PEPPER
EOF
chmod 600 .env

echo "Created .env (NODE_ENV=$NODE_ENV)"
