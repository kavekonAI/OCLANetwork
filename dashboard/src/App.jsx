import React, { useState, useCallback, useEffect } from 'react'
import Overview from './components/Overview.jsx'
import TaskBoard from './components/TaskBoard.jsx'
import EfficiencyTab from './components/EfficiencyTab.jsx'
import SecurityLog from './components/SecurityLog.jsx'
import DLPLog from './components/DLPLog.jsx'
import ALKBTab from './components/ALKBTab.jsx'
import ManagementTab from './components/ManagementTab.jsx'
import { useWebSocket, hasToken, setToken, verifyToken, whoami } from './api.js'

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'tasks', label: 'Task Board' },
  { id: 'efficiency', label: 'Efficiency' },
  { id: 'security', label: 'Security' },
  { id: 'dlp', label: 'DLP' },
  { id: 'alkb', label: 'ALKB' },
  { id: 'management', label: 'Management' },
]

const styles = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #0d1117; color: #e6edf3; font-family: 'Segoe UI', system-ui, sans-serif; font-size: 14px; }
  a { color: #58a6ff; text-decoration: none; }
  button { cursor: pointer; font-size: 13px; }
  table { border-collapse: collapse; width: 100%; }
  th, td { text-align: left; padding: 6px 10px; border-bottom: 1px solid #21262d; }
  th { background: #161b22; color: #8b949e; font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: .05em; }
  tr:hover td { background: #161b22; }
  input, select { background: #161b22; border: 1px solid #30363d; color: #e6edf3; padding: 5px 8px; border-radius: 4px; font-size: 13px; }
  input:focus, select:focus { outline: none; border-color: #58a6ff; }
`

function Login({ onLogin }) {
  const [token, setInputToken] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const valid = await verifyToken(token.trim())
      if (valid) {
        setToken(token.trim())
        onLogin()
      } else {
        setError('Invalid token')
      }
    } catch {
      setError('Connection failed')
    }
    setLoading(false)
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
      <form onSubmit={handleSubmit} style={{
        background: '#161b22', border: '1px solid #30363d', borderRadius: 8,
        padding: 32, width: 380, display: 'flex', flexDirection: 'column', gap: 16,
      }}>
        <div style={{ fontWeight: 700, fontSize: 18, color: '#58a6ff', textAlign: 'center' }}>OCLAN Dashboard</div>
        <div style={{ color: '#8b949e', fontSize: 13, textAlign: 'center' }}>Enter your dashboard token to continue</div>
        <input
          type="password"
          value={token}
          onChange={(e) => setInputToken(e.target.value)}
          placeholder="Bearer token"
          autoFocus
          style={{ padding: '10px 12px', fontSize: 14 }}
        />
        {error && <div style={{ color: '#f85149', fontSize: 13 }}>{error}</div>}
        <button
          type="submit"
          disabled={loading || !token.trim()}
          style={{
            background: '#238636', color: '#fff', border: 'none', borderRadius: 6,
            padding: '10px 16px', fontWeight: 600, opacity: loading || !token.trim() ? 0.5 : 1,
          }}
        >
          {loading ? 'Verifying...' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}

export default function App() {
  const [authed, setAuthed] = useState(false)
  const [authChecking, setAuthChecking] = useState(true)
  const [authUser, setAuthUser] = useState(null)
  const [tab, setTab] = useState('overview')
  const [wsEvents, setWsEvents] = useState([])

  // Auto-login: try whoami on mount (handles Tailscale SSO + stored token)
  useEffect(() => {
    let cancelled = false
    async function tryAutoLogin() {
      try {
        const info = await whoami()
        if (!cancelled && info) {
          setAuthUser(info)
          setAuthed(true)
        }
      } catch {}
      if (!cancelled) setAuthChecking(false)
    }
    tryAutoLogin()
    return () => { cancelled = true }
  }, [])

  // Listen for auth expiry from api.js (401 responses)
  useEffect(() => {
    const handler = () => { setAuthed(false); setAuthUser(null) }
    window.addEventListener('oclan-auth-expired', handler)
    return () => window.removeEventListener('oclan-auth-expired', handler)
  }, [])

  const handleWsMessage = useCallback((msg) => {
    if (msg.type === 'security' || msg.type === 'dlp') {
      setWsEvents((prev) => [msg, ...prev].slice(0, 500))
    }
  }, [])

  const wsConnected = useWebSocket(handleWsMessage)

  if (authChecking) {
    return (
      <>
        <style>{styles}</style>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
          <div style={{ color: '#8b949e', fontSize: 14 }}>Checking authentication...</div>
        </div>
      </>
    )
  }

  if (!authed) {
    const handleLogin = async () => {
      try {
        const info = await whoami()
        setAuthUser(info)
      } catch {}
      setAuthed(true)
    }
    return (
      <>
        <style>{styles}</style>
        <Login onLogin={handleLogin} />
      </>
    )
  }

  const handleLogout = () => {
    setToken(null)
    setAuthUser(null)
    setAuthed(false)
  }

  const securityEvents = wsEvents.filter((e) => e.type === 'security').map((e) => e.data)
  const dlpEvents = wsEvents.filter((e) => e.type === 'dlp').map((e) => e.data)

  return (
    <>
      <style>{styles}</style>
      <div style={{ minHeight: '100vh' }}>
        {/* Header */}
        <div style={{ background: '#161b22', borderBottom: '1px solid #30363d', padding: '0 20px', display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ padding: '12px 0', fontWeight: 700, fontSize: 16, color: '#58a6ff' }}>OCLAN Dashboard</div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 16 }}>
            {authUser?.method === 'tailscale' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {authUser.pic && (
                  <img src={authUser.pic} alt="" style={{ width: 24, height: 24, borderRadius: '50%' }} />
                )}
                <span style={{ fontSize: 13, color: '#8b949e' }}>{authUser.name || authUser.login}</span>
              </div>
            )}
            {authUser?.method === 'token' && (
              <span style={{ fontSize: 12, color: '#8b949e' }}>Token auth</span>
            )}
            <div style={{ fontSize: 12, color: wsConnected ? '#3fb950' : '#f85149' }}>
              {wsConnected ? 'Live' : 'Reconnecting...'}
            </div>
            <button
              onClick={handleLogout}
              style={{ background: 'none', border: '1px solid #30363d', color: '#8b949e', borderRadius: 4, padding: '4px 10px', fontSize: 12 }}
            >
              Logout
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ background: '#161b22', borderBottom: '1px solid #30363d', padding: '0 20px', display: 'flex', gap: 0 }}>
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                background: 'none',
                border: 'none',
                color: tab === t.id ? '#e6edf3' : '#8b949e',
                borderBottom: tab === t.id ? '2px solid #58a6ff' : '2px solid transparent',
                padding: '10px 16px',
                fontWeight: tab === t.id ? 600 : 400,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ padding: 20 }}>
          {tab === 'overview' && <Overview />}
          {tab === 'tasks' && <TaskBoard />}
          {tab === 'efficiency' && <EfficiencyTab />}
          {tab === 'security' && <SecurityLog liveEvents={securityEvents} />}
          {tab === 'dlp' && <DLPLog liveEvents={dlpEvents} />}
          {tab === 'alkb' && <ALKBTab />}
          {tab === 'management' && <ManagementTab />}
        </div>
      </div>
    </>
  )
}
