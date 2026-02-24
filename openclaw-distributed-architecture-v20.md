# OpenClaw Distributed Multi-Gateway Architecture
## Version 20.0 — Integration-Verified, Production-Ready

---

## The Big Picture

```
                        ┌─────────────────────┐
                        │    YOU (Telegram)    │
                        │  DM + Agent Group    │
                        └──────────┬──────────┘
                                   │
                    ┌──────────────┼──────────────┐
                    │              │               │
                    ▼              ▼               ▼
    ┌───────────────────┐ ┌──────────────────┐ ┌──────────────────┐
    │  GATEWAY 1: HOME  │ │ GATEWAY 2: CLOUD │ │ GATEWAY 3: GPU   │
    │  (your machine)   │ │   (Hetzner VPS)  │ │  (on-demand)     │
    │                   │ │                  │ │                  │
    │ • Commander       │ │ • Researcher     │ │ • VIRS Trainer   │
    │ • Watchdog        │ │ • LinkedIn Mgr   │ │ • ML Pipeline    │
    │ • Content Creator │ │ • Librarian      │ │                  │
    │ • Quant Trader    │ │                  │ │                  │
    │ • Market Fetcher  │ │                  │ │                  │
    └────────┬──────────┘ └────────┬─────────┘ └────────┬─────────┘
             │                     │                     │
             └─────────────────────┼─────────────────────┘
                                   │
                   ┌───────────────┼───────────────┐
                   │               │               │
           ┌───────▼──────┐ ┌─────▼──────┐ ┌──────▼─────┐
           │  TAILSCALE   │ │   REDIS    │ │ SYNOLOGY   │
           │  MESH VPN    │ │  MSG BUS   │ │    NAS     │
           │  (encrypted) │ │ (in k3s)   │ │(bulk data) │
           └──────────────┘ └────────────┘ └────────────┘
```

---

## Why Multiple Gateways?

| Concern | Solution |
|---------|----------|
| Single point of failure | Watchdog + Redis bus ensure continuity; gateways independent |
| Resource isolation | GPU training doesn't starve content pipeline |
| Blast radius | Compromised cloud agent can't reach home trading keys |
| NAS contention | Redis handles all mutable state; NAS is write-once bulk only |
| Cost optimization | Cheap VPS for scraping, GPU only when training |
| Latency | Home agents use local Redis; cloud agents use cluster Redis |
| Version drift | All gateways pinned to same OCL version; ocl-upgrade syncs atomically |

---

## Network: Tailscale Mesh

```
┌──────────────────────────────────────────────────────────────────┐
│                       YOUR TAILNET                                │
│                                                                   │
│  home-gateway ──────── cloud-gateway-1 ──────── cloud-gpu        │
│  100.64.0.1            100.64.0.2                100.64.0.3      │
│       │                     │                         │           │
│       └─────────── synology-nas ──────────────────────┘           │
│                    100.64.0.4                                     │
│                                                                   │
│  All: WireGuard encrypted, NAT traversal, zero open ports        │
└──────────────────────────────────────────────────────────────────┘
```

---

## Inter-Gateway Communication: Redis + Telegram

### Redis Streams — The Actual Message Bus

All agent-to-agent task routing goes through Redis Streams. This works across gateways because all k3s nodes share the same Redis instance (home node hosts it, cloud nodes access via Tailscale).

```
Home Gateway:  Commander writes → Redis ocl:agent:researcher
Cloud Gateway: Researcher reads ← Redis ocl:agent:researcher
Cloud Gateway: Researcher writes → Redis ocl:results
Home Gateway:  Commander reads ← Redis ocl:results
```

Redis Streams are persistent — if any agent or gateway crashes, messages stay in the stream until consumed. No work is ever lost.

### Telegram Group — Human-Visible Audit Trail

Agents ALSO post summaries to the shared Telegram group. This is for YOUR visibility, not for agent-to-agent routing. Even if Telegram is down, agents communicate fine via Redis.

