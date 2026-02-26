import React, { useEffect, useState } from 'react'
import { api } from '../api.js'

function streamIdToDate(id) {
  const ts = parseInt(id?.split('-')[0], 10)
  return isNaN(ts) ? '—' : new Date(ts).toLocaleString()
}

export default function DLPLog({ liveEvents = [] }) {
  const [historical, setHistorical] = useState([])
  const [filter, setFilter] = useState('')
  const [agentFilter, setAgentFilter] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.dlp(100).then(setHistorical).finally(() => setLoading(false))
  }, [])

  const liveIds = new Set(liveEvents.map((e) => e.id))
  const merged = [...liveEvents, ...historical.filter((e) => !liveIds.has(e.id))]
  const filtered = merged.filter((e) => {
    if (agentFilter && e.agent !== agentFilter) return false
    if (filter && !JSON.stringify(e).toLowerCase().includes(filter.toLowerCase())) return false
    return true
  })

  const agents = [...new Set(merged.map((e) => e.agent).filter(Boolean))]

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <h3 style={{ fontSize: 14 }}>Egress DLP Log</h3>
        {liveEvents.length > 0 && (
          <span style={{ fontSize: 11, color: '#d29922', fontWeight: 600 }}>
            ● {liveEvents.length} live
          </span>
        )}
        <select value={agentFilter} onChange={(e) => setAgentFilter(e.target.value)} style={{ marginLeft: 'auto' }}>
          <option value="">All agents</option>
          {agents.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <input
          placeholder="Filter…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ width: 200 }}
        />
      </div>
      {loading ? <div style={{ color: '#8b949e' }}>Loading…</div> : (
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Agent</th>
              <th>Action</th>
              <th>URL / Target</th>
              <th>Sanitized Fields</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((e) => (
              <tr key={e.id}>
                <td style={{ fontSize: 11, color: '#8b949e', whiteSpace: 'nowrap' }}>
                  {streamIdToDate(e.id)}
                </td>
                <td style={{ fontSize: 12 }}>{e.agent || '—'}</td>
                <td>
                  <span style={{ fontSize: 12, color: e.action === 'blocked' ? '#f85149' : '#d29922', fontWeight: 600 }}>
                    {e.action || e.event || '—'}
                  </span>
                </td>
                <td style={{ fontSize: 11, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {e.url || e.target || '—'}
                </td>
                <td style={{ fontSize: 11, color: '#8b949e' }}>
                  {e.sanitized_fields || e.fields || '—'}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={5} style={{ color: '#8b949e', textAlign: 'center', padding: 20 }}>No entries</td></tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  )
}
