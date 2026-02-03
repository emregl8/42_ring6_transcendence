#!/bin/bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$PROJECT_ROOT/.env"

NAMESPACE="${NAMESPACE:-transcendence}"
DOMAIN="${DOMAIN:-transcendence.local}"
INGRESS_NS="ingress-nginx"
INGRESS_DEPLOY="ingress-nginx-controller"
INGRESS_MANIFEST_VERSION="v1.14.1"
CERT_MANAGER_VERSION="v1.19.2"
TLS_SECRET="$NAMESPACE/$NAMESPACE-tls"

IMAGES=(
    "transcendence-postgres"
    "transcendence-frontend"
    "transcendence-backend"
)

check_prerequisites() {
    echo "Checking prerequisites..."
    local missing=0

    if ! command -v docker &> /dev/null; then
        echo "ERROR: docker not found. Please install Docker." >&2
        missing=1
    fi

    if ! command -v kubectl &> /dev/null; then
        echo "ERROR: kubectl not found. Please install kubectl." >&2
        missing=1
    fi

    if ! command -v k3s &> /dev/null && ! sudo k3s --version &> /dev/null; then
        echo "ERROR: k3s not found. Please install k3s." >&2
        missing=1
    fi

    if ! command -v jq &> /dev/null; then
        echo "ERROR: jq not found. Please install jq." >&2
        missing=1
    fi

    if [[ $missing -eq 1 ]]; then
        return 1
    fi

    echo "All prerequisites satisfied."
    return 0
}

setup_hosts() {
    if ! grep -q "$DOMAIN" /etc/hosts; then
        echo "Adding $DOMAIN to /etc/hosts..."
        echo "127.0.0.1 $DOMAIN" | sudo tee -a /etc/hosts
    fi
    return 0
}

create_data_directories() {
    echo "Creating data directories with secure permissions..."

    sudo mkdir -p "$PROJECT_ROOT/data"
    sudo chmod 755 "$PROJECT_ROOT/data"

    sudo mkdir -p "$PROJECT_ROOT/data/vault"
    sudo chown -R 100:1000 "$PROJECT_ROOT/data/vault"
    sudo chmod -R 700 "$PROJECT_ROOT/data/vault"

    sudo mkdir -p "$PROJECT_ROOT/data/postgres"
    sudo chown -R 999:999 "$PROJECT_ROOT/data/postgres"
    sudo chmod -R 700 "$PROJECT_ROOT/data/postgres"

    sudo mkdir -p "$PROJECT_ROOT/data/redis"
    sudo chown -R 999:999 "$PROJECT_ROOT/data/redis"
    sudo chmod -R 700 "$PROJECT_ROOT/data/redis"

    sudo mkdir -p "$PROJECT_ROOT/data/uploads/temp"
    sudo mkdir -p "$PROJECT_ROOT/data/uploads/public"
    sudo chown -R 1000:1000 "$PROJECT_ROOT/data/uploads"
    sudo chmod -R 700 "$PROJECT_ROOT/data/uploads"
    return 0
}

generate_env() {
    if [[ -f "$ENV_FILE" ]]; then
        echo ".env file already exists at $ENV_FILE. Skipping generation."
        return 0
    fi

    if [[ ! -f "$SCRIPT_DIR/generate-env.sh" ]]; then
        echo "ERROR: generate-env.sh not found at $SCRIPT_DIR/generate-env.sh" >&2
        return 1
    fi

    bash "$SCRIPT_DIR/generate-env.sh"
    echo "Press ENTER after configuring the .env file..."
    read -r
    return 0
}

disable_traefik() {
    echo "Disabling Traefik to avoid port conflicts with Nginx Ingress..."
    kubectl delete helmchart traefik -n kube-system --ignore-not-found=true 2>&1 >/dev/null || true
    kubectl delete deployment traefik -n kube-system --ignore-not-found=true 2>&1 >/dev/null || true

    if kubectl get deployment traefik -n kube-system >/dev/null 2>&1; then
        kubectl wait --for=condition=terminating pod -l app=traefik -n kube-system --timeout=30s 2>/dev/null || true
    fi
    return 0
}

