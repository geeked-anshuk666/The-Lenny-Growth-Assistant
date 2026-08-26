# Agent-Transcripts

This directory contains raw coding-agent session logs from the build of The Lenny Growth Assistant. Secrets (API keys, database URLs) have been scrubbed and replaced with `[REDACTED]`.

## Contents

| File | Description |
|---|---|
| `session_01_initial_build.md` | Initial scaffold: Docker Compose, FastAPI schema, Pi agent service, NeonDB + pgvector setup, ingestion pipeline (269 episodes → 4,712 chunks) |
| `session_02_rag_and_grounding.md` | RAG retrieval wired into API, citation system with timestamped YouTube deep-links, no-hallucination guardrail (cosine threshold + system prompt), multi-turn session context |
| `session_03_essay_and_artifacts.md` | Ship 30/30 essay skill (dedicated system prompt, ~1,250 words), artifact extraction from fenced LLM output, sandboxed Artifact Viewer with HTML iframe + Markdown rendering, split-pane layout |
| `session_04_stress_testing.md` | Adversarial stress testing: hallucination probes, prompt injection, cross-episode comparisons, Ship 30/30 length validation on all 3 providers (local 3B limitation documented), 15/15 automated tests passing |
| `session_05_provider_and_models.md` | Dynamic provider/model selection, rate-limit handling, Groq model migration, duplicate API call fix |
| `session_06_rag_hybrid_scoring_and_history_bias.md` | RAG guest priority (Bug #27/28), exclusive context isolation, hybrid topic keyword scoring (Bug #29), chat history turn bias override (Bug #30) |
| `demo_notes.md` | Demo script and notable stress test results for evaluator reference |

## How to read these logs

Each session log follows this format:
- **User prompt** - what was asked
- **Agent response** - including reasoning, code written, decisions made
- **Corrections** - failed attempts and how they were fixed (not redacted - this is honest engineering)

## Note on secrets

All occurrences of `GEMINI_API_KEY`, `GROQ_API_KEY`, `NEON_DATABASE_URL`, and any token values have been replaced with `[REDACTED]` before committing.
