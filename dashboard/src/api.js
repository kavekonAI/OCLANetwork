// API helpers + WebSocket hook

const TOKEN_KEY = 'oclan-dashboard-token';

function getToken() {
  return sessionStorage.getItem(TOKEN_KEY) || '';
}

export function setToken(token) {
  if (token) {
    sessionStorage.setItem(TOKEN_KEY, token);
  } else {
    sessionStorage.removeItem(TOKEN_KEY);
  }
}

export function hasToken() {
  return !!sessionStorage.getItem(TOKEN_KEY);
}

export async function verifyToken(token) {
  const r = await fetch('/api/auth/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  return r.ok;
}

export async function whoami() {
  const r = await fetch('/api/auth/whoami', { headers: headers() });
  if (!r.ok) return null;
  return r.json();
}

function headers() {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

async function get(path) {
  const r = await fetch(path, { headers: headers() });
  if (r.status === 401) {
    setToken(null);
    window.dispatchEvent(new Event('oclan-auth-expired'));
    throw new Error('Session expired');
  }
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json();
}

async function post(path, body) {
  const r = await fetch(path, {
    method: 'POST',
    headers: { ...headers(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (r.status === 401) {
    setToken(null);
    window.dispatchEvent(new Event('oclan-auth-expired'));
    throw new Error('Session expired');
  }
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json();
}

async function del(path, body) {
  const r = await fetch(path, {
    method: 'DELETE',
    headers: { ...headers(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (r.status === 401) {
    setToken(null);
    window.dispatchEvent(new Event('oclan-auth-expired'));
    throw new Error('Session expired');
  }
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
      const token = getToken();
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const url = `${proto}://${location.host}/ws${token ? `?token=${token}` : ''}`;
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
