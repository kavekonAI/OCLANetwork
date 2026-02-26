# OCL Agent Network — Requirements & Architecture Document
## Version 20.0 — Integration-Verified, Production-Ready, Production-Ready

---

## 1. Executive Summary

A self-hosted, scalable multi-agent AI system built on OpenClaw that starts as a single home deployment and scales to multi-gateway cloud, with no single point of failure, no file-locking issues, no secret leakage, full rate-limit resilience, proactive cost monitoring, NAS file indexing, encrypted inter-node traffic, hardened secret storage with tmpfs-only key injection, JWT-signed inter-agent messaging with rotation, a token optimization dashboard, pinned version management with pre-flight upgrade locking and force-unlock safety, two-stage egress DLP (deterministic regex + LLM Diplomat), Kubernetes NetworkPolicy egress lockdown, subscription-aware rate-limit handling, external agent reputation enforcement, a human-validated Agent Learnings Knowledge Base (ALKB) with project-level monetization attribution, split-brain resilient Redis buffering with deduplication recovery, a complete agent/node lifecycle management system, a modular Token Optimizer that can be installed optionally and enabled later via hot-swap, and NFSv4.1 enforced NAS mounts for file-lock stability.

---

## 2. Requirements Matrix

### REQ-01: Token Optimizer (Modular — Optional at Install)

| ID | Requirement | Priority |
|----|-------------|----------|
| REQ-01.1 | LiteLLM proxy sits between all agents and LLM providers (when optimizer is active) | MUST |
| REQ-01.2 | Local Ollama instance for prompt pre-processing and optimization (when optimizer is active) | MUST |
| REQ-01.3 | Ollama compresses verbose prompts before sending to frontier models | MUST |
| REQ-01.4 | Prompt caching for repeated system prompts (SOUL.md) via Anthropic cache_control | MUST |
| REQ-01.5 | Response caching for identical queries via Redis (TTL-based) | SHOULD |
| REQ-01.6 | Per-agent token usage tracking and reporting via LiteLLM | MUST |
| REQ-01.7 | Monthly budget caps per agent and global | MUST |
| REQ-01.8 | Routing: simple tasks → Ollama local, complex → frontier models | SHOULD |
| REQ-01.9 | Token Optimizer is OPTIONAL at initial install — system runs in "Direct Mode" without it | MUST |
| REQ-01.10 | "Direct Mode": agents route directly to provider APIs (api.anthropic.com, etc.) when optimizer is disabled | MUST |
| REQ-01.11 | Optimizer can be enabled later via `ocl-enable optimizer` — hot-swap with rolling restart, no nuke required | MUST |
| REQ-01.12 | State flag `services.optimizer_active` in state.yaml tracks optimizer status | MUST |
| REQ-01.13 | Low Memory Mode: 8GB systems can run without local models by using cloud providers for all reasoning | SHOULD |

### REQ-02: Telegram Inter-Agent Communication

| ID | Requirement | Priority |
|----|-------------|----------|
| REQ-02.1 | Private Telegram group as human-visible audit trail | MUST |
| REQ-02.2 | Each agent has a dedicated Telegram bot in the group | MUST |
| REQ-02.3 | Forum topics per agent for organized threads | MUST |
| REQ-02.4 | Human can observe all agent-to-agent communication | MUST |
| REQ-02.5 | Human can intervene/override agent decisions via Telegram | MUST |
| REQ-02.6 | Redis Streams is the actual message bus; Telegram mirrors for visibility | MUST |
| REQ-02.7 | Messages tagged with task IDs for traceability | SHOULD |

### REQ-03: Agent Communication Dashboard

| ID | Requirement | Priority |
|----|-------------|----------|
| REQ-03.1 | Web-based dashboard accessible via Tailscale only | MUST |
| REQ-03.2 | Real-time agent messages and task status from Redis | MUST |
| REQ-03.3 | Agent health status via Redis heartbeats (online/offline/rate-limited/error) | MUST |
| REQ-03.4 | Token usage graphs per agent and cumulative via LiteLLM API | MUST |
| REQ-03.5 | Task board view from Redis taskboard hashes | MUST |
| REQ-03.6 | Cost tracking per agent and per provider | MUST |
| REQ-03.7 | Log viewer with filtering by agent, severity, time | SHOULD |
| REQ-03.8 | One-click actions: restart agent, pause agent, nuke agent | SHOULD |
| REQ-03.9 | "High-Burn" leaderboard: Agent ID vs Daily Cost vs Token-to-Result ratio | MUST |
| REQ-03.10 | Optimization recommendations: flag agents with avg prompt >10K tokens as "Needs Compression" | MUST |
| REQ-03.11 | Cache hit rate display per agent; flag 0% cache-hit agents as "Redundant System Prompts" | MUST |
| REQ-03.12 | Provider tier status: show if agent is on primary (Claude Premium) or failed over to pay-as-you-go | MUST |
| REQ-03.13 | Agent Efficiency Ratio: (tokens_out / tokens_in); flag ratio <0.1 as "Wasteful — Needs Prompt Compression" | MUST |
| REQ-03.14 | Claude Premium Reset Countdown: live timer showing time until subscription limit resets | MUST |
| REQ-03.15 | Security Audit Log: table of dropped messages that failed HMAC signature verification | MUST |
| REQ-03.16 | Egress DLP Log: table of outbound requests sanitized by the Diplomat protocol | SHOULD |
| REQ-03.17 | Learnings & Knowledge Base tab: searchable list of all agent failures and fixes, categorized by agent type and error category | MUST |
| REQ-03.18 | Learnings Promotion: one-click button to move an item from "What Didn't Work" to "Fixed" when an agent completes a previously failed task | MUST |
| REQ-03.19 | Monetization Features view: curated list of "Fixed" items tagged for future product features or version upgrades | SHOULD |
| REQ-03.20 | Agent Management Panel: per-agent controls — Pause, Resume, Restart, Nuke — with one-click buttons | MUST |
| REQ-03.21 | Node Management Panel: per-gateway controls — Restart All Agents, Nuke Gateway, Health Check — with one-click buttons | MUST |
| REQ-03.22 | Agent status indicator: Running (green), Paused (yellow), Stopped (red), Rate-Limited (orange) for each agent | MUST |
| REQ-03.23 | Confirmation dialog on destructive actions (Nuke) with ALKB archive status shown before execution | MUST |

### REQ-04: Agent & Node Lifecycle Management

