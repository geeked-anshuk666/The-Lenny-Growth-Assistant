# Changelog

All notable changes to The Lenny Growth Assistant are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Added
- Multi-stage `api/Dockerfile` — builder stage installs deps + pre-downloads sentence-transformers into a venv; runner stage copies only venv + app code into a clean `python:3.11-slim` image
- Multi-stage `agent-service/Dockerfile` — builder compiles TypeScript; runner uses `npm ci --omit=dev` so `ts-node-dev`, `typescript`, and all `@types/*` packages are excluded from production
- Multi-stage `frontend/Dockerfile` — builder runs `vite build`; runner is `nginx:1.27-alpine` serving static assets (~25MB final image vs ~600MB dev server)
- `frontend/nginx.conf` — SPA routing fallback (`try_files $uri /index.html`) + 1-year `Cache-Control: immutable` for Vite hashed asset filenames
- `api/.dockerignore`, `agent-service/.dockerignore`, `frontend/.dockerignore` — exclude `node_modules/`, `venv/`, `.env`, `__pycache__/`, `tests/` from build context (context drops from ~1GB → <10MB)
- `VITE_API_URL` build-arg in `docker-compose.yml` frontend service for override at build time
- `.private_docs/Optimizations.md` — full historical log of every optimization applied across all project phases

- `GET /provider/models?provider=X` endpoint in `agent-service` — proxies live model lists from Gemini, Groq, and Ollama APIs
- `GET /provider/models` FastAPI proxy endpoint — forwards to agent-service so frontend only needs one backend origin
- Dynamic per-provider model dropdown in `frontend/src/App.tsx` — fetches live model list on provider change, spins while loading
- Rate-limit warning banner in frontend — amber dismissible banner shown when `rate_limited: true` in API response; auto-dismisses after 6s and updates selected model state
- `model_override` field in `MessageCreate` Pydantic schema — lets frontend send a specific model ID per request
- `model_used`, `rate_limited`, `fallback_model` fields in `/agent/generate` response body
- `GROQ_MODEL` and `GEMINI_MODEL` env variables in `.env` and `.env.example` for explicit model pinning
- `agent-transcripts/` directory with session logs and demo notes (required deliverable)
- Root-level `README.md`, `PRD.md`, `design.md`, `architecture.md` (required assignment deliverables)
- Automated test suite in `api/tests/` covering sessions, RAG retrieval, hallucination guardrail, provider routing, artifact extraction
- Manual UI test plan at `docs/manual_test_plan.md`
- `CHANGELOG.md` (this file)

### Changed
- `OLLAMA_MODEL` default changed from `llama3.2:3b-instruct-q4_K_M` → `qwen2.5:3b` across `.env.example`, `docker-compose.yml`, `agent-service/src/index.ts`, and docs
- `GROQ_MODEL` default changed from deprecated `llama-3.1-8b-instant` → `openai/gpt-oss-120b`
- Provider dropdown labels updated from "Groq Llama-3.1" / "Ollama Llama-3.2" → "Google Gemini" / "Groq Cloud" / "Local (Ollama)"
- `useEffect` in `App.tsx` now depends on `activeSession?.id` (not full object) — prevents duplicate API calls on session switch
- Added `activeSessionIdRef` stale-fetch guard — discards responses completing after session has already changed
- `generateLLMResponseWithRotation` in `agent-service` now accepts and threads `modelOverride` — only overrides primary provider, fallbacks use their defaults

### Fixed
- PyTorch CUDA download bloat & timeout in Docker build — `api/Dockerfile` now explicitly pre-installs CPU-only PyTorch (`torch --index-url https://download.pytorch.org/whl/cpu`), reducing Python dependency download size from ~2.5GB (CUDA wheels) to ~180MB (CPU wheel) and fixing long build timeouts
- TypeScript compilation error in `agent-service` build stage — defined a strict `LLMResponse` interface containing the dynamic `rateLimited` and `fallbackModel` fields so the `tsc` compiler successfully verifies the build output
- Session switch triggering duplicate `/messages` + `/artifacts` API calls (useEffect dependency bug)
- Ingest parser failing to parse transcripts without explicit `Speaker (HH:MM:SS):` prefix — regex upgraded to match both formats
- FastAPI `ForeignKeyViolationError` crash when posting messages with new session IDs — added auto-session creation check
- `gemini-3.5-flash-lite` model name (does not exist) → corrected to `gemini-2.0-flash-lite`
- Ollama warmup in `agent-service` using stale llama model name — now reads from `OLLAMA_MODEL` env var

## [0.1.0] — 2026-08-24

### Added
- FastAPI backend with `/sessions`, `/messages`, `/artifacts`, `/health` routes
- NeonDB Postgres schema: `sessions`, `messages`, `artifacts`, `transcript_chunks` (pgvector)
- `ingest.py` — one-off idempotent transcript ingestion script (269 episodes, sentence-transformers embeddings)
- Pi Coding Agent service (Node.js) with `POST /agent/generate` endpoint
- Provider rotation: Gemini → Groq → Ollama fallback chain
- Ship 30/30 essay system prompt (grounded in real Ship 30/30 framework principles)
- Artifact extraction from LLM output (```html / ```markdown fence detection)
- React frontend: session sidebar, chat thread, Artifact Viewer (sandboxed iframe + ReactMarkdown)
- Docker Compose: `api`, `agent-service`, `frontend` services
- `.env.example` with all required variables
- `meta_docs/` planning documents: PRD.md, TRD.md, design.md, architecture.md, plan.md, AI_rules.md
