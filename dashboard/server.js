'use strict';
const express = require('express');
const cors = require('cors');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { WebSocketServer } = require('ws');
const Redis = require('ioredis');

const PORT = parseInt(process.env.PORT || '3000', 10);
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const DASHBOARD_TOKEN = process.env.DASHBOARD_TOKEN || '';
const K8S_TOKEN_FILE = '/var/run/secrets/kubernetes.io/serviceaccount/token';
const K8S_CA_FILE = '/var/run/secrets/kubernetes.io/serviceaccount/ca.crt';
const K8S_NAMESPACE_FILE = '/var/run/secrets/kubernetes.io/serviceaccount/namespace';
const K8S_API = 'https://kubernetes.default.svc';

// ── Redis clients ──────────────────────────────────────────────────────────
const redis = new Redis(REDIS_URL, { lazyConnect: false, enableOfflineQueue: true });
const streamSecurity = new Redis(REDIS_URL, { lazyConnect: false, enableOfflineQueue: true });
const streamDLP = new Redis(REDIS_URL, { lazyConnect: false, enableOfflineQueue: true });

redis.on('error', (e) => console.error('[redis] main error:', e.message));
streamSecurity.on('error', (e) => console.error('[redis] security stream error:', e.message));
streamDLP.on('error', (e) => console.error('[redis] DLP stream error:', e.message));

// ── k8s helpers ────────────────────────────────────────────────────────────
function k8sToken() {
  try { return fs.readFileSync(K8S_TOKEN_FILE, 'utf8').trim(); } catch { return ''; }
}
function k8sCa() {
  try { return fs.readFileSync(K8S_CA_FILE); } catch { return undefined; }
}

async function k8sGet(path) {
  const https = require('https');
  return new Promise((resolve, reject) => {
    const req = https.request(`${K8S_API}${path}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${k8sToken()}`, Accept: 'application/json' },
      ca: k8sCa(),
    }, (res) => {
      let body = '';
      res.on('data', (d) => body += d);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(body) }); }
        catch { resolve({ status: res.statusCode, body }); }
      });
    });
    req.on('error', reject);
    req.setTimeout(5000, () => { req.destroy(new Error('k8s request timeout')); });
    req.end();
  });
}

async function k8sPatch(path, body) {
  const https = require('https');
  const data = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = https.request(`${K8S_API}${path}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${k8sToken()}`,
        'Content-Type': 'application/strategic-merge-patch+json',
        'Content-Length': Buffer.byteLength(data),
        Accept: 'application/json',
      },
      ca: k8sCa(),
    }, (res) => {
      let body = '';
      res.on('data', (d) => body += d);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(body) }); }
        catch { resolve({ status: res.statusCode, body }); }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(new Error('k8s patch timeout')); });
    req.write(data);
    req.end();
  });
}

// ── Agent list cache (from ConfigMap) ─────────────────────────────────────
let agentListCache = null;
let agentListExpiry = 0;

async function getAgentList() {
  if (agentListCache && Date.now() < agentListExpiry) return agentListCache;
  try {
    const res = await k8sGet('/api/v1/namespaces/ocl-agents/configmaps/openclaw-home-config');
    if (res.status === 200 && res.body.data) {
      const configStr = res.body.data['config.json'] || res.body.data['openclaw.json'] || '';
      if (configStr) {
        const cfg = JSON.parse(configStr);
        const list = cfg.agents?.list || cfg.agents || [];
        agentListCache = Array.isArray(list)
          ? list.map((a) => (typeof a === 'string' ? { id: a, name: a } : a))
          : [];
      }
    }
  } catch (e) {
    console.error('[agents] ConfigMap read failed:', e.message);
  }
  // Fallback: scan redis heartbeat keys
  if (!agentListCache || agentListCache.length === 0) {
    const keys = await redisScan('ocl:heartbeat:*');
    agentListCache = keys.map((k) => {
      const id = k.replace('ocl:heartbeat:', '');
      return { id, name: id };
    });
  }
  agentListExpiry = Date.now() + 60000;
  return agentListCache || [];
}

// ── Redis SCAN helper ──────────────────────────────────────────────────────
async function redisScan(pattern) {
  const keys = [];
  let cursor = '0';
  do {
    const [nextCursor, batch] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 200);
    cursor = nextCursor;
    keys.push(...batch);
  } while (cursor !== '0');
  return keys;
}