install_nginx_ingress() {
    echo "Installing Nginx Ingress Controller..."
    if ! kubectl apply -f "https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-${INGRESS_MANIFEST_VERSION}/deploy/static/provider/cloud/deploy.yaml" >/dev/null; then
        echo "ERROR: Failed to apply nginx ingress manifest" >&2
        return 1
    fi

    echo "Waiting for ingress controller deployment to be available..."
    if ! kubectl wait \
        --namespace "$INGRESS_NS" \
        --for=condition=available \
        deployment "$INGRESS_DEPLOY" \
        --timeout=180s >/dev/null; then
        echo "ERROR: Ingress controller deployment failed to become available" >&2
        return 1
    fi

    patch_nginx_default_tls
}

patch_nginx_default_tls() {
    local tls_arg="--default-ssl-certificate=$TLS_SECRET"

    if ! kubectl get deployment "$INGRESS_DEPLOY" -n "$INGRESS_NS" \
        -o jsonpath='{.spec.template.spec.containers[0].args[*]}' \
        | grep -q -- "$tls_arg"; then

        echo "Patching ingress controller to use default TLS secret..."
        kubectl patch deployment "$INGRESS_DEPLOY" -n "$INGRESS_NS" --type=json -p="
        [
          {
            \"op\": \"add\",
            \"path\": \"/spec/template/spec/containers/0/args/-\",
            \"value\": \"$tls_arg\"
          }
        ]" >/dev/null

        kubectl rollout restart deployment "$INGRESS_DEPLOY" -n "$INGRESS_NS" >/dev/null
        kubectl rollout status deployment "$INGRESS_DEPLOY" -n "$INGRESS_NS" --timeout=180s >/dev/null
    else
        echo "Ingress controller already configured with default TLS secret."
    fi
    return 0
}

build_and_load() {
    echo "Building and loading images to k3s..."
    for image in "${IMAGES[@]}"; do
        local context="${image#transcendence-}"
        echo "Building image: $image"

        if ! docker build -q -t "${image}:latest" "./$context" >/dev/null; then
            echo "ERROR: Failed to build image $image" >&2
            return 1
        fi

        if ! docker save "${image}:latest" | sudo k3s ctr images import - >/dev/null; then
            echo "ERROR: Failed to load image $image to k3s" >&2
            return 1
        fi

        echo "Successfully built and loaded: $image"
    done
    return 0
}

deploy_namespace() {
    echo "Creating namespace..."
    if ! kubectl apply -f k8s/namespace/namespace.yaml >/dev/null; then
        echo "ERROR: Failed to create namespace" >&2
        return 1
    fi
    return 0
}

deploy_cert_manager() {
    echo "Installing cert-manager..."
    if ! kubectl apply -f "https://github.com/cert-manager/cert-manager/releases/download/${CERT_MANAGER_VERSION}/cert-manager.yaml" >/dev/null; then
        echo "ERROR: Failed to apply cert-manager manifest" >&2
        return 1
    fi

    echo "Waiting for cert-manager resources to be created..."
    if ! kubectl wait --for=condition=ready pod -l app.kubernetes.io/instance=cert-manager -n cert-manager --timeout=180s >/dev/null; then
        echo "ERROR: cert-manager pods failed to become ready" >&2
        return 1
    fi

    echo "Creating ClusterIssuer and ingress TLS certificate..."
    if ! kubectl apply -f k8s/security/cert-manager.yaml >/dev/null; then
        echo "ERROR: Failed to apply cert-manager config" >&2
        return 1
    fi

    kubectl wait --for=condition=ready certificate --all -n "$NAMESPACE" --timeout=60s 2>/dev/null || true
    return 0
}

