# Changelog

All notable changes to The Lenny Growth Assistant are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Added
- Structured transcript citations rendering as interactive pill cards directly below assistant message bubbles, displaying guest name and exact deep-link timestamp (e.g. `t=43:57`)
- Fallback Markdown citations formatting block appended to the end of text responses, rendering clickable hyperlinks out-of-the-box in raw rendering environments
- Citations database persistence via a new `citations` JSONB column in `messages` table, automatically added via auto-alter statement on container boot
- Persistent Onboarding Refresh routing - page reload/startup now always displays the landing page, and clicking the "Let's Start" CTA redirects directly to chat if a username exists (skipping the name input modal)
- Landing page with Lenny Growth avatar and interactive intro
- User name modal for session initialization with persistent local storage
- ChatGPT-style sidebar with categorized session history and visual hierarchy
- "Served-by" badge fix ensuring model attribution accuracy in UI
- Global toast error system for handling network/API failures gracefully
- `PATCH /sessions/{id}` endpoint to support session renaming
- `DELETE /sessions/{id}` endpoint for chat history management
- Forwarding of `error_detail` from agent-service to frontend for granular debugging
- Multi-stage `api/Dockerfile` - builder stage installs deps + pre-downloads sentence-transformers into a venv; runner stage copies only venv + app code into a clean `python:3.11-slim` image
- Multi-stage `agent-service/Dockerfile` - builder compiles TypeScript; runner uses `npm ci --omit=dev` so `ts-node-dev`, `typescript`, and all `@types/*` packages are excluded from production
- Multi-stage `frontend/Dockerfile` - builder runs `vite build`; runner is `nginx:1.27-alpine` serving static assets (~25MB final image vs ~600MB dev server)
- `frontend/nginx.conf` - SPA routing fallback (`try_files $uri /index.html`) + 1-year `Cache-Control: immutable` for Vite hashed asset filenames
- `api/.dockerignore`, `agent-service/.dockerignore`, `frontend/.dockerignore` - exclude `node_modules/`, `venv/`, `.env`, `__pycache__/`, `tests/` from build context (context drops from ~1GB → <10MB)
- `VITE_API_URL` build-arg in `docker-compose.yml` frontend service for override at build time
- `.private_docs/Optimizations.md` - full historical log of every optimization applied across all project phases
- `GET /provider/models?provider=X` endpoint in `agent-service` - proxies live model lists from Gemini, Groq, and Ollama APIs
- `GET /provider/models` FastAPI proxy endpoint - forwards to agent-service so frontend only needs one backend origin
- Dynamic per-provider model dropdown in `frontend/src/App.tsx` - fetches live model list on provider change, spins while loading
- Rate-limit warning banner in frontend - amber dismissible banner shown when `rate_limited: true` in API response; auto-dismisses after 6s and updates selected model state
- `model_override` field in `MessageCreate` Pydantic schema - lets frontend send a specific model ID per request
- `model_used`, `rate_limited`, `fallback_model` fields in `/agent/generate` response body
- RAG Guest Column Entity Priority Search (`api/main.py`) - queries `TranscriptChunkModel.guest ILIKE '%Entity%'` first before falling back to `chunk_text` search to prevent entity candidate theft by guests mentioning names in passing
- Exclusive Guest Context Isolation - bypasses unconstrained global vector search when guest-specific chunks are matched, eliminating cross-episode context bleed
- Hybrid Topic Keyword + Vector RAG Scoring - extracts non-stopword query topic terms (e.g. `"detail"`, `"details"`) and boosts topic-matched chunks to the top of the context window
- System Prompt History Override Directive (`agent-service/src/index.ts`) - instructs local LLMs to prioritize current Grounded Context over previous turn responses, preventing multi-turn history refusal loops
- `agent-transcripts/session_06_rag_hybrid_scoring_and_history_bias.md` - full architectural session transcript documenting bugs 27–30

