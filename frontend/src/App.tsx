import { useState, useEffect, useRef, useCallback } from 'react'
import { 
  MessageSquare, 
  Plus, 
  Cpu, 
  Send, 
  ChevronRight, 
  Copy, 
  Download, 
  X, 
  FileText, 
  Check,
  AlertCircle,
  AlertTriangle,
  RefreshCw,
  Zap
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

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

type ProviderKey = 'gemini' | 'groq' | 'ollama'

const PROVIDER_LABELS: Record<ProviderKey, string> = {
  gemini: 'Google Gemini',
  groq: 'Groq Cloud',
  ollama: 'Local (Ollama)'
}

const PROVIDER_DEFAULT_MODELS: Record<ProviderKey, ProviderModel[]> = {
  gemini: [{ id: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash Lite' }],
  groq: [{ id: 'openai/gpt-oss-120b', label: 'GPT-OSS 120B' }],
  ollama: [{ id: 'qwen2.5:3b', label: 'Qwen 2.5 3B (Local)' }]
}

export default function App() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [activeSession, setActiveSession] = useState<Session | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [activeArtifact, setActiveArtifact] = useState<Artifact | null>(null)
  const [inputMessage, setInputMessage] = useState('')
  
  // Provider & model state
  const [provider, setProvider] = useState<ProviderKey>('gemini')
  const [selectedModel, setSelectedModel] = useState('gemini-2.0-flash-lite')
  const [availableModels, setAvailableModels] = useState<ProviderModel[]>(PROVIDER_DEFAULT_MODELS.gemini)
  const [modelsLoading, setModelsLoading] = useState(false)

  const [isLoading, setIsLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [activeTab, setActiveTab] = useState<'preview' | 'code'>('preview')
  const [apiError, setApiError] = useState<string | null>(null)
  // Rate-limit / auto-switch warning
  const [switchWarning, setSwitchWarning] = useState<string | null>(null)
  
  const messagesEndRef = useRef<HTMLDivElement>(null)
  // Track in-flight fetch IDs to cancel stale requests on session switch
  const activeSessionIdRef = useRef<string | null>(null)

  const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

  // ─── helpers ───────────────────────────────────────────────────────────────

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  // Fetch available models for the chosen provider
  const fetchModels = useCallback(async (prov: ProviderKey) => {
    setModelsLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/provider/models?provider=${prov}`)
      if (res.ok) {
        const data = await res.json()
        if (data.models && data.models.length > 0) {
          setAvailableModels(data.models)
          setSelectedModel(data.models[0].id)
          return
        }
      }
    } catch {
      // silent — fall through to defaults
    } finally {
      setModelsLoading(false)
    }
    // Fallback to hardcoded defaults if API is unavailable
    setAvailableModels(PROVIDER_DEFAULT_MODELS[prov])
    setSelectedModel(PROVIDER_DEFAULT_MODELS[prov][0].id)
  }, [API_BASE_URL])

  // ─── effects ───────────────────────────────────────────────────────────────

  // Fetch sessions on mount only
  useEffect(() => {
    fetchSessions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // When session changes: cancel stale, fetch fresh messages + artifacts
  useEffect(() => {
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
  }, [activeSession?.id]) // Only re-run if the ID actually changed (prevents double-fetching)

  // Fetch models whenever provider changes
  useEffect(() => {
    fetchModels(provider)
  }, [provider, fetchModels])

  useEffect(() => {
    scrollToBottom()
  }, [messages, isLoading])

  // Auto-dismiss switch warning after 6 seconds
  useEffect(() => {
    if (!switchWarning) return
    const t = setTimeout(() => setSwitchWarning(null), 6000)
    return () => clearTimeout(t)
  }, [switchWarning])

  // ─── data fetching ─────────────────────────────────────────────────────────

  const fetchSessions = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/sessions`)
      if (res.ok) {
        const data = await res.json()
        setSessions(data)
        if (data.length > 0 && !activeSession) {
          setActiveSession(data[0])
        }
      }
    } catch {
      setApiError('Database / Backend API connection offline.')
    }
  }

  const fetchMessages = async (sessionId: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/sessions/${sessionId}/messages`)
      if (res.ok && activeSessionIdRef.current === sessionId) {
        const data = await res.json()
        setMessages(data)
      }
    } catch (err) {
      console.error('Failed to fetch messages', err)
    }
  }

  const fetchArtifacts = async (sessionId: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/sessions/${sessionId}/artifacts`)
      if (res.ok && activeSessionIdRef.current === sessionId) {
        const data = await res.json()
        if (data.length > 0) setActiveArtifact(data[data.length - 1])
        else setActiveArtifact(null)
      }
    } catch (err) {
      console.error('Failed to fetch artifacts', err)
    }
  }

  // ─── actions ───────────────────────────────────────────────────────────────

  const handleCreateSession = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metadata: {} })
      })
      if (res.ok) {
        const newSession = await res.json()
        setSessions(prev => [newSession, ...prev])
        setActiveSession(newSession)
      }
    } catch (err) {
      console.error('Failed to create session', err)
    }
  }

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inputMessage.trim() || isLoading) return

    let currentSession = activeSession
    if (!currentSession) {
      try {
        const res = await fetch(`${API_BASE_URL}/sessions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ metadata: {} })
        })
        if (res.ok) {
          currentSession = await res.json()
          setSessions(prev => [currentSession!, ...prev])
          setActiveSession(currentSession)
        } else return
      } catch (err) {
        console.error(err)
        return
      }
    }

    const userText = inputMessage
    setInputMessage('')
    setIsLoading(true)
    setApiError(null)

    const tempUserMsg: Message = {
      id: Math.random().toString(),
      session_id: currentSession!.id,
      role: 'user',
      content: userText,
      created_at: new Date().toISOString()
    }
    setMessages(prev => [...prev, tempUserMsg])

    try {
      const res = await fetch(`${API_BASE_URL}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: currentSession!.id,
          content: userText,
          provider: provider,
          model_override: selectedModel
        })
      })

      if (res.ok) {
        const data = await res.json()
        setMessages(prev => [...prev.filter(m => m.id !== tempUserMsg.id), tempUserMsg, data.message])

        // Show rate-limit / auto-switch warning if a different model was actually used
        if (data.rate_limited && data.fallback_model) {
          setSwitchWarning(`⚠️ Rate limit hit on ${selectedModel}. Switched to: ${data.fallback_model}`)
          setSelectedModel(data.fallback_model)
        }

        if (data.artifact) {
          setActiveArtifact(data.artifact)
          setActiveTab('preview')
        }
      } else {
        const errData = await res.json()
        setApiError(errData.detail || 'Server failed to respond.')
      }
    } catch {
      setApiError('Network error: failed to send message.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleCopyArtifact = () => {
    if (!activeArtifact) return
    navigator.clipboard.writeText(activeArtifact.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleDownloadArtifact = () => {
    if (!activeArtifact) return
    const extension = activeArtifact.type === 'html' ? 'html' : 'md'
    const blob = new Blob([activeArtifact.content], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `artifact-${activeArtifact.id}.${extension}`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // ─── render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen w-screen bg-[#080B11] text-gray-100 overflow-hidden">
      
      {/* Sidebar - Sessions */}
      <aside className="w-80 bg-[#0F1420] border-r border-white/5 flex flex-col justify-between shrink-0">
        <div>
          {/* Header */}
          <div className="p-4 flex items-center justify-between border-b border-white/5">
            <h1 className="text-lg font-bold bg-gradient-to-r from-primary to-cyan-400 bg-clip-text text-transparent tracking-wide">
              Lenny Assistant
            </h1>
            <button 
              onClick={handleCreateSession}
              className="p-3 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 transition-all"
              title="New Chat"
              aria-label="New Chat"
            >
              <Plus size={18} />
            </button>
          </div>

          {/* Session List */}
          <div className="p-2 space-y-1 overflow-y-auto max-h-[calc(100vh-140px)]">
            {sessions.map(s => (
              <button
                key={s.id}
                onClick={() => setActiveSession(s)}
                className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${
                  activeSession?.id === s.id 
                    ? 'bg-primary/10 border border-primary/20 text-white' 
                    : 'hover:bg-white/5 border border-transparent text-gray-400'
                }`}
              >
                <MessageSquare size={16} />
                <span className="text-sm truncate text-left w-full">
                  Chat {s.id.substring(0, 6)}
                </span>
                <ChevronRight size={14} className="opacity-50" />
              </button>
            ))}
          </div>
        </div>

        {/* Info footer */}
        <div className="p-4 border-t border-white/5 bg-[#0A0D16] text-xs text-gray-500 space-y-2">
          <div className="flex items-center justify-between">
            <span>NeonDB connection</span>
            <span className="font-semibold tracking-wider text-[10px] text-gray-400">SSL SECURE</span>
          </div>
          <div className="flex items-center gap-1.5 text-emerald-500 font-medium tracking-wide">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Verified & Certified System Live
          </div>
        </div>
      </aside>

      {/* Main Container */}
      <main id="main-content" className="flex-1 flex overflow-hidden">
        
        {/* Chat Thread */}
        <div className="flex-1 flex flex-col justify-between bg-[#0B0F19] overflow-hidden relative">
          
          {/* Top Bar - Provider + Model Selector */}
          <header className="border-b border-white/5 px-6 py-3 flex items-center justify-between shrink-0 glass-panel">
            <div className="flex items-center gap-3">
              <Cpu className="text-primary animate-pulse" size={20} />
              <div className="text-sm font-semibold">Active LLM Instance</div>
            </div>
            
            {/* Provider + Model dropdowns */}
            <div className="flex items-center gap-3 flex-wrap">
              {/* Provider Selector */}
              <div className="flex items-center gap-2">
                <label htmlFor="provider-select" className="text-xs text-gray-400 whitespace-nowrap">
                  <Zap size={12} className="inline mr-1 text-amber-400" />
                  Provider:
                </label>
                <select
                  id="provider-select"
                  value={provider}
                  onChange={(e) => setProvider(e.target.value as ProviderKey)}
                  className="bg-[#1A2130] border border-white/10 rounded-lg text-xs py-1.5 px-3 focus:outline-none focus:border-primary/50 text-gray-200 min-w-[140px]"
                >
                  {(Object.entries(PROVIDER_LABELS) as [ProviderKey, string][]).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>

              {/* Model Selector — dynamic per provider */}
              <div className="flex items-center gap-2">
                <label htmlFor="model-select" className="text-xs text-gray-400 whitespace-nowrap">Model:</label>
                <div className="relative">
                  <select
                    id="model-select"
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    disabled={modelsLoading}
                    className="bg-[#1A2130] border border-white/10 rounded-lg text-xs py-1.5 px-3 focus:outline-none focus:border-primary/50 text-gray-200 min-w-[180px] disabled:opacity-50"
                  >
                    {availableModels.map(m => (
                      <option key={m.id} value={m.id}>{m.label}</option>
                    ))}
                  </select>
                  {modelsLoading && (
                    <RefreshCw size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 animate-spin pointer-events-none" />
                  )}
                </div>
              </div>
            </div>
          </header>

          {/* Auto-switch warning banner */}
          {switchWarning && (
            <div className="mx-4 mt-3 p-3 bg-amber-950/40 border border-amber-500/30 text-amber-300 rounded-xl text-xs flex items-center gap-3 animate-fade-in">
              <AlertTriangle size={14} className="shrink-0" />
              <span>{switchWarning}</span>
              <button onClick={() => setSwitchWarning(null)} className="ml-auto text-amber-400 hover:text-white">
                <X size={14} />
              </button>
            </div>
          )}

          {/* Messages Pane */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {apiError && (
              <div className="p-3 bg-red-950/30 border border-red-500/20 text-red-300 rounded-xl text-sm flex items-center gap-3">
                <AlertCircle size={16} />
                <span>{apiError}</span>
              </div>
            )}

            {messages.length === 0 && !isLoading && (
              <div className="h-full flex flex-col items-center justify-center text-center space-y-4 max-w-md mx-auto">
                <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                  <MessageSquare size={24} />
                </div>
                <h2 className="text-base font-semibold">Ready for growth questions</h2>
                <p className="text-xs text-gray-500 leading-relaxed max-w-[60ch]">
                  Ask questions about growth, conversion, or product management from Lenny's podcast. Or request a Ship 30/30 essay based on transcripts.
                </p>
              </div>
            )}

            {messages.map(m => (
              <div
                key={m.id}
                className={`flex gap-4 max-w-3xl ${m.role === 'user' ? 'ml-auto flex-row-reverse' : ''}`}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                  m.role === 'user' ? 'bg-primary text-white' : 'bg-secondary text-primary border border-primary/20'
                }`}>
                  {m.role === 'user' ? 'U' : 'AI'}
                </div>

                <div className={`space-y-2 ${m.role === 'user' ? 'items-end' : ''}`}>
                  <div className={`p-4 rounded-2xl text-sm leading-relaxed ${
                    m.role === 'user' 
                      ? 'bg-primary text-white rounded-tr-none' 
                      : 'bg-secondary border border-white/5 text-gray-100 rounded-tl-none'
                  }`}>
                    {m.role === 'assistant' ? (
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {m.content}
                      </ReactMarkdown>
                    ) : (
                      m.content
                    )}
                  </div>
                  
                  {m.role === 'assistant' && m.provider && (
                    <span className="text-[10px] text-gray-500 px-1 tracking-wider uppercase">
                      Served by {m.provider}
                    </span>
                  )}
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex gap-4 max-w-3xl">
                <div className="w-8 h-8 rounded-full bg-secondary border border-primary/20 flex items-center justify-center text-xs font-bold text-primary animate-pulse">
                  AI
                </div>
                <div className="flex items-center space-x-2 py-3 px-4 bg-secondary border border-white/5 rounded-2xl rounded-tl-none">
                  <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Form Input */}
          <form 
            onSubmit={handleSendMessage}
            className="p-4 border-t border-white/5 bg-[#0A0D16] flex items-center gap-3"
          >
            <input
              type="text"
              id="message-input"
              name="message-input"
              aria-label="Message Input"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="Ask anything or request: 'Make a Ship 30/30 essay about product retention'"
              className="flex-1 bg-[#151B2B] border border-white/5 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary/50 text-gray-100 placeholder-gray-500"
              disabled={isLoading}
            />
            <button
              type="submit"
              className="bg-primary hover:bg-primary/90 text-white rounded-xl p-3 min-w-[44px] min-h-[44px] flex items-center justify-center transition-all disabled:opacity-50"
              disabled={isLoading || !inputMessage.trim()}
              aria-label="Send Message"
            >
              <Send size={18} />
            </button>
          </form>

        </div>

        {/* Artifact side panel (on demand) */}
        {activeArtifact && (
          <div className="w-[500px] border-l border-white/5 bg-[#0D121F] flex flex-col shrink-0 transition-all duration-300">
            {/* Header */}
            <div className="h-16 px-4 border-b border-white/5 flex items-center justify-between bg-[#0B0F19]">
              <div className="flex items-center gap-2">
                <FileText size={18} className="text-primary" />
                <h2 className="text-sm font-semibold truncate capitalize tracking-wide">
                  {activeArtifact.type} Artifact
                </h2>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setActiveTab(activeTab === 'preview' ? 'code' : 'preview')}
                  className="px-3 py-2 min-h-[44px] flex items-center justify-center rounded-lg hover:bg-white/5 text-xs font-medium text-gray-400 hover:text-white"
                  aria-label="Toggle Preview/Code"
                >
                  {activeTab === 'preview' ? 'View Code' : 'Preview'}
                </button>
                <button
                  onClick={handleCopyArtifact}
                  className="p-3 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition-all"
                  title="Copy"
                  aria-label="Copy Artifact"
                >
                  {copied ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
                </button>
                <button
                  onClick={handleDownloadArtifact}
                  className="p-3 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition-all"
                  title="Download"
                  aria-label="Download Artifact"
                >
                  <Download size={16} />
                </button>
                <button
                  onClick={() => setActiveArtifact(null)}
                  className="p-3 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition-all"
                  title="Close"
                  aria-label="Close Artifact"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Viewer Body */}
            <div className="flex-1 overflow-auto bg-[#080B12]">
              {activeTab === 'preview' ? (
                activeArtifact.type === 'html' ? (
                  <iframe
                    title="Artifact Output"
                    sandbox="allow-same-origin"
                    srcDoc={activeArtifact.content}
                    className="w-full h-full border-0 bg-white"
                  />
                ) : (
                  <div className="p-6 prose prose-invert max-w-[65ch] mx-auto text-sm text-gray-300 leading-relaxed">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {activeArtifact.content}
                    </ReactMarkdown>
                  </div>
                )
              ) : (
                <pre className="p-6 text-xs font-mono text-emerald-400 overflow-x-auto select-text whitespace-pre-wrap">
                  {activeArtifact.content}
                </pre>
              )}
            </div>
          </div>
        )}

      </main>

    </div>
  )
}
