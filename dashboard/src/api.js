// API helpers + WebSocket hook

let TOKEN = null;

export function initToken() {
  const meta = document.querySelector('meta[name="dashboard-token"]');
  TOKEN = meta?.content || '';
}

function headers() {
  return TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {};
}

async function get(path) {
  const r = await fetch(path, { headers: headers() });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json();
}

async function post(path, body) {
  const r = await fetch(path, {
    method: 'POST',
    headers: { ...headers(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json();
}

async function del(path, body) {
  const r = await fetch(path, {
    method: 'DELETE',
    headers: { ...headers(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json();
}

export const api = {
  agents: () => get('/api/agents'),
  tasks: () => get('/api/tasks'),
  efficiency: () => get('/api/efficiency'),
  subscription: () => get('/api/subscription'),
  security: (limit = 100) => get(`/api/security?limit=${limit}`),
  dlp: (limit = 100) => get(`/api/dlp?limit=${limit}`),
  alkbFailures: () => get('/api/alkb/failures'),
  alkbFixed: () => get('/api/alkb/fixed'),
  alkbPendingCount: () => get('/api/alkb/pending-count'),
  litellmStatus: () => get('/api/litellm/status'),

  pauseAgent: (id) => post(`/api/agents/${id}/pause`),
  resumeAgent: (id) => post(`/api/agents/${id}/resume`),
  restartAgent: (id) => post(`/api/agents/${id}/restart`),
  nukeAgent: (id, confirmText) => del(`/api/agents/${id}`, { confirm: confirmText }),
  promoteAlkb: (id) => post(`/api/alkb/${id}/promote`),
  restartGateway: () => post('/api/gateway/restart'),
};

// ── WebSocket hook ──────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react';

export function useWebSocket(onMessage) {
  const wsRef = useRef(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    function connect() {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const url = `${proto}://${location.host}/ws${TOKEN ? `?token=${TOKEN}` : ''}`;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => setConnected(true);
      ws.onclose = () => {
        setConnected(false);
        setTimeout(connect, 3000);
      };
      ws.onerror = () => ws.close();
      ws.onmessage = (e) => {
        try { onMessage(JSON.parse(e.data)); } catch {}
      };
    }
    connect();
    return () => { wsRef.current?.close(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return connected;
}
