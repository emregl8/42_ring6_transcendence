#!/bin/bash

set -euo pipefail

CLUSTER_NAME="transcendence"
NAMESPACE="ingress-nginx"
KUBECTL="docker exec $CLUSTER_NAME-control-plane kubectl"
MAX_ATTEMPTS=3
RETRY_DELAY=5

install_nginx_ingress() {
	echo "Installing nginx-ingress controller..."

	$KUBECTL apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml 2>&1 | grep -v "Warning" || true

	echo "Waiting for namespace..."
	$KUBECTL wait --for=jsonpath='{.status.phase}'=Active "namespace/$NAMESPACE" --timeout=30s 2>/dev/null || true

	echo "Adding required label to namespace..."
	$KUBECTL label namespace "$NAMESPACE" name=ingress-nginx --overwrite 2>/dev/null || true

	echo "Waiting for admission jobs to create webhook secret..."
	for i in {1..30}; do
		if $KUBECTL get secret ingress-nginx-admission -n "$NAMESPACE" >/dev/null 2>&1; then
			echo "Webhook secret created!"
			break
		fi
		sleep 2
	done

	echo "Cleaning up admission webhook jobs..."
	$KUBECTL delete validatingwebhookconfiguration ingress-nginx-admission 2>/dev/null || true
	$KUBECTL delete job ingress-nginx-admission-create ingress-nginx-admission-patch -n "$NAMESPACE" 2>/dev/null || true

	echo "Waiting for controller..."
	for i in {1..60}; do
		READY=$($KUBECTL get deployment ingress-nginx-controller -n "$NAMESPACE" -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
		if [ "$READY" = "1" ]; then
			echo "Controller ready!"
			break
		fi
		sleep 3
	done

	echo "Setting NodePorts..."
	$KUBECTL patch service ingress-nginx-controller -n "$NAMESPACE" --type='json' \
		-p='[
        {"op": "replace", "path": "/spec/ports/0/nodePort", "value": 30656},
        {"op": "replace", "path": "/spec/ports/1/nodePort", "value": 30813}
    ]' 2>/dev/null || true

	echo "Nginx-ingress controller installed"
}

for attempt in $(seq 1 $MAX_ATTEMPTS); do
	echo "Attempt $attempt of $MAX_ATTEMPTS..."

	if install_nginx_ingress; then
		echo "Nginx-ingress installed successfully!"
		exit 0
	else
		if [ $attempt -lt $MAX_ATTEMPTS ]; then
			echo "Attempt $attempt failed. Retrying in $RETRY_DELAY seconds..."
			sleep $RETRY_DELAY
		else
			echo "All $MAX_ATTEMPTS attempts failed. Installation failed."
			exit 1
		fi
	fi
done
