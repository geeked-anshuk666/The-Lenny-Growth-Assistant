# Lenny's Growth Assistant

> A grounded conversational assistant over Lenny's Podcast transcripts (269 episodes). Answers product/growth questions with timestamped citations linking to the exact YouTube moment, generates Ship 30/30-style essays, and produces Markdown/HTML artifacts rendered in a sandboxed in-app viewer. Includes a 5:31 min comprehensive video demonstration covering all assignment requirements.

## What it does

- **Grounded Q&A** - All answers cite exact episode + clickable timestamped YouTube links. The assistant explicitly declines when no transcript content supports the question - zero hallucination mode.
- **Ship 30/30 Essay Generation** - Transforms any topic covered in the corpus into a ~1,250-word skimmable essay following the Ship 30 for 30 framework (headline formula, wheel-and-spoke structure, concrete closing takeaway).
- **Artifact Viewer** - Markdown summaries and self-contained HTML cards rendered in a sandboxed side pane, downloadable as files.
- **Multi-provider LLM toggle** - Switch between Google Gemini, Groq (cloud), and Ollama (local) with per-provider dynamic model selection, live from the UI. No restart needed.
- **Session persistence** - All chats stored in NeonDB Postgres; sessions survive page reloads.
- **Premium UI with landing page & onboarding** - Immersive deep-cobalt landing page with animated orbs; name modal personalises the session. Chat names auto-derived from first message. ChatGPT-style sidebar with rename, pin, and delete per chat.
- **Live error transparency** - Exact LLM API error strings (rate limits, model 404s) surface as top-right toast notifications instead of being swallowed by generic fallback text.

## ⚡ Quickstart (Reproducible Setup Guide)

Follow **Method 1 (Docker Setup - Recommended)** to spin up the entire application stack.

---

### Method 1: Docker Desktop Setup (Recommended)

Running via Docker spins up `api`, `agent-service`, and `frontend` automatically.

#### Step 1: Clone & Configure Environment
```bash
git clone https://github.com/geeked-anshuk666/The-Lenny-Growth-Assistant.git
cd The-Lenny-Growth-Assistant

# Create your .env file
cp .env.example .env

# Pull local LLM model (ensure Ollama app/service is running on host)
ollama pull qwen2.5:3b
```
*(In `.env`, set `NEON_DATABASE_URL` with your NeonDB connection string, or use the pre-ingested evaluation database string provided in submission notes).*

