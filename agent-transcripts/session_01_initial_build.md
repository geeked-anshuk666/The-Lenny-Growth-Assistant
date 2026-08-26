# Session 01 - Initial Scaffold: Docker Compose, FastAPI, Pi Agent Service, Ingestion Pipeline

**Date:** 2026-08-23  
**Focus:** Project bootstrap, Docker Compose multi-service setup, FastAPI schema, Pi agent wrapper, NeonDB connection, ingest pipeline skeleton

---

## Prompt 1 - Project bootstrap

> I want to build "The Lenny Growth Assistant" for an assignment. It needs: FastAPI backend, Pi Coding Agent as the agent layer, NeonDB Postgres with pgvector, React frontend, and Docker Compose to run everything. Start with the folder structure and docker-compose.yml.

**Agent action:** Scaffolded the following project structure:

```
/
├── api/                   (FastAPI, Python 3.11)
├── agent-service/         (Node.js 22, TypeScript, pi-agent-core)
├── frontend/              (React 18 + Vite + TypeScript)
├── episodes/              (transcript corpus - not yet populated)
├── docker-compose.yml
├── .env.example
```

**docker-compose.yml created** with three services:
- `api` — builds `api/Dockerfile`, exposes `:8000`
- `agent-service` — builds `agent-service/Dockerfile`, internal network only, exposes `:3000`
- `frontend` — builds `frontend/Dockerfile`, exposes `:5173`

**Key decision logged:** Agent Service deliberately placed on an internal Docker network with no public port exposure. Only `api` talks to it via `http://agent-service:3000`. Evaluator cannot reach agent service directly from outside Docker.

---

## Prompt 2 - FastAPI schema and database models

> Build the FastAPI backend with sessions, messages, artifacts tables in Postgres. Use SQLAlchemy async. Sessions need a UUID primary key, messages need session_id FK, role, content, timestamps. Add a health endpoint.

**Files created:**
- `api/database.py` — SQLAlchemy async engine targeting `NEON_DATABASE_URL`, `SessionModel` (UUID PK, `metadata_` JSONB), `MessageModel` (session FK, role, content, timestamp), `ArtifactModel` (session FK, type, content)
- `api/main.py` — `POST /sessions`, `GET /sessions`, `GET /sessions/{id}/messages`, `DELETE /sessions/{id}`, `GET /health`

**Health endpoint design:**
```python
@app.get("/health")
async def health():
    # Checks: DB connectivity, embeddings model loaded
    return {"status": "ok", "database": "connected", "embeddings_model": "loaded"}
```

**Failed attempt logged:** First `docker compose up` failed — `asyncpg` driver not in requirements.txt. Added `asyncpg`, `greenlet`, `sqlalchemy[asyncio]` and rebuilt.

---

## Prompt 3 - Pi Agent Service wrapper

> Create the Node.js agent service that wraps pi-agent-core. It should receive {messages, context, provider, model_override} on POST /agent/generate and return {text, provider_used}.

**Files created:**
- `agent-service/src/index.ts` — Express server, `POST /agent/generate` handler
- `agent-service/package.json` — `pi-ai`, `pi-agent-core`, `express`, `typescript` dependencies

**Pi agent integration:**
```typescript
import { Pi } from 'pi-agent-core';

const pi = new Pi({
  provider: process.env.LLM_PROVIDER || 'gemini',
  apiKey: process.env.GEMINI_API_KEY || '',
});

app.post('/agent/generate', async (req, res) => {
  const { messages, context, provider, model_override } = req.body;
  const result = await pi.generate({ messages, systemPrompt: buildSystemPrompt(context) });
  res.json({ text: result.text, provider_used: provider });
});
```

**Failed attempt logged:** `pi-agent-core` import path differed from `pi-ai`. Spent 20 minutes reading the Pi docs. Correct import is `import { createAgent } from 'pi-agent-core'`. Fixed.

---

## Prompt 4 - NeonDB pgvector table for transcript chunks

> Add a transcript_chunks table with a 384-dimensional pgvector column for embeddings, plus guest, chunk_text, source_title, source_url, timestamp_seconds columns.

**Migration added to `api/database.py`:**
```python
class TranscriptChunkModel(Base):
    __tablename__ = "transcript_chunks"
    id = Column(Integer, primary_key=True)
    guest = Column(String, index=True)
    chunk_text = Column(Text)
    source_title = Column(String)
    source_url = Column(String)   # youtube_url?t=seconds
    timestamp_seconds = Column(Integer)
    keywords = Column(ARRAY(String))
    embedding = mapped_column(Vector(384))
```

**`CREATE EXTENSION IF NOT EXISTS vector`** run manually on NeonDB console to enable pgvector.

---

## Prompt 5 - Ingestion script skeleton

> Build api/ingest.py that reads all episodes/{guest}/transcript.md files, parses frontmatter and transcript body, chunks them into ~500 token windows preserving timestamps, embeds with sentence-transformers/all-MiniLM-L6-v2, and inserts into transcript_chunks.

**`api/ingest.py` created:**
- Reads `YAML` frontmatter (`guest`, `title`, `youtube_url`, `video_id`, `duration`, `keywords`)
- Parses speaker-turn lines with timestamp regex `r'^(.+?) \((\d{2}:\d{2}:\d{2})\):'`
- Groups consecutive turns into ~500-800 token chunks, preserving the **first timestamp** of each chunk
- Converts `HH:MM:SS` to integer seconds for `youtube_url?t=N` deep-link construction
- Embeds each chunk via `SentenceTransformer('all-MiniLM-L6-v2')`
- Bulk-inserts via `asyncpg`

**Ingestion run result:** 269 episodes → 4,712 chunks inserted in ~8 minutes on first run.

---

## Prompt 6 - Verify containers start cleanly

> Run docker compose up --build -d and tell me what you see.

**Agent action:** Ran build. All three containers started. Verified:
- `api` health: `GET http://localhost:8000/health` → `{"status": "ok", "database": "connected", "embeddings_model": "loaded"}`
- `agent-service` health: `GET http://localhost:3000/health` → `{"status": "ok"}`
- `frontend`: Vite dev server responding on `:5173`

**Session outcome:** Full scaffold running end-to-end. Ingestion complete. Ready for RAG retrieval in Session 02.