| ID | Requirement | Priority |
|----|-------------|----------|
| REQ-04.1 | `ocl-nuke agent <id>`: stop and wipe one agent (pod + workspace) with ALKB archive | MUST |
| REQ-04.2 | `ocl-nuke gateway <id>`: wipe all agents on a gateway | MUST |
| REQ-04.3 | `ocl-nuke service <n>`: wipe a service (LiteLLM, dashboard, Ollama) | MUST |
| REQ-04.4 | `ocl-nuke all --confirm="NUKE ALL"`: nuclear option, wipe everything except NAS | MUST |
| REQ-04.5 | NAS data always preserved unless explicitly targeted | MUST |
| REQ-04.6 | Confirmation prompt with scope display before execution | MUST |
| REQ-04.7 | Secure cleanup: shred temp files, scan/redact leaked keys, clear bash history | MUST |
| REQ-04.8 | Nuke-to-Knowledge: archive final task-state to ALKB before wiping | MUST |
| REQ-04.9 | `ocl-pause <agent-id>`: pause agent — stops accepting new tasks, completes current step | MUST |
| REQ-04.10 | `ocl-resume <agent-id>`: resume paused agent — clears pause flag, reads from task queue | MUST |
| REQ-04.11 | `ocl-restart agent <id>`: rolling restart of a single agent pod | MUST |
| REQ-04.12 | `ocl-restart gateway <id>`: rolling restart of all agents on a gateway | MUST |
| REQ-04.13 | `ocl-start agent <id>`: re-deploy a previously nuked agent (generate SOUL + scale to 1) | MUST |
| REQ-04.14 | Dashboard Agent Management Panel: one-click Pause/Resume/Restart/Nuke per agent | MUST |
| REQ-04.15 | Dashboard Node Management Panel: one-click Restart/Nuke/Health-Check per gateway | MUST |
| REQ-04.16 | Agent status indicator: Running/Paused/Stopped/Rate-Limited with color coding | MUST |
| REQ-04.17 | Confirmation dialog on destructive actions showing ALKB archive status | MUST |
| REQ-04.18 | All lifecycle commands available via both CLI and Dashboard API | SHOULD |
| REQ-04.19 | Secure wipe uses NFS-aware method: `truncate -s 0` + `rm` on NFS paths, `shred` on local SSD only | MUST |
| REQ-04.20 | `ocl-nuke agent` runs `XGROUP DESTROY` for the agent's Redis Stream consumer groups | MUST |

### REQ-05: Rate Limit Resilience

| ID | Requirement | Priority |
|----|-------------|----------|
| REQ-05.1 | LiteLLM handles retry with exponential backoff per provider | MUST |
| REQ-05.2 | Automatic failover to fallback providers on rate limit | MUST |
| REQ-05.3 | Agents checkpoint task state to Redis before each step of multi-step work | MUST |
| REQ-05.4 | On startup, every agent checks Redis for incomplete tasks and resumes from last checkpoint | MUST |
| REQ-05.5 | Each agent can use a different primary provider | MUST |
| REQ-05.6 | Rate limit status visible on dashboard | MUST |
| REQ-05.7 | Duplicate execution prevention: agents check Redis task lock before starting work | MUST |
| REQ-05.8 | On 429: LiteLLM does NOT blindly retry; notifies Watchdog which posts reset time to Telegram | MUST |
| REQ-05.9 | Claude Premium subscription is the PRIMARY tier; on rate limit, WAIT for premium reset rather than failing over to expensive pay-per-token | MUST |
| REQ-05.10 | Watchdog parses retry_after timestamp from 429 response header and posts reset countdown to Telegram #System | MUST |
| REQ-05.11 | Cooldown-aware scheduling: defer non-urgent tasks during rate limits | SHOULD |
| REQ-05.12 | Multiple API keys per provider for key rotation | SHOULD |

### REQ-06: Resilience & Fault Tolerance

| ID | Requirement | Priority |
|----|-------------|----------|
| REQ-06.1 | Watchdog agent monitors Commander via Redis heartbeat every 60s | MUST |
| REQ-06.2 | If Commander is down >3min, Watchdog takes over simple task routing | MUST |
| REQ-06.3 | Redis Streams persist all task queues — no work lost on any agent crash | MUST |
| REQ-06.4 | All mutable shared state lives in Redis, not on NFS | MUST |
| REQ-06.5 | NAS used only for immutable bulk data (write-once-read-many) | MUST |
| REQ-06.6 | NAS mounted with NFSv4.1 for file-lock stability with parallel agent writes | MUST |
| REQ-06.7 | Commander checks for Watchdog-routed tasks on recovery | MUST |
| REQ-06.8 | Cloud agents buffer checkpoints locally if Home Redis is unreachable (split-brain resilience) | MUST |
| REQ-06.9 | Local buffer queue auto-syncs to Home Redis when Tailscale link reconnects | MUST |
| REQ-06.10 | Redis Sentinel monitors Home Redis health; cloud agents detect failover automatically | SHOULD |
| REQ-06.11 | Split-brain recovery uses message-ID deduplication to prevent duplicate writes on reconnect | MUST |

### REQ-07: Security

