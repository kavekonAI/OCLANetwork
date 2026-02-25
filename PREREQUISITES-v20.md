# OCL Agent Network — Prerequisites & Interactive Setup Guide

## Version 20.0

This document provides every step required before running `bash setup-wizard.sh` in interactive mode. Complete ALL sections in order. Each section ends with a verification command.

---

## Table of Contents

1. [Hardware Requirements](#1-hardware-requirements)
2. [Operating System Setup](#2-operating-system-setup)
3. [Network & Firewall Preparation](#3-network--firewall-preparation)
4. [Synology NAS Configuration](#4-synology-nas-configuration)
5. [Tailscale VPN Setup](#5-tailscale-vpn-setup)
6. [API Keys & Accounts](#6-api-keys--accounts)
7. [Telegram Bot Setup](#7-telegram-bot-setup)
8. [Pre-Flight Checklist](#8-pre-flight-checklist)
9. [Running the Interactive Wizard](#9-running-the-interactive-wizard)
10. [Post-Install Verification](#10-post-install-verification)
11. [Troubleshooting Common Issues](#11-troubleshooting-common-issues)

---

## 1. Hardware Requirements

### Minimum (Phase 0 — Direct Mode, 8GB)

For systems with limited RAM. Agents route directly to cloud APIs without a local optimizer. Higher monthly API cost ($135–350/mo) but lower hardware bar.

| Component | Minimum Spec |
|-----------|-------------|
| CPU | 4 cores (Intel i5 / Apple M1 or equivalent) |
| RAM | 8 GB |
| Storage | 64 GB SSD (boot + local buffer) |
| Network | Stable internet (10 Mbps+) |
| OS Disk | Must NOT be shared with NAS — agents buffer to local SSD |

Suitable hardware: Mac Mini (2018+), Intel NUC, any small-form-factor PC, entry-level VPS (4 vCPU / 8GB).

### Recommended (Phase 1 — Optimized Mode, 16GB+)

Agents route through LiteLLM + Ollama for local inference on simple tasks. ~25–40% token savings ($70–160/mo).

| Component | Recommended Spec |
|-----------|-----------------|
| CPU | 6+ cores (Intel i7 / Apple M2 or equivalent) |
| RAM | 16 GB (32 GB for quant-trading + virs-trainer) |
| Storage | 128 GB SSD (models ~10GB + local buffer) |
| GPU | Optional — needed only for `virs-trainer` agent |
| Network | Stable internet (25 Mbps+) for model pulls |

### NAS Requirements

| Component | Spec |
|-----------|------|
| Device | Synology DS220+ / DS920+ or equivalent NFS server |
| Storage | 1 TB+ (agent outputs, media assets, backups) |
| Protocol | NFSv4.1 (MUST be enabled — see Section 4) |
| Network | Connected to same LAN as home server, or via Tailscale |

### Verification

```bash
# Check CPU cores
nproc

# Check total RAM (need ≥8000 MB)
free -m | awk '/Mem:/ {print $2 " MB"}'

# Check available disk
df -h / | awk 'NR==2 {print $4 " available"}'
```

---

## 2. Operating System Setup

### Supported Operating Systems

| OS | Version | Status |
|----|---------|--------|
| Ubuntu Server | 22.04 LTS / 24.04 LTS | Fully supported (recommended) |
| Debian | 12 (Bookworm) | Supported |
| macOS | 13+ (Ventura) | Supported (Homebrew required) |
| Raspberry Pi OS | 64-bit (Bookworm) | Community tested |

The wizard auto-installs all dependencies, but the following must be available on the system beforehand.

### Step 2.1: Update System Packages

```bash
sudo apt update && sudo apt upgrade -y
```

### Step 2.2: Install Core Utilities

These are needed before the wizard can run:

```bash
sudo apt install -y \
    curl \
    wget \
    git \
    jq \
    openssl \
    nfs-common \
    net-tools \
    ca-certificates \
    gnupg \
    lsb-release \
    python3              # Required if using Quant Trader (trade-executor.py)
```

For macOS:
```bash
brew install curl wget jq openssl nfs-utils
```

### Step 2.3: Ensure sudo Access

The wizard needs `sudo` for k3s installation, NFS mounts, and firewall rules. Verify your user has passwordless sudo or be ready to enter your password during setup:

```bash
# Test sudo access
sudo whoami
# Should print: root

# (Optional) Enable passwordless sudo for smoother install
sudo visudo
# Add this line at the end:
# yourusername ALL=(ALL) NOPASSWD: ALL
```

### Step 2.4: Disable Conflicting Services

**IMPORTANT — Networking Change (v16):** The wizard now installs k3s with **Calico CNI** instead of Flannel. This is required because default Flannel does NOT enforce Kubernetes NetworkPolicy — the egress lockdown that prevents agents from bypassing the proxy would be a silent no-op. Calico provides both networking AND policy enforcement. If you have an existing k3s install with Flannel, you'll need to re-install k3s (the wizard handles this automatically on fresh installs).

**IMPORTANT — NAS Permissions (v16):** The wizard now sets `/mnt/nas/agents` ownership to UID 1000 (the `node` user inside gateway pods). If you've previously created NAS directories manually, run: `sudo chown -R 1000:1000 /mnt/nas/agents`

If you have existing Docker, Kubernetes, or container runtimes:

```bash
# Stop existing k8s/docker if present (wizard installs k3s fresh)
sudo systemctl stop docker 2>/dev/null || true
sudo systemctl stop kubelet 2>/dev/null || true
sudo systemctl stop containerd 2>/dev/null || true

# Check nothing is using ports 6443, 10250, 18789
sudo ss -tlnp | grep -E '6443|10250|18789'
# Should return empty
```

### Verification

```bash
# All core tools present
for cmd in curl wget git jq openssl sudo; do
    command -v $cmd >/dev/null && echo "✅ $cmd" || echo "❌ $cmd MISSING"
done

# NFS client available
dpkg -l | grep nfs-common && echo "✅ NFS client" || echo "❌ nfs-common MISSING"
```

---

## 3. Network & Firewall Preparation

### Step 3.1: Required Ports

The wizard configures these automatically, but ensure your router/firewall allows outbound traffic:

| Port | Direction | Purpose |
|------|-----------|---------|
| 443 | Outbound | API calls (Anthropic, OpenAI, Google) |
| 41641/UDP | Outbound | Tailscale VPN |
| 6443 | Internal only | k3s API server |
| 6379 | Internal only | Redis (ClusterIP — never exposed) |
| 4000 | Internal only | LiteLLM proxy (ClusterIP) |
| 11434 | Internal only | Ollama (ClusterIP) |
| 18789 | Internal only | OpenClaw gateway |

### Step 3.2: Configure UFW (Ubuntu)

```bash
# Allow Tailscale
sudo ufw allow 41641/udp comment "Tailscale"

# Allow SSH (for remote management)
sudo ufw allow 22/tcp comment "SSH"

# Enable firewall (if not already)
sudo ufw enable

# Verify
sudo ufw status verbose
```

IMPORTANT: Do NOT expose ports 6379, 4000, or 11434 to the network. The wizard deploys these as `ClusterIP` services — accessible only within the Kubernetes cluster.

### Step 3.3: DNS Resolution

Verify the server can reach API providers:

```bash
# Test connectivity to API providers
curl -sf https://api.anthropic.com/v1/messages -o /dev/null -w "%{http_code}" && echo " Anthropic ✅" || echo " Anthropic ❌"
curl -sf https://api.openai.com/v1/models -o /dev/null -w "%{http_code}" && echo " OpenAI ✅" || echo " OpenAI ❌"
curl -sf https://generativelanguage.googleapis.com/ -o /dev/null -w "%{http_code}" && echo " Google AI ✅" || echo " Google AI ❌"
```

### Verification

```bash
# No conflicting listeners
sudo ss -tlnp | grep -E '6443|6379|4000|11434|18789'
# Should return empty (nothing listening yet)
```

---

## 4. Synology NAS Configuration

This section configures your NAS to serve files over NFSv4.1. Skip if you don't have a NAS (the wizard will still work, using local SSD only).

### Step 4.1: Enable NFS on Synology

1. Open **Control Panel** → **File Services**
2. Click the **NFS** tab
3. Check **Enable NFS service**
4. Set **Maximum NFS protocol** to **NFSv4.1** (CRITICAL — NFSv3 lacks safe file locking)
5. Click **Apply**

### Step 4.2: Create the Shared Folder

1. Open **Control Panel** → **Shared Folder**
2. Click **Create** → name it `openclaw-data`
3. Set location to your main volume (e.g., Volume 1)
4. Skip encryption for now (can add later)
5. Click **Apply**

### Step 4.3: Set NFS Permissions

1. Select `openclaw-data` → click **Edit**
2. Go to the **NFS Permissions** tab
3. Click **Create**
4. Set:
   - **Hostname or IP**: `*` (or your server's Tailscale IP for tighter security, e.g., `100.64.0.0/24`)
   - **Privilege**: Read/Write
   - **Squash**: Map all users to admin
   - **Security**: sys
   - **Enable asynchronous**: Yes
   - **Allow connections from non-privileged ports**: Yes
   - **Allow users to access mounted subfolders**: Yes
5. Click **OK** → **Apply**

### Step 4.4: Note Your NAS Details

You'll need these during the wizard:

```
NAS IP:   _____________ (Tailscale IP preferred, e.g., 100.64.0.5)
NFS Path: /volume1/openclaw-data (default)
```

### Step 4.5: Test NFS Mount Manually

From your server:

```bash
# Install NFS client if not already
sudo apt install -y nfs-common

# Create mount point
sudo mkdir -p /mnt/nas-test

# Test NFSv4.1 mount
sudo mount -t nfs -o nfsvers=4.1 YOUR_NAS_IP:/volume1/openclaw-data /mnt/nas-test

# Verify
mountpoint -q /mnt/nas-test && echo "✅ NFS mount works" || echo "❌ NFS mount FAILED"
ls /mnt/nas-test

# Test write
touch /mnt/nas-test/.write-test && echo "✅ Write works" || echo "❌ Write FAILED"
rm /mnt/nas-test/.write-test

# Check NFS version
nfsstat -m | grep "/mnt/nas-test"
# Should show "vers=4.1"

# Clean up test mount
sudo umount /mnt/nas-test
sudo rmdir /mnt/nas-test
```

### Verification

```bash
# From the server, verify NAS is reachable
showmount -e YOUR_NAS_IP 2>/dev/null && echo "✅ NFS exports visible" || echo "❌ Cannot reach NAS"
```

---

## 5. Tailscale VPN Setup

Tailscale provides encrypted mesh networking between your home server, NAS, and any future cloud/GPU nodes.

### Step 5.1: Create a Tailscale Account

1. Go to https://login.tailscale.com/start
2. Sign up with Google, GitHub, or Microsoft
3. Note your **tailnet name** (e.g., `yourname.ts.net`)

### Step 5.2: Install Tailscale on Your Server

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```

Follow the authentication URL printed in the terminal. Once authenticated:

```bash
# Verify connection
tailscale status
tailscale ip -4
# Note this IP — you'll use it for NAS access
```

### Step 5.3: Install Tailscale on Your NAS

For Synology:
1. Open **Package Center**
2. Search for **Tailscale**
3. Install and authenticate
4. Note the NAS's Tailscale IP (visible in the Tailscale admin console)

### Step 5.4: Test Connectivity

```bash
# Ping your NAS via Tailscale
ping -c 3 YOUR_NAS_TAILSCALE_IP

# Verify NFS works over Tailscale
sudo mount -t nfs -o nfsvers=4.1 YOUR_NAS_TAILSCALE_IP:/volume1/openclaw-data /mnt/nas-test
mountpoint -q /mnt/nas-test && echo "✅ NFS over Tailscale works"
sudo umount /mnt/nas-test 2>/dev/null
```

### Verification

```bash
tailscale status | head -5
# Should show "online" status for your machine
```

---

## 6. API Keys & Accounts

You need **at least one** LLM provider API key. More providers = better fallback resilience.

### Step 6.1: Anthropic (Recommended — Primary)

1. Go to https://console.anthropic.com/
2. Create an account and add a payment method
3. Go to **API Keys** → **Create Key**
4. Copy the key (starts with `sk-ant-`)
5. Set a usage limit in **Settings** → **Billing** → **Usage Limits**

Recommended tier: **Build** ($50–100/mo pre-paid credits)

### Step 6.2: OpenAI (Recommended — Fallback)

1. Go to https://platform.openai.com/
2. Create an account and add a payment method
3. Go to **API Keys** → **Create new secret key**
4. Copy the key (starts with `sk-`)

### Step 6.3: Google AI (Recommended — Cheapest for System Agents)

1. Go to https://aistudio.google.com/apikey
2. Click **Create API key**
3. Select a Google Cloud project (or create one)
4. Copy the key

This is the cheapest option for system agents (Watchdog, Token Audit) in Direct Mode.

### Step 6.4: DeepSeek (Optional)

1. Go to https://platform.deepseek.com/
2. Create account → go to **API Keys**
3. Generate and copy key

### Step 6.5: Claude Max Subscription — Anthropic OAuth (Optional, Zero API Cost)

If you have an **Anthropic Max subscription**, the wizard can use it instead of API keys for all Claude models — no per-token billing.

1. Install Claude Code CLI on this machine if not already installed:
   ```bash
   npm install -g @anthropic-ai/claude-code
   ```
2. Log in to your Anthropic Max account:
   ```bash
   claude login
   ```
3. Complete the browser OAuth flow. Credentials are saved to `~/.claude.json`.
4. Verify authentication:
   ```bash
   cat ~/.claude.json | python3 -c "import sys,json; d=json.load(sys.stdin); print('✅ Claude Max OAuth active') if d.get('oauthToken') else print('❌ No OAuth token found')"
   ```

The wizard auto-detects `~/.claude.json` and configures gateway agents to use the OAuth profile. No Anthropic API key is needed when Claude Max OAuth is active.

### Step 6.6: OpenAI Codex CLI — ChatGPT Plus OAuth (Optional, Zero API Cost)

If you have a **ChatGPT Plus subscription**, the wizard can authenticate via the OpenAI Codex CLI to use `gpt-5.3-codex` models at zero API cost. The `token-audit` agent is automatically assigned to this provider when configured.

1. Install the OpenAI Codex CLI (the wizard installs this automatically, but you can do it manually):
   ```bash
   npm install -g @openai/codex
   ```
2. Log in with your ChatGPT Plus account using device authorization:
   ```bash
   codex login --device-auth
   ```
3. Follow the prompts:
   - Open the displayed URL (https://auth.openai.com/codex/device) in your browser
   - Enter the one-time code shown in the terminal
   - Sign in with the Google/Microsoft account linked to your ChatGPT Plus subscription
4. Verify credentials were saved:
   ```bash
   [ -f ~/.codex/auth.json ] && python3 -c "
   import json
   d = json.load(open('$HOME/.codex/auth.json'))
   plan = d.get('tokens', {})
   print('✅ Codex CLI authenticated (auth_mode:', d.get('auth_mode'), ')')
   " || echo "❌ ~/.codex/auth.json not found — login may have failed"
   ```
5. Note: Codex CLI OAuth tokens expire in ~10 days. The wizard installs a cron job (`openai-codex-refresh.sh`) that refreshes tokens every 6 hours automatically.

**What this enables:**
- `token-audit` agent uses `gpt-5.3-codex` via ChatGPT Plus — zero API cost
- Falls back to `gemini/gemini-2.0-flash` → `openai/gpt-4o` if token expires
- Inference routes through `chatgpt.com/backend-api` (NOT `api.openai.com`)

### Key Storage (BEFORE Running Wizard)

Store your keys temporarily in a secure location. The wizard collects them via secure stdin (no echo) and immediately injects them into Kubernetes Secrets. Keys never touch disk.

```bash
# DO NOT put keys in shell history
# DO NOT save keys in .env files on the server (unless using --env unattended mode)
# Have the keys ready to paste during the interactive wizard
```

### Verification

```bash
# Test Anthropic key (optional — costs ~$0.001)
curl -s https://api.anthropic.com/v1/messages \
  -H "x-api-key: YOUR_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{"model":"claude-haiku-4-5-20251001","max_tokens":5,"messages":[{"role":"user","content":"hi"}]}' \
  | jq .type
# Should return "message"
```

---

## 7. Telegram Bot Setup

Telegram is used for agent status alerts, task completions, cost warnings, and security notifications.

### Step 7.1: Create a Telegram Bot

1. Open Telegram and message **@BotFather**
2. Send `/newbot`
3. Choose a name (e.g., "OCL Agent Network")
4. Choose a username (e.g., `ocl_agent_bot`)
5. Copy the **bot token** (looks like `123456789:ABCdefGHI-jklMNOpqrsTUVwxyz`)

### Step 7.2: Create a Telegram Group

1. Create a new Telegram group (e.g., "OCL Alerts")
2. Add your bot to the group
3. Send a test message in the group

### Step 7.3: Get the Group ID

```bash
# Replace YOUR_BOT_TOKEN with the token from BotFather
curl -s "https://api.telegram.org/botYOUR_BOT_TOKEN/getUpdates" | jq '.result[].message.chat.id'
# The group ID is a negative number, e.g., -1001234567890
```

If no results appear, send another message in the group and re-run the curl command.

### Step 7.4: Get Your User ID

1. Message **@userinfobot** on Telegram
2. It replies with your numeric user ID (e.g., `123456789`)

### Summary of Values Needed

```
Bot Token:  _____________ (from BotFather)
Group ID:   _____________ (negative number, from getUpdates)
User ID:    _____________ (from userinfobot)
```

### Verification

```bash
# Send a test message
curl -s "https://api.telegram.org/botYOUR_BOT_TOKEN/sendMessage" \
  -d "chat_id=YOUR_GROUP_ID" \
  -d "text=🦞 OCL Agent Network test message" | jq .ok
# Should return: true
```

---

## 8. Pre-Flight Checklist

Run through this checklist before starting the wizard. Every item should be ✅.

```bash
echo "═══ OCL Pre-Flight Checklist ═══"
echo ""

# 1. Hardware
RAM=$(free -m | awk '/Mem:/ {print $2}')
[ "$RAM" -ge 7500 ] && echo "✅ RAM: ${RAM}MB (≥8GB)" || echo "❌ RAM: ${RAM}MB (need ≥8GB)"

CORES=$(nproc)
[ "$CORES" -ge 4 ] && echo "✅ CPU: ${CORES} cores" || echo "⚠️ CPU: ${CORES} cores (4+ recommended)"

DISK=$(df -BG / | awk 'NR==2 {gsub(/G/,""); print $4}')
[ "$DISK" -ge 50 ] && echo "✅ Disk: ${DISK}GB free" || echo "❌ Disk: ${DISK}GB free (need ≥50GB)"

# 2. Core tools
for cmd in curl wget git jq openssl sudo; do
    command -v $cmd >/dev/null 2>&1 && echo "✅ $cmd installed" || echo "❌ $cmd MISSING"
done

# 3. NFS client
dpkg -l nfs-common 2>/dev/null | grep -q "^ii" && echo "✅ nfs-common installed" || echo "❌ nfs-common MISSING — run: sudo apt install nfs-common"

# 4. Tailscale
command -v tailscale >/dev/null 2>&1 && echo "✅ Tailscale installed" || echo "❌ Tailscale MISSING"
tailscale status >/dev/null 2>&1 && echo "✅ Tailscale connected" || echo "⚠️ Tailscale not connected"

# 5. No port conflicts
CONFLICTS=$(sudo ss -tlnp 2>/dev/null | grep -cE '6443|6379|4000|11434' || echo 0)
[ "$CONFLICTS" -eq 0 ] && echo "✅ No port conflicts" || echo "❌ ${CONFLICTS} port conflict(s) detected"

# 6. NAS reachable (replace with your NAS IP)
# ping -c 1 YOUR_NAS_TAILSCALE_IP >/dev/null 2>&1 && echo "✅ NAS reachable" || echo "⚠️ NAS not reachable"

echo ""
echo "Have ready:"
echo "  □ Anthropic API key (sk-ant-...) OR Claude Max subscription (see Section 6.5)"
echo "  □ OpenAI API key (sk-...) [optional]"
echo "  □ Google AI API key [optional]"
echo "  □ Telegram bot token"
echo "  □ Telegram group ID"
echo "  □ NAS IP address"
echo ""

# 7. Optional: Claude Max OAuth
if [ -f "$HOME/.claude.json" ]; then
    CLAUDE_OAUTH=$(python3 -c "import json; d=json.load(open('$HOME/.claude.json')); print('yes') if d.get('oauthToken') else print('no')" 2>/dev/null || echo "no")
    [ "$CLAUDE_OAUTH" = "yes" ] && echo "✅ Claude Max OAuth detected — API key optional" || echo "ℹ️  ~/.claude.json found but no oauthToken"
else
    echo "ℹ️  Claude Max OAuth not configured (Section 6.5 — optional)"
fi

# 8. Optional: OpenAI Codex CLI OAuth
if [ -f "$HOME/.codex/auth.json" ]; then
    CODEX_MODE=$(python3 -c "import json; d=json.load(open('$HOME/.codex/auth.json')); print(d.get('auth_mode',''))" 2>/dev/null || echo "")
    [ "$CODEX_MODE" = "chatgpt" ] && echo "✅ OpenAI Codex OAuth detected — token-audit will use gpt-5.3-codex (zero cost)" || echo "ℹ️  ~/.codex/auth.json found but auth_mode is not chatgpt"
else
    echo "ℹ️  OpenAI Codex CLI OAuth not configured (Section 6.6 — optional)"
fi
```

---

## 9. Running the Interactive Wizard

### Step 9.1: Download the Wizard

```bash
# Option A: Clone from GitHub
git clone https://github.com/kavekonAI/OCLANetwork.git
cd OCLANetwork

# Option B: Direct download
curl -LO https://raw.githubusercontent.com/kavekonAI/OCLANetwork/main/setup-wizard.sh
chmod +x setup-wizard.sh
```

### Step 9.2: Start the Wizard

```bash
bash setup-wizard.sh
```

### Step 9.3: Interactive Wizard Walkthrough

The wizard guides you through 10 steps. Here's what to expect at each one:

**Step 1 — Prerequisites** (automatic)
- Installs k3s, Docker, Node.js, Tailscale if missing
- Takes 2–5 minutes on first run
- You may be prompted for your sudo password

**Step 2 — NAS Configuration**
- Enter your NAS Tailscale IP (e.g., `100.64.0.5`)
- Enter your NFS export path (default: `/volume1/openclaw-data`)
- The wizard mounts with NFSv4.1 and creates the directory structure
- If NFSv4.1 fails, you'll see a loud warning — fix your NAS settings before proceeding

**Step 3 — API Keys & OAuth Detection** (secure input — nothing is echoed)
- The wizard first auto-detects OAuth credentials:
  - If `~/.claude.json` contains an `oauthToken`, Anthropic API key becomes optional
  - If `~/.codex/auth.json` contains `auth_mode: chatgpt`, Codex CLI OAuth is activated and `token-audit` is assigned `gpt-5.3-codex` at zero cost
- Paste each API key when prompted. Press Enter to skip optional keys.
- At least one LLM provider (API key or OAuth) is required.
- Keys go directly into Kubernetes Secrets — cleared from shell memory immediately after injection.

**Step 4 — Telegram Configuration**
- Enter your bot token, group ID, and user ID
- The wizard sends a test message to verify

**Step 5 — Agent Selection**
- Commander, Watchdog, and Token Audit are auto-selected (required)
- Choose additional agents: content-creator, quant-trader, researcher, linkedin-mgr, librarian, virs-trainer
- Each agent's purpose is described in the selection menu

**Step 6 — Budget Configuration**
- Set your monthly budget cap (default: $300)
- Choose whether to enable the Token Optimizer (requires 16GB+ RAM)
- If you have ≤8GB RAM, choose "No" — agents will use Direct Mode

**Step 7 — Service Deployment** (automatic)
- Deploys Redis, Egress Proxy, NetworkPolicy, JWT Rotation CronJob
- If optimizer enabled: also deploys Ollama + LiteLLM
- Takes 1–3 minutes

**Step 8 — Gateway & Agent Deployment** (automatic)
- Generates SOUL files for each agent with the Universal Recovery Protocol
- Deploys the gateway pod with all agents
- Takes 1–2 minutes

**Step 9 — Management Tools** (automatic)
- Installs CLI tools: ocl-health, ocl-nuke, ocl-upgrade, ocl-pause/resume/restart, ocl-unlock, ocl-enable
- Installs trade executor (if quant-trader selected)
- Takes <1 minute

**Step 10 — Verify & Secure Cleanup** (automatic)
- Waits for all pods to reach Running state
- Checks for Ollama model downloads (may take 10–30 min on first run)
- Scrubs any leaked keys from disk
- Displays completion banner with all resolved gaps

### Step 9.4: Expected Duration

| Step | Duration | Notes |
|------|----------|-------|
| Prerequisites | 2–5 min | First run only |
| NAS + Keys + Telegram | 2–3 min | Your input time |
| Service Deployment | 1–3 min | Automatic |
| Agent Deployment | 1–2 min | Automatic |
| Verification | 1–3 min | Pods starting up |
| **Total** | **7–16 min** | First install |

Re-runs (adding agents, upgrading) take 2–5 minutes.

---

## 10. Post-Install Verification

After the wizard completes:

```bash
# Check system health
ocl-health

# Verify all pods are running
kubectl get pods -n ocl-services
kubectl get pods -n ocl-agents

# Check agent status
kubectl exec -n ocl-services deploy/redis -- redis-cli KEYS "ocl:agent-status:*"

# View JWT rotation status
kubectl exec -n ocl-services deploy/redis -- redis-cli HGETALL "ocl:jwt:rotation"

# Check NAS sync status
kubectl exec -n ocl-services deploy/redis -- redis-cli HGETALL "ocl:nas:sync"

# Send a test task via Telegram
# (message your bot with a command — Commander picks it up)
```

### Expected Pod Status

```
NAMESPACE      NAME                          READY   STATUS    
ocl-services   redis-0                       1/1     Running   
ocl-services   egress-proxy-xxxxx            1/1     Running   
ocl-services   ollama-xxxxx                  2/2     Running   # (if optimizer enabled)
ocl-services   litellm-xxxxx                 1/1     Running   # (if optimizer enabled)
ocl-agents     gateway-home-xxxxx            1/1     Running   
```

---

## 11. Troubleshooting Common Issues

### "NAS mount failed"

```bash
# Check NFS is enabled on Synology
showmount -e YOUR_NAS_IP

# Check NFSv4.1 specifically
sudo mount -t nfs -o nfsvers=4.1 YOUR_NAS_IP:/volume1/openclaw-data /mnt/nas
# If this fails: enable NFSv4.1 on Synology → Control Panel → File Services → NFS
```

### "At least one API provider is required"

You skipped all API key prompts. Go back and provide at least one key (Anthropic recommended).

### Pods stuck in "Pending" or "ContainerCreating"

```bash
# Check events
kubectl describe pod -n ocl-services <pod-name>
kubectl describe pod -n ocl-agents <pod-name>

# Common cause: insufficient resources
kubectl top nodes
```

### Ollama shows "0/2 Ready"

This is normal on first install — the model-puller sidecar is downloading ~5GB of model weights. Check progress:

```bash
kubectl logs -n ocl-services deploy/ollama -c model-puller -f
```

### JWT rotation failing

```bash
# Check CronJob status
kubectl get cronjob jwt-rotator -n ocl-services
kubectl get jobs -n ocl-services | grep jwt

# View last rotation attempt
kubectl logs -n ocl-services job/$(kubectl get jobs -n ocl-services --sort-by=.metadata.creationTimestamp -o name | tail -1 | cut -d/ -f2)

# Check rotation status in Redis
kubectl exec -n ocl-services deploy/redis -- redis-cli HGETALL "ocl:jwt:rotation"
```

### Disk space warning from NAS sync

```bash
# Check local SSD usage
df -h /home/ocl-local

# Force a manual sync
kubectl create job --from=cronjob/ocl-nas-sync manual-sync -n ocl-services

# Check NAS reachability
mountpoint -q /mnt/nas && echo "NAS mounted" || echo "NAS offline"
```

### Resetting Everything

```bash
# Nuclear option — wipe entire deployment (NAS data preserved)
ocl-nuke all --confirm="NUKE ALL"

# Then re-run wizard
bash setup-wizard.sh
```

---

## Quick Reference Card

```
┌──────────────────────────────────────────────────────┐
│              OCL Agent Network v20.0                  │
│            Quick Reference Card                       │
├──────────────────────────────────────────────────────┤
│                                                       │
│  INSTALL:    bash setup-wizard.sh                    │
│  UNATTENDED: bash setup-wizard.sh --env .env         │
│                                                       │
│  HEALTH:     ocl-health                              │
│  PODS:       kubectl get pods -A                     │
│  LOGS:       kubectl logs -n ocl-agents deploy/gw    │
│                                                       │
│  PAUSE:      ocl-pause <agent>                       │
│  RESUME:     ocl-resume <agent>                      │
│  RESTART:    ocl-restart agent <id>                  │
│  NUKE:       ocl-nuke agent <id>                     │
│                                                       │
│  UPGRADE:    ocl-upgrade 1.5.0                       │
│  UNLOCK:     ocl-unlock                              │
│  OPTIMIZER:  ocl-enable optimizer                    │
│                                                       │
│  NAS STATUS: redis-cli HGETALL ocl:nas:sync          │
│  JWT STATUS: redis-cli HGETALL ocl:jwt:rotation      │
│                                                       │
│  FILES:                                               │
│    REQUIREMENTS.md        — Full spec                │
│    openclaw-architecture.md — Architecture           │
│    setup-wizard.sh        — Installer                │
│    .env.example           — Unattended template      │
│    PREREQUISITES.md       — This document            │
│                                                       │
└──────────────────────────────────────────────────────┘
```
