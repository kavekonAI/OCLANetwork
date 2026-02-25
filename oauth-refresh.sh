#!/bin/bash
# Refresh Claude Max OAuth token and update k8s secret
set -euo pipefail
KUBECONFIG=/home/ocl/.kube/config
CREDS=/home/ocl/.claude/.credentials.json

ACCESS=$(python3 -c "import json; d=json.load(open('$CREDS')); print(d['claudeAiOauth']['accessToken'])")
REFRESH=$(python3 -c "import json; d=json.load(open('$CREDS')); print(d['claudeAiOauth']['refreshToken'])")
EXPIRES=$(python3 -c "import json; d=json.load(open('$CREDS')); print(d['claudeAiOauth']['expiresAt'])")
NOW_MS=$(python3 -c "import time; print(int(time.time()*1000))")

# If token expires in < 2 hours, update the secret
EXPIRES_IN=$(python3 -c "print(($EXPIRES - $NOW_MS) // 1000 // 60)")
echo "Token expires in ${EXPIRES_IN} minutes"

if [ "$EXPIRES_IN" -lt 120 ]; then
  echo "Token expiring soon — update secret and restart gateway"
else
  echo "Token still fresh (${EXPIRES_IN} min left) — updating secret anyway to stay current"
fi

kubectl create secret generic anthropic-oauth -n ocl-agents \
  --from-literal=ANTHROPIC_OAUTH_TOKEN="$ACCESS" \
  --from-literal=ANTHROPIC_REFRESH_TOKEN="$REFRESH" \
  --from-literal=ANTHROPIC_OAUTH_EXPIRES="$EXPIRES" \
  --dry-run=client -o json | kubectl apply -f -

# Restart gateway to pick up new token
kubectl rollout restart deployment/gateway-home -n ocl-agents
echo "Gateway restart triggered with fresh OAuth token"
