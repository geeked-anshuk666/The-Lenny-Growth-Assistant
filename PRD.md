# PRD — The Lenny Growth Assistant

## 1. Discovery Brief

**Primary user:** A PM/growth practitioner who wants fast, trustworthy
answers to product/growth questions sourced from Lenny's Podcast, without
reading/searching hours of transcripts, and who wants to turn good answers
into shareable written content.

**Job to be done:** "Give me an answer I can trust is actually from Lenny's
Podcast, let me dig deeper with follow-ups, and let me turn the good stuff
into a polished essay or artifact — without touching a prompt, a model
config, or a database."

**Pain removed:** manual transcript search; manual reformatting into
shareable content; not knowing whether an AI answer is actually grounded.

**Success metric (primary, measurable):** ≥90% of assistant answers include
at least one verifiable transcript citation (episode + clickable
timestamp), and the assistant explicitly declines when no transcript
content supports the question — measured via the manual test plan.

**Secondary (operational):** p50 latency under 6s on local Ollama, under 3s
on cloud (Gemini/Groq).

## 2. Assumptions (brief was incomplete)

- **Transcript source:** the real repo (`geeked-anshuk666/lennys-podcast-transcripts`,
  forked from `ChatPRD/lennys-podcast-transcripts`) — 269 episodes, each
  `episodes/{guest-name}/transcript.md` with YAML frontmatter (`guest`,
  `title`, `youtube_url`, `video_id`, `publish_date`, `duration`,
  `keywords`) and a transcript body with **per-speaker-turn timestamps**
  (e.g. `Brian Chesky (00:00:00):`). This means citations can link to an
  exact moment in the YouTube video, not just the episode.
- **Cloud LLM provider:** the brief says "such as Anthropic Claude or
  OpenAI" (a soft example, not a hard requirement) and separately requires
  the agent layer to use "the Anthropic Claude Agent SDK or Pi Coding
  Agent" (a hard either/or). Both Anthropic and OpenAI require a credit
  card for billing, which is not available to the engineer (India, no
  card). Google AI Studio (Gemini) and Groq were used instead — both have
  genuinely free tiers with no payment method required. This satisfies the
  spirit of "flexible LLM configuration" fully, and the underlying
  provider abstraction (`pi-ai`) makes swapping in Anthropic/OpenAI later
  a one-line config change, not a code change.
- **Agent framework:** Pi Coding Agent (`pi-ai` + `pi-agent-core`) was
  chosen over the Claude Agent SDK because it is natively multi-provider
  (Anthropic, OpenAI, Google, Groq, Ollama, and more, out of the box) —
  the Claude Agent SDK only speaks Anthropic's API format and would need a
  translation proxy to work with free-tier providers, which is unnecessary
  complexity given Pi is an equally valid, explicitly named option in the
  brief.
- **Runtime split:** Pi is TypeScript-native (no official Python SDK). The
  agent layer runs as a small internal Node.js service; FastAPI remains
  the one public-facing API and calls this service over HTTP internally.
  This is a direct consequence of the brief naming a Python backend
  (FastAPI) and a TypeScript-only agent framework (Pi) — not
  over-engineering, just the minimum plumbing to satisfy both literally.
- **Database:** brief says "you may use Supabase or Railway" (optional,
  not mandatory). NeonDB (free-tier serverless Postgres, no card) was used
  instead — same category of managed Postgres, satisfies the requirement
  identically.
- **Embeddings:** a local `sentence-transformers` model is used instead of
  a cloud embedding API, so ingestion works fully offline and isn't rate
  limited. This is a small (~80MB) model, not a second heavyweight LLM.
- **Artifacts scope:** Markdown documents and self-contained HTML/CSS
  snippets, rendered in a sandboxed iframe. No JS execution inside
  generated artifacts (see Risks).
- **Single-tenant demo:** no login/auth system; a session = a generated
  session ID. Multi-user auth is out of scope (see Scope).

## 3. Scope

**In scope**
- FastAPI backend, session-scoped chat, Postgres (NeonDB) persistence
- RAG over the real 269-episode transcript corpus with timestamped
  citations linking to the exact YouTube moment
