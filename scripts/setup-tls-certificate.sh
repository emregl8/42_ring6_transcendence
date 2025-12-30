#!/bin/bash

set -euo pipefail

NAMESPACE="transcendence"
SECRET_NAME="transcendence-tls"
KUBECTL="docker exec transcendence-control-plane kubectl"

echo "Setting up TLS certificates..."
if $KUBECTL get secret "$SECRET_NAME" -n "$NAMESPACE" &>/dev/null; then
    echo "TLS certificate already exists"
    exit 0
fi

attempts=0
max_attempts=60
while [ $attempts -lt $max_attempts ]; do
    WEBHOOK_READY=$($KUBECTL get deployment cert-manager-webhook -n cert-manager -o jsonpath='{.status.readyReplicas}' 2>/dev/null)
    if [ "$WEBHOOK_READY" = "" ]; then
        WEBHOOK_READY=0
    fi
    if [ "$WEBHOOK_READY" -gt 0 ]; then
        break
    fi
    attempts=$((attempts + 1))
    if [ $attempts -lt $max_attempts ]; then
        sleep 2
    fi
done

if [ $attempts -eq $max_attempts ]; then
    echo "ERROR: cert-manager webhook not ready"
    echo "Run: kubectl get pods -n cert-manager"
    exit 1
fi

cat k8s/security/cert-manager.yaml | docker exec -i transcendence-control-plane kubectl apply -f - >/dev/null
if [ $? -ne 0 ]; then
    echo "ERROR: Failed to create certificate resource"
    exit 1
fi

wait_count=0
max_wait=60
while [ $wait_count -lt $max_wait ]; do
    if $KUBECTL get secret "$SECRET_NAME" -n "$NAMESPACE" &>/dev/null; then
        echo "TLS certificate configured"
        exit 0
    fi
    wait_count=$((wait_count + 1))
    sleep 2
done

echo "ERROR: Certificate issuance timeout"
echo "Check: kubectl describe certificate -n $NAMESPACE"
exit 1
