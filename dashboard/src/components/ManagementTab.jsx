import React, { useEffect, useState } from 'react'
import { api } from '../api.js'

function ConfirmDialog({ agentId, pendingCount, onConfirm, onCancel }) {
  const [text, setText] = useState('')
  const expected = `NUKE ${agentId}`
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: '#0d111799', display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000,
    }}>
      <div style={{
        background: '#161b22', border: '1px solid #f85149', borderRadius: 8,
        padding: '24px 28px', maxWidth: 420, width: '90%',
      }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#f85149', marginBottom: 12 }}>
          Nuke Agent: {agentId}
        </div>
        <div style={{ fontSize: 13, color: '#8b949e', marginBottom: 16, lineHeight: 1.6 }}>
          This will archive agent state to ALKB, clear all task state, and remove status keys from Redis.
          The gateway pod will NOT be deleted (agents share a pod).
        </div>
        <div style={{
          background: '#0d1117', border: '1px solid #30363d', borderRadius: 4,
          padding: '8px 12px', marginBottom: 14, fontSize: 12,
        }}>
          Pending ALKB reviews: <strong style={{ color: '#d29922' }}>{pendingCount}</strong>
        </div>
        <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 8 }}>
          Type <strong style={{ color: '#f85149' }}>{expected}</strong> to confirm:
        </div>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={expected}
          style={{ width: '100%', marginBottom: 16 }}
          autoFocus
        />
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            style={{ background: '#30363d', border: 'none', color: '#e6edf3', padding: '6px 16px', borderRadius: 4 }}
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(text)}
            disabled={text !== expected}
            style={{
              background: text === expected ? '#da3633' : '#30363d',
              border: 'none', color: '#fff', padding: '6px 16px', borderRadius: 4,
              opacity: text !== expected ? 0.5 : 1,
            }}
          >
            NUKE
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ManagementTab() {
  const [agents, setAgents] = useState([])
  const [pendingCount, setPendingCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [nukeTarget, setNukeTarget] = useState(null)
  const [busy, setBusy] = useState({})
  const [msgs, setMsgs] = useState({})
  const [error, setError] = useState(null)

  async function load() {
    try {
      const [a, pc] = await Promise.all([api.agents(), api.alkbPendingCount()])
      setAgents(a)
      setPendingCount(pc.count || 0)
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    const t = setInterval(load, 15000)
    return () => clearInterval(t)
  }, [])

  async function action(fn, id, label) {
    setBusy((b) => ({ ...b, [id]: label }))
    setMsgs((m) => ({ ...m, [id]: null }))
    try {
      await fn()
      setMsgs((m) => ({ ...m, [id]: { ok: true, text: `${label} OK` } }))
      await load()
    } catch (e) {
      setMsgs((m) => ({ ...m, [id]: { ok: false, text: e.message } }))
    } finally {
      setBusy((b) => { const n = { ...b }; delete n[id]; return n })
    }
  }

  async function confirmNuke(id, confirmText) {
    setNukeTarget(null)
    await action(() => api.nukeAgent(id, confirmText), id, 'Nuke')
  }

  async function restartGateway() {
    setBusy((b) => ({ ...b, _gateway: 'Restarting' }))
    setMsgs((m) => ({ ...m, _gateway: null }))
    try {
      await api.restartGateway()
      setMsgs((m) => ({ ...m, _gateway: { ok: true, text: 'Gateway restart triggered' } }))
    } catch (e) {
      setMsgs((m) => ({ ...m, _gateway: { ok: false, text: e.message } }))
    } finally {
      setBusy((b) => { const n = { ...b }; delete n._gateway; return n })
    }
  }

  const btnStyle = (color = '#238636') => ({
    background: color, border: 'none', color: '#fff',
    padding: '5px 12px', borderRadius: 4, fontSize: 12,
    marginRight: 6,
  })

  if (loading) return <div style={{ color: '#8b949e' }}>Loading agents…</div>
  if (error) return <div style={{ color: '#f85149' }}>Error: {error}</div>

  return (
    <div>
      {/* Node Management — REQ-03.21 */}
      <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 6, padding: '14px 16px', marginBottom: 24 }}>
        <h3 style={{ fontSize: 14, marginBottom: 12 }}>Node Management</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button
            onClick={restartGateway}
            disabled={!!busy._gateway}
            style={btnStyle('#1f6feb')}
          >
            {busy._gateway || 'Restart Gateway'}
          </button>
          {msgs._gateway && (
            <span style={{ fontSize: 12, color: msgs._gateway.ok ? '#3fb950' : '#f85149' }}>
              {msgs._gateway.text}
            </span>
          )}
        </div>
      </div>

      {/* Agent Management — REQ-03.20 */}
      <h3 style={{ fontSize: 14, marginBottom: 12 }}>Agent Management</h3>
      <table>
        <thead>
          <tr>
            <th>Agent</th>
            <th>Status</th>
            <th>Actions</th>
            <th>Result</th>
          </tr>
        </thead>
        <tbody>
          {agents.map((a) => (
            <tr key={a.id}>
              <td><strong>{a.name || a.id}</strong></td>
              <td>
                <span style={{
                  fontSize: 12, fontWeight: 600,
                  color: a.display === 'running' ? '#3fb950'
                    : a.display === 'paused' ? '#d29922'
                    : a.display === 'rate_limited' ? '#f0883e'
                    : '#f85149',
                }}>
                  {a.display?.replace('_', ' ').toUpperCase()}
                </span>
              </td>
              <td>
                {a.display !== 'paused' && (
                  <button
                    onClick={() => action(() => api.pauseAgent(a.id), a.id, 'Pause')}
                    disabled={!!busy[a.id]}
                    style={btnStyle('#d29922')}
                  >
                    Pause
                  </button>
                )}
                {a.display === 'paused' && (
                  <button
                    onClick={() => action(() => api.resumeAgent(a.id), a.id, 'Resume')}
                    disabled={!!busy[a.id]}
                    style={btnStyle('#238636')}
                  >
                    Resume
                  </button>
                )}
                <button
                  onClick={() => action(() => api.restartAgent(a.id), a.id, 'Restart')}
                  disabled={!!busy[a.id]}
                  style={btnStyle('#1f6feb')}
                >
                  Restart
                </button>
                <button
                  onClick={() => setNukeTarget(a.id)}
                  disabled={!!busy[a.id]}
                  style={btnStyle('#da3633')}
                >
                  Nuke
                </button>
                {busy[a.id] && (
                  <span style={{ fontSize: 12, color: '#8b949e' }}>{busy[a.id]}…</span>
                )}
              </td>
              <td>
                {msgs[a.id] && (
                  <span style={{ fontSize: 12, color: msgs[a.id].ok ? '#3fb950' : '#f85149' }}>
                    {msgs[a.id].text}
                  </span>
                )}
              </td>
            </tr>
          ))}
          {agents.length === 0 && (
            <tr><td colSpan={4} style={{ color: '#8b949e', textAlign: 'center', padding: 20 }}>No agents</td></tr>
          )}
        </tbody>
      </table>

      {/* Nuke confirmation dialog — REQ-03.23 */}
      {nukeTarget && (
        <ConfirmDialog
          agentId={nukeTarget}
          pendingCount={pendingCount}
          onConfirm={(text) => confirmNuke(nukeTarget, text)}
          onCancel={() => setNukeTarget(null)}
        />
      )}
    </div>
  )
}
