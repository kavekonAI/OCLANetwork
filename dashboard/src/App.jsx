import React, { useState, useCallback, useEffect } from 'react'
import Overview from './components/Overview.jsx'
import TaskBoard from './components/TaskBoard.jsx'
import EfficiencyTab from './components/EfficiencyTab.jsx'
import SecurityLog from './components/SecurityLog.jsx'
import DLPLog from './components/DLPLog.jsx'
import ALKBTab from './components/ALKBTab.jsx'
import ManagementTab from './components/ManagementTab.jsx'
import { useWebSocket } from './api.js'

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

export default function App() {
  const [tab, setTab] = useState('overview')
  const [wsEvents, setWsEvents] = useState([])

  const handleWsMessage = useCallback((msg) => {
    if (msg.type === 'security' || msg.type === 'dlp') {
      setWsEvents((prev) => [msg, ...prev].slice(0, 500))
    }
  }, [])

  const wsConnected = useWebSocket(handleWsMessage)

  const securityEvents = wsEvents.filter((e) => e.type === 'security').map((e) => e.data)
  const dlpEvents = wsEvents.filter((e) => e.type === 'dlp').map((e) => e.data)

  return (
    <>
      <style>{styles}</style>
      <div style={{ minHeight: '100vh' }}>
        {/* Header */}
        <div style={{ background: '#161b22', borderBottom: '1px solid #30363d', padding: '0 20px', display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ padding: '12px 0', fontWeight: 700, fontSize: 16, color: '#58a6ff' }}>OCLAN Dashboard</div>
          <div style={{ marginLeft: 'auto', fontSize: 12, color: wsConnected ? '#3fb950' : '#f85149' }}>
            ● {wsConnected ? 'Live' : 'Reconnecting…'}
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