deploy_vault() {
    echo "Deploying Vault..."
    if ! kubectl apply -n "$NAMESPACE" -f k8s/vault/vault-serviceaccount.yaml >/dev/null; then
        echo "ERROR: Failed to apply vault serviceaccount" >&2
        return 1
    fi

    if ! kubectl apply -n "$NAMESPACE" -f k8s/vault/vault-config.yaml >/dev/null; then
        echo "ERROR: Failed to apply vault config" >&2
        return 1
    fi

    if ! kubectl apply -n "$NAMESPACE" -f k8s/vault/vault-service.yaml >/dev/null; then
        echo "ERROR: Failed to apply vault service" >&2
        return 1
    fi

    if ! kubectl apply -n "$NAMESPACE" -f k8s/vault/vault-service-internal.yaml >/dev/null; then
        echo "ERROR: Failed to apply vault internal service" >&2
        return 1
    fi

    if ! kubectl apply -n "$NAMESPACE" -f k8s/vault/vault-auto-unseal-script.yaml >/dev/null; then
        echo "ERROR: Failed to apply vault unseal script" >&2
        return 1
    fi

    kubectl get secret vault-unseal-keys -n "$NAMESPACE" >/dev/null 2>&1 || \
        kubectl create secret generic vault-unseal-keys -n "$NAMESPACE" --from-literal=placeholder=placeholder >/dev/null

    if ! kubectl apply -n "$NAMESPACE" -f k8s/vault/vault-tls-secret.yaml >/dev/null; then
        echo "ERROR: Failed to apply vault TLS secret" >&2
        return 1
    fi

    if ! kubectl wait --for=condition=ready certificate/vault-tls -n "$NAMESPACE" --timeout=60s >/dev/null; then
        echo "ERROR: Vault TLS certificate failed to become ready" >&2
        return 1
    fi

    sed "s|{{PROJECT_ROOT}}|$PROJECT_ROOT|g" k8s/vault/vault-statefulset.yaml | kubectl apply -n "$NAMESPACE" -f - >/dev/null

    if ! kubectl wait --for=condition=ready pod/vault-0 -n "$NAMESPACE" --timeout=180s >/dev/null; then
        echo "ERROR: Vault pod failed to become ready" >&2
        return 1
    fi
    return 0
}

deploy_postgres() {
    echo "Deploying PostgreSQL..."
    find k8s/postgres/ -name "*.yaml" ! -name "postgres-statefulset.yaml" -exec kubectl apply -n "$NAMESPACE" -f {} \; >/dev/null
    sed "s|{{PROJECT_ROOT}}|$PROJECT_ROOT|g" k8s/postgres/postgres-statefulset.yaml | kubectl apply -n "$NAMESPACE" -f - >/dev/null
    return 0
}

deploy_redis() {
    echo "Deploying Redis..."
    find k8s/redis/ -name "*.yaml" ! -name "redis-statefulset.yaml" -exec kubectl apply -n "$NAMESPACE" -f {} \; >/dev/null
    sed "s|{{PROJECT_ROOT}}|$PROJECT_ROOT|g" k8s/redis/redis-statefulset.yaml | kubectl apply -n "$NAMESPACE" -f - >/dev/null
    return 0
}

deploy_backend() {
    echo "Deploying Backend..."
    if ! kubectl apply -n "$NAMESPACE" -f k8s/backend/backend-configmap-dev.yaml >/dev/null; then
        echo "ERROR: Failed to apply backend configmap" >&2
        return 1
    fi

    find k8s/backend/ -name "*.yaml" ! -name "backend-deployment.yaml" ! -name "backend-configmap-dev.yaml" -exec kubectl apply -n "$NAMESPACE" -f {} \; >/dev/null

    sed "s|{{PROJECT_ROOT}}|$PROJECT_ROOT|g" k8s/backend/backend-deployment.yaml | kubectl apply -n "$NAMESPACE" -f - >/dev/null
    return 0
}