```
Private Group: "OCL Agent Network"
├── 📌 General           (Commander announcements)
├── 🛡️ Watchdog          (health alerts, failover)
├── 🎬 Content-Creator   (video pipeline)
├── 📊 Market-Data       (fetch status)
├── 🔬 Researcher        (paper discoveries)
├── 💼 LinkedIn          (post drafts)
├── 📚 Librarian         (archive acquisitions)
├── 📈 Quant-Trader      (signals)
├── 🧠 VIRS-Trainer      (training progress)
├── ⚙️ System            (health, rate limits)
└── 📊 Dashboard         (daily cost summaries)
```

---

## Gateway Assignments

### Gateway 1: HOME (Your Unix Machine)

| Agent | Model | Network | Why Here |
|-------|-------|---------|----------|
| Commander | Opus | bridge | Central brain, always reachable |
| Watchdog | local-fast | bridge | Commander failover ($5/mo) |
| Token Audit | local-fast | bridge | Cost monitoring ($3/mo) |
| Content Creator | Sonnet | bridge | Direct NAS video access |
| Quant Trader | Opus | **none** | Trading keys never leave home |
| Market Data Fetcher | local-fast | bridge | Feeds Quant Trader ($5/mo) |

### Gateway 2: CLOUD VPS (~€8/mo Hetzner)

| Agent | Model | Network | Why Here |
|-------|-------|---------|----------|
| Researcher | Opus | bridge | Heavy web scraping, 24/7 |
| LinkedIn Manager | Sonnet | bridge | Social posting |
| Librarian | Opus | bridge | Large downloads from archives |

### Gateway 3: GPU CLOUD (on-demand)

| Agent | Model | Network | Why Here |
|-------|-------|---------|----------|
| VIRS Trainer | Sonnet | bridge | Needs GPU |
| ML Pipeline | Sonnet | bridge | Data preprocessing |

---

## Data Architecture Across Gateways

### Redis (Hosted on Home k3s Node, Accessible to All via Tailscale)

All gateways connect to the same Redis instance. Cloud agents access it at the home node's Tailscale IP.

```yaml
# Cloud gateway's OpenClaw config points to home Redis
redis:
  host: "100.64.0.1"     # Home Tailscale IP
  port: 6379
```

This means:
- Task boards, queues, heartbeats, checkpoints all centralized
- No NFS locking issues regardless of how many gateways write
- Cloud agents have ~5-20ms latency to Redis (Tailscale overhead) — fine for task metadata
- If home goes down, cloud agents lose Redis access but their current work continues locally

### NAS (Accessed by All Gateways via NFS over Tailscale)

```
/mnt/nas/ ← mounted on all gateways
├── agents/
│   ├── content-creator/    ← Written by Home only
│   ├── quant-trading/
│   │   ├── data/           ← Written by Market Fetcher (Home) only
│   │   ├── signals/        ← Written by Quant Trader (Home) only
│   │   └── logs/
│   ├── researcher/         ← Written by Cloud only
│   ├── linkedin/           ← Written by Cloud only
│   ├── library/            ← Written by Cloud only
│   └── virs-training/      ← Written by GPU only
├── shared/
│   └── media-assets/
└── backups/
```

**Key rule:** Each NAS directory is written to by exactly ONE agent. No concurrent writers. NFS locking is never an issue because files are write-once.

---

## Resilience Across Gateways

### Scenario: Home Gateway Crashes

```
✅ Cloud agents continue working (their tasks are in Redis, already consumed)
✅ Cloud agents write results to NAS (still accessible)
⚠️ Cloud agents can't get NEW tasks from Commander (Redis unreachable)
⚠️ New task delegation pauses until home recovers
✅ Existing in-progress work completes normally
✅ On home recovery: Commander reads Redis, catches up on results
```

### Scenario: Cloud Gateway Crashes

```
✅ Home agents unaffected
✅ Commander detects via expired heartbeats in Redis
✅ Commander re-queues unfinished tasks in Redis
✅ When cloud recovers: agents check Redis for incomplete tasks, resume
```

### Scenario: Commander AND Watchdog Both Crash

```
✅ Redis Streams persist all queued tasks
✅ Agents already working continue to completion
✅ Results accumulate in Redis ocl:results
⚠️ New task delegation pauses
✅ On recovery: Commander processes backlog from Redis
```

---

## Rate Limit Resilience Across Gateways

All agents on all gateways share the same rate-limit resilience behavior:

