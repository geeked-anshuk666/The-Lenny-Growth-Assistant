# Session 05 - Dynamic Provider & Model Selection, Rate-Limit Handling

**Date:** 2026-08-26  
**Focus:** Groq model migration, dynamic model discovery, redundant API call fix, naming standardisation

---

## Prompt 1 - Model availability audit

> Run `curl -X GET "https://api.groq.com/openai/v1/models" -H "Authorization: Bearer [REDACTED]"` so I can see which models are available.

**Agent action:** Ran Groq API discovery. Found 13 available models on free tier.  
**Finding:** `llama-3.1-8b-instant` is deprecated. Recommended replacement: `openai/gpt-oss-120b` (owned by OSI/OpenAI, hosted on Groq).

---

## Prompt 2 - Update Groq model and fix naming throughout

> Update GROQ_MODEL to `openai/gpt-oss-120b`. Also everywhere in the project naming is still LLama3.2:3b instead of Qwen. Change everywhere for the local model.

**Files changed:**
- `agent-service/src/index.ts` - Groq default: `llama-3.1-8b-instant` → `openai/gpt-oss-120b`; Ollama default: `llama3.2:3b-instruct-q4_K_M` → `qwen2.5:3b`; warmup model reference fixed
- `.env` - Added `GROQ_MODEL=openai/gpt-oss-120b`, `GEMINI_MODEL=gemini-2.0-flash-lite`
- `meta_docs/TRD.md` - Updated model references
- `meta_docs/readme.md` - `ollama pull` command updated to `qwen2.5:3b`
- `frontend/src/App.tsx` - UI labels updated: "Google Gemini", "Groq Cloud", "Local (Ollama)"

---

## Prompt 3 - Fix session switch duplicate API calls

> I noticed every time I switch chats, more API calls are being made.

**Root cause identified:** `useEffect([activeSession])` fired on every render because React creates a new object reference each time, even when the session ID hasn't changed.

**Fix applied:**
```typescript
// BEFORE (broken)
useEffect(() => { fetchMessages(activeSession.id) }, [activeSession])

// AFTER (fixed)
useEffect(() => { fetchMessages(activeSession.id) }, [activeSession?.id])
```

Added `activeSessionIdRef` to discard stale responses that complete after the session has already switched.

---

## Prompt 4 - Dynamic 3-option provider dropdown + per-model selection

> Is there a way to show in the dropdown 3 options? 1 is Gemini, 2nd is Groq, 3rd is Local. When Gemini is clicked, dynamically fetch which models are available. If there is a rate limit error, dynamically switch and change the selected model.

**Architecture decision:** Two-level selector pattern.
- Level 1: Provider (static 3 options)
- Level 2: Model dropdown - live-fetched from `/provider/models?provider=X`

**New backend endpoint added:**  
`agent-service`: `GET /provider/models?provider=gemini|groq|ollama`
- Gemini: queries `https://generativelanguage.googleapis.com/v1beta/models`, filters to `generateContent` capable
- Groq: queries `https://api.groq.com/openai/v1/models`, filters out whisper/guard/orpheus/TTS
- Ollama: queries `{OLLAMA_BASE_URL}/api/tags`, falls back to `[{id: "qwen2.5:3b"}]` if Ollama unreachable

`FastAPI`: `GET /provider/models` - proxy to agent-service (frontend talks to one origin)

**Rate-limit handling:**
- `agent-service` response includes `rate_limited: bool`, `fallback_model: string | null`
- Frontend: amber `AlertTriangle` banner, auto-dismisses 6s, calls `setSelectedModel(fallback_model)`

**Key implementation detail:** `modelOverride` only applies to the initially requested provider; fallback providers use their own defaults - prevents a Groq-specific model from being passed to Gemini/Ollama during rotation.

---

## Prompt 5 - Compliance audit

> Does the whole project strictly adhere to the requirements/standards given in the assignment?

**Gaps found:**
1. Root-level `README.md`, `PRD.md`, `design.md`, `architecture.md` missing (lived inside `meta_docs/`)
2. `agent-transcripts/` directory missing
3. No automated test suite
4. No `CHANGELOG.md`
5. Manual UI test plan missing
6. `.env.example` and `docker-compose.yml` still had old model names
7. README Setup section was a placeholder (`*(Coding agent: fill this in...)*`)

**All gaps addressed in session 05 continuation (this file and subsequent writes).**
