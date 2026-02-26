import React, { useEffect, useState } from 'react'
import { api } from '../api.js'

function CountdownTimer({ resetAt }) {
  const [label, setLabel] = useState('')
  useEffect(() => {
    function tick() {
      const diff = parseInt(resetAt, 10) - Date.now()
      if (diff <= 0) { setLabel('Resetting…'); return }
      const h = Math.floor(diff / 3600000)
      const m = Math.floor((diff % 3600000) / 60000)
      const s = Math.floor((diff % 60000) / 1000)
      setLabel(`${h}h ${m}m ${s}s`)
    }
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [resetAt])
  return <span style={{ color: '#58a6ff', fontWeight: 600 }}>{label}</span>
}

export default function EfficiencyTab() {
  const [rows, setRows] = useState([])
  const [sub, setSub] = useState({})
  const [litellm, setLitellm] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  async function load() {
    try {
      const [eff, s, ll] = await Promise.all([
        api.efficiency(),
        api.subscription(),
        api.litellmStatus(),
      ])
      setRows(eff)
      setSub(s)
      setLitellm(ll)
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    const t = setInterval(load, 30000)
    return () => clearInterval(t)
  }, [])

  // High-Burn leaderboard: sort by cost desc
  const leaderboard = [...rows].sort((a, b) =>
    parseFloat(b.cost || '0') - parseFloat(a.cost || '0')
  ).slice(0, 10)

  if (loading) return <div style={{ color: '#8b949e' }}>Loading efficiency data…</div>
  if (error) return <div style={{ color: '#f85149' }}>Error: {error}</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Reset countdown — REQ-03.14 */}
      {sub.reset_at && (
        <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 6, padding: '12px 16px' }}>
          <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 4 }}>CLAUDE PREMIUM RESET IN</div>
          <CountdownTimer resetAt={sub.reset_at} />
          {sub.status && (
            <span style={{ marginLeft: 16, fontSize: 12, color: '#8b949e' }}>
              Status: <strong style={{ color: sub.status === 'rate_limited' ? '#f0883e' : '#3fb950' }}>{sub.status}</strong>
            </span>
          )}
        </div>
      )}

      {/* LiteLLM hidden panels — REQ-03.4 / 03.11 */}
      {litellm?.deployed === false && (
        <div style={{ background: '#161b2244', border: '1px dashed #30363d', borderRadius: 6, padding: '10px 16px', fontSize: 12, color: '#8b949e' }}>
          LiteLLM not deployed — Token Usage Graphs (REQ-03.4) and Cache Hit Rate (REQ-03.11) panels are hidden until LiteLLM is detected at litellm-service:4000/health.
        </div>
      )}

      {/* High-Burn Leaderboard — REQ-03.9 */}
      <div>
        <h3 style={{ marginBottom: 12, fontSize: 14, color: '#f0883e' }}>High-Burn Leaderboard</h3>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Agent</th>
              <th>Date</th>
              <th>Tokens In</th>
              <th>Tokens Out</th>
              <th>Cost ($)</th>
              <th>Efficiency Ratio</th>
              <th>Avg Prompt Tokens</th>
              <th>Provider Tier</th>
              <th>Flags</th>
            </tr>
          </thead>
          <tbody>
            {leaderboard.map((r, i) => {
              const ratio = parseFloat(r.efficiency_ratio)
              const avgPrompt = parseInt(r.avg_prompt_tokens || '0', 10)
              const wasteful = !isNaN(ratio) && ratio < 0.1
              const needsComp = avgPrompt > 10000
              return (
                <tr key={r.key}>
                  <td style={{ color: '#8b949e' }}>{i + 1}</td>
                  <td><strong>{r.agent || r.key?.split(':')[2] || '—'}</strong></td>
                  <td style={{ fontSize: 11, color: '#8b949e' }}>{r.date || '—'}</td>
                  <td>{r.tokens_in ? parseInt(r.tokens_in, 10).toLocaleString() : '—'}</td>
                  <td>{r.tokens_out ? parseInt(r.tokens_out, 10).toLocaleString() : '—'}</td>
                  <td style={{ color: '#f0883e' }}>{r.cost ? parseFloat(r.cost).toFixed(4) : '—'}</td>
                  <td style={{ color: wasteful ? '#f85149' : '#3fb950' }}>
                    {isNaN(ratio) ? '—' : ratio.toFixed(3)}
                  </td>
                  <td style={{ color: needsComp ? '#d29922' : undefined }}>
                    {avgPrompt > 0 ? avgPrompt.toLocaleString() : '—'}
                  </td>
                  <td>
                    <span style={{
                      fontSize: 11,
                      color: r.provider_tier === 'premium' ? '#3fb950' : '#8b949e',
                    }}>
                      {r.provider_tier || '—'}
                    </span>
                  </td>
                  <td style={{ fontSize: 11 }}>
                    {wasteful && <span style={{ color: '#f85149', marginRight: 6 }}>Wasteful</span>}
                    {needsComp && <span style={{ color: '#d29922' }}>Needs Compression</span>}
                  </td>
                </tr>
              )
            })}
            {leaderboard.length === 0 && (
              <tr><td colSpan={10} style={{ color: '#8b949e', textAlign: 'center', padding: 20 }}>No cost data in Redis</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