**Claude Premium Subscription Priority:** Your Claude Premium subscription is the primary tier. When it hits a rate limit (often 5-hour reset cycles), the system waits for the premium reset rather than immediately failing over to expensive pay-per-token models. LiteLLM is configured with `num_retries: 0`, `retry_after: true`, and `cooldown_time: 300`. On 429, LiteLLM writes the reset timestamp to `ocl:subscription:anthropic` and `ocl:ratelimit:<agent>` in Redis. The Watchdog detects this and posts to Telegram: "⚠️ Claude Premium Limit Reached. Agent {id} sleeping. Resume at: {reset_time}. Checkpoints saved." The Dashboard displays a live Reset Countdown timer. Only tasks explicitly flagged "urgent" by Commander may failover to pay-per-token providers. The agent's task state is already checkpointed in Redis, so when the premium resets, the agent resumes from the last saved step.

**Task Checkpointing:** Every agent saves its progress to Redis (`ocl:task-state:<agent>:<task>`) before each step of multi-step work. If the agent's session times out during a LiteLLM backoff, the checkpoint persists in Redis.

**Resume on Restart:** Every agent's SOUL.md includes the Universal Recovery Protocol. On startup, agents check `KEYS ocl:task-state:<id>:*` for incomplete tasks and resume from the last checkpoint instead of restarting.

**Duplicate Prevention:** Before starting any task, agents check `EXISTS ocl:task-state:<id>:<task>`. If it exists and was updated within 10 minutes, another instance is already working on it — skip. If older than 10 minutes, the previous run likely crashed — resume.

**Cross-Gateway Impact:** When a cloud agent is rate-limited on Anthropic, home agents may still have quota (different request patterns). LiteLLM tracks per-provider cooldowns. Each agent independently falls back through its provider chain.

```
Cloud Researcher hits Anthropic 429
  → LiteLLM retries with backoff
  → If backoff exceeds session timeout:
      Task state already saved to Redis (home node)
  → Agent session ends
  → Agent restarts, reads checkpoint from Redis, resumes
  → Meanwhile: Home Commander still working fine on Anthropic
    (different rate-limit bucket if using different API keys)
```

---

## Kubernetes Multi-Node Setup

### Phase 1: Single Node (Home Only)

```bash
# Install k3s with WireGuard-encrypted inter-node networking
# --flannel-backend=wireguard-native encrypts ALL pod-to-pod traffic
curl -sfL https://get.k3s.io | sh -s - \
  --write-kubeconfig-mode 644 \
  --flannel-backend=wireguard-native
```

### Phase 2: Add Cloud Node

```bash
# On home machine, get join token
sudo cat /var/lib/rancher/k3s/server/node-token

# On cloud VPS (must have Tailscale running)
# flannel-backend is inherited from server, but wireguard-native
# ensures the cloud ↔ home pod traffic is encrypted at the CNI layer
curl -sfL https://get.k3s.io | K3S_URL=https://100.64.0.1:6443 \
  K3S_TOKEN=<token> sh -s - --node-name cloud-1
```

Now both nodes share the same k3s cluster. Pods can be scheduled on either node. Redis and LiteLLM run on home, gateway pods on their respective nodes. All inter-node traffic is double-encrypted: Tailscale WireGuard tunnel + flannel WireGuard CNI.

```yaml
# Force gateway-cloud to run on cloud node
spec:
  nodeSelector:
    kubernetes.io/hostname: cloud-1
```

### Phase 3: Add GPU Node

```bash
# On GPU instance (with nvidia-container-toolkit installed)
curl -sfL https://get.k3s.io | K3S_URL=https://100.64.0.1:6443 \
  K3S_TOKEN=<token> sh -s - --node-name gpu-1

# Install NVIDIA device plugin
kubectl apply -f https://raw.githubusercontent.com/NVIDIA/k8s-device-plugin/v0.14.1/nvidia-device-plugin.yml
```

---

## Version Management Across Gateways

### The Problem: API Protocol Drift

If the OpenClaw team changes internal message structures (e.g., `sessions_send` format) between versions, a Home gateway on v1.2 cannot communicate with a Cloud gateway on v1.3. With multiple gateways deployed at different times, this is a real risk.

