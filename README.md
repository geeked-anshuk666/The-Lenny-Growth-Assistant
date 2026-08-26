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

## ⚡ Quickstart (Copy-Paste Steps)

If you have **Docker Desktop** running and **Ollama** installed on your host machine, you can run the entire stack in 3 simple steps:

### 1. Setup Environment
```bash
# Clone the repository
git clone https://github.com/geeked-anshuk666/The-Lenny-Growth-Assistant.git
cd The-Lenny-Growth-Assistant

# Copy env template and pull model
cp .env.example .env
ollama pull qwen2.5:3b
```
*(Open `.env` and fill in your `NEON_DATABASE_URL`, `GEMINI_API_KEY`, and `GROQ_API_KEY`)*

### 2. Ingest transcripts into NeonDB
```bash
cd api
python -m venv venv
# On Windows:
venv\Scripts\activate
# On macOS/Linux:
# source venv/bin/activate

pip install -r requirements.txt
python ingest.py
cd ..
```

### 3. Spin up the App
```bash
docker compose up --build
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
To support the Pi Coding Agent engine (`pi-ai` and `pi-agent-core` which are TypeScript-native) while maintaining a FastAPI Python backend, the system is split into two runtimes.
- **FastAPI (Python):** Handles RAG database operations, document ingestion, session/message REST APIs, and citation formatting.
- **Agent Service (Node.js):** Runs as an internal service to coordinate LLM calls, tool execution, and provider fallbacks.
- **Internal Boundary:** Communication is restricted to a single internal HTTP boundary (`POST /agent/generate` and `GET /provider/models`). The Agent Service is never exposed to the public internet.

### 2. NeonDB Postgres + pgvector
- Managed serverless Postgres with native vector support.
- Embeddings are stored in a 384-dimensional `vector` column in `transcript_chunks`.
- Vector similarity uses Postgres-native cosine distance (`<=>`), running directly inside the DB engine for high performance.

### 3. Local sentence-transformers Embeddings
- Instead of using a cloud embedding API which introduces network latency and rate limits, a local `sentence-transformers/all-MiniLM-L6-v2` model is loaded at runtime.
- Pre-downloaded and cached inside the Python Docker image during the build stage to guarantee offline compatibility and instant container startup.

---

## ⚖️ Trade-offs & Known Limitations

### 1. Local LLM Size vs. Generation Quality (3B Model)
- **Trade-off:** The default local Ollama model is `qwen2.5:3b`. A 3B model is optimized for fast local CPU execution and low memory consumption (under 4GB RAM), but it can struggle with complex structuring tasks like generating full 1,250-word Ship 30/30 essays.
- **Recommendation:** For full quality compliance and essay length, use the cloud Gemini or Groq providers, or pull `qwen2.5:7b` if you have 8GB+ VRAM.

### 2. Static Corpus Ingestion
- **Limitation:** Ingestion is a one-off, manual step (`python ingest.py`). There is no live scraping or real-time RSS feed parsing. This is a deliberate simplification to focus on the retrieval, grounding, and citation engine.

### 3. Ollama GPU Passthrough in Docker
- **Limitation:** Ollama is left running as a host-level process (`http://localhost:11434` or bridged via `host.docker.internal`). Containerizing Ollama with GPU support across multiple operating systems (especially Windows/WSL2 and macOS) is highly unreliable for a portable demo setup.

### 4. Single-Tenant Session Model
- **Trade-off:** The project uses session-based tracking via client-side generated UUIDs. There is no user authentication, authorization, or database row-level security. This is optimized for quick local evaluation.

### 5. RAG Vector Search Limitation (Tuned Top-K Retrieval)
- **Limitation:** Standard vector-based RAG retrieves the top $N$ chunks closest to the embedded query vector. If a user asks a compound or highly specific query, slight semantic overlaps in unrelated transcript chunks can crowd out the target information if $N$ is too small.
- **Symptom Case:** Asking local models *"What did Brian Chesky say about leaders being in the details?"* originally failed with grounding declines.
- **Pinpointing:** We measured cosine distances locally for the query vs. database chunks. We found that the correct Brian Chesky chunk (containing the "details" quote) had a distance of `0.5348`, but other transcript chunks from Shreyas Doshi and Will Larson scored slightly closer (distances `0.5018` to `0.5233`) and occupied all 4 slots under the old `limit(4)` setting, cutting off the target chunk.
- **Fix:** We expanded the database retrieval limit to `limit(8)` in `api/main.py`. This ensures target chunks are successfully retrieved even when other topics have minor word overlaps.
- **Impact & Metrics:** local Qwen 3B model accuracy on specific detail questions went from **0% (failing to answer)** to **100% (fully correct, quoting Chesky's leadership views on details vs micromanagement)**.
- **Mitigation for Compound Prompts:** If a user combines two entirely unrelated topics in one query (e.g. *"Brian Chesky on details AND Dmitry Zlokazov on functional models"*), users should still split them to target clean query vectors.

---

## 🚫 Out of Scope (Currently)

The following capabilities are deliberately omitted from the current scope to maintain simplicity and focus on RAG precision:
1. **User Authentication & Authorization (Auth):** No user signup, login, session cookies, RBAC (Role-Based Access Control), or database-level row isolation.
2. **API Rate Limiting:** The FastAPI server does not enforce IP-level or token-level rate limiting on endpoints (outside of the fallback logic when handling remote LLM API provider 429 errors).
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
