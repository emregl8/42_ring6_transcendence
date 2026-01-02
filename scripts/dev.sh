#!/bin/bash

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

generate-env() {
    bash "$SCRIPT_DIR/generate-env.sh"
}

install-nginx-ingress() {
    bash "$SCRIPT_DIR/setup-nginx-ingress.sh"
}

build() {
    echo "Building Docker images..."
    docker build -t transcendence-postgres:latest ./postgres
    docker build -t transcendence-frontend:latest ./frontend
    docker build -t transcendence-backend:latest ./backend
    echo "Docker images built successfully!"
}

load-images() {
    echo "Loading images to kind cluster..."
    kind load docker-image transcendence-postgres:latest --name transcendence
    kind load docker-image transcendence-backend:latest --name transcendence
    kind load docker-image transcendence-frontend:latest --name transcendence
    echo "Images loaded successfully!"
}

cluster() {
    echo "Creating kind cluster..."
    if kind get clusters | grep -q transcendence; then
        echo "Cluster already exists"
    else
        kind create cluster --name transcendence --config kind-config.yaml
        echo "Kind cluster created successfully!"
    fi
}

deploy() {
    echo "Deploying to Kubernetes..."
    KUBECTL="docker exec -i transcendence-control-plane kubectl"
    CONFIGMAP=backend-configmap-dev.yaml
    
    cat k8s/namespace/namespace.yaml | $KUBECTL apply -f -
    
    echo "Installing cert-manager..."
    curl -fsSL https://github.com/cert-manager/cert-manager/releases/download/v1.19.2/cert-manager.yaml | $KUBECTL apply -f - 2>/dev/null || true
    
    echo "Waiting for cert-manager to be ready..."
    $KUBECTL wait --for=condition=ready pod -l app.kubernetes.io/instance=cert-manager -n cert-manager --timeout=180s 2>/dev/null || echo "Cert-manager still initializing..."
    
    echo "Deploying Vault base resources..."
    cat k8s/vault/vault-serviceaccount.yaml | $KUBECTL apply -f - || true
    cat k8s/vault/vault-config.yaml | $KUBECTL apply -f - || true
    cat k8s/vault/vault-service.yaml | $KUBECTL apply -f - || true
    cat k8s/vault/vault-service-internal.yaml | $KUBECTL apply -f - || true
    cat k8s/vault/vault-auto-unseal-script.yaml | $KUBECTL apply -f - || true
    
    $KUBECTL get secret vault-unseal-keys -n transcendence >/dev/null 2>&1 || \
        $KUBECTL create secret generic vault-unseal-keys -n transcendence --from-literal=placeholder=placeholder --save-config >/dev/null 2>&1 || true
    
    echo "Creating Vault TLS certificate..."
    cat k8s/vault/vault-tls-secret.yaml | $KUBECTL apply -f - || true
    
    echo "Waiting for TLS certificate to be ready..."
    $KUBECTL wait --for=condition=ready certificate/vault-tls -n transcendence --timeout=60s 2>/dev/null || echo "Certificate still being issued..."
    
    echo "Deploying Vault StatefulSet (with TLS)..."
    cat k8s/vault/vault-statefulset.yaml | $KUBECTL apply -f - || true
    
    echo "Waiting for Vault pods to be ready..."
    $KUBECTL wait --for=condition=ready pod/vault-0 -n transcendence --timeout=180s
    
    for file in k8s/postgres/*.yaml; do cat "$file" | $KUBECTL apply -f - || true; done
    cat k8s/backend/$CONFIGMAP | $KUBECTL apply -f -
    
    for file in k8s/backend/*.yaml; do
        if [ "$(basename "$file")" != "backend-configmap-dev.yaml" ]; then
            cat "$file" | $KUBECTL apply -f - || true
        fi
    done
    
    for file in k8s/frontend/*.yaml; do cat "$file" | $KUBECTL apply -f - || true; done
    
    echo "Applying security policies..."
    cat k8s/security/network-policy.yaml | $KUBECTL apply -f -
    
    echo "Deploying ingress..."
    for file in k8s/ingress/*.yaml; do cat "$file" | $KUBECTL apply -f - || true; done
}

setup-vault() {
    echo "Initializing Vault..."
    bash "$SCRIPT_DIR/vault/vault-init.sh"
    
    echo "Configuring Vault Kubernetes auth..."
    bash "$SCRIPT_DIR/vault/vault-configure-k8s-auth.sh"
    
    echo "Storing secrets in Vault..."
    bash "$SCRIPT_DIR/vault/vault-store-secrets.sh"
    
    echo "Creating Kubernetes secrets from Vault..."
    bash "$SCRIPT_DIR/vault/vault-create-k8s-secrets.sh"
    
    echo "Deploying token auto-renewal CronJob..."
    cat k8s/vault/vault-admin-serviceaccount.yaml | docker exec -i transcendence-control-plane kubectl apply -f -
    cat k8s/vault/vault-token-renew-script.yaml | docker exec -i transcendence-control-plane kubectl apply -f -
    cat k8s/vault/vault-token-renew-cronjob.yaml | docker exec -i transcendence-control-plane kubectl apply -f -
    
    echo "Vault setup complete!"
}

setup-tls() {
    bash "$SCRIPT_DIR/setup-tls-certificate.sh"
}

reload-ingress() {
    echo "Reloading ingress controller to apply TLS certificates..."
    docker exec transcendence-control-plane kubectl rollout restart deployment/ingress-nginx-controller -n ingress-nginx
    echo "Waiting for ingress controller to be ready..."
    docker exec transcendence-control-plane kubectl wait --for=condition=ready pod -l app.kubernetes.io/component=controller -n ingress-nginx --timeout=60s 2>/dev/null || true
    echo "Ingress controller reloaded!"
}

dev() {
    cd "$SCRIPT_DIR/.."
    
    echo "Starting development deployment..."
    
    generate-env
    cluster
    install-nginx-ingress
    build
    load-images
    deploy
    setup-vault
    setup-tls
    reload-ingress
    
    echo "Development environment ready!"
    echo "Access: http://transcendence.local/"
    
    "$SCRIPT_DIR/status.sh"
}

dev