### Solution: Pinned Versions, Synchronized Upgrades

**All gateways run the exact same OpenClaw version.** The version is pinned at first install and enforced on every subsequent gateway deployment.

```
state.yaml (on home machine):
  ocl_version: "1.4.2"           ← Pinned at first install
  node_image: "node:22.14-slim"  ← Pinned container base
  redis_image: "redis:7.4-alpine"
  ollama_image: "ollama/ollama:0.6.2"

When adding Cloud gateway (week 5+):
  Wizard reads ocl_version: "1.4.2" from state.yaml
  Installs openclaw@1.4.2 (NOT @latest)
  If cloud already has openclaw@1.5.0 → ERROR: version mismatch
  Must run ocl-upgrade first, or use --force to override
```

### Gateway Container Image

```yaml
# gateway-home.yaml and gateway-cloud.yaml use pinned images
spec:
  containers:
    - name: openclaw
      image: node:22.14-slim                  # Pinned, not node:22-slim
      command: [sh, -c]
      args:
        - |
          npm install -g openclaw@1.4.2       # Pinned, not @latest
          openclaw gateway --port 18789
```

### Synchronized Upgrade Procedure

```bash
# Upgrade all gateways to 1.5.0
ocl-upgrade 1.5.0
```

The `ocl-upgrade` command performs a **locked rolling upgrade with health checks**:

```
1. PRE-FLIGHT LOCK: Pause all Redis task queues cluster-wide
   - SET ocl:upgrade:lock "1.5.0" EX 3600
   - All agents stop accepting new tasks (checkpoint current work)
   - Post to Telegram: "🔒 Upgrade lock engaged. Task queues paused."
2. Validate 1.5.0 exists on npm registry
3. Check skill compatibility (min/max OCL version in skill templates)
4. Update state.yaml: ocl_version → "1.5.0"
5. Upgrade Home gateway:
   a. Update gateway-home ConfigMap with new version
   b. Rolling restart: kubectl rollout restart deployment/gateway-home
   c. Wait for Ready state
   d. Run ocl-health — verify version match
   e. If FAIL → rollback to 1.4.2, abort, UNLOCK queues
6. Upgrade Cloud gateway (same steps)
7. Upgrade GPU gateway (same steps)
8. VERIFY: ocl-health confirms 100% of nodes on target version
9. UNLOCK: Resume all Redis task queues
   - DEL ocl:upgrade:lock
   - Post to Telegram: "✅ All gateways upgraded to 1.5.0. Queues resumed."
```

If any gateway fails its health check after upgrade, the entire operation rolls back to the previous version on ALL gateways AND unlocks queues. The system never enters a "half-state" where different gateways run different versions while tasks are flowing.

**Emergency Recovery:** If both the upgrade AND the rollback fail, leaving the cluster locked, run `ocl-unlock` to force-remove the upgrade lock. This is a safety valve that presents a confirmation dialog before unlocking.

### Version Verification in ocl-health

```bash
$ ocl-health

═══ OCL Agent Network Health ═══

── Version Sync ──
  Pinned version:    1.4.2
  Home gateway:      1.4.2 ✅
  Cloud gateway:     1.4.2 ✅
  GPU gateway:       (not deployed)
  Node.js image:     node:22.14-slim ✅
  Redis image:       redis:7.4-alpine ✅
  Ollama image:      ollama/ollama:0.6.2 ✅

── Kubernetes ──
  ...
```

### Skill Compatibility

Custom skills declare version constraints:

```yaml
apiVersion: ocl/v1
kind: SkillTemplate
metadata:
  name: custom-web-scraper
spec:
  ocl_version:
    min: "1.3.0"
    max: "1.99.99"
```

The wizard validates before deploying: if a skill requires OCL ≥1.5 but you're pinned to 1.4.2, deployment is blocked with a clear error.

---

## Tailscale ACL Policy

