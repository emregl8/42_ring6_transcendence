#!/bin/bash

set -euo pipefail

INGRESS_VERSION="v1.14.1"
CLUSTER_NAME="transcendence"
NAMESPACE="ingress-nginx"
KUBECTL="docker exec $CLUSTER_NAME-control-plane kubectl"
MANIFEST_URL="https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-${INGRESS_VERSION}/deploy/static/provider/kind/deploy.yaml"
MANIFEST_FILE="/tmp/ingress-nginx-${INGRESS_VERSION}.yaml"
MANIFEST_SHA256="4d77c9a2feb0b3b371b3332350db5a83b8ea8fc0c4f8ea5b702e8fbc0154dd72"

echo "Installing nginx-ingress controller ($INGRESS_VERSION)..."
if [ ! -f "$MANIFEST_FILE" ]; then
    curl -fsSL "$MANIFEST_URL" -o "$MANIFEST_FILE"

    DOWNLOADED_SHA256=$(sha256sum "$MANIFEST_FILE" | cut -d' ' -f1)

    if [ "$DOWNLOADED_SHA256" != "$MANIFEST_SHA256" ]; then
        echo "ERROR: Manifest checksum mismatch"
        echo "Expected: $MANIFEST_SHA256"
        echo "Got:      $DOWNLOADED_SHA256"
        rm -f "$MANIFEST_FILE"
        exit 1
    fi
fi

cat "$MANIFEST_FILE" | docker exec -i "$CLUSTER_NAME-control-plane" kubectl apply --validate=false -f - >/dev/null

$KUBECTL wait --for=jsonpath='{.status.phase}'=Active "namespace/$NAMESPACE" --timeout=30s >/dev/null

$KUBECTL label namespace "$NAMESPACE" name="$NAMESPACE" --overwrite >/dev/null

echo "Configuring admission webhook..."
CERT_DIR=$(mktemp -d)
trap "rm -rf ${CERT_DIR}" EXIT

openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout "$CERT_DIR/tls.key" \
    -out "$CERT_DIR/tls.crt" \
    -subj "/CN=ingress-nginx-controller-admission.ingress-nginx.svc" \
    -addext "subjectAltName=DNS:ingress-nginx-controller-admission,DNS:ingress-nginx-controller-admission.ingress-nginx.svc" 2>/dev/null

CERT_B64=$(base64 -w0 < "$CERT_DIR/tls.crt")
KEY_B64=$(base64 -w0 < "$CERT_DIR/tls.key")

docker exec "$CLUSTER_NAME-control-plane" bash -c "
cat <<'MANIFEST' | kubectl apply -f -
apiVersion: v1
kind: Secret
metadata:
  name: ingress-nginx-admission
  namespace: $NAMESPACE
type: kubernetes.io/tls
data:
  tls.crt: $CERT_B64
  tls.key: $KEY_B64
  ca: $CERT_B64
MANIFEST
"

CA_BUNDLE=$(base64 -w0 < "$CERT_DIR/tls.crt")

$KUBECTL patch validatingwebhookconfiguration ingress-nginx-admission \
    --type='json' \
    -p="[{'op': 'replace', 'path': '/webhooks/0/clientConfig/caBundle', 'value':'$CA_BUNDLE'}]" 2>/dev/null || true

$KUBECTL rollout status deployment/ingress-nginx-controller -n "$NAMESPACE" --timeout=120s >/dev/null

echo "Disabling admission webhook (causes TLS errors)..."
$KUBECTL delete validatingwebhookconfiguration ingress-nginx-admission 2>/dev/null || true

echo "Setting fixed NodePorts for Kind cluster..."
$KUBECTL patch service ingress-nginx-controller -n "$NAMESPACE" --type='json' \
    -p='[
        {"op": "replace", "path": "/spec/ports/0/nodePort", "value": 30656},
        {"op": "replace", "path": "/spec/ports/1/nodePort", "value": 30813}
    ]' >/dev/null

echo "Nginx-ingress controller installed (NodePorts: 30656/HTTP, 30813/HTTPS)"