- Model toggle across Gemini / Groq / Ollama via Pi's unified provider API
- Dynamic per-provider model selection from live API model lists
- Ship 30/30-derived essay generation skill (~1,250 words)
- Markdown/HTML artifact generation + sandboxed in-app Artifact Viewer
- Docker Compose one-command startup (api, agent service, frontend; NeonDB
  and Ollama are external/host dependencies, documented as such)
- Structured logging, health endpoints, graceful degradation on missing
  keys / unavailable Ollama / empty retrieval / DB connection failure
- Automated tests (API, retrieval, routing, persistence) + manual UI test
  plan

**Out of scope (explicitly, with reason)**
- Multi-user auth/RBAC — single-tenant demo, not needed to prove the concept
- Horizontal scaling, caching layers, message queues — this is a graded
  take-home demo, not a production system under real traffic
- Live transcript scraping/refresh — static corpus (already 269 episodes)
  is sufficient to demonstrate ingestion → retrieval → citation; refresh =
  re-running the ingestion script manually
- Fine-tuning any model — prompting + retrieval is sufficient and more
  transferable to any provider
- CI/CD, blue-green/canary deploys — one-command local Docker Compose is
  the deployment bar the brief actually asks for

## 4. Key User Flows

1. New session → grounded question → retrieval → cited answer → follow-up
   preserving session context.
2. Question outside corpus coverage → explicit "not covered" response, no
   hallucination.
3. "Turn this into a Ship 30/30 essay" → essay skill invoked → ~1,250-word
   essay rendered in Artifact Viewer (not inline chat).
4. "Make me a markdown summary / HTML card" → Artifact Viewer opens beside
   chat, sandboxed rendering.
5. Provider toggle (Gemini/Groq/Ollama) + model selection → visible in UI
   header → next message served by new provider/model, no restart needed.
6. Rate limit hit → UI auto-switches to fallback model and shows warning
   banner.

## 5. Acceptance Criteria

- [x] Fresh clone + documented startup produces a running app (Docker
      Compose for api/agent-service/frontend; NeonDB connection string +
      Ollama install documented as prerequisites)
- [x] Sessions persist across reload (NeonDB-backed)
- [x] Every grounded answer cites episode title + clickable timestamped
      YouTube link
- [x] Assistant declines gracefully on empty/low-similarity retrieval
- [x] Ship 30/30 skill produces ~1,250-word output meeting the format spec
      in TRD.md / AI_rules.md
- [x] Artifact Viewer renders Markdown/HTML without executing untrusted
      scripts
- [x] Switching provider is visible in the UI and works without code changes
- [x] Dynamic per-provider model listing fetched live from /provider/models
- [x] Missing API key / unreachable Ollama / unreachable Pi agent service /
      DB connection failure all degrade gracefully, never crash the app

## 6. Risks & Trade-offs

| Risk | Mitigation |
|---|---|
| Hallucination | Strict "answer only from provided context" prompting, mandatory citation, explicit "not covered" fallback |
| Local model quality (3B Ollama model) | Documented limitation: 3B models prioritize speed/RAM limits but struggle with 1,250-word essay generation and can hallucinate when overloaded. Cloud is quality baseline; evaluators with 8GB+ VRAM are advised to run `qwen2.5:7b` locally for full essay compliance. |
| Latency (local model on modest hardware) | Streaming responses; local p50 is ~5s, but complex long-form essay tasks are recommended for cloud APIs to avoid hardware spin. |
| Free-tier rate limits (Gemini/Groq) | Pi's multi-provider fallback (`LLM_PROVIDER_FALLBACK`) switches provider on failure, logged. UI shows amber warning banner and auto-switches model. |
| Unsafe artifact rendering | Sandboxed iframe, no `allow-scripts`, Markdown HTML-passthrough disabled |
| Two-runtime complexity (Python + Node agent service) | Documented explicitly as a consequence of the brief's own FastAPI + Pi requirement, kept to one thin internal HTTP boundary, not a distributed system |
| Data leakage | No data sent to any provider beyond the current session's necessary retrieved context |
| Cost | $0 — all providers used have genuinely free tiers, no card required |