```jsonc
{
  "tagOwners": {
    "tag:home":     ["your-email@example.com"],
    "tag:cloud":    ["your-email@example.com"],
    "tag:gpu":      ["your-email@example.com"],
    "tag:nas":      ["your-email@example.com"],
    "tag:personal": ["your-email@example.com"]
  },
  "acls": [
    // Your devices reach everything
    { "action": "accept", "src": ["tag:personal"], "dst": ["*:*"] },
    // Gateways reach each other (k3s cluster communication)
    { "action": "accept",
      "src": ["tag:home", "tag:cloud", "tag:gpu"],
      "dst": ["tag:home:*", "tag:cloud:*", "tag:gpu:*"] },
    // All gateways reach NAS (NFS)
    { "action": "accept",
      "src": ["tag:home", "tag:cloud", "tag:gpu"],
      "dst": ["tag:nas:2049"] }
  ]
}
```

---

## Agent & Node Lifecycle Management — Per-Tier

### Agent-Level Commands (Cross-Gateway)

```bash
# ── Pause / Resume (any agent on any gateway) ──
ocl-pause researcher                  # Cloud researcher paused
ocl-resume researcher                 # Cloud researcher resumed

# ── Restart (rolling, no data loss) ──
ocl-restart agent researcher          # Restart researcher pod on cloud
ocl-restart gateway cloud             # Restart all cloud agents

# ── Start (re-deploy after nuke) ──
ocl-start agent researcher            # Re-generate SOUL, scale deployment to 1

# ── Nuke (destructive, archives to ALKB first) ──
ocl-nuke agent researcher             # Archive + wipe researcher on cloud
ocl-nuke tier cloud                   # Archive + wipe all cloud agents
ocl-nuke tier home                    # Archive + wipe home (cloud continues with cached tasks)
ocl-nuke all --confirm="NUKE ALL"     # Nuclear: everything except NAS
```

### Cross-Gateway Behavior

When pausing or restarting agents across gateways, commands are issued via Tailscale SSH to the target node's `kubectl`. The Dashboard sends the same commands via API.

| Action | Home Agents | Cloud Agents | GPU Agents |
|--------|-------------|--------------|------------|
| Pause/Resume | Direct kubectl | Via Tailscale SSH | Via Tailscale SSH |
| Restart | Rolling restart | Rolling restart | Rolling restart |
| Nuke | Local + ALKB archive | Remote + ALKB archive | Remote + ALKB archive |
| Health Check | `ocl-health` | `ocl-health` (remote) | `ocl-health` (remote) |

### Dashboard Integration

The Dashboard's **Agent Management Panel** shows every agent across all gateways with real-time status, pause/resume controls, and nuke buttons. The **Node Management Panel** shows each gateway with aggregate health and one-click restart/nuke controls.

Every nuke includes: ALKB archive, K8s pod deletion, agent state cleanup, secure file shredding, and key pattern scanning. NAS data is always preserved unless explicitly targeted.

---

## Security Per Tier

| Aspect | Home | Cloud | GPU |
|--------|------|-------|-----|
| Network | Tailscale only | Tailscale only, UFW deny all | Tailscale only |
| SSH | Tailscale SSH | Tailscale SSH, public SSH disabled | Tailscale SSH |
| Gateway bind | 127.0.0.1 | Tailscale IP | Tailscale IP |
| Exec approval | ON | ON | ON |
| Trading access | Commander + Quant + Fetcher | NONE | NONE |
| API keys | tmpfs-mounted K8s Secrets | tmpfs-mounted K8s Secrets | tmpfs-mounted K8s Secrets |
| Inter-node encryption | WireGuard CNI (flannel) | WireGuard CNI (flannel) | WireGuard CNI (flannel) |
| Redis Stream auth | JWT-signed messages (60-min TTL) | JWT-signed messages (60-min TTL) | JWT-signed messages (60-min TTL) |
| NAS mount | noexec | noexec | noexec |
| Sandbox | Docker per agent | Docker per agent | Docker + GPU |
| OCL version | Pinned, same as home | Pinned, same as home | Pinned, same as home |
| Container images | Pinned tags | Pinned tags | Pinned tags |
| Egress DLP | Regex + Diplomat (2-stage) | Regex + Diplomat (2-stage) | Regex + Diplomat (2-stage) |
| Egress Proxy | All external traffic via proxy | All external traffic via proxy | All external traffic via proxy |
| NetworkPolicy | Agents → Proxy/LiteLLM/Redis only | Agents → Proxy/LiteLLM/Redis only | Agents → Proxy/LiteLLM/Redis only |
| Redis resilience | Primary (master) | Local buffer queue (split-brain) | Local buffer queue (split-brain) |
| ALKB validation | Human-in-the-Loop review | Reads only "Approved" fixes | Reads only "Approved" fixes |
| Community skills | BLOCKED | BLOCKED | BLOCKED |

