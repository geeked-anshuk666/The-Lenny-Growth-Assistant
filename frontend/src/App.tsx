import { useState, useEffect, useRef, useCallback } from 'react'
// NOTE: handleSendMessage reads data.error_detail for exact LLM error display
import {
  MessageSquare,
  Plus,
  Send,
  Copy,
  Download,
  X,
  FileText,
  Check,
  AlertCircle,
  AlertTriangle,
  RefreshCw,
  MoreHorizontal,
  Pencil,
  Pin,
  Trash2,
  Info,
  Sparkles,
  ArrowRight,
  Zap,
  Youtube,
  Search,
  Cpu,
  Code,
  Home,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

// ─── Types ──────────────────────────────────────────────────────────────────

interface Session {
  id: string
  created_at: string
  metadata: Record<string, unknown>
}

interface Message {
  id: string
  session_id: string
  role: 'user' | 'assistant'
  content: string
  provider?: string
  citations?: { guest: string; title: string; url: string }[]
  created_at: string
}

interface Artifact {
  id: string
  type: 'html' | 'markdown'
  content: string
}

interface ProviderModel {
  id: string
  label: string
}

interface Toast {
  id: string
  type: 'error' | 'warn' | 'success' | 'info'
  message: string
}

interface ContextMenu {
  sessionId: string
  x: number
  y: number
}

interface ServiceStatus {
  label: string
  status: 'checking' | 'ok' | 'error'
}

type ProviderKey = 'gemini' | 'groq' | 'ollama'

// ─── Constants ──────────────────────────────────────────────────────────────

const PROVIDER_LABELS: Record<ProviderKey, string> = {
  gemini: 'Google Gemini',
  groq: 'Groq Cloud',
  ollama: 'Local (Ollama)',
}

const PROVIDER_DEFAULT_MODELS: Record<ProviderKey, ProviderModel[]> = {
  gemini: [{ id: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash Lite' }],
  groq:   [{ id: 'openai/gpt-oss-120b',   label: 'GPT-OSS 120B' }],
  ollama: [{ id: 'qwen2.5:3b',            label: 'Qwen 2.5 3B (Local)' }],
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function deriveChatTitle(firstMessage: string): string {
  const cleaned = firstMessage.replace(/['"]/g, '').trim()
  const words = cleaned.split(/\s+/).slice(0, 6).join(' ')
  return words.length < cleaned.length ? `${words}…` : words
}

function timestampFromUrl(url: string): string {
  const m = url.match(/[?&]t=(\d+)/)
  if (m) {
    const secs = parseInt(m[1], 10)
    const mins = Math.floor(secs / 60)
    const remainingSecs = secs % 60
    return `${mins}:${remainingSecs.toString().padStart(2, '0')}`
  }
  return 'Link'
}

function getSessionName(session: Session, sessionTitles: Record<string, string>): string {
  const metaName = session.metadata?.name as string | undefined
  if (metaName) return metaName
  if (sessionTitles[session.id]) return sessionTitles[session.id]
  return 'New Chat'
}

function isPinned(session: Session, pinnedIds: Set<string>): boolean {
  return pinnedIds.has(session.id) || session.metadata?.pinned === true
}

// ─── Sub-components ──────────────────────────────────────────────────────────

// Boot Screen - shown while polling /health until all services are ready
function BootScreen({ services }: { services: ServiceStatus[] }) {
  const allOk = services.every(s => s.status === 'ok')
  return (
    <div className="boot-screen" role="status" aria-live="polite" aria-label="Initializing services">
      {/* Ambient background orb */}
      <div className="boot-orb" />

      <div className="boot-card">
        {/* Logo */}
        <div className="boot-logo">
          <div className="lg-avatar" style={{ width: 52, height: 52, fontSize: 15 }} aria-hidden="true">LG</div>
        </div>

        <h1 className="boot-title">Lenny's Growth Assistant</h1>
        <p className="boot-subtitle">Starting up services…</p>

        {/* Service status rows */}
        <ul className="boot-services" aria-label="Service startup status">
          {services.map(svc => (
            <li key={svc.label} className="boot-service-row">
              <span className="boot-service-label">{svc.label}</span>
              <span className={`boot-service-badge boot-badge-${svc.status}`} aria-label={`${svc.label}: ${svc.status}`}>
                {svc.status === 'checking' && <><span className="boot-spinner" />Connecting</>}
                {svc.status === 'ok'       && <><span className="boot-dot-ok" />Ready</>}
                {svc.status === 'error'    && <><span className="boot-dot-err" />Waiting…</>}
              </span>
            </li>
          ))}
        </ul>

        {/* Progress bar */}
        <div className="boot-bar-track" aria-hidden="true">
          <div
            className="boot-bar-fill"
            style={{
              width: `${(services.filter(s => s.status === 'ok').length / services.length) * 100}%`,
              transition: allOk ? 'width 0.4s ease' : 'width 0.6s ease',
            }}
          />
        </div>

        <p className="boot-hint">
          {allOk ? '✓ All systems ready - launching…' : 'Waiting for Docker containers to finish booting'}
        </p>
      </div>
    </div>
  )
}

// Robot Mascot SVG illustration matching brand design
function RobotMascot() {
  return (
    <div className="robot-container">
      {/* Background glowing aura */}
      <div className="robot-aura" />
      
      {/* Floating badges */}
      <div className="floating-badge badge-1">
        <Sparkles size={14} className="text-amber-400" /> 269+ Episodes
      </div>
      <div className="floating-badge badge-2">
        <Zap size={14} className="text-indigo-400" /> Grounded RAG
      </div>
      <div className="floating-badge badge-3">
        <Youtube size={14} className="text-red-400" /> Video Timestamps
      </div>

      {/* Main Robot SVG */}
      <svg className="robot-svg" viewBox="0 0 320 360" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="bodyGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#f8fafc" />
            <stop offset="50%" stopColor="#cbd5e1" />
            <stop offset="100%" stopColor="#64748b" />
          </linearGradient>
          <linearGradient id="visorGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#090d1a" />
            <stop offset="100%" stopColor="#1e1b4b" />
          </linearGradient>
          <filter id="cyanGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Antenna */}
        <line x1="160" y1="75" x2="160" y2="45" stroke="#cbd5e1" strokeWidth="6" strokeLinecap="round" />
        <circle cx="160" cy="40" r="10" fill="#00f2ff" filter="url(#cyanGlow)" />

        {/* Ears / Head Pods */}
        <rect x="50" y="115" width="16" height="36" rx="8" fill="#64748b" />
        <rect x="254" y="115" width="16" height="36" rx="8" fill="#64748b" />

        {/* Head Shell */}
        <path d="M 70 120 C 70 70, 250 70, 250 120 C 250 170, 220 185, 160 185 C 100 185, 70 170, 70 120 Z" fill="url(#bodyGrad)" stroke="#e2e8f0" strokeWidth="4" />

        {/* Dark Visor */}
        <path d="M 90 120 C 90 92, 230 92, 230 120 C 230 152, 210 162, 160 162 C 110 162, 90 152, 90 120 Z" fill="url(#visorGrad)" stroke="#334155" strokeWidth="3" />

        {/* Glowing Cyan Eyes & Mouth */}
        <path d="M 115 122 C 122 110, 134 110, 140 122" stroke="#00f2ff" strokeWidth="5" strokeLinecap="round" fill="none" filter="url(#cyanGlow)" />
        <path d="M 180 122 C 186 110, 198 110, 205 122" stroke="#00f2ff" strokeWidth="5" strokeLinecap="round" fill="none" filter="url(#cyanGlow)" />
        <path d="M 144 140 Q 160 150 176 140" stroke="#00f2ff" strokeWidth="4" strokeLinecap="round" fill="none" filter="url(#cyanGlow)" />

        {/* Body Torso */}
        <path d="M 95 195 Q 160 188 225 195 L 235 280 C 235 320, 85 320, 85 280 Z" fill="url(#bodyGrad)" stroke="#e2e8f0" strokeWidth="4" />

        {/* Chest Reactor Core */}
        <circle cx="160" cy="245" r="24" fill="#0f172a" stroke="#475569" strokeWidth="3" />
        <circle cx="160" cy="245" r="14" fill="#00f2ff" filter="url(#cyanGlow)" />
        <circle cx="160" cy="245" r="6" fill="#fff" />
      </svg>
    </div>
  )
}

// Landing Page matching brand identity & rich feature breakdown
function LandingPage({ onStart }: { onStart: () => void }) {
  return (
    <div className="landing-v2">
      {/* Top Navbar */}
      <header className="landing-navbar">
        <div className="nav-brand">
          <LGAvatar size={42} />
          <span className="brand-name">Lenny's Growth Assistant</span>
        </div>
      </header>

      {/* Main Hero Split */}
      <main className="landing-hero-split">
        {/* Left Column: Robot Mascot */}
        <div className="hero-left">
          <RobotMascot />
        </div>

        {/* Right Column: Copy & CTA */}
        <div className="hero-right">
          <div className="hero-badge-pill">
            <Sparkles size={13} className="text-amber-400" />
            <span>AI Product & Growth Intelligence</span>
          </div>
          <h1 className="hero-title-v2">
            The Lenny's <span className="highlight-brand">Growth Assistant</span>
          </h1>
          <p className="hero-subtitle-v2">
            Ask any product strategy, PM interviewing, or growth question - grounded in 269+
            Lenny's Podcast episodes with timestamped YouTube source deep-links.
          </p>

          <div className="hero-cta-wrapper">
            <button className="hero-btn-yellow main-cta" onClick={onStart} id="cta-start">
              Let's Start
              <ArrowRight size={18} />
            </button>
            <p className="hero-subtext">Instant Access - Local Ollama & Multi-LLM Powered</p>
          </div>
        </div>
      </main>

      {/* Feature Capabilities Grid */}
      <section className="landing-features">
        <h2 className="features-title">Everything You Need for PM & Growth Excellence</h2>
        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-icon bg-indigo-500/10 text-indigo-400">
              <Search size={22} />
            </div>
            <h3>Hybrid Vector RAG</h3>
            <p>Indexed across 4,700+ transcript chunks from 269 episodes using dense vector embeddings + BM25 keyword search.</p>
          </div>

          <div className="feature-card">
            <div className="feature-icon bg-amber-500/10 text-amber-400">
              <Youtube size={22} />
            </div>
            <h3>Exact Video Timestamps</h3>
            <p>Every claim links directly to the exact YouTube timestamp in episodes with Brian Chesky, Elena Verna, Shreyas Doshi, and 200+ guests.</p>
          </div>

          <div className="feature-card">
            <div className="feature-icon bg-cyan-500/10 text-cyan-400">
              <Cpu size={22} />
            </div>
            <h3>Multi-LLM Engine</h3>
            <p>Switch dynamically between Local Ollama Qwen 2.5 3B, Google Gemini 2.0 Flash, or Groq GPT-OSS without restarting.</p>
          </div>

          <div className="feature-card">
            <div className="feature-icon bg-emerald-500/10 text-emerald-400">
              <Code size={22} />
            </div>
            <h3>Interactive Artifacts</h3>
            <p>Renders custom HTML/Markdown artifacts, growth frameworks, and comparison tables inline in your workspace.</p>
          </div>
        </div>
      </section>
    </div>
  )
}
// Name Modal
function NameModal({ onSubmit }: { onSubmit: (name: string) => void }) {
  const [name, setName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    onSubmit(trimmed)
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Enter your name">
      <div className="modal-card">
        <div className="modal-icon">🎙️</div>
        <h2 className="modal-title">What do I call you?</h2>
        <p className="modal-subtitle">
          Your name helps personalise the experience. It's stored locally - only you can see it.
        </p>
        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            id="name-input"
            className="modal-input"
            type="text"
            placeholder="Your name or nickname"
            value={name}
            onChange={e => setName(e.target.value.slice(0, 30))}
            autoComplete="off"
          />
          <button
            type="submit"
            className="modal-submit"
            disabled={!name.trim()}
            id="name-submit"
          >
            Enter the Assistant →
          </button>
        </form>
      </div>
    </div>
  )
}

// Toast Component
function ToastItem({ toast, onClose }: { toast: Toast; onClose: (id: string) => void }) {
  const icons = {
    error: <AlertCircle size={14} className="shrink-0 mt-0.5" />,
    warn:  <AlertTriangle size={14} className="shrink-0 mt-0.5" />,
    success: <Check size={14} className="shrink-0 mt-0.5" />,
    info: <Info size={14} className="shrink-0 mt-0.5" />,
  }
  return (
    <div className={`toast toast-${toast.type}`} role="alert">
      {icons[toast.type]}
      <span style={{ flex: 1 }}>{toast.message}</span>
      <button className="toast-close" onClick={() => onClose(toast.id)} aria-label="Dismiss notification">×</button>
    </div>
  )
}

// LG Logo Avatar
function LGAvatar({ size = 32 }: { size?: number }) {
  return (
    <div
      className="lg-avatar"
      style={{ width: size, height: size, fontSize: size < 30 ? 9 : 11 }}
      aria-label="Lenny's Growth Assistant"
    >
      LG
    </div>
  )
}

// User initial avatar
function UserAvatar({ name, size = 32 }: { name: string; size?: number }) {
  const initial = (name || 'U')[0].toUpperCase()
  return (
    <div className="user-avatar" style={{ width: size, height: size, fontSize: size < 30 ? 10 : 12 }}>
      {initial}
    </div>
  )
}

// ─── Main App ────────────────────────────────────────────────────────────────

export default function App() {
  // ── Onboarding & Hash Route state ─────────────────────────────────────────
  const getInitialPhase = (): 'landing' | 'naming' | 'booting' | 'chat' => {
    const hash = window.location.hash.replace('#', '')
    if (hash === 'chat') return 'chat'
    if (hash === 'booting') return 'booting'
    if (hash === 'naming') return 'naming'
    return 'landing'
  }

  const [phase, setPhase] = useState<'landing' | 'naming' | 'booting' | 'chat'>(getInitialPhase)
  
  // Helper to change phase and sync window.location.hash
  const changePhase = useCallback((newPhase: 'landing' | 'naming' | 'booting' | 'chat') => {
    setPhase(newPhase)
    window.location.hash = newPhase === 'landing' ? '' : newPhase
  }, [])

  // Sync phase on browser back/forward (hashchange)
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '')
      if (hash === 'chat') setPhase('chat')
      else if (hash === 'booting') setPhase('booting')
      else if (hash === 'naming') setPhase('naming')
      else setPhase('landing')
    }
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  const [bootServices, setBootServices] = useState<ServiceStatus[]>([
    { label: 'API Server', status: 'checking' },
    { label: 'Agent Service', status: 'checking' },
  ])
  const [userName, setUserName] = useState<string>(() => localStorage.getItem('lga_user_name') || '')

  // ── Session / chat state ─────────────────────────────────────────────────
  const [sessions, setSessions] = useState<Session[]>([])
  const [activeSession, setActiveSession] = useState<Session | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [activeArtifact, setActiveArtifact] = useState<Artifact | null>(null)
  const [inputMessage, setInputMessage] = useState('')
  const [sessionTitles, setSessionTitles] = useState<Record<string, string>>({})
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set())

  // ── Sidebar rename state ─────────────────────────────────────────────────
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null)

  // ── Provider / model state ───────────────────────────────────────────────
  const [provider, setProvider] = useState<ProviderKey>('ollama')
  const [selectedModel, setSelectedModel] = useState('qwen2.5:3b')
  const [availableModels, setAvailableModels] = useState<ProviderModel[]>(PROVIDER_DEFAULT_MODELS.ollama)
  const [modelsLoading, setModelsLoading] = useState(false)

  // ── UI state ─────────────────────────────────────────────────────────────
  const [isLoading, setIsLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [activeTab, setActiveTab] = useState<'preview' | 'code'>('preview')
  const [toasts, setToasts] = useState<Toast[]>([])

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const activeSessionIdRef = useRef<string | null>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)

  const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

  // ── Toast helpers ──────────────────────────────────────────────────────────
  const addToast = useCallback((type: Toast['type'], message: string) => {
    const id = Math.random().toString(36).slice(2)
    setToasts(prev => [...prev, { id, type, message }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 8000)
  }, [])

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  // ── Fetch models ───────────────────────────────────────────────────────────
  const fetchModels = useCallback(async (prov: ProviderKey) => {
    setModelsLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/provider/models?provider=${prov}`)
      if (res.ok) {
        const data = await res.json()
        if (data.models?.length > 0) {
          setAvailableModels(data.models)
          setSelectedModel(data.models[0].id)
          return
        }
      }
    } catch {
      // silent fallback
    } finally {
      setModelsLoading(false)
    }
    setAvailableModels(PROVIDER_DEFAULT_MODELS[prov])
    setSelectedModel(PROVIDER_DEFAULT_MODELS[prov][0].id)
  }, [API_BASE_URL])

  // ── Effects ────────────────────────────────────────────────────────────────

  // Boot health-poll - only runs when phase === 'booting'
  useEffect(() => {
    if (phase !== 'booting') return
    let cancelled = false
    const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

    const checkServices = async () => {
      // 1. Check FastAPI
      let apiOk = false
      try {
        const r = await fetch(`${API}/health`, { signal: AbortSignal.timeout(3000) })
        apiOk = r.ok
      } catch { /* still booting */ }

      if (cancelled) return
      setBootServices(prev => prev.map(s =>
        s.label === 'API Server' ? { ...s, status: apiOk ? 'ok' : 'error' } : s
      ))

      // 2. Check Agent Service (proxied via FastAPI /provider/models)
      let agentOk = false
      if (apiOk) {
        try {
          const r2 = await fetch(`${API}/provider/models?provider=ollama`, { signal: AbortSignal.timeout(3000) })
          agentOk = r2.ok
        } catch { /* still booting */ }
      }

      if (cancelled) return
      setBootServices(prev => prev.map(s =>
        s.label === 'Agent Service' ? { ...s, status: agentOk ? 'ok' : (apiOk ? 'checking' : 'error') } : s
      ))

      // Both green → advance to the chat phase
      if (apiOk && agentOk) {
        setTimeout(() => {
          if (!cancelled) changePhase('chat')
        }, 600) // brief pause so user sees all-green state
        return
      }

      // Retry in 2s
      setTimeout(() => { if (!cancelled) checkServices() }, 2000)
    }

    checkServices()
    return () => { cancelled = true }
  }, [phase, changePhase])

  useEffect(() => {
    if (phase === 'chat') fetchSessions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  useEffect(() => {
    setIsLoading(false)
    if (activeSession) {
      activeSessionIdRef.current = activeSession.id
      fetchMessages(activeSession.id)
      fetchArtifacts(activeSession.id)
    } else {
      activeSessionIdRef.current = null
      setMessages([])
      setActiveArtifact(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSession?.id])

  useEffect(() => { fetchModels(provider) }, [provider, fetchModels])

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, isLoading])

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return
    const handler = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest('.ctx-menu')) return
      setContextMenu(null)
    }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [contextMenu])

  // Focus rename input
  useEffect(() => {
    if (renamingId) renameInputRef.current?.focus()
  }, [renamingId])

  // ── Onboarding handlers ────────────────────────────────────────────────────
  const handleLandingStart = () => {
    const savedName = localStorage.getItem('lga_user_name')
    if (savedName) {
      setUserName(savedName)
      changePhase('booting')
    } else {
      changePhase('naming')
    }
  }

  const handleNameSubmit = (name: string) => {
    localStorage.setItem('lga_user_name', name)
    setUserName(name)
    setPhase('booting')
  }

  // ── Data fetching ──────────────────────────────────────────────────────────
  const fetchSessions = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/sessions`)
      if (res.ok) {
        const data: Session[] = await res.json()
        setSessions(data)
        if (data.length > 0 && !activeSession) setActiveSession(data[0])
      }
    } catch {
      addToast('error', 'Cannot connect to the backend API. Is the server running?')
    }
  }

  const fetchMessages = async (sessionId: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/sessions/${sessionId}/messages`)
      if (res.ok && activeSessionIdRef.current === sessionId) {
        const data: Message[] = await res.json()
        setMessages(data)
        // Auto-derive title from first user message if not already set
        const firstUser = data.find(m => m.role === 'user')
        if (firstUser && !sessionTitles[sessionId]) {
          setSessionTitles(prev => ({ ...prev, [sessionId]: deriveChatTitle(firstUser.content) }))
        }
      }
    } catch (err) { console.error('Failed to fetch messages', err) }
  }

  const fetchArtifacts = async (sessionId: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/sessions/${sessionId}/artifacts`)
      if (res.ok && activeSessionIdRef.current === sessionId) {
        const data = await res.json()
        setActiveArtifact(data.length > 0 ? data[data.length - 1] : null)
      }
    } catch (err) { console.error('Failed to fetch artifacts', err) }
  }

  // ── Session actions ────────────────────────────────────────────────────────
  const handleCreateSession = async () => {
    const tempId = crypto.randomUUID ? crypto.randomUUID() : '00000000-0000-4000-8000-' + Date.now().toString().slice(-12).padStart(12, '0')
    const tempSession: Session = {
      id: tempId,
      created_at: new Date().toISOString(),
      metadata: {},
    }
    // Optimistic UI: Add new chat item and select it instantly (0ms latency)
    setSessions(prev => [tempSession, ...prev])
    setActiveSession(tempSession)
    setMessages([])
    setActiveArtifact(null)
    activeSessionIdRef.current = tempId

    try {
      const res = await fetch(`${API_BASE_URL}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metadata: {} }),
      })
      if (res.ok) {
        const realSession: Session = await res.json()
        setSessions(prev => prev.map(s => (s.id === tempId ? realSession : s)))
        if (activeSessionIdRef.current === tempId) {
          setActiveSession(realSession)
          activeSessionIdRef.current = realSession.id
        }
      } else {
        setSessions(prev => prev.filter(s => s.id !== tempId))
        addToast('error', 'Failed to create a new session on server.')
      }
    } catch {
      setSessions(prev => prev.filter(s => s.id !== tempId))
      addToast('error', 'Network error creating session.')
    }
  }

  const handleDeleteSession = async (sessionId: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/sessions/${sessionId}`, { method: 'DELETE' })
      if (res.ok || res.status === 204) {
        setSessions(prev => prev.filter(s => s.id !== sessionId))
        if (activeSession?.id === sessionId) {
          const remaining = sessions.filter(s => s.id !== sessionId)
          setActiveSession(remaining.length > 0 ? remaining[0] : null)
        }
        addToast('success', 'Chat deleted.')
      } else {
        const err = await res.json().catch(() => ({}))
        addToast('error', `Failed to delete chat: ${err.detail || res.statusText}`)
      }
    } catch { addToast('error', 'Failed to delete session due to network error.') }
  }

  const handleClearAllSessions = async () => {
    if (!window.confirm('Are you sure you want to delete all chats? This cannot be undone.')) return
    try {
      const res = await fetch(`${API_BASE_URL}/sessions`, { method: 'DELETE' })
      if (res.ok || res.status === 204) {
        setSessions([])
        setActiveSession(null)
        setMessages([])
        setActiveArtifact(null)
        setPinnedIds(new Set())
        addToast('success', 'All chats deleted.')
      } else {
        const err = await res.json().catch(() => ({}))
        addToast('error', `Failed to clear chats: ${err.detail || res.statusText}`)
      }
    } catch { addToast('error', 'Failed to clear chats due to network error.') }
  }

  const handleRenameSession = async (sessionId: string, newName: string) => {
    const trimmed = newName.trim()
    if (!trimmed) { setRenamingId(null); return }
    // Optimistic update
    setSessions(prev => prev.map(s =>
      s.id === sessionId ? { ...s, metadata: { ...s.metadata, name: trimmed } } : s
    ))
    setSessionTitles(prev => ({ ...prev, [sessionId]: trimmed }))
    setRenamingId(null)
    try {
      await fetch(`${API_BASE_URL}/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      })
    } catch { addToast('warn', 'Could not persist rename to server.') }
  }

  const handlePinSession = (sessionId: string) => {
    setPinnedIds(prev => {
      const next = new Set(prev)
      if (next.has(sessionId)) { next.delete(sessionId) } else { next.add(sessionId) }
      return next
    })
    setContextMenu(null)
  }

  // ── Send message ───────────────────────────────────────────────────────────
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    // Submission guard against double-submits / empty input
    if (!inputMessage.trim() || isLoading) return

    const userText = inputMessage.trim()
    let currentSession = activeSession

    // Synchronously lock submit and clear input instantly (0ms UI latency)
    setInputMessage('')
    setIsLoading(true)

    // Handle session initialization if user sends prompt without active session
    if (!currentSession) {
      try {
        const res = await fetch(`${API_BASE_URL}/sessions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ metadata: {} }),
        })
        if (res.ok) {
          currentSession = await res.json()
          setSessions(prev => [currentSession!, ...prev])
          setActiveSession(currentSession)
          activeSessionIdRef.current = currentSession!.id
        } else {
          addToast('error', 'Failed to start a session.')
          setIsLoading(false)
          setInputMessage(userText)
          return
        }
      } catch {
        addToast('error', 'Failed to start a session.')
        setIsLoading(false)
        setInputMessage(userText)
        return
      }
    }

    if (!currentSession) return
    const activeSess: Session = currentSession

    // Derive chat title from first user message
    if (!sessionTitles[activeSess.id]) {
      setSessionTitles(prev => ({ ...prev, [activeSess.id]: deriveChatTitle(userText) }))
    }

    // Optimistic user message bubble insertion (0ms)
    const tempUserMsgId = `temp-msg-${Date.now()}`
    const tempUserMsg: Message = {
      id: tempUserMsgId,
      session_id: activeSess.id,
      role: 'user',
      content: userText,
      created_at: new Date().toISOString(),
    }
    setMessages(prev => [...prev, tempUserMsg])
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)

    try {
      const res = await fetch(`${API_BASE_URL}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: activeSess.id,
          content: userText,
          provider,
          model_override: selectedModel,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        
        // Only update local state if the user is still on the same session
        if (activeSessionIdRef.current === activeSess.id) {
          const assistantMsg = { ...data.message, citations: data.citations }
          setMessages(prev => [...prev.filter(m => m.id !== tempUserMsgId), tempUserMsg, assistantMsg])
          if (data.artifact) {
            setActiveArtifact(data.artifact)
            setActiveTab('preview')
          }
        }

        // Show fallback / rate-limit warning toast
        if (data.rate_limited && data.fallback_model) {
          addToast('warn', `⚡ Rate limited on ${selectedModel}. Switched to: ${data.fallback_model}`)
          setSelectedModel(data.fallback_model)
        }
        // Show exact LLM error if any
        if (data.error_detail) {
          addToast('error', `AI Error: ${data.error_detail}`)
        }
      } else {
        const errData = await res.json().catch(() => ({}))
        if (activeSessionIdRef.current === activeSess.id) {
          setMessages(prev => prev.filter(m => m.id !== tempUserMsgId))
          addToast('error', errData.detail || `Server error ${res.status}: Failed to respond.`)
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Network error'
      if (activeSessionIdRef.current === activeSess.id) {
        setMessages(prev => prev.filter(m => m.id !== tempUserMsgId))
      }
      addToast('error', `Connection error: ${msg}`)
    } finally {
      setIsLoading(false)
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
    }
  }

  // ── Artifact actions ───────────────────────────────────────────────────────
  const handleCopyArtifact = () => {
    if (!activeArtifact) return
    navigator.clipboard.writeText(activeArtifact.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleDownloadArtifact = () => {
    if (!activeArtifact) return
    const ext = activeArtifact.type === 'html' ? 'html' : 'md'
    const blob = new Blob([activeArtifact.content], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `artifact-${activeArtifact.id}.${ext}`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  // ── Context menu ────────────────────────────────────────────────────────────
  const openContextMenu = (e: React.MouseEvent, sessionId: string) => {
    e.preventDefault()
    e.stopPropagation()
    
    const menuHeight = 130
    const menuWidth = 165
    let x = e.clientX
    let y = e.clientY
    
    if (y + menuHeight > window.innerHeight) {
      y = Math.max(10, y - menuHeight)
    }
    if (x + menuWidth > window.innerWidth) {
      x = Math.max(10, x - menuWidth)
    }
    
    setContextMenu({ sessionId, x, y })
  }

  // ── Session sort (pinned first) ─────────────────────────────────────────────
  const pinned = sessions.filter(s => isPinned(s, pinnedIds))
  const unpinned = sessions.filter(s => !isPinned(s, pinnedIds))

  // ─── Render: Onboarding phases ────────────────────────────────────────────
  if (phase === 'booting') return <BootScreen services={bootServices} />
  if (phase === 'landing') return <LandingPage onStart={handleLandingStart} />
  if (phase === 'naming') return <NameModal onSubmit={handleNameSubmit} />

  // ─── Render: Chat App ─────────────────────────────────────────────────────
  return (
    <div className="flex h-screen w-screen overflow-hidden" style={{ background: 'var(--bg-void)', color: 'var(--text-primary)' }}>

      {/* ── Toast container ─────────────────────────────────────────────── */}
      <div className="toast-container">
        {toasts.map(t => <ToastItem key={t.id} toast={t} onClose={removeToast} />)}
      </div>

      {/* ── Context Menu ────────────────────────────────────────────────── */}
      {contextMenu && (
        <div
          className="ctx-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={e => e.stopPropagation()}
        >
          <button
            className="ctx-item"
            onClick={() => {
              const session = sessions.find(s => s.id === contextMenu.sessionId)
              setRenameValue(getSessionName(session!, sessionTitles))
              setRenamingId(contextMenu.sessionId)
              setContextMenu(null)
            }}
          >
            <Pencil size={13} /> Rename
          </button>
          <button
            className="ctx-item"
            onClick={() => handlePinSession(contextMenu.sessionId)}
          >
            <Pin size={13} />
            {pinnedIds.has(contextMenu.sessionId) ? 'Unpin' : 'Pin'}
          </button>
          <div className="ctx-divider" />
          <button
            className="ctx-item danger"
            onClick={() => {
              const id = contextMenu.sessionId
              setContextMenu(null)
              handleDeleteSession(id)
            }}
          >
            <Trash2 size={13} /> Delete
          </button>
        </div>
      )}

      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside style={{ width: 272, background: 'var(--bg-surface)', borderRight: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        {/* Sidebar header */}
        <div style={{ padding: '16px 14px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
            <LGAvatar size={28} />
            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'Outfit, sans-serif', letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 135 }}>
              Lenny's Growth Assistant
            </span>
          </div>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <button
              onClick={() => changePhase('landing')}
              id="landing-home-btn"
              aria-label="Back to Home Landing"
              title="Back to Landing Page"
              style={{ padding: '6px', borderRadius: 8, background: 'none', border: '1px solid var(--border-soft)', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', transition: 'all 0.15s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-hover)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)' }}
            >
              <Home size={16} />
            </button>
            <button
              onClick={handleClearAllSessions}
              id="clear-chats-btn"
              aria-label="Clear All Chats"
              title="Clear All Chats"
              style={{ padding: '6px', borderRadius: 8, background: 'none', border: '1px solid var(--border-soft)', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', transition: 'all 0.15s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(248,113,113,0.08)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--danger)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)' }}
            >
              <Trash2 size={16} />
            </button>
            <button
              onClick={handleCreateSession}
              id="new-chat-btn"
              aria-label="New Chat"
              style={{ padding: '6px', borderRadius: 8, background: 'none', border: '1px solid var(--border-soft)', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', transition: 'all 0.15s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-hover)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)' }}
            >
              <Plus size={16} />
            </button>
          </div>
        </div>

        {/* Session list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 8px' }}>
          {pinned.length > 0 && (
            <>
              <div className="section-label">Pinned</div>
              {pinned.map(s => <SessionItem key={s.id} session={s} active={activeSession?.id === s.id} pinned name={getSessionName(s, sessionTitles)} renamingId={renamingId} renameValue={renameValue} renameInputRef={renameInputRef} setRenamingId={setRenamingId} setRenameValue={setRenameValue} onSelect={() => setActiveSession(s)} onContextMenu={e => openContextMenu(e, s.id)} onRename={handleRenameSession} />)}
              {unpinned.length > 0 && <div className="section-label" style={{ marginTop: 8 }}>Chats</div>}
            </>
          )}
          {unpinned.map(s => (
            <SessionItem
              key={s.id}
              session={s}
              active={activeSession?.id === s.id}
              pinned={false}
              name={getSessionName(s, sessionTitles)}
              renamingId={renamingId}
              renameValue={renameValue}
              renameInputRef={renameInputRef}
              setRenamingId={setRenamingId}
              setRenameValue={setRenameValue}
              onSelect={() => setActiveSession(s)}
              onContextMenu={e => openContextMenu(e, s.id)}
              onRename={handleRenameSession}
            />
          ))}
          {sessions.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
              No chats yet.<br />Click + to start a new one.
            </div>
          )}
        </div>

        {/* User identity footer */}
        <div className="sidebar-user">
          <UserAvatar name={userName} size={30} />
          <div className="sidebar-user-info">
            <div className="sidebar-user-name">{userName}</div>
            <div className="sidebar-user-status">
              <div className="status-dot" />
              System Live
            </div>
          </div>
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <main id="main-content" style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Chat thread */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg-panel)', overflow: 'hidden', position: 'relative' }}>

          {/* Top bar - clean, no chip logo */}
          <header style={{ padding: '12px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, background: 'var(--bg-surface)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <LGAvatar size={26} />
              <div>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, fontFamily: 'Outfit, sans-serif', color: 'var(--text-primary)' }}>
                  Lenny's Growth Assistant
                </span>
                {activeSession && (
                  <span style={{ display: 'block', fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 1 }}>
                    {getSessionName(activeSession, sessionTitles)}
                  </span>
                )}
              </div>
            </div>

            {/* Provider + Model selects */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Provider</span>
                <select
                  id="provider-select"
                  value={provider}
                  onChange={e => setProvider(e.target.value as ProviderKey)}
                  className="provider-select"
                  aria-label="Select AI provider"
                >
                  {(Object.entries(PROVIDER_LABELS) as [ProviderKey, string][]).map(([k, label]) => (
                    <option key={k} value={k}>{label}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Model</span>
                <div style={{ position: 'relative' }}>
                  <select
                    id="model-select"
                    value={selectedModel}
                    onChange={e => setSelectedModel(e.target.value)}
                    disabled={modelsLoading}
                    className="provider-select"
                    style={{ minWidth: 164, opacity: modelsLoading ? 0.5 : 1 }}
                    aria-label="Select AI model"
                  >
                    {availableModels.map(m => (
                      <option key={m.id} value={m.id}>{m.label}</option>
                    ))}
                  </select>
                  {modelsLoading && (
                    <RefreshCw size={11} style={{ position: 'absolute', right: 28, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', animation: 'spin-slow 1s linear infinite', pointerEvents: 'none' }} />
                  )}
                </div>
              </div>
            </div>
          </header>

          {/* Messages pane */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Empty state */}
            {messages.length === 0 && !isLoading && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 16, padding: '60px 24px' }}>
                <LGAvatar size={48} />
                <div>
                  <h2 style={{ fontSize: '1rem', fontWeight: 600, margin: '0 0 6px', fontFamily: 'Outfit, sans-serif' }}>
                    Ready for your questions, {userName || 'there'}.
                  </h2>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.7, maxWidth: '52ch', margin: 0 }}>
                    Ask about product growth, retention, pricing, or conversion - grounded in 269 Lenny's Podcast episodes.
                    Or request a Ship&nbsp;30/30 essay.
                  </p>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 8 }}>
                  {['What did Brian Chesky say about details?', 'Explain Product-Led Growth', 'Write a Ship 30/30 essay on retention'].map(s => (
                    <button
                      key={s}
                      onClick={() => setInputMessage(s)}
                      style={{ fontSize: '0.75rem', padding: '7px 14px', background: 'var(--bg-card)', border: '1px solid var(--border-soft)', borderRadius: 20, color: 'var(--text-secondary)', cursor: 'pointer', transition: 'all 0.15s' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--brand)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-soft)'; }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Message bubbles */}
            {messages.map(m => (
              <div
                key={m.id}
                style={{
                  display: 'flex',
                  gap: 12,
                  maxWidth: 780,
                  flexDirection: m.role === 'user' ? 'row-reverse' : 'row',
                  marginLeft: m.role === 'user' ? 'auto' : undefined,
                }}
              >
                {m.role === 'user' ? <UserAvatar name={userName} /> : <LGAvatar />}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                  <div style={{
                    padding: '11px 16px',
                    borderRadius: m.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                    fontSize: '0.875rem',
                    lineHeight: 1.65,
                    background: m.role === 'user'
                      ? 'linear-gradient(135deg, #6366f1, #4f46e5)'
                      : 'var(--bg-card)',
                    border: m.role === 'user' ? 'none' : '1px solid var(--border-subtle)',
                    color: m.role === 'user' ? '#fff' : 'var(--text-primary)',
                  }}>
                    {m.role === 'assistant' ? (
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                    ) : m.content}
                  </div>

                  {/* Served-by badge - only on assistant */}
                  {m.role === 'assistant' && m.provider && (
                    <ServedByBadge provider={m.provider} requestedProvider={provider} />
                  )}

                  {/* Citations / Sources Pills */}
                  {m.role === 'assistant' && m.citations && m.citations.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8, maxWidth: '100%' }}>
                      {m.citations.map((cit, idx) => (
                        <a
                          key={idx}
                          href={cit.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="citation-pill"
                          title={`${cit.guest} - ${cit.title}`}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '4px 10px',
                            background: 'var(--bg-card)',
                            border: '1px solid var(--border-soft)',
                            borderRadius: 12,
                            fontSize: '0.72rem',
                            color: 'var(--brand)',
                            textDecoration: 'none',
                            transition: 'all 0.15s',
                          }}
                          onMouseEnter={e => {
                            e.currentTarget.style.borderColor = 'var(--brand)';
                            e.currentTarget.style.background = 'var(--bg-hover)';
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.borderColor = 'var(--border-soft)';
                            e.currentTarget.style.background = 'var(--bg-card)';
                          }}
                        >
                          <span style={{ display: 'inline-block', width: 5, height: 5, borderRadius: '50%', background: 'var(--brand)' }} />
                          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{cit.guest}</span>
                          <span style={{ color: 'var(--text-muted)' }}>t={timestampFromUrl(cit.url)}</span>
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Typing indicator */}
            {isLoading && (
              <div style={{ display: 'flex', gap: 12, maxWidth: 780 }}>
                <LGAvatar />
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '13px 16px', background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: '18px 18px 18px 4px' }}>
                  {[0, 150, 300].map(delay => (
                    <span key={delay} style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--brand)', display: 'block', animation: 'bounce 1.2s ease-in-out infinite', animationDelay: `${delay}ms` }} />
                  ))}
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input form */}
          <form
            onSubmit={handleSendMessage}
            style={{ padding: '12px 16px', borderTop: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', display: 'flex', gap: 10, alignItems: 'center' }}
          >
            <input
              id="message-input"
              name="message-input"
              aria-label="Message Input"
              type="text"
              value={inputMessage}
              onChange={e => setInputMessage(e.target.value)}
              placeholder="Ask anything or request: 'Write a Ship 30/30 essay on retention'"
              disabled={isLoading}
              style={{
                flex: 1,
                background: 'var(--bg-card)',
                border: '1px solid var(--border-soft)',
                borderRadius: 14,
                padding: '11px 16px',
                fontSize: '0.875rem',
                color: 'var(--text-primary)',
                outline: 'none',
                fontFamily: 'Inter, sans-serif',
                transition: 'border-color 0.2s',
              }}
              onFocus={e => { e.currentTarget.style.borderColor = 'var(--brand)' }}
              onBlur={e => { e.currentTarget.style.borderColor = 'var(--border-soft)' }}
            />
            <button
              type="submit"
              id="send-btn"
              aria-label="Send Message"
              disabled={isLoading || !inputMessage.trim()}
              style={{
                width: 44, height: 44, borderRadius: '50%',
                background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', flexShrink: 0,
                opacity: isLoading || !inputMessage.trim() ? 0.45 : 1,
                transition: 'opacity 0.2s, transform 0.15s',
                boxShadow: '0 0 16px rgba(99,102,241,0.35)',
              }}
              onMouseEnter={e => { if (!isLoading && inputMessage.trim()) (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.05)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)' }}
            >
              <Send size={17} />
            </button>
          </form>
        </div>

        {/* Artifact panel */}
        {activeArtifact && (
          <div style={{ width: 500, borderLeft: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
            <div style={{ height: 60, padding: '0 14px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-panel)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <FileText size={16} style={{ color: 'var(--brand)' }} />
                <h2 style={{ fontSize: '0.82rem', fontWeight: 600, margin: 0, textTransform: 'capitalize', letterSpacing: '0.01em' }}>
                  {activeArtifact.type} Artifact
                </h2>
              </div>
              <div style={{ display: 'flex', gap: 2 }}>
                <IconBtn label="Toggle view" onClick={() => setActiveTab(activeTab === 'preview' ? 'code' : 'preview')}>
                  <span style={{ fontSize: '0.72rem', fontWeight: 500 }}>{activeTab === 'preview' ? 'Code' : 'Preview'}</span>
                </IconBtn>
                <IconBtn label="Copy" onClick={handleCopyArtifact}>
                  {copied ? <Check size={15} style={{ color: 'var(--success)' }} /> : <Copy size={15} />}
                </IconBtn>
                <IconBtn label="Download" onClick={handleDownloadArtifact}><Download size={15} /></IconBtn>
                <IconBtn label="Close" onClick={() => setActiveArtifact(null)}><X size={15} /></IconBtn>
              </div>
            </div>
            <div style={{ flex: 1, overflow: 'auto', background: activeTab === 'preview' && activeArtifact.type === 'html' ? '#fff' : 'var(--bg-void)' }}>
              {activeTab === 'preview' ? (
                activeArtifact.type === 'html' ? (
                  <iframe title="Artifact" sandbox="allow-same-origin" srcDoc={activeArtifact.content} style={{ width: '100%', height: '100%', border: 'none' }} />
                ) : (
                  <div style={{ padding: 24, fontSize: '0.85rem', color: 'var(--text-primary)', lineHeight: 1.75, maxWidth: '65ch' }}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{activeArtifact.content}</ReactMarkdown>
                  </div>
                )
              ) : (
                <pre style={{ padding: 24, fontSize: '0.75rem', fontFamily: 'monospace', color: '#34d399', overflowX: 'auto', whiteSpace: 'pre-wrap', margin: 0 }}>
                  {activeArtifact.content}
                </pre>
              )}
            </div>
          </div>
        )}
      </main>

      <style>{`
        @keyframes bounce {
          0%, 80%, 100% { transform: translateY(0); }
          40% { transform: translateY(-6px); }
        }
        @keyframes spin-slow { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}

// ─── Reusable icon button ─────────────────────────────────────────────────────
function IconBtn({ children, label, onClick }: { children: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      style={{
        width: 34, height: 34, borderRadius: 8,
        background: 'none', border: 'none', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--text-muted)', transition: 'background 0.15s, color 0.15s',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-hover)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)'; }}
    >
      {children}
    </button>
  )
}

// ─── Served-by badge ──────────────────────────────────────────────────────────
function ServedByBadge({ provider, requestedProvider }: { provider: string; requestedProvider: string }) {
  // If the actual provider used ≠ what the user selected → show fallback style
  const isFallback = provider !== requestedProvider

  const providerLabel: Record<string, string> = {
    gemini: 'Google Gemini',
    groq: 'Groq Cloud',
    ollama: 'Ollama (Local)',
  }

  const display = providerLabel[provider] || provider

  return (
    <div className={`served-badge ${isFallback ? 'served-badge-fallback' : ''}`}>
      <div className="served-badge-dot" />
      {isFallback ? `⚡ Switched to ${display}` : `Served by ${display}`}
    </div>
  )
}

// ─── Session list item ────────────────────────────────────────────────────────
function SessionItem({
  session, active, name, renamingId, renameValue, renameInputRef,
  setRenamingId, setRenameValue, onSelect, onContextMenu, onRename,
}: {
  session: Session
  active: boolean
  pinned: boolean
  name: string
  renamingId: string | null
  renameValue: string
  renameInputRef: React.RefObject<HTMLInputElement>
  setRenamingId: (id: string | null) => void
  setRenameValue: (v: string) => void
  onSelect: () => void
  onContextMenu: (e: React.MouseEvent) => void
  onRename: (id: string, name: string) => void
}) {
  const isRenaming = renamingId === session.id

  return (
    <div
      className={`sidebar-session ${active ? 'active' : ''}`}
      onClick={!isRenaming ? onSelect : undefined}
      onContextMenu={onContextMenu}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' && !isRenaming) onSelect() }}
    >
      <MessageSquare size={13} style={{ color: active ? 'var(--brand)' : 'var(--text-muted)', flexShrink: 0 }} />

      {isRenaming ? (
        <input
          ref={renameInputRef}
          className="rename-input"
          value={renameValue}
          onChange={e => setRenameValue(e.target.value)}
          onBlur={() => onRename(session.id, renameValue)}
          onKeyDown={e => {
            if (e.key === 'Enter') onRename(session.id, renameValue)
            if (e.key === 'Escape') setRenamingId(null)
          }}
          onClick={e => e.stopPropagation()}
        />
      ) : (
        <span className="sidebar-session-name">{name}</span>
      )}

      {!isRenaming && (
        <button
          className="sidebar-session-menu-btn"
          onClick={onContextMenu}
          aria-label={`Options for ${name}`}
          title="Options"
        >
          <MoreHorizontal size={13} />
        </button>
      )}
    </div>
  )
}