### Changed
- `OLLAMA_MODEL` default changed from `llama3.2:3b-instruct-q4_K_M` → `qwen2.5:3b` across `.env.example`, `docker-compose.yml`, `agent-service/src/index.ts`, and docs
- `GROQ_MODEL` default changed from deprecated `llama-3.1-8b-instant` → `openai/gpt-oss-120b`
- Provider dropdown labels updated from "Groq Llama-3.1" / "Ollama Llama-3.2" → "Google Gemini" / "Groq Cloud" / "Local (Ollama)"
- `useEffect` in `App.tsx` now depends on `activeSession?.id` (not full object) - prevents duplicate API calls on session switch
- Added `activeSessionIdRef` stale-fetch guard - discards responses completing after session has already changed
- `generateLLMResponseWithRotation` in `agent-service` now accepts and threads `modelOverride` - only overrides primary provider, fallbacks use their defaults

### Fixed
- PyTorch CUDA download bloat & timeout in Docker build - `api/Dockerfile` now explicitly pre-installs CPU-only PyTorch (`torch --index-url https://download.pytorch.org/whl/cpu`), reducing Python dependency download size from ~2.5GB (CUDA wheels) to ~180MB (CPU wheel) and fixing long build timeouts
- RAG context retrieval Top-K limit tuning - increased database similarity query limit from `limit(4)` to `limit(8)` in `api/main.py` to prevent related or slightly higher-scoring chunks from competing guests (e.g. Shreyas Doshi, Will Larson) from pushing the target Brian Chesky detail chunks out of the context window, resolving false-positive grounding declines on compound/specific questions
- Gemini model configuration alignment - updated default cloud LLM model to `gemini-flash-lite-latest` in code and config files to resolve 404 API exceptions on legacy models (`gemini-2.0-flash-lite` / `gemini-2.5-flash`) for new API keys
- Pytest-asyncio loop closure error - changed the API test suite client fixture to function-scope, resolving asyncio event loop conflicts and stabilizing the test suite to 100% pass (15/15)
- TypeScript compilation error in `agent-service` build stage - defined a strict `LLMResponse` interface containing the dynamic `rateLimited` and `fallbackModel` fields so the `tsc` compiler successfully verifies the build output
- Session switch triggering duplicate `/messages` + `/artifacts` API calls (useEffect dependency bug)
- Ingest parser failing to parse transcripts without explicit `Speaker (HH:MM:SS):` prefix - regex upgraded to match both formats
- FastAPI `ForeignKeyViolationError` crash when posting messages with new session IDs - added auto-session creation check
- Ollama warmup in `agent-service` using stale llama model name - now reads from `OLLAMA_MODEL` env var


## [0.3.2] - 2026-08-26 - Context Menu, RAG, Optimistic UI & Stale-Session Fixes

### Added
- **Optimistic UI & Double-Submit Locking** - updated `handleSendMessage` and `handleCreateSession` in `App.tsx` with instant 0ms state rendering. Hitting Enter appends the user prompt bubble immediately, clears the input box, and locks submission against double-submits. Clicking `+` New Chat instantly creates a temporary session item and opens a blank thread while background network calls sync with FastAPI in parallel. Rolls back state cleanly with an error toast if a network error occurs.

### Fixed
- **Clean 'New Chat' default session titles** - updated `getSessionName` in `App.tsx` to return `'New Chat'` instead of raw UUID strings (`Session db34c9`) for new/unnamed sessions. Auto-derives a ≤6-word title when the first prompt is sent and preserves manual renames permanently
- **Guest Entity Filter & Hybrid Vector RAG Retrieval** - upgraded `api/main.py` RAG vector pipeline with guest entity detection and candidate boosting. Queries mentioning specific guests (e.g. Brian Chesky) perform an initial prioritized SQL query (`TranscriptChunkModel.guest.ilike('%Name%')`) to fetch exact guest episode chunks first before attempting text fallbacks or global vector slots. Prevents other guests (e.g. Brian Balfour) who mention a name in passing from stealing candidate slots. Each chunk is prefixed with `--- Episode Guest: [Name] | Title: [Title] ---` metadata headers. Eliminates false-positive declines on Ollama local models (`qwen2.5:3b`) and compresses context size by 60% (~3,500 → ~1,200 tokens)
- **Context menu viewport overflow** - `openContextMenu` now clamps `x`/`y` coordinates against `window.innerWidth` / `window.innerHeight` before storing them in state, so the `⋯` dropdown always flips upward/inward instead of overflowing behind the OS taskbar
- **Context menu buttons unclickable (React event-delegation race)** - outside-click handler on `document` was calling `setContextMenu(null)` before the button's own `onClick` could execute; fixed by adding `.closest('.ctx-menu')` guard so the handler ignores clicks originating inside the menu
- **Delete chat not persisting** - local state (`setSessions(prev => prev.filter(...))`) was mutated before confirming `res.ok` from `DELETE /sessions/{id}`; guarded behind `if (res.ok)` with error toast on failure
- **AI preamble text included in markdown artifact** - regex fallback `content = match ? match[1].trim() : result.text` passed the entire raw LLM response (including conversational lead-ins) as artifact content when the LLM omitted the fenced code block; fallback now strips to the first `#` heading heuristic and system prompt rule 7 was reinforced
- **Stale session rendering when switching chats** - `useEffect` dependency changed from full `activeSession` object to `activeSession?.id` primitive; `activeSessionIdRef` stale-guard added to discard async responses that arrive after the user has already switched to a different session

