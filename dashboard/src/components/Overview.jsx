import React, { useEffect, useState } from 'react'
import { api } from '../api.js'

const STATUS_COLOR = {
  running: '#3fb950',
  paused: '#d29922',
  stopped: '#f85149',
  rate_limited: '#f0883e',
}
const STATUS_ICON = {
  running: '🟢',
  paused: '🟡',
  stopped: '🔴',
  rate_limited: '🟠',
}

export default function Overview() {
  const [agents, setAgents] = useState([])
  const [sub, setSub] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  async function load() {
    try {
      const [a, s] = await Promise.all([api.agents(), api.subscription()])
      setAgents(a)
      setSub(s)
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

  // Reset countdown
  let resetIn = null
  if (sub.reset_at) {
    const diff = parseInt(sub.reset_at, 10) - Date.now()
    if (diff > 0) {
      const h = Math.floor(diff / 3600000)
      const m = Math.floor((diff % 3600000) / 60000)
      resetIn = `${h}h ${m}m`
    }
  }

  if (loading) return <div style={{ color: '#8b949e' }}>Loading agents…</div>
  if (error) return <div style={{ color: '#f85149' }}>Error: {error}</div>

  return (
    <div>
      {/* Subscription banner */}
      {(sub.status || resetIn) && (
        <div style={{
          background: '#161b22',
          border: '1px solid #30363d',
          borderRadius: 6,
          padding: '10px 16px',
          marginBottom: 20,
          display: 'flex',
          gap: 24,
          flexWrap: 'wrap',
        }}>
          {sub.status && (
            <span>
              Anthropic subscription:{' '}
              <strong style={{ color: sub.status === 'rate_limited' ? '#f0883e' : '#3fb950' }}>
                {sub.status}
              </strong>
            </span>
          )}
          {resetIn && <span>Reset in: <strong style={{ color: '#58a6ff' }}>{resetIn}</strong></span>}
        </div>
      )}

      {/* Agent cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
        {agents.map((a) => (
          <div key={a.id} style={{
            background: '#161b22',
            border: `1px solid ${STATUS_COLOR[a.display] || '#30363d'}44`,
            borderRadius: 8,
            padding: '14px 16px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 18 }}>{STATUS_ICON[a.display] || '⚪'}</span>
              <strong style={{ fontSize: 14 }}>{a.name || a.id}</strong>
            </div>
            <div style={{ fontSize: 12, color: STATUS_COLOR[a.display] || '#8b949e' }}>
              {a.display?.replace('_', ' ').toUpperCase() || 'UNKNOWN'}
            </div>
            {a.heartbeatTtl > 0 && (
              <div style={{ fontSize: 11, color: '#8b949e', marginTop: 4 }}>
                Heartbeat TTL: {a.heartbeatTtl}s
              </div>
            )}
            {a.paused_at && (
              <div style={{ fontSize: 11, color: '#8b949e', marginTop: 2 }}>
                Paused: {new Date(parseInt(a.paused_at, 10)).toLocaleTimeString()}
              </div>
            )}
          </div>
        ))}
        {agents.length === 0 && (
          <div style={{ color: '#8b949e', gridColumn: '1/-1' }}>
            No agents found in ConfigMap. Check openclaw-home-config.
          </div>
        )}
      </div>
    </div>
  )
}