| ID | Requirement | Priority |
|----|-------------|----------|
| REQ-07.1 | All inter-machine communication via Tailscale mesh (zero public ports) | MUST |
| REQ-07.2 | API keys collected in memory only (read -rs), never written to disk | MUST |
| REQ-07.3 | Keys injected directly to K8s Secrets via stdin pipe | MUST |
| REQ-07.4 | Secure cleanup routine: shred temp files, scan configs for leaked key patterns | MUST |
| REQ-07.5 | Quant Trader sandboxed with network: none | MUST |
| REQ-07.6 | Dedicated Market Data Fetcher with write-only access to trading/data/, no access to signals/ | MUST |
| REQ-07.7 | Trade execution is a separate process requiring human approval | MUST |
| REQ-07.8 | Per-agent Docker sandbox isolation | MUST |
| REQ-07.9 | exec.ask: on for all agents | MUST |
| REQ-07.10 | No community skills installed until vetted | MUST |
| REQ-07.11 | k3s installed with flannel-backend=wireguard-native for encrypted inter-node traffic | MUST |
| REQ-07.12 | Secrets mounted as tmpfs volumes (RAM-disk), not environment variables, to prevent zombie exposure | MUST |
| REQ-07.13 | LiteLLM and Redis bound to Tailscale interface only; reject non-Tailnet connections | MUST |
| REQ-07.14 | Redis Stream messages carry HMAC signature; unsigned/invalid messages dropped + alert | MUST |
| REQ-07.15 | All external agent traffic routed through a dedicated Egress Proxy pod — no direct internet from agent containers | MUST |
| REQ-07.16 | Egress Proxy maintains a Redis-based whitelist/blacklist of external AI endpoints | MUST |
| REQ-07.17 | Messages without valid HMAC classified as External/Untrusted; Diplomat protocol enforced | MUST |
| REQ-07.18 | JWT signing secret auto-rotated every 55 minutes by K8s CronJob; gateways rolling-restarted to pick up new secret | MUST |
| REQ-07.19 | JWT revocation: if a node is compromised, Home master revokes its token immediately via Redis blacklist | MUST |
| REQ-07.20 | K8s NetworkPolicy: agent pods can ONLY reach Egress Proxy + LiteLLM + Redis — no raw HTTP/FTP to internet | MUST |
| REQ-07.21 | Deterministic regex layer in Egress Proxy hard-blocks internal patterns (/mnt/nas/, 100.x.x.x, ocl- prefixes) regardless of LLM sanitization output | MUST |
| REQ-07.22 | AGENT_SIGNATURE_KEY injected via tmpfs volume mount only — never as environment variable | MUST |
| REQ-07.23 | Empty API keys excluded from K8s Secret creation to prevent "Malformed Key" errors | MUST |
| REQ-07.24 | JWT rotation CronJob verifies BOTH K8s secret patch AND Redis hash update before restarting gateways | MUST |
| REQ-07.25 | Redis, LiteLLM, and Ollama K8s Services use `type: ClusterIP` — never exposed outside cluster | MUST |
| REQ-07.26 | Direct Mode fallback chain: Google → OpenAI → Anthropic (based on available keys) | MUST |
| REQ-07.27 | k3s installed with Calico CNI (not Flannel) for working NetworkPolicy enforcement | MUST |
| REQ-07.28 | NAS directories owned by UID 1000 (container node user) to prevent Permission Denied | MUST |
| REQ-07.29 | Unattended `.env` parsed line-by-line — never `source`d into shell environment | MUST |
| REQ-07.30 | Egress Proxy enforces 10MB max body size — rejects oversized requests with HTTP 413 | MUST |
| REQ-07.31 | Egress Proxy regex sanitization is async (chunked via `setImmediate`) to prevent event loop blocking | MUST |
| REQ-07.32 | NAS fstab entry uses delete-and-readd — prevents IP drift on re-runs | MUST |
| REQ-07.33 | `.env` file shredded by exit trap on ANY exit path (success, failure, interrupt) | MUST |
| REQ-07.34 | JWT rotation tracks generation number; offline gateways marked "stale" for force-sync | MUST |
| REQ-07.35 | `ocl-restart gateway` checks JWT generation and force-syncs if stale | MUST |
| REQ-07.36 | Redis eviction policy is `volatile-lru` — permanent streams/ALKB never evicted | MUST |
| REQ-07.37 | Gateway pods inject `HTTP_PROXY` and `HTTPS_PROXY` pointing to Egress Proxy at port 8080 | MUST |
| REQ-07.38 | Gateway pods inject `LITELLM_MASTER_KEY` and `OPENAI_API_BASE` for LiteLLM proxy routing | MUST |
| REQ-07.39 | Gateway deployment name, labels, and configmap use `GATEWAY_TIER` variable — not hardcoded to "home" | MUST |
| REQ-07.40 | `llm-api-keys` secret replicated into both `ocl-services` and `ocl-agents` namespaces | MUST |
| REQ-07.41 | `telegram-tokens` secret created in both `ocl-services` and `ocl-agents` namespaces | MUST |
| REQ-07.42 | JWT rotation CronJob syncs rotated secret to `ocl-agents` namespace after patching | MUST |
| REQ-07.43 | Gateway container references `OCL_PINNED_VERSION` env var at runtime — not baked-in value | MUST |
| REQ-07.44 | `directMode` in OpenClaw config is the inverse of `OPTIMIZER_ACTIVE` (optimizer on = directMode false) | MUST |
| REQ-07.45 | NetworkPolicy allows UDP port 53 to `kube-system` for CoreDNS resolution | MUST |
| REQ-07.46 | NetworkPolicy uses `kubernetes.io/metadata.name` standard label for namespace selection | MUST |
| REQ-07.47 | Egress Proxy forwards sanitized requests to destination URL via `http.request`/`https.request` | MUST |
| REQ-07.48 | Egress Proxy `req.on("end")` checks `aborted` flag before processing — prevents double-header crash | MUST |
| REQ-07.49 | JWT rotator RBAC grants `secrets` permission in `ocl-agents` namespace for cross-namespace sync | MUST |
| REQ-07.50 | `ocl-nas-sync` CronJob mounts `telegram-tokens` via `envFrom` for disk-full Telegram alerts | MUST |
| REQ-07.51 | `ocl-nas-sync` runs `find -empty -delete` after rsync to prevent inode exhaustion from empty dirs | MUST |
| REQ-07.52 | Local SSD buffer pre-creates `quant-trading/signals` directory for NAS-outage trade processing | SHOULD |

### REQ-08: Scalable Architecture

| ID | Requirement | Priority |
|----|-------------|----------|
| REQ-08.1 | Start with home-only deployment, add cloud later | MUST |
| REQ-08.2 | Setup wizard detects existing state and extends | MUST |
| REQ-08.3 | Kubernetes (k3s) from day one | MUST |
| REQ-08.4 | Adding a new agent = template file + re-run wizard | MUST |
| REQ-08.5 | Adding a cloud gateway = run wizard on new machine, join cluster | MUST |

### REQ-09: Cost Visibility & Runaway Prevention

| ID | Requirement | Priority |
|----|-------------|----------|
| REQ-09.1 | Token Audit Agent polls LiteLLM /usage API every 30 minutes | MUST |
| REQ-09.2 | Alert via Telegram if any agent exceeds 50% of its daily budget in <4 hours | MUST |
| REQ-09.3 | Auto-pause agent if it exceeds its monthly budget cap | MUST |
| REQ-09.4 | Dashboard shows per-agent cost breakdown updated every 30 minutes | MUST |
| REQ-09.5 | Token Audit Agent runs on `openai-codex/gpt-5.3-codex` (ChatGPT Plus, zero API cost) when Codex CLI OAuth is configured; falls back to `local-fast` otherwise | MUST |

