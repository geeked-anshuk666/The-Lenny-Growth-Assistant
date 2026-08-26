# The Lenny Growth Assistant

> A grounded conversational assistant over Lenny's Podcast transcripts (269 episodes). Answers product/growth questions with timestamped citations linking to the exact YouTube moment, generates Ship 30/30-style essays, and produces Markdown/HTML artifacts rendered in a sandboxed in-app viewer.

## What it does

- **Grounded Q&A** — All answers cite exact episode + clickable timestamped YouTube links. The assistant explicitly declines when no transcript content supports the question — zero hallucination mode.
- **Ship 30/30 Essay Generation** — Transforms any topic covered in the corpus into a ~1,250-word skimmable essay following the Ship 30 for 30 framework (headline formula, wheel-and-spoke structure, concrete closing takeaway).
- **Artifact Viewer** — Markdown summaries and self-contained HTML cards rendered in a sandboxed side pane, downloadable as files.
- **Multi-provider LLM toggle** — Switch between Google Gemini, Groq (cloud), and Ollama (local) with per-provider dynamic model selection, live from the UI. No restart needed.
- **Session persistence** — All chats stored in NeonDB Postgres; sessions survive page reloads.

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
| **Ollama** | Install from [ollama.com](https://ollama.com) — runs as a host-level process |
| **NeonDB project** | Free at [neon.tech](https://neon.tech) — enable the `pgvector` extension |
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
| No answers / empty context | Run `python ingest.py` — the `transcript_chunks` table may be empty |
| Ollama timeout | Ensure Ollama is running (`ollama serve`) and the model is pulled (`ollama pull qwen2.5:3b`) |
| Groq rate limit warning in UI | The UI will auto-switch to a fallback model and show an amber banner |
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