## [0.3.1] - 2026-08-26 - UI Bugfixes & Global Chat Clearing

### Added
- **Global clear chats button** - red-hovering Trashcan icon button added next to `+` button in sidebar header; calls `DELETE /sessions` and cleanses local state (sessions, active chat, messages, artifacts, pinned sessions) after user confirmation
- **`DELETE /sessions` global clear endpoint** (FastAPI) - executes database-wide cascade deletes of all tables except the static `transcript_chunks` RAG vectors
- **Explicit API error toasts** - added `else` response mapping to `handleDeleteSession` and `handleClearAllSessions` so that backend database constraints or API failures show a descriptive error toast in the UI instead of failing silently

### Fixed
- **Vite CSS warning on `@import` order** - moved the Google Fonts `@import` declaration to line 1 of `index.css` (before `@tailwind` directives), resolving Vite's CSS compiler warning during production build
- **Context menu buttons failing to click** - resolved the React event delegation bug where document-level click listeners unmounted the context menu before the button's `onClick` could bubble up and execute. The outside click handler now checks if target is inside `.ctx-menu` and ignores it
- **Sidebar header buttons squeezed out of view** - fixed CSS overflow clip issue by adding `flex-shrink: 0` to the header buttons actions wrapper and clamping title text container with a `135px` max-width and `text-overflow: ellipsis`. The Clear All and New Chat buttons are now permanently visible side-by-side on all viewports

## [0.3.0] - 2026-08-26 - Full UI Revamp

### Added
- **Landing page** (`LandingPage` component) - full-screen deep cobalt gradient hero (`#040814 → #1a237e`) with two CSS keyframe animated ambient orbs, floating podcast-quote cards, hero headline, subtitle, and `"Let's Start →"` CTA with spring-physics hover. Stats bar shows corpus size (269 episodes, 4,700+ chunks, 3 providers)
- **Onboarding name modal** (`NameModal` component) - frosted-glass card with scale+fade-in animation; prompts `"What do I call you?"`; name stored in `localStorage` and used as user identity throughout the session
- **Phase-based rendering** - app gates entry through `landing → naming → chat` state machine; returns directly to chat if name is already saved in `localStorage`
- **Human-readable chat titles** - first user message auto-derives a ≤6-word readable title per session stored in `sessionTitles` state (frontend-only, no backend change)
- **Sidebar context menu** - `⋯` button (and right-click) on every session item opens a `CtxMenu` component with **Rename**, **Pin**, and **Delete** actions
- **Inline rename** - clicking Rename replaces session name with a live `<input>`; confirmed with Enter or blur, cancelled with Escape; optimistically updates UI then persists via `PATCH /sessions/{id}`
- **Pin chats** - pinned sessions float to a "Pinned" header section above the main list in the sidebar (frontend `pinnedIds` state, session-scoped)
- **LG avatar** - `LGAvatar` component: 32px gradient indigo circle with "LG" initials replaces the old `"AI"` text bubble
- **User initial avatar** - `UserAvatar` component: gradient purple-pink circle with the user's first initial; used in chat bubbles and sidebar footer
- **User identity sidebar footer** - `sidebar-user` block at the bottom of the sidebar showing name, initial avatar, and pulsing green status dot; replaces the NeonDB SSL status footer
- **Toast notification system** - `ToastItem` + `toast-container` CSS: four-variant (error / warn / success / info) slide-in toasts at top-right with 8-second auto-dismiss and manual ✕ close; replaces all inline error/warning banners
- **Exact LLM error forwarding** - `error_detail` string from LLM API (e.g., `"gemini-2.5-flash is no longer available"`) now surfaced verbatim via toast instead of a generic decline message
- **Suggestion chips** - empty-state message pane shows three pre-built prompt suggestion buttons to quickstart a query
- **`PATCH /sessions/{session_id}`** (FastAPI) - updates session `name` and/or `pinned` fields stored in the existing `metadata_` JSONB column; no DB schema migration required
- **`DELETE /sessions/{session_id}`** (FastAPI) - cascade-deletes a session and all child `messages` and `artifacts` rows
- **`error_detail` field** in `/messages` response - verbatim agent-service error string forwarded to frontend
- **`rate_limited` + `fallback_model`** now forwarded from agent-service through `main.py` to the frontend response, replacing the previously dropped values