### REQ-17: Subscription-based OAuth Authentication

| ID | Requirement | Priority |
|----|-------------|----------|
| REQ-17.1 | Wizard auto-detects Anthropic Max subscription OAuth token (`~/.claude.json`) and configures gateway to use it — zero API cost for Claude models | MUST |
| REQ-17.2 | Wizard auto-detects OpenAI Codex CLI credentials (`~/.codex/auth.json`) and configures gateway to use ChatGPT Plus OAuth — zero API cost for `gpt-5.3-codex` | MUST |
| REQ-17.3 | OAuth tokens stored in Kubernetes Secrets (`anthropic-oauth`, `openai-codex-oauth`) — never on disk or in env vars | MUST |
| REQ-17.4 | OAuth tokens injected into gateway auth-profiles.json at pod startup — one profile per OAuth provider | MUST |
| REQ-17.5 | OpenAI Codex OAuth refresh script (`openai-codex-refresh.sh`) installed as cron job — runs every 6 hours to refresh tokens before expiry | MUST |
| REQ-17.6 | `OPENAI_CODEX_OAUTH_MODEL_PREFIXES` env var controls which model strings route through Codex OAuth profile (default: `["gpt-5.3-codex"]`) | MUST |
| REQ-17.7 | Wizard install step installs `@openai/codex` npm package globally — enables device-auth login for ChatGPT Plus | SHOULD |
| REQ-17.8 | When Codex CLI is installed but `auth.json` is absent, wizard skips Codex OAuth setup with informational message | MUST |
| REQ-17.9 | `chatgpt.com` and `auth.openai.com` added to egress whitelist — required for Codex OAuth inference and token refresh | MUST |

### REQ-10: NAS File Index

| ID | Requirement | Priority |
|----|-------------|----------|
| REQ-10.1 | Redis Search index of all files on NAS, maintained by Librarian agent | MUST |
| REQ-10.2 | Agents discover NAS files via Redis index query, not recursive NFS directory scans | MUST |
| REQ-10.3 | Index updated on file write: agent writes to NAS, then writes metadata to Redis | MUST |
| REQ-10.4 | Index schema: file path, agent owner, file type, size, created_at, tags | MUST |

### REQ-11: Version Management

| ID | Requirement | Priority |
|----|-------------|----------|
| REQ-11.1 | OpenClaw version is pinned at install time and stored in wizard state file | MUST |
| REQ-11.2 | All gateways (home, cloud, GPU) MUST run the same pinned OpenClaw version | MUST |
| REQ-11.3 | Setup wizard refuses to deploy a new gateway on a different OCL version without --force | MUST |
| REQ-11.4 | `ocl-health` reports the OpenClaw version running on each gateway and flags mismatches | MUST |
| REQ-11.5 | `ocl-upgrade` command upgrades all gateways atomically with rolling restart and health checks | MUST |
| REQ-11.6 | Custom skills declare a minimum and maximum compatible OCL version in their template | SHOULD |
| REQ-11.7 | Wizard validates skill compatibility against pinned OCL version before deploying | SHOULD |
| REQ-11.8 | Node.js base image is pinned to a specific tag (e.g., node:22.14-slim), not just node:22-slim | MUST |
| REQ-11.9 | Redis, Ollama, and LiteLLM images are pinned to specific digest or tag, not :latest | SHOULD |
| REQ-11.10 | `ocl-upgrade` pauses all Redis task queues cluster-wide before starting upgrade (pre-flight lock) | MUST |
| REQ-11.11 | `ocl-upgrade` only unpauses queues when `ocl-health` confirms 100% of nodes are on target version | MUST |
| REQ-11.12 | `ocl-unlock` force-removes stuck upgrade locks when both upgrade and rollback fail | MUST |

### REQ-12: Data Loss Prevention — Diplomat Protocol

| ID | Requirement | Priority |
|----|-------------|----------|
| REQ-12.1 | Before any outbound request to an external service, the prompt is sanitized by a local-fast model (Ollama) | MUST |
| REQ-12.2 | Sanitization strips: internal NAS paths, internal agent names, task IDs, Redis keys, cluster metadata | MUST |
| REQ-12.3 | Agents use a generic "Network Persona" externally — never reveal OCL cluster identity, version, or architecture | MUST |
| REQ-12.4 | Sanitization events logged to Redis (`ocl:dlp:log`) and displayed on Dashboard DLP Log | MUST |
| REQ-12.5 | Diplomat Sanitization Skill auto-attached to all agents with network: bridge | MUST |
| REQ-12.6 | Deterministic regex pre-filter runs BEFORE LLM sanitization — hard-blocks /mnt/nas/, 100.x.x.x, ocl:, ocl-, AGENT_SIGNATURE patterns | MUST |
| REQ-12.7 | Regex layer is immune to prompt injection — operates at string level, not LLM level | MUST |

### REQ-13: External Agent Reputation & Egress Control

| ID | Requirement | Priority |
|----|-------------|----------|
| REQ-13.1 | Dedicated Egress Proxy pod in ocl-services namespace handles all outbound external agent traffic | MUST |
| REQ-13.2 | Redis-based whitelist (`ocl:egress:whitelist`) and blacklist (`ocl:egress:blacklist`) of external endpoints | MUST |
| REQ-13.3 | Requests to blacklisted endpoints blocked; unknown endpoints allowed but logged | MUST |
| REQ-13.4 | Internal traffic (valid HMAC) bypasses Egress Proxy; only unsigned/external traffic routed through it | MUST |
| REQ-13.5 | Security alerts posted to Telegram when blacklisted endpoint is contacted or HMAC verification fails | MUST |

### REQ-14: Agent Learnings Knowledge Base (ALKB)