### Secret Management Across Gateways
API keys are stored exclusively in Kubernetes Secrets. The setup wizard collects keys with `read -rs` (silent, never echoed), pipes them directly to `kubectl create secret` without writing to any file, and immediately unsets them from shell memory. Secrets are mounted into pods as **tmpfs volumes** (RAM-disk), not as environment variables. If a container is compromised, `env` reveals nothing. If the pod is killed, the tmpfs disappears. The `ocl-nuke` script includes a secure cleanup routine that shreds temp files and scans all config files for leaked key patterns, redacting any found.

### Inter-Node Encryption
k3s is installed with `--flannel-backend=wireguard-native`, encrypting all pod-to-pod traffic across nodes. Combined with Tailscale, cross-gateway traffic is double-encrypted: Tailscale WireGuard tunnel at the network layer, plus flannel WireGuard at the CNI layer.

### Agent Identity & HMAC Verification
Every agent receives a unique `AGENT_SIGNATURE_KEY`. When writing to Redis Streams, agents include an HMAC-SHA256 signature. Commander and Watchdog verify signatures when reading from any stream. Invalid or unsigned messages are dropped and trigger a security alert in the Telegram Security topic. This prevents a compromised cloud pod from injecting fake tasks into the home trading pipeline.

### Tailscale-Only Service Binding
LiteLLM and Redis are configured to listen only on the Tailscale interface (`100.64.x.x`). Any connection from outside the Tailnet — even from the same physical machine — is rejected at the network level.

### Trading Isolation Across Gateways
The Quant Trader (network: none) and Market Data Fetcher (write-only to trading/data/) both run on the Home gateway exclusively. Trading keys and broker credentials never leave the home network. Cloud and GPU gateways have zero access to trading data or signals.

### Cost Monitoring
The Token Audit Agent (Home tier, local-fast model, ~$3/mo) polls LiteLLM's `/usage` API every 30 minutes and writes per-agent cost data to `ocl:cost:<agent>:<date>` in Redis. If any agent exceeds 50% of its daily budget in under 4 hours, a runaway alert is posted to Telegram. The Dashboard reads these Redis hashes to display the high-burn leaderboard and optimization recommendations.

### NAS File Index
Agents register every file they write to the NAS in Redis (`ocl:files:<hash>`) with metadata: path, agent owner, file type, size, timestamps, and tags. Other agents discover NAS files by querying Redis (`SMEMBERS ocl:files:by-tag:ai-research`) instead of performing slow recursive NFS directory scans. The Librarian agent periodically reconciles the index against the actual NAS contents.

### Diplomat Protocol — Two-Stage Egress DLP Across Gateways
All outbound external traffic goes through a **two-stage DLP pipeline**. Stage 1 is a deterministic regex filter (immune to prompt injection) that hard-blocks `/mnt/nas/`, `100.x.x.x` IPs, `ocl-` prefixes, JWT tokens, and Redis key patterns. Stage 2 is the LLM-based Diplomat Sanitization Skill that catches semantic leaks. Both stages must pass before the request reaches the Egress Proxy.

All outbound external traffic is then routed through the **Egress Proxy pod** in `ocl-services`. The proxy checks requests against Redis reputation lists (`ocl:egress:whitelist` / `ocl:egress:blacklist`). Whitelisted endpoints pass; blacklisted endpoints are blocked with a security alert to Telegram.

This applies across all gateways: Cloud agents researching external sources, Home agents fetching market data, and GPU agents downloading training datasets all go through the regex + Diplomat + Egress Proxy pipeline.

### K8s NetworkPolicy — Preventing Binary Exfiltration
A cluster-wide `NetworkPolicy` restricts agent pods to only reach the Egress Proxy (port 8080), LiteLLM (port 4000), and Redis (port 6379). All other outbound traffic is blocked at the CNI level. This prevents a compromised bridge-network agent from uploading NAS files via raw HTTP/FTP, bypassing the DLP proxy entirely.

