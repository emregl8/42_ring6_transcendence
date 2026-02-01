#!/bin/bash

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="$PROJECT_ROOT/backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
NAMESPACE="transcendence"

mkdir -p "$BACKUP_DIR"
TEMP_DIR="$BACKUP_DIR/temp_$TIMESTAMP"
mkdir -p "$TEMP_DIR"

PG_POD=$(kubectl get pods -n $NAMESPACE -l app=postgres -o jsonpath="{.items[0].metadata.name}")
kubectl exec -n $NAMESPACE $PG_POD -- pg_dump -U transcendence transcendence > "$TEMP_DIR/postgres_dump.sql"

VAULT_POD=$(kubectl get pods -n $NAMESPACE -l app=vault -o jsonpath="{.items[0].metadata.name}" | head -n 1)
if kubectl exec -n $NAMESPACE $VAULT_POD -- vault operator raft snapshot save /tmp/vault.snapshot >/dev/null 2>&1; then
    kubectl cp "$NAMESPACE/$VAULT_POD:/tmp/vault.snapshot" "$TEMP_DIR/vault.snapshot"
fi

if [ -d "$PROJECT_ROOT/data/uploads" ]; then
    cp -r "$PROJECT_ROOT/data/uploads" "$TEMP_DIR/uploads"
fi

FINAL_ARCHIVE="$BACKUP_DIR/backup_$TIMESTAMP.tar.gz"
tar -czf "$FINAL_ARCHIVE" -C "$TEMP_DIR" .

rm -rf "$TEMP_DIR"

find "$BACKUP_DIR" -name "backup_*.tar.gz" -mtime +30 -delete

echo "Backup created: $FINAL_ARCHIVE"