| ID | Requirement | Priority |
|----|-------------|----------|
| REQ-14.1 | Centralized Redis-based knowledge base stores all agent failures with error category, failed prompt, and context | MUST |
| REQ-14.2 | When an agent completes a task that was previously in `ocl:learnings:failures`, auto-promote to `ocl:learnings:fixed` with the working solution | MUST |
| REQ-14.3 | Categorized index (`ocl:learnings:index`) for Dashboard search by agent type, error category, and domain (Trading, Research, DLP, etc.) | MUST |
| REQ-14.4 | Feature tagging: solutions that achieve ≥25% token savings are tagged for monetization in `ocl:learnings:features` | SHOULD |
| REQ-14.5 | Dashboard Learnings tab displays failure → fix pipeline with one-click promotion | MUST |
| REQ-14.6 | Nuke-to-Knowledge: `ocl-nuke` archives agent's final task-state to ALKB before wiping | MUST |
| REQ-14.7 | Agents consult `ocl:learnings:fixed` before attempting tasks with known failure patterns | SHOULD |
| REQ-14.8 | ALKB data persists across agent nukes, gateway restarts, and version upgrades | MUST |
| REQ-14.9 | Human-in-the-Loop validation: items in `learnings:fixed` are marked "Pending Review" until human approves via Dashboard | MUST |
| REQ-14.10 | Only "Approved" learnings are used for future agent consultation and monetization tagging | MUST |
| REQ-14.11 | Dashboard shows approve/reject buttons on each Pending Review learning | MUST |
| REQ-14.12 | Feature attribution metadata on every learning: source_agent_type, token_saving_delta, monetization_tier | MUST |
| REQ-14.13 | Monetization tiers: "Basic", "Pro", "Enterprise" — assigned by human via Dashboard | SHOULD |
| REQ-14.14 | Project/Owner attribution: every learning carries `project_id` and `owner_id` for multi-project environments | MUST |
| REQ-14.15 | ALKB rotation runs as daily K8s CronJob — prunes learnings >90 days old, caps at 10000 | MUST |
| REQ-14.16 | Redis PVC sized at 10Gi minimum to accommodate ALKB growth | MUST |
| REQ-14.17 | Trade Executor uses `shutil.move()` for cross-device signal file moves (SSD→NAS) | MUST |

### REQ-15: Unattended One-Click Deployment

| ID | Requirement | Priority |
|----|-------------|----------|
| REQ-15.1 | Setup wizard accepts `.env` file for fully unattended deployment — no interactive prompts | MUST |
| REQ-15.2 | `.env` file contains: API keys, NAS IP/path, Telegram config, agent selection, budget, optimizer toggle | MUST |
| REQ-15.3 | `bash setup-wizard.sh --env /path/to/.env` triggers non-interactive mode | MUST |
| REQ-15.4 | `.env` file validated before execution — missing required fields halt with clear error | MUST |
| REQ-15.5 | `.env.example` template provided with all fields documented | SHOULD |
| REQ-15.6 | Unattended mode produces same output as interactive mode — no feature gaps | MUST |
| REQ-15.7 | `.env` file is shredded after secrets are injected into K8s Secrets | MUST |
| REQ-15.8 | Unattended NAS setup validates `/mnt/nas` is a real NFS mount, not local directory — halts if not | MUST |
| REQ-15.9 | Setup script installs `trap` handler — scrubs secrets from log on premature exit (Ctrl-C, error) | MUST |

### REQ-16: NAS Outage Resilience (SSD-First Write)

| ID | Requirement | Priority |
|----|-------------|----------|
| REQ-16.1 | Agents write output to local SSD first (`/home/claude/ocl-local/`), then sync to NAS | MUST |
| REQ-16.2 | Background sync service (`ocl-nas-sync`) copies local SSD files to NAS every 5 minutes | MUST |
| REQ-16.3 | If NAS is unreachable, agents continue working — writes accumulate on local SSD | MUST |
| REQ-16.4 | When NAS reconnects, `ocl-nas-sync` replays all pending writes in order | MUST |
| REQ-16.5 | Dashboard shows NAS sync status: "Synced", "Pending (N files)", or "NAS Offline" | SHOULD |
| REQ-16.6 | `ocl-health` reports NAS mount status and pending sync count | MUST |
| REQ-16.7 | Local SSD buffer is NOT wiped by `ocl-nuke` — data preserved until NAS sync confirms | MUST |
| REQ-16.8 | `ocl-nas-sync` checks local SSD disk usage — alerts via Redis + Telegram if ≥90% full | MUST |

### REQ-18: Provider Identity Badges & Cross-Session Memory

| ID | Requirement | Priority |
|----|-------------|----------|
| REQ-18.1 | Every agent Telegram message MUST end with a provider identity signature on the last line | MUST |
| REQ-18.2 | Signature format: `_<emoji> <model-short>_` (Telegram italic) — e.g. `_🟠 Opus 4.6_` | MUST |
| REQ-18.3 | Provider logo emojis: 🟠 Anthropic · 🟢 OpenAI · ✨ Gemini · 🦙 Ollama (local) | MUST |
| REQ-18.4 | When agent runs on its fallback chain (not primary model): append `⚡` — e.g. `_🟠 Opus 4.6 ⚡_` | MUST |
| REQ-18.5 | Badge is substituted per-agent at SOUL generation time based on the agent's configured primary model | MUST |
| REQ-18.6 | SOUL files MUST be written to workspace directory (`workspace-{agent}/SOUL.md`); gateway startup script copies ConfigMap souls to workspace dirs on every pod start | MUST |
| REQ-18.7 | Agent SOULs include `CONVERSATION_MEMORY_PROTOCOL`: after each exchange, save 1–2 sentence summary to Redis stream `ocl:conversation:{agent}:memory` (XTRIM to 50 entries) | MUST |
| REQ-18.8 | On every startup, agents restore last 10 conversation summaries from Redis and briefly acknowledge in first response if context exists | SHOULD |
| REQ-18.9 | `get_model_emoji()` and `get_model_short_name()` bash helper functions in wizard map model strings to display names — used by `generate_soul()` at deployment time | MUST |

---

## 3. Architecture Overview

### Token Optimizer Flow

```
Agent sends prompt
       │
       ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────────┐
│   LiteLLM    │────►│    Ollama     │────►│  Optimized prompt │
│   Proxy      │     │  (local LLM) │     │  (fewer tokens)   │
│              │     │  Compresses   │     └────────┬─────────┘
│  1. Check    │     │  verbose      │              │
│     Redis    │     │  prompts      │              ▼
│     cache    │     └──────────────┘     ┌──────────────────┐
│  2. Route to │                          │  Frontier Model   │
│     Ollama   │◄─────────────────────────│  (Claude/GPT)     │
│  3. Forward  │         response         └──────────────────┘
│  4. Cache    │
└──────────────┘
```

### Resilience Architecture

```
Layer 1: Redis Message Bus       (stateless, always available)
Layer 2: Watchdog Agent          (monitors Commander, failover routing)
Layer 3: Commander Agent         (primary orchestrator when healthy)

Even if Commander AND Watchdog crash, agents read queued tasks
from Redis and continue working. No work is ever lost.
```

