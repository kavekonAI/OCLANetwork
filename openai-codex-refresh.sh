#!/bin/bash
# Refresh OpenAI Codex CLI OAuth token and update k8s secret
set -euo pipefail
export KUBECONFIG=/home/ocl/.kube/config
AUTH=/home/ocl/.codex/auth.json

# Run codex to refresh the token (updates auth.json in place)
/home/ocl/.npm-global/bin/codex login --refresh 2>/dev/null || true

ACCESS=$(python3 -c "import json; d=json.load(open('$AUTH')); print(d['tokens']['access_token'])")
REFRESH=$(python3 -c "import json; d=json.load(open('$AUTH')); print(d['tokens']['refresh_token'])")
ACCOUNT=$(python3 -c "import json; d=json.load(open('$AUTH')); print(d['tokens']['account_id'])")
EXPIRES=$(python3 -c "
import json,base64
d=json.load(open('$AUTH'))
a=d['tokens']['access_token']
p=a.split('.')[1]; p+='='*(4-len(p)%4)
import json as j2; claims=j2.loads(base64.b64decode(p))
print(claims['exp']*1000)
")

NOW_MS=$(python3 -c "import time; print(int(time.time()*1000))")
EXPIRES_IN=$(python3 -c "print(($EXPIRES - $NOW_MS) // 1000 // 60)")
echo "OpenAI Codex token expires in ${EXPIRES_IN} minutes"

kubectl create secret generic openai-codex-oauth -n ocl-agents \
  --from-literal=OPENAI_CODEX_ACCESS_TOKEN="$ACCESS" \
  --from-literal=OPENAI_CODEX_REFRESH_TOKEN="$REFRESH" \
  --from-literal=OPENAI_CODEX_ACCOUNT_ID="$ACCOUNT" \
  --from-literal=OPENAI_CODEX_EXPIRES="$EXPIRES" \
  --dry-run=client -o json | kubectl apply -f -

kubectl rollout restart deployment/gateway-home -n ocl-agents
echo "Gateway restart triggered with fresh OpenAI Codex OAuth token"
