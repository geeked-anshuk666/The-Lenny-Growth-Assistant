# architecture.md — The Lenny Growth Assistant

## 1. System diagram

```mermaid
flowchart LR
    U[User Browser] --> FE[React Frontend<br/>Chat + Artifact Viewer]
    FE -->|REST| API[FastAPI Backend<br/>:8000]
    API -->|internal HTTP| AGENT[Pi Agent Service<br/>Node.js :3000]
    AGENT -->|cloud| GEMINI[Google AI Studio<br/>gemini-2.0-flash-lite]
    AGENT -->|cloud| GROQ[Groq<br/>openai/gpt-oss-120b]
    AGENT -->|local| OLLAMA[Ollama Runtime<br/>qwen2.5:3b]
    API --> RAG[Retrieval Module]
    RAG --> EMB[sentence-transformers<br/>all-MiniLM-L6-v2]
    RAG --> PGV[(NeonDB Postgres + pgvector<br/>transcript_chunks)]
    API --> DB[(NeonDB Postgres<br/>sessions, messages, artifacts)]
    API --> ARTIFACT[Artifact Extractor]
    ARTIFACT --> FE
    FE -->|GET /provider/models| API
    API -->|proxy| AGENT
```

## 2. Component boundaries

- **Frontend (React 18 + Vite + TypeScript):** chat UI, session list,
  two-level provider/model selector (live-fetched from `/provider/models`),
  Artifact Viewer (sandboxed iframe for HTML, ReactMarkdown for MD).
  Rate-limit warning banner with auto-dismiss. All sessions, messages, and
  artifacts fetched from FastAPI over REST.
- **API (FastAPI):** `/sessions`, `/messages`, `/artifacts`, `/health`,
  `/provider/models` routes. Pydantic validation. Orchestrates retrieval +
  calls the agent service; contains no LLM-calling logic itself.
- **Agent service (Node.js, internal only):** thin HTTP wrapper around
  `pi-agent-core`. Receives `{messages, context, provider, model_override}`,
  returns `{text, provider_used, model_used, rate_limited, fallback_model,
  artifact}`. Provider selection via `pi-ai`'s unified interface — Gemini,
  Groq, or Ollama. Also exposes `GET /provider/models?provider=X` which
  fetches live model lists from each provider's API.
  **Never exposed to the public internet** — only reachable from the
  FastAPI container on the internal Docker network.
- **Retrieval module (in FastAPI):** chunking/embedding at ingestion time
  (offline script), cosine similarity search at query time via pgvector,
  returns chunks + full source metadata (guest, title, `youtube_url`,
  timestamp) for citation.
- **Artifact extractor (in FastAPI → agent service):** parses
  ` ```html ` / ` ```markdown ` fences from LLM output, persists as
  `ArtifactModel`, returns to frontend for side-pane rendering.
- **Persistence:** NeonDB Postgres — `sessions`, `messages`, `artifacts`,
  `transcript_chunks` (384-dim pgvector column).

## 3. Ingestion / retrieval flow

1. Clone/read `episodes/{guest}/transcript.md` (269 files). Parse YAML
   frontmatter (`guest`, `title`, `youtube_url`, `video_id`,
   `publish_date`, `duration`, `keywords`) and the transcript body.
2. Transcript body has per-speaker-turn timestamps
   (`Speaker Name (HH:MM:SS):`). Chunk by grouping consecutive turns into
   ~500–800 token windows, preserving the **first timestamp in each
   chunk** so a citation can link to `youtube_url&t=<seconds>` — an exact
   moment, not just the episode.
3. Embed each chunk locally via `sentence-transformers/all-MiniLM-L6-v2`,
   store in `transcript_chunks` with `source_title`, `source_url`
   (timestamped), `guest`, `keywords` (reused from frontmatter).
4. Query time: embed the user question with the same model, top-k
   similarity search in pgvector, return chunks + metadata to the agent
   service as context.
5. Agent is instructed (system prompt) to answer only from provided
   context and cite `source_title` + timestamped `source_url` per claim.
   If top-k similarity is below a threshold, respond that the corpus
   doesn't cover the question — never fabricate.
6. Re-ingestion = re-running `python ingest.py` manually. No live
   refresh pipeline (see PRD.md assumptions).

## 4. Agent routing (Pi-based, multi-provider)

- `pi-ai` natively supports Gemini, Groq, and Ollama — no custom
  provider-adapter code needed, no translation proxy.
- Config value (`LLM_PROVIDER=gemini|groq|ollama`) selects the active
  provider; `LLM_PROVIDER_FALLBACK` is used automatically if the primary
  fails (logged as a structured warning).
- Per-request `model_override` lets the UI send a specific model ID chosen
  by the user — the agent service respects this for the primary provider
  and falls back to provider defaults on rotation.
- Ship 30/30 essay generation is a distinct **skill**: its own system
  prompt (built from the real Ship 30/30 framework, see `meta_docs/AI_rules.md §2`)
  plus output validators for word count (~1,250) and heading/hook
  presence — not folded into the general chat prompt.
- Artifact generation: LLM wraps output in ` ```html ` or ` ```markdown `
  fences; the agent service detects this regex and returns the extracted
  content as a typed `artifact` field.

## 5. Model toggle behavior

- Provider selector in UI → triggers `GET /provider/models?provider=X` →
  FastAPI proxies to agent service → agent service queries live provider
  API → returns `{models: [{id, label}]}` → UI populates model dropdown.
- If the primary provider is unreachable/errors → agent service falls
  back per `LLM_PROVIDER_FALLBACK`, logs a structured warning, and the
  API response includes `rate_limited: true`, `fallback_model` — UI shows
  amber banner and updates selected model state.
- UI provider badge reads the *actual* serving provider off each
  response — not the configured default — so a fallback mid-demo is shown
  honestly, not hidden.

## 6. Security (artifact rendering — the one security topic the brief asks for)

- Generated HTML renders inside a **sandboxed iframe**
  (`sandbox="allow-same-origin"` only — no `allow-scripts`), so no
  JavaScript from generated content executes.
- Markdown renders via `react-markdown` with `remarkGfm`. HTML pass-through
  is not enabled, preventing script injection through Markdown.
- Standard API-level validation (Pydantic schemas, parameterized ORM
  queries via SQLAlchemy) covers injection risk for persistence.
- No broader security program — see TRD.md §3 for why that's explicitly
  out of scope.

## 7. Deployment topology

```
┌─── Docker Compose ──────────────────────────────────────┐
│  api (FastAPI :8000)                                     │
│  agent-service (Node.js :3000) ← internal network only  │
│  frontend (Vite :5173)                                   │
└──────────────────────────────────────────────────────────┘
       ↓ external dependencies (host-level, documented)
  NeonDB (remote managed Postgres + pgvector)
  Ollama (host process, GPU passthrough unreliable in Docker)
```

Docker Compose passes `GEMINI_API_KEY`, `GROQ_API_KEY`, `GROQ_MODEL`,
`GEMINI_MODEL`, `OLLAMA_BASE_URL`, `OLLAMA_MODEL`, `NEON_DATABASE_URL`,
`LLM_PROVIDER`, `LLM_PROVIDER_FALLBACK` from the root `.env` file to
each container via `environment:` blocks.