### Data Flow Split — Redis vs NAS

```
Redis (in-cluster, <1ms):          NAS (NFS mount, bulk storage):
├── Task board (status, assigns)    ├── Video files
├── Task queues (per-agent)         ├── PDFs, book scans
├── Agent heartbeats                ├── Model checkpoints
├── Rate limit state                ├── Market data snapshots
├── Task checkpoints (resume)       ├── Trade signals (write-once)
└── Agent status                    ├── Audit logs (append-only)
                                    └── Backups

Rule: If multiple agents write to it → Redis
      If it's large and write-once → NAS
```

### Trading Isolation

```
┌──────────────────┐  write-only   ┌──────────────────┐  read-only  ┌──────────────────┐
│ Market Data      │──────────────►│ NAS: trading/    │◄────────────│ Quant Trader     │
│ Fetcher          │               │ data/            │             │                  │
│ Network: bridge  │               └──────────────────┘             │ Network: NONE    │
│ Reads: APIs      │                                                │ Writes: signals/ │
│ Cannot read      │               ┌──────────────────┐            └────────┬─────────┘
│ signals or       │               │ Trade Executor   │                     │
│ strategies       │               │ (separate proc)  │◄────────────────────┘
└──────────────────┘               │ Human approval   │         reads signals
                                   └──────────────────┘
```

---

## 4. Per-Agent Provider Configuration

```yaml
# Each agent specifies its own provider chain
agent_model_configs:
  commander:
    primary: claude-opus
    fallbacks: [gpt-4o, gemini-flash, deepseek]
    max_budget: 50
    optimize_prompts: true

  watchdog:
    primary: local-fast
    fallbacks: [claude-sonnet]
    max_budget: 5
    optimize_prompts: false

  token-audit:
    primary: openai-codex/gpt-5.3-codex  # ChatGPT Plus OAuth — zero API cost when available
    fallbacks: [gemini/gemini-3.1-pro-preview, openai/gpt-4o]
    max_budget: 0                         # $0 when using ChatGPT Plus OAuth
    optimize_prompts: false
    # Falls back to local-fast if Codex CLI OAuth not configured

  content-creator:
    primary: claude-sonnet
    fallbacks: [gpt-4o, gemini-flash]
    max_budget: 40
    optimize_prompts: true

  market-data-fetcher:
    primary: local-fast          # Just fetches data, minimal LLM usage
    fallbacks: [claude-sonnet]
    max_budget: 5
    optimize_prompts: false

  researcher:
    primary: claude-opus
    fallbacks: [gpt-4o, deepseek]
    max_budget: 60
    optimize_prompts: true

  linkedin-mgr:
    primary: claude-sonnet
    fallbacks: [gpt-4o, gemini-flash]
    max_budget: 20
    optimize_prompts: false

  librarian:
    primary: claude-opus
    fallbacks: [gpt-4o, deepseek]
    max_budget: 40
    optimize_prompts: true

  quant-trader:
    primary: claude-opus
    fallbacks: [gpt-4o]
    max_budget: 80
    optimize_prompts: false      # Accuracy critical

  virs-trainer:
    primary: claude-sonnet
    fallbacks: [gpt-4o, deepseek, local-fast]
    max_budget: 30
    optimize_prompts: true
```

---

## 5. Redis Data Schema

