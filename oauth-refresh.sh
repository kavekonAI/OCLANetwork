#!/bin/bash
# Sync Claude OAuth token from credentials.json to k8s secret (LEGACY — manual backup only)
# Token architecture (no race conditions):
#   1. Claude Code CLI — SOLE token refresher (auto-refreshes before expiry)
#   2. token-sync.js (inside gateway pod, every 60s) — READ-ONLY, distributes to agents
#   3. anthropic-oauth-refresh CronJob (every 30m) — READ-ONLY, syncs to k8s secret
# This script does NOT refresh — just syncs current credentials.json to k8s secret.
set -euo pipefail
export KUBECONFIG=/home/ocl/.kube/config
CREDS=/home/ocl/.claude/.credentials.json

if [ ! -f "$CREDS" ]; then
  echo "ERROR: $CREDS not found"
  exit 1
fi

ACCESS=$(python3 -c "import json; d=json.load(open('$CREDS')); print(d['claudeAiOauth']['accessToken'])")
REFRESH=$(python3 -c "import json; d=json.load(open('$CREDS')); print(d['claudeAiOauth']['refreshToken'])")
EXPIRES=$(python3 -c "import json; d=json.load(open('$CREDS')); print(d['claudeAiOauth']['expiresAt'])")
NOW_MS=$(python3 -c "import time; print(int(time.time()*1000))")

EXPIRES_IN=$(python3 -c "print(($EXPIRES - $NOW_MS) // 1000 // 60)")
echo "Token expires in ${EXPIRES_IN} minutes"

if [ "$EXPIRES_IN" -le 0 ]; then
  echo "WARNING: Token is EXPIRED — CronJob or token-sync.js should auto-refresh"
fi

# Sync to k8s secret (no restart — token-sync.js in the pod reads credentials.json directly)
kubectl create secret generic anthropic-oauth -n ocl-agents \
  --from-literal=ANTHROPIC_OAUTH_TOKEN="$ACCESS" \
  --from-literal=ANTHROPIC_REFRESH_TOKEN="$REFRESH" \
  --from-literal=ANTHROPIC_OAUTH_EXPIRES="$EXPIRES" \
  --dry-run=client -o json | kubectl apply -f -

# Ensure permissions for pod readability (uid 1000 reads file owned by uid 1001)
chmod 666 "$CREDS" 2>/dev/null || true

echo "Secret synced (no restart). Token-sync.js handles live distribution."