### External Agent Reputation & JWT Authentication
Internal traffic carries valid JWTs (60-minute TTL, issued by Home master) and bypasses the Egress Proxy entirely. Cloud and GPU nodes refresh their JWTs every 55 minutes. If a node is compromised, the admin runs `ocl-revoke <node-id>` to immediately blacklist it — all messages from that node are rejected without needing to rotate keys on other nodes.

Any message arriving without a valid JWT is automatically classified as External/Untrusted and the full two-stage Diplomat pipeline is enforced on all responses.

Security audit events (JWT failures, blacklist hits, DLP regex blocks, Diplomat sanitization counts) are logged to `ocl:security:audit` in Redis. The Dashboard's Security Audit Log tab displays these in real-time.

### Agent Learnings Knowledge Base (ALKB) Across Gateways
The ALKB is stored in Redis on the Home node, making it accessible to all agents across all gateways. When a Cloud Researcher fails a task, the failure context is archived to `ocl:learnings:failures` — accessible to every other agent. When a Home Content Creator later encounters a similar pattern, it can consult `ocl:learnings:by-domain:<domain>` to find the validated fix.

**Human-in-the-Loop Validation:** Auto-promoted fixes are marked "Pending Review" until a human approves them via the Dashboard. Only "Approved" learnings are returned when agents consult the ALKB. This prevents the "Poisoned Learning" problem — a hallucinating agent cannot propagate bad habits to other agents across gateways.

**Feature Attribution:** Every learning carries `source_agent_type`, `token_saving_delta`, and `monetization_tier` metadata. The Dashboard's Monetization Features view aggregates these across all gateways for product planning.

**Nuke-to-Knowledge:** When any agent on any tier is nuked, `ocl-nuke` archives the final task-state to `ocl:learnings:failures` before wiping. ALKB data itself is never wiped by nuke operations — it persists as permanent institutional memory.

---

## Redis Split-Brain Resilience

### The Problem

Cloud and GPU agents write to Home Redis over Tailscale. If the Tailscale link is unstable, agents hang waiting for Redis, producing "Task Zombies" — tasks that appear active but the agent has stalled.

### Solution: Local Buffer Queue

Each non-Home gateway runs a lightweight local Redis instance as a buffer. If the Home Redis connection drops, agents transparently write checkpoints to the local buffer (`ocl:buffer:<gateway-id>`). When the Tailscale link reconnects, the buffer auto-syncs to Home Redis.

```
Cloud agent writes checkpoint
       │
       ▼
┌──────────────────────┐
│ Try Home Redis       │
│ (100.64.x.x:6379)   │──► Success? Write directly
│                      │
│ Connection timeout?  │
│       │              │
│       ▼              │
│ Write to local       │
│ buffer Redis         │
│ (127.0.0.1:6380)    │
│                      │
│ ocl:buffer:cloud-1   │
│ Stream: checkpoint,  │
│ heartbeat, results   │
└──────────┬───────────┘
           │
           ▼ (Tailscale reconnects)
┌──────────────────────────┐
│ Buffer Sync Service      │
│                          │
│ For each buffered entry: │
│  1. Check dedup key:     │
│     EXISTS ocl:dedup:<id>│
│  2. If exists → skip     │
│  3. If not → write to    │
│     Home Redis + SET     │
│     ocl:dedup:<id> 1     │
│     EX 3600 (1hr TTL)   │
│                          │
│ Clears local buffer      │
│ Posts: "✅ Cloud-1       │
│ re-synced N entries      │
│ (M deduped)"            │
└──────────────────────────┘
```

**Why dedup?** During a split-brain, some entries may have already been written to primary Redis before the connection dropped mid-batch. Without dedup, the sync replays those entries again, causing duplicate checkpoints, double-counted costs, and duplicate task completions.

Home agents do not need a buffer — they write directly to local Redis.

---

## NAS Outage Resilience — SSD-First Write Across Gateways