```
# ═══ TASK MANAGEMENT ═══
HSET ocl:taskboard:<task_id>
  status          "queued|assigned|running|paused|complete|failed"
  agent           "researcher"
  created_at      "ISO-8601"
  updated_at      "ISO-8601"
  assigned_by     "commander"
  description     "Research latest RLHF papers"
  result_path     "/mnt/nas/agents/researcher/output/2026-02-24/"
  error           ""
  retry_count     0

ZADD ocl:taskboard:index <timestamp> <task_id>

# Per-agent task queue (Redis Stream — persistent, ordered)
# Messages carry HMAC signature for authenticity verification
XADD ocl:agent:<agent-id> * task_id <id> payload '<json>' sig '<hmac-sha256>'

# Results stream (also signed)
XADD ocl:results * task_id <id> agent <agent-id> status complete sig '<hmac>'

# ═══ HEARTBEATS ═══
SET ocl:heartbeat:<agent-id> alive EX 120

# ═══ RATE LIMIT STATE + TASK CHECKPOINTS ═══
HSET ocl:ratelimit:<agent-id>
  provider        "anthropic"
  since           "ISO-8601"
  retry_after     "ISO-8601"

HSET ocl:task-state:<agent-id>:<task-id>
  status          "running"
  current_step    3
  total_steps     7
  step_description "Downloading paper 3 of 5"
  context         '<serialized context for resume>'
  updated_at      "ISO-8601"

# ═══ AGENT STATUS ═══
HSET ocl:agent-status:<agent-id>
  status          "running|idle|rate-limited|paused|stopped|error|offline"
  last_seen       "ISO-8601"
  current_task    "T-001"
  tokens_today    4832
  cost_today      0.48
  provider_tier   "primary|fallback-1|fallback-2"
  paused_at       "ISO-8601"      # Set by ocl-pause, cleared by ocl-resume
  paused_by       "cli|dashboard"  # Who initiated the pause

# ═══ NAS FILE INDEX (replaces slow NFS directory scans) ═══
HSET ocl:files:<sha256-of-path>
  path            "/mnt/nas/agents/researcher/output/2026-02-24/rlhf-summary.md"
  agent           "researcher"
  type            "summary"
  size_bytes      4096
  created_at      "ISO-8601"
  tags            "ai-research,rlhf,2026-02-24"

# File index by agent (for fast agent-scoped lookups)
SADD ocl:files:by-agent:researcher <sha256-of-path>

# File index by tag (for cross-agent search)
SADD ocl:files:by-tag:ai-research <sha256-of-path>

# ═══ COST TRACKING (populated by Token Audit Agent) ═══
HSET ocl:cost:<agent-id>:<YYYY-MM-DD>
  tokens_in       48320
  tokens_out      12450
  cost_usd        4.82
  cache_hits      142
  cache_misses    58
  efficiency      0.26           # tokens_out / tokens_in ratio
  provider        "anthropic"
  provider_tier   "premium"      # premium | pay-as-you-go

# ═══ CLAUDE PREMIUM SUBSCRIPTION STATE ═══
HSET ocl:subscription:anthropic
  status          "active|rate-limited"
  reset_at        "ISO-8601"     # When premium limit resets (from retry-after header)
  limited_since   "ISO-8601"

# ═══ DATA LOSS PREVENTION — Diplomat Protocol ═══
XADD ocl:dlp:log * agent <id> direction outbound target "<url>" stripped_count 3 timestamp "<ISO>"

# ═══ EGRESS REPUTATION ═══
SADD ocl:egress:whitelist "api.openai.com" "api.anthropic.com" "arxiv.org" "chatgpt.com" "auth.openai.com"
SADD ocl:egress:blacklist "<known-bad-endpoint>"

# ═══ SECURITY AUDIT ═══
XADD ocl:security:audit * event "hmac_failed" source_ip "<ip>" agent "<claimed>" timestamp "<ISO>"
XADD ocl:security:audit * event "blacklist_hit" target "<url>" agent "<id>" timestamp "<ISO>"

# ═══ JWT TOKEN MANAGEMENT ═══
HSET ocl:jwt:tokens:<node-id>
  token           "<signed-jwt>"
  issued_at       "ISO-8601"
  expires_at      "ISO-8601"
  revoked         false

# JWT rotation tracking (written by CronJob every 55 minutes)
HSET ocl:jwt:rotation
  last_rotated    "ISO-8601"
  secret_hash     "<sha256 of current signing secret>"

# JWT revocation list (compromised nodes)
SADD ocl:jwt:revoked <node-id>

# ═══ SPLIT-BRAIN LOCAL BUFFER (per-gateway) ═══
# When Home Redis is unreachable, cloud agents buffer here
# Auto-synced on reconnect
XADD ocl:buffer:<gateway-id> * type checkpoint agent <id> task <task-id> data '<json>'

# ═══ AGENT LEARNINGS KNOWLEDGE BASE (ALKB) ═══
# Failures: what went wrong, categorized for pattern detection
HSET ocl:learnings:failures:<learning-id>
  task_id         "T-001"
  agent           "researcher"
  error_category  "rate-limit|tool-error|prompt-too-long|hallucination|timeout"
  domain          "research|trading|content|dlp"
  project_id      "proj-001"
  owner_id        "user-001"
  failed_prompt   "<truncated prompt that caused the failure>"
  error_log       "<error message and stack context>"
  step_failed     3
  total_steps     7
  created_at      "ISO-8601"
  status          "open|investigating|fixed"

# Fixes: validated solutions that resolved previous failures
HSET ocl:learnings:fixed:<learning-id>
  original_failure "<learning-id of the failure>"
  agent           "researcher"
  domain          "research"
  project_id      "proj-001"
  owner_id        "user-001"
  fix_summary     "Reduced prompt from 12K to 4K tokens by extracting abstract only"
  working_prompt  "<the prompt/approach that worked>"
  token_savings   "67%"
  fixed_at        "ISO-8601"
  fixed_by_task   "T-042"
  validation      "pending-review|approved|rejected"
  validated_by    "human|auto"
  validated_at    "ISO-8601"
  source_agent_type "researcher"
  token_saving_delta "8200"
  monetization_tier "basic|pro|enterprise"

# Feature candidates: fixes tagged for monetization (approved only)
SADD ocl:learnings:features <learning-id>

# Categorized index for Dashboard search
ZADD ocl:learnings:index <timestamp> <learning-id>
SADD ocl:learnings:by-domain:trading <learning-id>
SADD ocl:learnings:by-domain:research <learning-id>
SADD ocl:learnings:by-agent:researcher <learning-id>
SADD ocl:learnings:by-status:open <learning-id>
```

---

## 6. Telegram Group Structure

```
Private Group: "OCL Agent Network"
├── 📌 General          (Commander announcements)
├── 🛡️ Watchdog         (health alerts, failover notices)
├── 💰 Token-Audit      (cost alerts, runaway warnings)
├── 🔒 Security         (HMAC failures, unauthorized access attempts)
├── 🛂 Egress-DLP       (sanitization events, blocked endpoints)
├── 🎬 Content-Creator   (video pipeline)
├── 📊 Market-Data       (data fetch status)
├── 🔬 Researcher       (paper discoveries)
├── 💼 LinkedIn          (post drafts & approvals)
├── 📚 Librarian        (archive acquisitions)
├── 📈 Quant-Trader     (signals & analysis)
├── 🧠 VIRS-Trainer     (training progress)
├── ⚙️ System           (health, errors, rate limits)
└── 📊 Dashboard        (daily summaries, costs)
```

---

## 7. Nuke Targets

```
ocl-nuke <target> [name] [--confirm=VALUE]

  agent <id>        Wipe one agent + secure cleanup
  gateway <id>      Wipe all agents on a gateway + secure cleanup
  service <name>    Wipe a service (litellm|ollama|dashboard|redis)
  tier <name>       Wipe entire tier (home|cloud|gpu) + secure cleanup
  all               Wipe everything (--confirm="NUKE ALL") + secure cleanup
  nas-data <path>   Wipe specific NAS data (--confirm required)
  status            Show all running components
```

| Target | K8s Pods | Agent State | Redis Data | NAS Data | Secure Cleanup |
|--------|----------|-------------|------------|----------|----------------|
| agent X | X only | X only | X's keys | Preserved | ✅ shred temps |
| gateway Y | Y's pods | Y's agents | Y's keys | Preserved | ✅ shred temps |
| service Z | Z only | — | — | — | — |
| tier T | T's pods | T's agents | T's keys | Preserved | ✅ shred temps |
| all | ALL | ALL | ALL | Preserved | ✅ full scrub |

---

## 8. Universal Recovery Protocol (All Agents)

Every agent SOUL.md includes this standardized block:

