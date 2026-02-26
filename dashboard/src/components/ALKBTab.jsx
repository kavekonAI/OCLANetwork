import React, { useEffect, useState } from 'react'
import { api } from '../api.js'

export default function ALKBTab() {
  const [failures, setFailures] = useState([])
  const [fixed, setFixed] = useState([])
  const [pendingCount, setPendingCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [subTab, setSubTab] = useState('failures')
  const [filter, setFilter] = useState('')
  const [promoting, setPromoting] = useState(null)
  const [error, setError] = useState(null)
  const [msg, setMsg] = useState(null)

  async function load() {
    try {
      const [f, fx, pc] = await Promise.all([
        api.alkbFailures(),
        api.alkbFixed(),
        api.alkbPendingCount(),
      ])
      setFailures(f)
      setFixed(fx)
      setPendingCount(pc.count || 0)
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function promote(id) {
    setPromoting(id)
    setMsg(null)
    try {
      await api.promoteAlkb(id)
      setMsg({ ok: true, text: `Promoted ${id} to Fixed` })
      await load()
    } catch (e) {
      setMsg({ ok: false, text: `Promote failed: ${e.message}` })
    } finally {
      setPromoting(null)
    }
  }

  const items = subTab === 'failures' ? failures : fixed
  const filtered = items.filter((i) => {
    if (!filter) return true
    if (subTab === 'monetizable') return i.monetizable === 'true' || i.monetizable === '1'
    return JSON.stringify(i).toLowerCase().includes(filter.toLowerCase())
  })
  const monetizable = fixed.filter((i) => i.monetizable === 'true' || i.monetizable === '1')

  const tabs = [
    { id: 'failures', label: `Failures (${failures.length})` },
    { id: 'fixed', label: `Fixed (${fixed.length})` },
    { id: 'monetizable', label: `Monetizable (${monetizable.length})` },
  ]

  if (loading) return <div style={{ color: '#8b949e' }}>Loading ALKB…</div>

  return (
    <div>
      {error && <div style={{ color: '#f85149', marginBottom: 12 }}>Error: {error}</div>}
      {msg && (
        <div style={{ color: msg.ok ? '#3fb950' : '#f85149', marginBottom: 12 }}>
          {msg.text}
        </div>
      )}

      {pendingCount > 0 && (
        <div style={{ background: '#161b22', border: '1px solid #d29922', borderRadius: 6, padding: '8px 14px', marginBottom: 14, fontSize: 12, color: '#d29922' }}>
          {pendingCount} item{pendingCount !== 1 ? 's' : ''} pending review in ALKB
        </div>
      )}

      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: '1px solid #30363d' }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id)}
            style={{
              background: 'none',
              border: 'none',
              color: subTab === t.id ? '#e6edf3' : '#8b949e',
              borderBottom: subTab === t.id ? '2px solid #58a6ff' : '2px solid transparent',
              padding: '8px 14px',
              fontWeight: subTab === t.id ? 600 : 400,
            }}
          >
            {t.label}
          </button>
        ))}
        <input
          placeholder="Search…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ marginLeft: 'auto', width: 200 }}
        />
      </div>

      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Agent</th>
            <th>Error Category</th>
            <th>Task</th>
            <th>Created</th>
            {subTab === 'fixed' || subTab === 'monetizable' ? <th>Validation</th> : null}
            {subTab === 'failures' ? <th>Action</th> : null}
          </tr>
        </thead>
        <tbody>
          {(subTab === 'monetizable' ? monetizable : filtered).map((item) => (
            <tr key={item.id}>
              <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{item.id}</td>
              <td>{item.agent || '—'}</td>
              <td>
                <span style={{ fontSize: 12, color: '#d29922' }}>{item.error_category || '—'}</span>
              </td>
              <td style={{ maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.task_id || item.task || '—'}
              </td>
              <td style={{ fontSize: 11, color: '#8b949e' }}>
                {item.created_at || item.promoted_at
                  ? new Date(parseInt(item.created_at || item.promoted_at, 10)).toLocaleString()
                  : '—'}
              </td>
              {(subTab === 'fixed' || subTab === 'monetizable') && (
                <td>
                  <span style={{ fontSize: 11, color: item.validation === 'pending-review' ? '#d29922' : '#3fb950' }}>
                    {item.validation || '—'}
                  </span>
                </td>
              )}
              {subTab === 'failures' && (
                <td>
                  <button
                    onClick={() => promote(item.id)}
                    disabled={promoting === item.id}
                    style={{
                      background: '#238636',
                      border: 'none',
                      color: '#fff',
                      padding: '4px 10px',
                      borderRadius: 4,
                      opacity: promoting === item.id ? 0.5 : 1,
                    }}
                  >
                    {promoting === item.id ? 'Promoting…' : 'Promote →'}
                  </button>
                </td>
              )}
            </tr>
          ))}
          {filtered.length === 0 && (
            <tr>
              <td colSpan={7} style={{ color: '#8b949e', textAlign: 'center', padding: 20 }}>
                No items
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