// ── WebSocket broadcast ────────────────────────────────────────────────────
const wss = new WebSocketServer({ noServer: true });
const wsClients = new Set();

function broadcast(type, data) {
  const msg = JSON.stringify({ type, data, ts: Date.now() });
  for (const ws of wsClients) {
    if (ws.readyState === 1) ws.send(msg);
  }
}

wss.on('connection', (ws, req) => {
  wsClients.add(ws);
  ws.on('close', () => wsClients.delete(ws));
  ws.on('error', () => wsClients.delete(ws));
  ws.send(JSON.stringify({ type: 'connected', ts: Date.now() }));
});

// ── Stream readers ─────────────────────────────────────────────────────────
let lastSecurityId = '$';
let lastDLPId = '$';

async function readSecurityStream() {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const results = await streamSecurity.xread(
        'BLOCK', 5000, 'STREAMS', 'ocl:security:audit', lastSecurityId
      );
      if (results) {
        for (const [, entries] of results) {
          for (const [id, fields] of entries) {
            lastSecurityId = id;
            const obj = { id };
            for (let i = 0; i < fields.length; i += 2) obj[fields[i]] = fields[i + 1];
            broadcast('security', obj);
          }
        }
      }
    } catch (e) {
      if (!e.message?.includes('Connection is closed')) {
        console.error('[stream:security]', e.message);
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

async function readDLPStream() {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const results = await streamDLP.xread(
        'BLOCK', 5000, 'STREAMS', 'ocl:dlp:log', lastDLPId
      );
      if (results) {
        for (const [, entries] of results) {
          for (const [id, fields] of entries) {
            lastDLPId = id;
            const obj = { id };
            for (let i = 0; i < fields.length; i += 2) obj[fields[i]] = fields[i + 1];
            broadcast('dlp', obj);
          }
        }
      }
    } catch (e) {
      if (!e.message?.includes('Connection is closed')) {
        console.error('[stream:dlp]', e.message);
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

// ── Auth middleware ────────────────────────────────────────────────────────
function auth(req, res, next) {
  if (!DASHBOARD_TOKEN) return next(); // no token configured — open (dev)
  const h = req.headers['authorization'] || '';
  if (h === `Bearer ${DASHBOARD_TOKEN}`) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

// ── Express app ────────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());

const DIST = path.join(__dirname, 'dist');

// Serve index.html with injected meta token
app.get('/', (req, res) => serveIndex(res));
app.get('/index.html', (req, res) => serveIndex(res));

function serveIndex(res) {
  const indexPath = path.join(DIST, 'index.html');
  if (!fs.existsSync(indexPath)) {
    return res.status(503).send('Dashboard not built. Run: npm run build');
  }
  let html = fs.readFileSync(indexPath, 'utf8');
  const meta = `<meta name="dashboard-token" content="${DASHBOARD_TOKEN}">`;
  html = html.replace('<head>', `<head>\n    ${meta}`);
  res.setHeader('Content-Type', 'text/html');
  res.send(html);
}

// Static assets (JS/CSS bundles — no token injection needed)
app.use(express.static(DIST, {
  index: false, // handled above
  setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache'),
}));

// ── API: Agents ─────────────────────────────────────────────────────────
app.get('/api/agents', auth, async (req, res) => {
  try {
    const agents = await getAgentList();
    const subStatus = await redis.hgetall('ocl:subscription:anthropic') || {};
    const isRateLimited = subStatus.status === 'rate_limited';

    const result = await Promise.all(agents.map(async (a) => {
      const id = a.id || a;
      const [ttl, statusHash] = await Promise.all([
        redis.ttl(`ocl:heartbeat:${id}`),
        redis.hgetall(`ocl:agent-status:${id}`) || {},
      ]);
      const agentStatus = statusHash.status || 'running';
      let display;
      if (ttl > 0) {
        if (agentStatus === 'paused') display = 'paused';
        else if (isRateLimited) display = 'rate_limited';
        else display = 'running';
      } else {
        display = 'stopped';
      }
      return { id, name: a.name || id, display, agentStatus, heartbeatTtl: ttl, ...statusHash };
    }));
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── API: Tasks ──────────────────────────────────────────────────────────
app.get('/api/tasks', auth, async (req, res) => {
  try {
    const keys = await redisScan('ocl:taskboard:*');
    const tasks = await Promise.all(
      keys.map(async (k) => {
        const h = await redis.hgetall(k);
        return { key: k, ...h };
      })
    );
    res.json(tasks.filter(Boolean));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── API: Efficiency / Cost ───────────────────────────────────────────────
app.get('/api/efficiency', auth, async (req, res) => {
  try {
    const keys = await redisScan('ocl:cost:*');
    const rows = await Promise.all(
      keys.map(async (k) => {
        const h = await redis.hgetall(k);
        const tokIn = parseInt(h.tokens_in || '0', 10);
        const tokOut = parseInt(h.tokens_out || '0', 10);
        const ratio = tokIn > 0 ? (tokOut / tokIn).toFixed(3) : null;
        const avgPrompt = tokIn > 0 && h.request_count
          ? Math.round(tokIn / parseInt(h.request_count, 10))
          : null;
        return { key: k, ...h, efficiency_ratio: ratio, avg_prompt_tokens: avgPrompt };
      })
    );
    res.json(rows.filter(Boolean));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── API: Subscription ────────────────────────────────────────────────────
app.get('/api/subscription', auth, async (req, res) => {
  try {
    const h = await redis.hgetall('ocl:subscription:anthropic');
    res.json(h || {});
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── API: Security log ────────────────────────────────────────────────────
app.get('/api/security', auth, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '100', 10), 500);
    const entries = await redis.xrevrange('ocl:security:audit', '+', '-', 'COUNT', limit);
    const result = entries.map(([id, fields]) => {
      const obj = { id };
      for (let i = 0; i < fields.length; i += 2) obj[fields[i]] = fields[i + 1];
      return obj;
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── API: DLP log ─────────────────────────────────────────────────────────
app.get('/api/dlp', auth, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '100', 10), 500);
    const entries = await redis.xrevrange('ocl:dlp:log', '+', '-', 'COUNT', limit);
    const result = entries.map(([id, fields]) => {
      const obj = { id };
      for (let i = 0; i < fields.length; i += 2) obj[fields[i]] = fields[i + 1];
      return obj;
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── API: ALKB ────────────────────────────────────────────────────────────
app.get('/api/alkb/failures', auth, async (req, res) => {
  try {
    const keys = await redisScan('ocl:learnings:failures:*');
    const items = await Promise.all(
      keys.map(async (k) => {
        const h = await redis.hgetall(k);
        return { id: k.replace('ocl:learnings:failures:', ''), key: k, ...h };
      })
    );
    res.json(items.filter(Boolean));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/alkb/fixed', auth, async (req, res) => {
  try {
    const keys = await redisScan('ocl:learnings:fixed:*');
    const items = await Promise.all(
      keys.map(async (k) => {
        const h = await redis.hgetall(k);
        return { id: k.replace('ocl:learnings:fixed:', ''), key: k, ...h };
      })
    );
    res.json(items.filter(Boolean));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/alkb/pending-count', auth, async (req, res) => {
  try {
    const count = await redis.scard('ocl:learnings:by-status:pending-review');
    res.json({ count });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── API: LiteLLM status ──────────────────────────────────────────────────
app.get('/api/litellm/status', auth, async (req, res) => {
  try {
    const http2 = require('http');
    await new Promise((resolve) => {
      const req2 = http2.get(
        'http://litellm-service.ocl-services:4000/health',
        { timeout: 1000 },
        (r) => { resolve({ deployed: r.statusCode < 500 }); }
      );
      req2.on('error', () => resolve({ deployed: false }));
      req2.on('timeout', () => { req2.destroy(); resolve({ deployed: false }); });
    }).then((r) => res.json(r));
  } catch {
    res.json({ deployed: false });
  }
});

// ── Write: Pause / Resume ────────────────────────────────────────────────
app.post('/api/agents/:id/pause', auth, async (req, res) => {
  const { id } = req.params;
  try {
    await redis.hset(`ocl:agent-status:${id}`,
      'status', 'paused',
      'paused_at', Date.now().toString(),
      'paused_by', 'dashboard'
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/agents/:id/resume', auth, async (req, res) => {
  const { id } = req.params;
  try {
    const pipe = redis.pipeline();
    pipe.hset(`ocl:agent-status:${id}`, 'status', 'running');
    pipe.hdel(`ocl:agent-status:${id}`, 'paused_at', 'paused_by');
    await pipe.exec();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Write: Restart agent (patches gateway deployment) ───────────────────
app.post('/api/agents/:id/restart', auth, async (req, res) => {
  try {
    const patch = {
      spec: {
        template: {
          metadata: {
            annotations: { 'kubectl.kubernetes.io/restartedAt': new Date().toISOString() },
          },
        },
      },
    };
    const r = await k8sPatch('/apis/apps/v1/namespaces/ocl-agents/deployments/gateway-home', patch);
    res.json({ ok: r.status < 300, k8sStatus: r.status });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Write: Nuke agent (Redis-based) ─────────────────────────────────────
app.delete('/api/agents/:id', auth, async (req, res) => {
  const { id } = req.params;
  const confirm = req.body?.confirm;
  if (confirm !== `NUKE ${id}`) {
    return res.status(400).json({ error: `confirm must equal "NUKE ${id}"` });
  }
  try {
    const ts = Date.now();
    // Archive to ALKB
    await redis.hset(`ocl:learnings:failures:nuke-${id}-${ts}`,
      'task_id', `nuke-${id}-${ts}`,
      'agent', id,
      'error_category', 'lifecycle',
      'event', 'nuke',
      'nuked_at', ts.toString(),
      'nuked_by', 'dashboard'
    );
    // Clear task state
    const taskStateKeys = await redisScan(`ocl:task-state:${id}:*`);
    if (taskStateKeys.length > 0) await redis.del(...taskStateKeys);
    // Clear agent status
    await redis.del(`ocl:agent-status:${id}`);
    // Scan taskboard and remove agent assignments
    const taskboardKeys = await redisScan('ocl:taskboard:*');
    const pipe = redis.pipeline();
    for (const k of taskboardKeys) {
      pipe.hdel(k, 'agent');
    }
    await pipe.exec();
    res.json({
      ok: true,
      deletedTaskStateKeys: taskStateKeys.length,
      taskboardKeysUpdated: taskboardKeys.length,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Write: ALKB promote ──────────────────────────────────────────────────
app.post('/api/alkb/:id/promote', auth, async (req, res) => {
  const { id } = req.params;
  const srcKey = `ocl:learnings:failures:${id}`;
  try {
    const src = await redis.hgetall(srcKey);
    if (!src || Object.keys(src).length === 0) {
      return res.status(404).json({ error: 'Failure item not found' });
    }
    const ts = Date.now();
    const agent = src.agent || 'unknown';
    const fixedKey = `ocl:learnings:fixed:${id}`;
    const pipe = redis.pipeline();
    pipe.hset(fixedKey, ...Object.entries({ ...src, validation: 'pending-review', promoted_at: ts.toString() }).flat());
    pipe.zadd('ocl:learnings:index', ts, `fixed:${id}`);
    pipe.srem('ocl:learnings:by-status:open', id);
    pipe.sadd('ocl:learnings:by-status:pending-review', id);
    pipe.sadd(`ocl:learnings:by-agent:${agent}`, `fixed:${id}`);
    pipe.del(srcKey);
    await pipe.exec();
    res.json({ ok: true, fixedKey });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Write: Gateway restart ───────────────────────────────────────────────
app.post('/api/gateway/restart', auth, async (req, res) => {
  try {
    const patch = {
      spec: {
        template: {
          metadata: {
            annotations: { 'kubectl.kubernetes.io/restartedAt': new Date().toISOString() },
          },
        },
      },
    };
    const r = await k8sPatch('/apis/apps/v1/namespaces/ocl-agents/deployments/gateway-home', patch);
    res.json({ ok: r.status < 300, k8sStatus: r.status });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── HTTP server + WS upgrade ───────────────────────────────────────────
const server = http.createServer(app);

server.on('upgrade', (req, socket, head) => {
  if (req.url === '/ws') {
    // Auth check on upgrade
    if (DASHBOARD_TOKEN) {
      const params = new URLSearchParams(req.url.split('?')[1] || '');
      const token = params.get('token');
      const authHeader = req.headers['authorization'] || '';
      if (token !== DASHBOARD_TOKEN && authHeader !== `Bearer ${DASHBOARD_TOKEN}`) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  } else {
    socket.destroy();
  }
});

// ── 15s heartbeat ping ────────────────────────────────────────────────
setInterval(() => {
  for (const ws of wsClients) {
    if (ws.readyState === 1) ws.ping();
  }
}, 15000);

// ── Start ──────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`Dashboard listening on :${PORT}`);
  // Start stream readers (non-blocking async loops)
  readSecurityStream().catch(() => {});
  readDLPStream().catch(() => {});
});