```
## On Every Startup
1. Check for incomplete tasks:
   KEYS ocl:task-state:<your-id>:*
   If found → read state → resume from last checkpoint

2. Check for queued tasks from rate-limit period:
   XREADGROUP GROUP <your-id> <your-id> COUNT 5 STREAMS ocl:agent:<your-id> >

3. Write heartbeat:
   SET ocl:heartbeat:<your-id> alive EX 120

4. Report status:
   HSET ocl:agent-status:<your-id> status running last_seen <now>

## During Multi-Step Work
After each step, checkpoint:
  HSET ocl:task-state:<your-id>:<task-id> current_step N context '<resume data>'

## Before Starting Any Task
Check it's not already running (prevent duplicates):
  EXISTS ocl:task-state:<your-id>:<task-id>
  If exists and updated_at < 10min ago → skip (someone else working on it)
  If exists and updated_at > 10min ago → previous run crashed, resume

## On Task Completion
  DEL ocl:task-state:<your-id>:<task-id>
  HSET ocl:taskboard:<task-id> status complete
  XADD ocl:results * task_id <id> agent <your-id> status complete

## Post-Task Learning Protocol (ALKB)
1. On Task Completion:
   - Check: KEYS ocl:learnings:failures:* matching this task pattern
   - If a previous failure exists for this task type → auto-promote:
     HSET ocl:learnings:fixed:<id> original_failure <fail-id> fix_summary '<what worked>'
     SMOVE ocl:learnings:by-status:open ocl:learnings:by-status:fixed <id>
   - If solution saved ≥25% tokens vs previous attempt → tag for monetization:
     SADD ocl:learnings:features <id>

2. On Task Failure:
   - Archive the failure context before giving up:
     HSET ocl:learnings:failures:<id> task_id <task> agent <your-id> error_category '<type>'
       failed_prompt '<truncated>' error_log '<error>' step_failed <N> created_at '<ISO>'
     ZADD ocl:learnings:index <timestamp> <id>
     SADD ocl:learnings:by-domain:<domain> <id>
     SADD ocl:learnings:by-agent:<your-id> <id>
     SADD ocl:learnings:by-status:open <id>

3. Before Starting Any Task:
   - Consult ALKB for known fixes:
     SMEMBERS ocl:learnings:by-domain:<relevant-domain>
     If a fix exists for a similar failure pattern → apply the working approach
```

---

## 9. Agent Roster

| Agent | Tier | Model | Network | Purpose |
|-------|------|-------|---------|---------|
| Commander | Home | Opus | bridge | Central orchestrator, human interface |
| Watchdog | Home | local-fast | bridge | Commander failover, health monitoring |
| Token Audit | Home | gpt-5.3-codex (ChatGPT Plus OAuth) or local-fast | bridge | Cost monitoring, runaway prevention |
| Content Creator | Home | Sonnet | bridge | YouTube/TikTok content |
| Quant Trader | Home | Opus | **none** | Trading analysis (air-gapped) |
| Market Data Fetcher | Home | local-fast | bridge | Feeds market data to Quant Trader |
| Researcher | Cloud | Opus | bridge | AI paper research |
| LinkedIn Manager | Cloud | Sonnet | bridge | Social posting |
| Librarian | Cloud | Opus | bridge | Book archival |
| VIRS Trainer | GPU | Sonnet | bridge | ML training |

---

## 10. Scaling Phases

| Phase | When | What | RAM | Cost |
|-------|------|------|-----|------|
| 0 | Day 1 (Low Memory) | Home: Direct Mode, no optimizer — agents route to cloud APIs directly | 8GB+ | ~$150-300/mo (higher API cost) |
| 1 | Week 1-4 | Home: Enable optimizer (LiteLLM + Ollama), Commander, Watchdog, Content, Quant, Market Fetcher | 16GB+ | ~$120-240/mo |
| 2 | Week 5+ | Add Cloud VPS: Researcher, LinkedIn, Librarian | 16GB+ | +$30-80/mo |
| 3 | When needed | Add GPU: VIRS Trainer | 16GB+ | +$20-100/mo on-demand |

**Phase 0 → Phase 1 transition:** Run `ocl-enable optimizer` to deploy LiteLLM + Ollama, regenerate agent configs to route through proxy, and rolling restart. No nuke required.

---

## 11. Security Checklist

- [ ] Tailscale on all machines, zero public ports
- [ ] API keys in K8s Secrets only, never on disk
- [ ] Secrets mounted as tmpfs volumes, not env vars (prevents zombie exposure)
- [ ] Setup wizard uses read -rs, keys never echo
- [ ] Secure cleanup runs after every setup and nuke
- [ ] Quant Trader: network none, cannot reach internet
- [ ] Market Data Fetcher: write-only to trading/data/
- [ ] Trade executor: separate process, human approval
- [ ] Gateway bound to 127.0.0.1 or Tailscale IP
- [ ] exec.ask: on for all agents
- [ ] NAS mounted with noexec
- [ ] No community skills installed
- [ ] LiteLLM budget caps configured
- [ ] Redis AOF persistence enabled
- [ ] k3s flannel-backend=wireguard-native for encrypted inter-node traffic
- [ ] LiteLLM and Redis listen on Tailscale interface only
- [ ] Redis Stream messages carry HMAC signatures
- [ ] Token Audit Agent monitoring spend every 30 minutes
- [ ] NAS file index maintained in Redis (no slow NFS scans)
- [ ] OpenClaw version pinned in state file, same across all gateways
- [ ] Container images pinned to specific tags/digests (no floating :latest)
- [ ] ocl-upgrade tested before production upgrades
- [ ] Diplomat Sanitization Skill attached to all bridge-network agents
- [ ] Egress Proxy pod deployed in ocl-services namespace
- [ ] External endpoint whitelist/blacklist populated in Redis
- [ ] Claude Premium subscription configured as primary (wait-for-reset, not failover)
- [ ] Dashboard shows efficiency ratios, reset countdown, security audit log
- [ ] ALKB Redis keys initialized (learnings:failures, learnings:fixed, learnings:features, learnings:index)
- [ ] Post-Task Learning Protocol in all agent SOULs
- [ ] ocl-nuke archives failed task-state to ALKB before wiping
- [ ] Deterministic regex blocklist in Egress Proxy (immune to prompt injection)
- [ ] JWT rotation: short-lived tokens (60-min TTL), not static HMAC
- [ ] K8s NetworkPolicy: agents can only reach Egress Proxy + LiteLLM + Redis
- [ ] ALKB learnings require human approval before agents consult them
- [ ] ocl-upgrade pauses task queues cluster-wide before rolling restart
- [ ] Cloud agents have local buffer queue for Redis split-brain resilience
- [ ] Anthropic Max OAuth token stored in `anthropic-oauth` K8s Secret (not in env vars or on disk)
- [ ] OpenAI Codex OAuth tokens stored in `openai-codex-oauth` K8s Secret — never in cmdline args (`--from-literal` avoided)
- [ ] `openai-codex-refresh.sh` cron job installed — refreshes Codex OAuth token every 6 hours
- [ ] `chatgpt.com` and `auth.openai.com` in egress whitelist for Codex OAuth inference and refresh
- [ ] Gateway startup script writes auth-profiles.json from secrets at runtime — OAuth tokens never baked into image
