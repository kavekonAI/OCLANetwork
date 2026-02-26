import React, { useEffect, useState } from 'react'
import { api } from '../api.js'

function streamIdToDate(id) {
  const ts = parseInt(id?.split('-')[0], 10)
  return isNaN(ts) ? '—' : new Date(ts).toLocaleString()
}

export default function SecurityLog({ liveEvents = [] }) {
  const [historical, setHistorical] = useState([])
  const [filter, setFilter] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.security(100).then(setHistorical).finally(() => setLoading(false))
  }, [])

  // Merge: live events at top, historical below (deduplicate by id)
  const liveIds = new Set(liveEvents.map((e) => e.id))
  const merged = [...liveEvents, ...historical.filter((e) => !liveIds.has(e.id))]
  const filtered = merged.filter((e) =>
    !filter || JSON.stringify(e).toLowerCase().includes(filter.toLowerCase())
  )

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <h3 style={{ fontSize: 14 }}>Security Audit Log</h3>
        {liveEvents.length > 0 && (
          <span style={{ fontSize: 11, color: '#f85149', fontWeight: 600 }}>
            ● {liveEvents.length} live
          </span>
        )}
        <input
          placeholder="Filter…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ width: 200, marginLeft: 'auto' }}
        />
      </div>
      {loading ? <div style={{ color: '#8b949e' }}>Loading…</div> : (
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Event</th>
              <th>Source</th>
              <th>Target</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((e) => (
              <tr key={e.id}>
                <td style={{ fontSize: 11, color: '#8b949e', whiteSpace: 'nowrap' }}>
                  {streamIdToDate(e.id)}
                </td>
                <td>
                  <span style={{
                    color: e.event?.includes('miss') || e.event?.includes('drop') || e.event?.includes('block')
                      ? '#f85149' : '#8b949e',
                    fontSize: 12,
                    fontWeight: 600,
                  }}>
                    {e.event || '—'}
                  </span>
                </td>
                <td style={{ fontSize: 12 }}>{e.source || '—'}</td>
                <td style={{ fontSize: 12 }}>{e.target || '—'}</td>
                <td style={{ fontSize: 11, color: '#8b949e', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {Object.entries(e)
                    .filter(([k]) => !['id', 'event', 'source', 'target'].includes(k))
                    .map(([k, v]) => `${k}=${v}`)
                    .join(' ')}
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