deploy_frontend() {
    echo "Deploying Frontend..."
    if ! kubectl apply -n "$NAMESPACE" -f k8s/frontend/ >/dev/null; then
        echo "ERROR: Failed to apply frontend manifests" >&2
        return 1
    fi
    return 0
}

deploy_security_and_ingress() {
    echo "Deploying security policies and ingress..."
    if ! kubectl apply -n "$NAMESPACE" -f k8s/security/network-policy.yaml >/dev/null; then
        echo "ERROR: Failed to apply network policy" >&2
        return 1
    fi

    if ! kubectl apply -n "$NAMESPACE" -f k8s/ingress/ >/dev/null; then
        echo "ERROR: Failed to apply ingress manifests" >&2
        return 1
    fi
    return 0
}

deploy() {
    deploy_namespace || return 1
    deploy_cert_manager || return 1
    deploy_vault || return 1
    deploy_postgres || return 1
    deploy_redis || return 1
    deploy_backend || return 1
    deploy_frontend || return 1
    deploy_security_and_ingress || return 1
    return 0
}

setup_vault() {
    echo "Configuring Vault..."
    if ! bash "$SCRIPT_DIR/vault/vault-init.sh"; then
        echo "ERROR: Vault initialization failed" >&2
        return 1
    fi

    if ! bash "$SCRIPT_DIR/vault/vault-configure-k8s-auth.sh"; then
        echo "ERROR: Vault Kubernetes auth configuration failed" >&2
        return 1
    fi

    if ! bash "$SCRIPT_DIR/vault/vault-store-secrets.sh"; then
        echo "ERROR: Vault secret storage failed" >&2
        return 1
    fi

    if ! bash "$SCRIPT_DIR/vault/vault-create-k8s-secrets.sh"; then
        echo "ERROR: Vault Kubernetes secrets creation failed" >&2
        return 1
    fi
    return 0
}

initialize_database() {
    echo "Waiting for database..."
    if ! kubectl wait --for=condition=ready pod/postgres-0 -n "$NAMESPACE" --timeout=120s >/dev/null; then
        echo "ERROR: PostgreSQL pod failed to become ready" >&2
        return 1
    fi

    if ! bash "$SCRIPT_DIR/database/k8s-create-db.sh"; then
        echo "ERROR: Database initialization failed" >&2
        return 1
    fi
    return 0
}

cleanup_stale_namespace() {
    if kubectl get ns "$NAMESPACE" &>/dev/null; then
        PHASE=$(kubectl get ns "$NAMESPACE" -o jsonpath='{.status.phase}' 2>/dev/null)
        if [[ "$PHASE" == "Terminating" ]]; then
            echo "Cleaning up stale terminating namespace..."
            kubectl get pvc -n "$NAMESPACE" -o name 2>/dev/null | xargs -I {} \
                kubectl patch {} -n "$NAMESPACE" -p '{"metadata":{"finalizers":[]}}' --type=merge 2>/dev/null || true
            kubectl patch ns "$NAMESPACE" -p '{"metadata":{"finalizers":[]}}' --type=merge 2>/dev/null || true
            sleep 2
        fi
    fi
    return 0
}

dev() {
    check_prerequisites || {
        echo "ERROR: Prerequisites check failed. Aborting." >&2
        return 1
    }
    cleanup_stale_namespace
    sudo echo ""
    cd "$PROJECT_ROOT" || return 1
    create_data_directories || return 1
    setup_hosts || return 1
    generate_env || return 1
    disable_traefik || return 1
    install_nginx_ingress || return 1
    build_and_load || return 1
    deploy || return 1
    setup_vault || return 1
    initialize_database || return 1
    echo "Waiting for services to stabilize..."
    sleep 15
    echo "Access the application at:"
    echo "https://$DOMAIN"
    return 0
}

dev