Each gateway writes agent output to local SSD first (`/home/ocl-local/agents/`), then syncs to the NAS in the background via `ocl-nas-sync`. If the Synology NAS goes offline, all gateways continue working — writes accumulate on each gateway's local SSD.

| Gateway | Local SSD Path | NAS Sync Target | Behavior on NAS Outage |
|---------|---------------|-----------------|----------------------|
| Home | `/home/ocl-local/agents/` | `/mnt/nas/agents/` | Writes to SSD, syncs when NAS returns |
| Cloud | `/home/ocl-local/agents/` | `/mnt/nas/agents/` (via Tailscale) | Writes to SSD, syncs when Tailscale + NAS up |
| GPU | `/home/ocl-local/agents/` | `/mnt/nas/agents/` | Writes to SSD, syncs when NAS returns |

`ocl-nas-sync` runs as a K8s CronJob every 5 minutes on each gateway. It uses `rsync --remove-source-files` to move confirmed synced files off local SSD. Dashboard shows per-gateway sync status.

## Unattended Deployment Across Gateways

Each gateway can be deployed unattended via `.env` file:

```bash
# Deploy Home gateway (one-click)
bash setup-wizard.sh --env /path/to/home.env

# Deploy Cloud gateway (one-click, via Tailscale SSH)
ssh cloud-node 'bash setup-wizard.sh --env /path/to/cloud.env'
```

Each `.env` file contains gateway-specific config (NAS IP, agent selection, optimizer toggle). The wizard auto-detects which gateway tier to deploy based on the `GATEWAY_TIER` field.

---

## Token Optimizer — Cross-Gateway Modularity

The Token Optimizer (LiteLLM + Ollama) is optional at install. Each gateway tracks its own `optimizer_active` flag in state.yaml. Home might run optimized while a lightweight Cloud VPS runs in Direct Mode to save memory.

| Mode | Home (16GB) | Cloud (4-8GB) | GPU |
|------|-------------|---------------|-----|
| Direct Mode | ⚠️ Higher API cost | ✅ Recommended for small VPS | N/A |
| Optimized | ✅ Full savings | ✅ If RAM allows | ✅ |

Enable per-gateway: `ocl-enable optimizer` on each node. The config hot-swap regenerates the gateway's OpenClaw config and performs a rolling restart — no nuke needed.

When optimizer is off, agents that normally use `local-fast` (Watchdog, Token Audit, Diplomat DLP) are re-routed to cheap cloud models (e.g., Gemini Flash). This slightly increases cost but allows operation on low-memory systems.

---

## Cost Projections

| Component | Phase 0 (Direct) | Phase 1 (Optimized) | Phase 2 (+Cloud) | Phase 3 (+GPU) |
|-----------|-------------------|---------------------|-------------------|----------------|
| Anthropic API | $120-300 | $80-180 | $130-230 | $150-260 |
| OpenAI (fallback) | $15-50 | $10-30 | $20-50 | $25-60 |
| Ollama (local) | N/A | Free | Free | Free |
| Cloud VPS | $0 | $0 | €8-15/mo | €8-15/mo |
| GPU on-demand | $0 | $0 | $0 | $0.50-2/hr |
| Token savings | None | -25-40% | -25-40% | -25-40% |
| Min RAM | **8GB** | **16GB** | 4GB+ | 8GB+ |
| **Net Total** | **$135-350** | **$70-160** | **$130-250** | **$160-330** |

---

## Deployment Order

| Week | Action | Machine | Version Note |
|------|--------|---------|-------------|
| 1 | Setup wizard: home tier | Home | Pins OCL version (e.g., 1.4.2) |
| 2 | Validate Commander + Watchdog + Telegram | Home | `ocl-health` confirms version |
| 3 | Add Content Creator + Market Fetcher + Quant Trader | Home | Same pinned version |
| 4 | Tune budgets, verify rate limit resilience | Home | |
| 5 | Provision cloud VPS, join k3s cluster | Cloud | Wizard reads pin from state.yaml |
| 6 | Run wizard on cloud: Researcher + LinkedIn | Cloud | Installs openclaw@1.4.2 (pinned) |
| 7 | Add Librarian to cloud | Cloud | `ocl-health` verifies version sync |
| 8 | Test GPU gateway with small VIRS training run | GPU | Same pinned version |
