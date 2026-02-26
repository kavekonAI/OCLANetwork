import React, { useEffect, useState } from 'react'
import { api } from '../api.js'

const STATUS_COLOR = {
  pending: '#8b949e',
  in_progress: '#58a6ff',
  completed: '#3fb950',
  failed: '#f85149',
  blocked: '#d29922',
}

export default function TaskBoard() {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')
  const [error, setError] = useState(null)

  async function load() {
    try {
      setTasks(await api.tasks())
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

  const filtered = tasks.filter((t) =>
    !filter || JSON.stringify(t).toLowerCase().includes(filter.toLowerCase())
  )

  // Queue depth by agent
  const queueDepth = {}
  for (const t of tasks) {
    if (t.agent && t.status !== 'completed') {
      queueDepth[t.agent] = (queueDepth[t.agent] || 0) + 1
    }
  }

  if (loading) return <div style={{ color: '#8b949e' }}>Loading tasks…</div>
  if (error) return <div style={{ color: '#f85149' }}>Error: {error}</div>

  return (
    <div>
      {/* Queue depth summary */}
      {Object.keys(queueDepth).length > 0 && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          {Object.entries(queueDepth).map(([agent, count]) => (
            <div key={agent} style={{
              background: '#161b22',
              border: '1px solid #30363d',
              borderRadius: 6,
              padding: '6px 12px',
              fontSize: 12,
            }}>
              <strong>{agent}</strong>: {count} pending
            </div>
          ))}
        </div>
      )}

      <div style={{ marginBottom: 12 }}>
        <input
          placeholder="Filter tasks…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ width: 260 }}
        />
        <span style={{ color: '#8b949e', fontSize: 12, marginLeft: 10 }}>
          {filtered.length} / {tasks.length} tasks
        </span>
      </div>

      <table>
        <thead>
          <tr>
            <th>Task ID</th>
            <th>Agent</th>
            <th>Status</th>
            <th>Priority</th>
            <th>Created</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((t) => (
            <tr key={t.key}>
              <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{t.task_id || t.key?.split(':').pop()}</td>
              <td>{t.agent || '—'}</td>
              <td>
                <span style={{
                  color: STATUS_COLOR[t.status] || '#8b949e',
                  fontWeight: 600,
                  fontSize: 12,
                }}>
                  {t.status || '—'}
                </span>
              </td>
              <td>{t.priority || '—'}</td>
              <td style={{ fontSize: 11, color: '#8b949e' }}>
                {t.created_at ? new Date(parseInt(t.created_at, 10)).toLocaleString() : '—'}
              </td>
              <td style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {t.description || t.task || '—'}
              </td>
            </tr>
          ))}
          {filtered.length === 0 && (
            <tr><td colSpan={6} style={{ color: '#8b949e', textAlign: 'center', padding: 20 }}>No tasks</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