### Changed
- Application name displayed as **"Lenny's Growth Assistant"** throughout (landing hero, sidebar header, page `<title>`)
- Chat header completely redesigned: removed "Active LLM Instance" label and the Cpu/Zap chip SVG icon; provider and model dropdowns placed directly inline with text labels ("Provider", "Model")
- Provider/model `<select>` elements re-styled as pill shapes (`border-radius: 9999px`) with custom CSS chevron SVGs via `background-image`
- `"Served by Ollama"` hardcoded label replaced by dynamic `ServedByBadge` component reading `data.message.provider` from the API response; shows amber `⚡ Switched to…` when actual provider differs from selection
- Rate-limit amber inline banner replaced by the new toast system (same information, less visual intrusion)
- Sidebar footer replaced - NeonDB SSL connection text removed; replaced with user identity block
- `index.css` fully rewritten with CSS custom property design tokens (`--bg-void`, `--bg-surface`, `--bg-panel`, `--brand`, `--text-primary`, etc.), Impeccable-principles animation system (ambient orb keyframes, modal slide-in, toast slide-in from right, floating card drift, pulse-dot), and component-scoped classes
- `App.tsx` refactored from a monolithic 611-line component into focused named sub-components: `LandingPage`, `NameModal`, `ToastItem`, `LGAvatar`, `UserAvatar`, `SessionItem`, `ServedByBadge`, `IconBtn`
- Google Fonts added: `Inter` (body text) + `Outfit` (headings / branding) via CSS `@import`

### Fixed
- `"Served by Ollama"` was hardcoded and never reflected the actual provider used - now dynamically reads `provider` field returned in API message response
- Error messages from LLM APIs (404 model not found, 429 rate limit, network errors) were silently replaced with generic "I'm having trouble" strings - now surface verbatim via `error_detail` field
- Chat names displayed as truncated UUID strings (`Session 8bbd0e`) - replaced with human-readable titles derived from first user message

## [0.1.0] - 2026-08-24

### Added
- FastAPI backend with `/sessions`, `/messages`, `/artifacts`, `/health` routes
- NeonDB Postgres schema: `sessions`, `messages`, `artifacts`, `transcript_chunks` (pgvector)
- `ingest.py` - one-off idempotent transcript ingestion script (269 episodes, sentence-transformers embeddings)
- Pi Coding Agent service (Node.js) with `POST /agent/generate` endpoint
- Provider rotation: Gemini → Groq → Ollama fallback chain
- Ship 30/30 essay system prompt (grounded in real Ship 30/30 framework principles)
- Artifact extraction from LLM output (```html / ```markdown fence detection)
- React frontend: session sidebar, chat thread, Artifact Viewer (sandboxed iframe + ReactMarkdown)
- Docker Compose: `api`, `agent-service`, `frontend` services
- `.env.example` with all required variables
- `meta_docs/` planning documents: PRD.md, TRD.md, design.md, architecture.md, plan.md, AI_rules.md