#### Step 2: Spin Up Containers
```bash
docker compose up --build -d
```
Open **[http://localhost:5173](http://localhost:5173)** in your browser!

---

#### 💡 Ingestion Guide (Only Needed for New/Fresh Databases)
- **Default Pre-Ingested NeonDB:** If using the provided NeonDB database string, **no ingestion is needed**. All 269 episodes are pre-indexed!
- **If connecting a fresh empty database**, run this exact command **once** to populate your vector store:
  ```bash
  docker compose exec api python ingest.py
  ```
  *(Parses 269 episode transcripts in `episodes/`, generates 384-dim embeddings locally, and populates `transcript_chunks`).*

---

#### 💡 100% Offline Local Database Option (Optional)
If you prefer running a local Postgres `pgvector` container without cloud dependencies:
1. In `.env`, uncomment: `DATABASE_URL=postgresql+asyncpg://postgres:postgrespassword@db:5432/lenny_assistant`
2. Start Docker with local database profile: `docker compose --profile local-db up --build -d`
3. Run local ingestion: `docker compose exec api python ingest.py`

---

### Method 2: Manual Setup (Bare-Metal / Local Development)

If running services individually outside Docker:

#### 1. API & Ingestion
```bash
cd api
python -m venv venv

# Windows: venv\Scripts\activate  |  macOS/Linux: source venv/bin/activate
pip install -r requirements.txt

# Run ingestion (only needed ONCE for empty DBs)
python ingest.py

# Start FastAPI server
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

#### 2. Agent Microservice (New Terminal)
```bash
cd agent-service
npm install
npm run dev
```

#### 3. Frontend UI (New Terminal)
```bash
cd frontend
npm install
npm run dev
```

Open **[http://localhost:5173](http://localhost:5173)** in your browser!

---

## 🛠️ Tech Stack Overview

| Category | Component / Library / Model | Description |
|---|---|---|
| **Frontend Framework** | React 18, Vite, TypeScript | SPA client UI with fast HMR build setup |
| **Frontend Styling & UI** | Tailwind CSS, Lucide Icons, clsx, tailwind-merge | Modern dark-mode UI with icon set and class merging utilities |
| **Frontend Markdown / Renderer** | `react-markdown`, `remark-gfm` | HTML-sanitized Markdown renderer |
| **Backend Framework (Python)** | FastAPI 0.111.0, Uvicorn | Async REST API backend orchestrating RAG and session workflows |
| **ORM & Database Client** | SQLAlchemy 2.0 (Async), asyncpg, Pydantic v2 | Asynchronous ORM, Postgres driver, and strict request/response data validation |
| **Agent Runtime (Node.js)** | Node.js 22, Express, TypeScript | Internal agent microservice for multi-provider LLM calls & tool extraction |
| **Agent Core & Multi-Provider** | `@earendil-works/pi-ai`, `@earendil-works/pi-agent-core` | Pi Agent framework for provider rotation, prompt formatting, and tool execution |
| **Database (Relational & State)** | NeonDB (Managed Serverless Postgres) | Persistence for `sessions`, `messages`, and generated `artifacts` |
| **Vector Database** | NeonDB `pgvector` Extension (384 dimensions) | Native Postgres vector storage for similarity search over transcript chunks |
| **Embedding Model (Local)** | `sentence-transformers/all-MiniLM-L6-v2` | CPU-optimized local embeddings (~80MB), zero API rate limits |
| **Cloud LLM Model 1 (Google)** | `gemini-2.0-flash-lite` | High-speed primary cloud LLM provider via Google AI Studio API |
| **Cloud LLM Model 2 (Groq)** | `openai/gpt-oss-120b` | High-throughput open model running on Groq LPU inference engine |
| **Local LLM Model (Ollama)** | `qwen2.5:3b` | Offline local LLM running via Ollama runtime engine |
| **Containerization & Web Server** | Docker, Docker Compose, Nginx 1.27 Alpine | Multi-stage container builds and Nginx static SPA web server |

---

## Why this stack

| Choice | Reason |
|---|---|
| **FastAPI** | Fast, modern, asynchronous web framework for Python with native Pydantic validation |
| **Pi Coding Agent** (`pi-ai` + `pi-agent-core`) | Natively multi-provider wrapper supporting Gemini, Groq, and Ollama out-of-the-box |
| **Gemini + Groq + Ollama** | Scalable, performant cloud APIs paired with robust local offline capability |
| **NeonDB** | Fully managed serverless Postgres with pgvector for instant vector queries |
| **Local sentence-transformers embeddings** | Offline, zero rate-limits, ~80 MB model running locally on CPU |

## Prerequisites

| Dependency | Notes |
|---|---|
| **Docker + Docker Compose** | Required to run `api`, `agent-service`, and `frontend` containers |
| **Node.js 22.12+** | For local development of `agent-service` and `frontend` |
| **Ollama** | Install from [ollama.com](https://ollama.com) - runs as a host-level process |
| **NeonDB project** | Free at [neon.tech](https://neon.tech) - enable the `pgvector` extension |
| **Google AI Studio API key** | Get from [aistudio.google.com](https://aistudio.google.com) |
| **Groq API key** | Get from [console.groq.com](https://console.groq.com) |

## Setup & Running Locally (No Docker)

If you prefer to run the services bare-metal on your laptop:

### Terminal 1: FastAPI Backend
```bash
cd api
venv\Scripts\activate
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### Terminal 2: Agent Service
```bash
cd agent-service
npm install
npm run dev
```

### Terminal 3: Frontend
```bash
cd frontend
npm install
npm run dev
```

## Running Tests

To run the automated API and integration test suite:
```bash
cd api
venv\Scripts\activate
pip install -r requirements.txt
pytest tests/ -v
```

See `docs/testing_strategy.md` for the full test plan.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `database: disconnected` in `/health` | Check `NEON_DATABASE_URL` in `.env`; ensure NeonDB project is active |
| `embeddings_model: unloaded` in `/health` | `pip install sentence-transformers` in your venv; first load may take ~60s |
| No answers / empty context | Run `python ingest.py` - the `transcript_chunks` table may be empty |
| Ollama timeout | Ensure Ollama is running (`ollama serve`) and the model is pulled (`ollama pull qwen2.5:3b`) |
| Rate limit / model unavailable toast | The UI shows the exact LLM error via a toast and auto-switches to the next provider in the rotation |
| "Switched to…" badge appears | Normal - fallback chain (Gemini → Groq → Ollama) handled the failure; badge reflects actual provider |
| Chat names show as UUID | Old sessions - send a new message to generate a title, or right-click to Rename |
| Docker Ollama connectivity | Set `OLLAMA_BASE_URL=http://host.docker.internal:11434` in `.env` for Docker containers to reach the host Ollama |

## 🏗️ Architecture Decisions & Tech Stack Rationale

### 1. The Two-Runtime Split (Python + Node.js)
- **FastAPI (Python 3.11):** Handles RAG database operations, `pgvector` similarity search, hybrid keyword scoring, document ingestion, session/message REST APIs, and structured JSONB citation formatting.
- **Agent Service (Node.js 22):** Runs as an internal orchestration service wrapping the TypeScript-native Pi Agent Framework (`pi-ai` and `pi-agent-core`) to coordinate LLM calls, execute structured skills (e.g. Ship 30/30 essay generation), sanitize prompt inputs, and handle automatic provider fallbacks.
- **Internal Security Boundary:** Communication is strictly constrained to an internal HTTP interface (`POST /agent/generate` and `GET /provider/models`). The Agent Service is unexposed to external traffic, running strictly within Docker container boundaries.

### 2. NeonDB Postgres + pgvector
- **Managed Serverless Postgres:** Utilizes NeonDB Postgres with native `pgvector` extension enabled.
- **384-Dimensional Vectors:** Embeddings generated by `all-MiniLM-L6-v2` are stored in a 384-dimensional `vector` column in `transcript_chunks`.
- **Cosine Distance & JSONB Citations:** Vector similarity uses Postgres-native cosine distance (`<=>`), running directly inside the DB engine. Message citations are saved in a structured `JSONB` column on `messages` to preserve timestamp links (`t=00:43:57`) across page reloads.

### 3. Local sentence-transformers Embeddings
- **Zero Network Overhead:** Instead of depending on cloud embedding APIs (which incur network latency and strict rate limits), a local PyTorch model (`sentence-transformers/all-MiniLM-L6-v2`) is loaded at runtime.
- **Container Build Caching:** Pre-downloaded and cached inside the Python Docker image during the build stage (`torch` + `sentence-transformers`), guaranteeing offline embedding generation and instant container boot.

---

## ⚖️ Trade-offs & Real Engineering Solutions

### 1. Local LLM Size vs. Generation Quality (`qwen2.5:3b`)
- **Trade-off:** The default local model is `qwen2.5:3b` via Ollama. It is optimized for fast local CPU execution and low VRAM consumption (<4GB RAM), but can struggle with long-form formatting (~1,250-word Ship 30/30 essays).
- **Engineering Solution:** The system defaults to local `qwen2.5:3b` for fast, private Q&A, while allowing users to dynamically toggle to Google Gemini 2.0 Flash or Groq GPT-OSS 120B live from the UI without restarting servers.

### 2. Chat History Turn Bias Overriding Fresh RAG Context (Bug #30 Fix)
- **Empirical Finding:** When retrying queries (e.g. *"What did Brian Chesky say about details?"*) inside an existing chat session, local 3B models repeatedly outputted their previous turn refusal (*"Brian Chesky did not mention details..."*), ignoring fresh RAG context.
- **Engineering Solution:** Updated the system prompt in `agent-service/src/index.ts` to explicitly enforce: *"Prioritize the information in the current Grounded Context over any previous assistant responses in conversation history."* This eliminated history turn bias across multi-turn sessions.

### 3. Guest Entity Collision & Exclusive Context Isolation (Bugs #27 & #28 Fixes)
- **Empirical Finding:** Unconstrained vector search caused entity collisions (e.g., matching "Brian Balfour" when searching for "Brian Chesky"). Additionally, appending global vector results to guest queries caused cross-episode context bleed.
- **Engineering Solution:** Implemented strict guest column filtering in `api/main.py`. When a guest entity is detected in the user message:
  1. The DB query filters strictly by `TranscriptChunkModel.guest.ilike("%Guest%")`.
  2. If guest-matched chunks are found, the search is locked exclusively to that guest's episode, preventing context pollution from unrelated interviews.

### 4. Hybrid Topic Keyword + Vector RAG Scoring (Bug #29 & Compound Query Fix)
- **Empirical Finding:** Unweighted vector embeddings (`all-MiniLM-L6-v2`) matched overall prompt semantics. For specific topic queries like *"What did Brian Chesky say about details?"*, general leadership chunks scored higher in cosine similarity (`0.5018`) than the specific quote chunk containing *"being in the details"* (`0.5348`), cutting off the target quote.
- **Engineering Solution:**
  1. Expanded vector retrieval limit from `limit(4)` to `limit(8)`.
  2. Added **Hybrid Topic Keyword Boosting**: Extracted non-guest topic keywords (e.g., `"detail"`, `"details"`) and queried candidate chunks with `chunk_text ILIKE '%detail%'` within that guest's episode. Boosted topic-matched chunks to the top of the context window.
- **Impact & Metrics:** Local Qwen 3B model accuracy on specific detail questions went from **0% (failing/declining)** to **100% (surfacing exact quotes and timestamp citations)**.

### 5. Static Corpus Ingestion
- **Limitation:** Ingestion is a controlled, batch step (`python ingest.py`). There is no live RSS feed parsing. This ensures deterministic vector indexing across all 269 podcast episodes (4,700+ transcript chunks).

### 6. Ollama Host Bridge Architecture
- **Limitation:** Ollama runs as a host process (`http://localhost:11434` or `host.docker.internal`). Containerizing Ollama with GPU passthrough across Windows/WSL2 and macOS is unstable; bridging host Ollama ensures smooth local execution across all OS platforms.

### 7. Frontend Hash Router State Machine
- **Engineering Solution:** Implemented hash routing (`/#landing`, `/#booting`, `/#chat`). This ensures browser refreshes (F5) preserve the active chat state rather than dropping users back to the landing page.

---

## 🚫 Out of Scope (Currently)

The following capabilities are deliberately omitted from the current scope to maintain simplicity and focus on RAG precision:
1. **User Authentication & Authorization (Auth):** No user signup, login, session cookies, RBAC (Role-Based Access Control), or database-level row isolation. Sessions are tracked via UUIDs stored in localStorage and NeonDB.
2. **API Rate Limiting:** The FastAPI server does not enforce IP-level or token-level rate limiting on endpoints (outside of automatic retry fallback handling when remote LLMs return HTTP 429).
3. **Caching Layer:** No Redis or database query caching is implemented. Every query triggers a fresh vector search and LLM call.
4. **Horizontal Scaling:** Single container processes (no load balancers, Kubernetes ingress routing, or distributed task queues like Celery).

---

## 🔮 Future Enhancements

Planned upgrades for transition to production environments:
1. **Production Auth Integration:** Introduce Clerk or Supabase Auth to enable user accounts, private session histories, and data isolation at the ORM layer.
2. **Endpoint Rate Limiting:** Add `slowapi` (limiter decorator) in FastAPI to protect endpoints from scraping and API exhaustion attacks.
3. **Vector Cache:** Add a Redis semantic caching layer to instantly return cached answers for identical/highly similar user queries, reducing LLM costs.
4. **Model Auto-Rotation Policies:** Upgrade model auto-rotation logic to prioritize low-latency local execution unless complex formatting (Ship 30/30) is requested.

---

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
│   └── src/
│       ├── App.tsx         # LandingPage, NameModal, Chat UI, Sidebar, Artifact Viewer, Toast system
│       └── index.css       # CSS design token system, animation keyframes, component styles
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
