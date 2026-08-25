# The Lenny Growth Assistant

> A grounded conversational assistant over Lenny's Podcast transcripts (269 episodes). Answers product/growth questions with timestamped citations linking to the exact YouTube moment, generates Ship 30/30-style essays, and produces Markdown/HTML artifacts rendered in a sandboxed in-app viewer.

## What it does

- **Grounded Q&A** — All answers cite exact episode + clickable timestamped YouTube links. The assistant explicitly declines when no transcript content supports the question — zero hallucination mode.
- **Ship 30/30 Essay Generation** — Transforms any topic covered in the corpus into a ~1,250-word skimmable essay following the Ship 30 for 30 framework (headline formula, wheel-and-spoke structure, concrete closing takeaway).
- **Artifact Viewer** — Markdown summaries and self-contained HTML cards rendered in a sandboxed side pane, downloadable as files.
- **Multi-provider LLM toggle** — Switch between Google Gemini, Groq (cloud), and Ollama (local) with per-provider dynamic model selection, live from the UI. No restart needed.
- **Session persistence** — All chats stored in NeonDB Postgres; sessions survive page reloads.

## Why this stack

| Choice | Reason |
|---|---|
| **FastAPI** | Required by the brief |
| **Pi Coding Agent** (`pi-ai` + `pi-agent-core`) | Named alternative to Claude Agent SDK in the brief; natively multi-provider (Gemini, Groq, Ollama) without a translation proxy |
| **Gemini + Groq + Ollama** | Genuinely free tiers, no credit card required (Anthropic/OpenAI require billing — see PRD.md §2 Assumptions) |
| **NeonDB** | Same category as Supabase/Railway (brief says "you may use"); free managed Postgres + pgvector, no card |
| **Local sentence-transformers embeddings** | Offline, zero rate-limits, ~80 MB model |

## Prerequisites

| Dependency | Notes |
|---|---|
| **Docker + Docker Compose** | Required to run `api`, `agent-service`, and `frontend` containers |
| **Node.js 22.12+** | For local development of `agent-service` and `frontend` |
| **Ollama** | Install from [ollama.com](https://ollama.com) — runs as a host-level process (not containerized — GPU passthrough in Docker is unreliable for demos) |
| **NeonDB project** | Free at [neon.tech](https://neon.tech) — no payment required. Enable the `pgvector` extension in your project. |
| **Google AI Studio API key** | Free at [aistudio.google.com](https://aistudio.google.com) — no payment required |
| **Groq API key** | Free at [console.groq.com](https://console.groq.com) — no payment required |

## Setup

### 1. Clone and configure

```bash
git clone <repo-url>
cd The-Lenny-Growth-Assistant

# Copy the example env and fill in your credentials
cp .env.example .env
```

Edit `.env` and set:

```env
NEON_DATABASE_URL=postgresql+asyncpg://<user>:<password>@<host>/<db>?sslmode=require
GEMINI_API_KEY=your_key_here
GROQ_API_KEY=your_key_here
OLLAMA_BASE_URL=http://localhost:11434   # or http://host.docker.internal:11434 inside Docker
OLLAMA_MODEL=qwen2.5:3b
GEMINI_MODEL=gemini-2.0-flash-lite
GROQ_MODEL=openai/gpt-oss-120b
LLM_PROVIDER=gemini
LLM_PROVIDER_FALLBACK=ollama
```

### 2. Pull the Ollama model

```bash
ollama pull qwen2.5:3b
```

### 3. Ingest transcripts into NeonDB

```bash
# First time only — populates the transcript_chunks table
cd api
python -m venv venv
venv\Scripts\activate       # Windows
# source venv/bin/activate  # macOS/Linux
pip install -r requirements.txt
python ingest.py
```

The ingestion script is idempotent — safe to re-run (skips already-ingested episodes).

### 4. Start the full stack

**Option A — Docker Compose (recommended)**

```bash
# From the repo root
docker compose up --build
```

Services started:
- `api` → http://localhost:8000
- `agent-service` → http://localhost:3000 (internal only)
- `frontend` → http://localhost:5173

**Option B — Local development (3 terminals)**

```bash
# Terminal 1: FastAPI backend
cd api
venv\Scripts\activate
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload

# Terminal 2: Agent service
cd agent-service
npm install
npm run dev

# Terminal 3: Frontend
cd frontend
npm install
npm run dev
```

### 5. Verify health

```bash
curl http://localhost:8000/health
# Expected: {"status": "ok", "database": "connected", "embeddings_model": "loaded"}

curl http://localhost:3000/health
# Expected: {"status": "ok", ...}
```

### 6. Open the app

Navigate to **http://localhost:5173** in your browser.

## Running tests

```bash
cd api
venv\Scripts\activate
pip install pytest pytest-asyncio httpx
pytest tests/ -v
```

The test suite covers:
- Session creation and persistence
- RAG retrieval (grounded answer with citation)
- Hallucination guardrail (no-context question → explicit decline)
- Provider fallback routing
- Artifact extraction

See `docs/testing_strategy.md` for the full test plan.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `database: disconnected` in `/health` | Check `NEON_DATABASE_URL` in `.env`; ensure NeonDB project is active |
| `embeddings_model: unloaded` in `/health` | `pip install sentence-transformers` in your venv; first load may take ~60s |
| No answers / empty context | Run `python ingest.py` — the `transcript_chunks` table may be empty |
| Ollama timeout | Ensure Ollama is running (`ollama serve`) and the model is pulled (`ollama pull qwen2.5:3b`) |
| Groq rate limit warning in UI | The UI will auto-switch to a fallback model and show an amber banner — this is expected behaviour on free tier |
| Docker Ollama connectivity | Set `OLLAMA_BASE_URL=http://host.docker.internal:11434` in `.env` for Docker containers to reach the host Ollama |

## Project structure

```
├── api/                    # FastAPI backend (Python)
│   ├── main.py             # Routes: /sessions, /messages, /artifacts, /health, /provider/models
│   ├── database.py         # SQLAlchemy models + NeonDB async connection
│   ├── ingest.py           # One-off transcript ingestion + embedding script
│   └── requirements.txt
├── agent-service/          # Pi Coding Agent wrapper (Node.js)
│   └── src/index.ts        # /agent/generate + /provider/models + /health
├── frontend/               # React 18 + Vite + TypeScript
│   └── src/App.tsx         # Chat UI, provider/model selector, Artifact Viewer
├── episodes/               # 269 Lenny's Podcast transcript files (source corpus)
├── agent-transcripts/      # Raw coding-agent session logs (secrets scrubbed)
├── docs/                   # Implementation-facing docs
├── docker-compose.yml      # One-command startup
├── .env.example            # Safe credential template
├── README.md               # This file
├── PRD.md                  # Product Requirements Document
├── design.md               # UI/UX design spec
└── architecture.md         # System architecture
```

## Key deliverables (per assignment brief)

| File | Status |
|---|---|
| `README.md` | ✅ This file |
| `PRD.md` | ✅ `PRD.md` (also in `meta_docs/`) |
| `design.md` | ✅ `design.md` (also in `meta_docs/`) |
| `architecture.md` | ✅ `architecture.md` (also in `meta_docs/`) |
| `agent-transcripts/` | ✅ Raw session logs, secrets scrubbed |
| Tests | ✅ `api/tests/` — automated + manual UI test plan |
| Demo video | 📹 See `agent-transcripts/demo_notes.md` |
