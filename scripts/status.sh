#!/bin/bash

set -Eeuo pipefail

get_pod_uptime() {
    local pod_name=$1
    local start_time=$(kubectl get pod "$pod_name" -n transcendence -o jsonpath='{.status.startTime}' 2>/dev/null)

    if [[ -n "$start_time" ]]; then
        local created_time=$(date -d "$start_time" +%s 2>/dev/null)

        if [[ -n "$created_time" ]]; then
            local current_time=$(date +%s)
            local uptime_seconds=$((current_time - created_time))
            local minutes=$((uptime_seconds / 60))
            local seconds=$((uptime_seconds % 60))
            printf "%dm %ds" $minutes $seconds
        else
            echo "N/A"
        fi
    else
        echo "N/A"
    fi
    return 0
}

get_pod_status() {
    local pods_output
    pods_output=$(kubectl get pods -n transcendence 2>/dev/null | tail -n +2) || {
        echo "No pods found"
        return
    }

    if [[ -z "$pods_output" ]]; then
        echo "No pods found"
        return
    fi

    local bc=0
    local fc=0
    while IFS= read -r line; do
        if [[ -z "$line" ]]; then
            continue
        fi

        local name status status_icon pod_uptime short_name ready restarts
        name=$(echo "$line" | awk '{print $1}')
        ready=$(echo "$line" | awk '{print $2}')
        status=$(echo "$line" | awk '{print $3}')
        restarts=$(echo "$line" | awk '{print $4}')

        if echo "$name" | grep -q "backend"; then
            ((bc++))
            short_name="backend-$bc"
        elif echo "$name" | grep -q "frontend"; then
            ((fc++))
            short_name="frontend-$fc"
        elif echo "$name" | grep -q "postgres"; then
            short_name="postgres"
        elif echo "$name" | grep -q "vault"; then
            short_name="vault"
        else
            short_name="$name"
        fi

        if [[ "$status" == "Running" ]]; then
            status_icon="✓"
        elif [[ "$status" == "Pending" || "$status" == "ContainerCreating" || "$status" == "PodInitializing" ]]; then
            status_icon="⏳"
        else
            status_icon="✗"
        fi

        pod_uptime=$(get_pod_uptime "$name")
        printf "% -15s %-8s %-12s %-8s %-8s %s\n" "$short_name" "$ready" "$status" "$restarts" "$pod_uptime" "$status_icon"
    done <<< "$pods_output"
    return 0
}

while true; do
    clear
    printf "% -15s %-8s %-12s %-8s %-8s %s\n" "POD" "READY" "STATUS" "RESTARTS" "UPTIME" "HEALTH"
    printf "% -15s %-8s %-12s %-8s %-8s %s\n" "---" "-----" "------" "--------" "------" "------"
    get_pod_status
    sleep 3
done