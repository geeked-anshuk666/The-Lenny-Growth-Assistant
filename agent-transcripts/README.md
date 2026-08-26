# Agent-Transcripts

This directory contains raw coding-agent session logs from the build of The Lenny Growth Assistant. Secrets (API keys, database URLs) have been scrubbed and replaced with `[REDACTED]`.

## Contents

| File | Description |
|---|---|
| `session_01_initial_build.md` | Initial scaffold: Docker Compose, FastAPI schema, Pi agent service, ingestion pipeline |
| `session_02_rag_and_grounding.md` | RAG retrieval, pgvector integration, citation system, hallucination guardrail |
| `session_03_essay_and_artifacts.md` | Ship 30/30 essay skill, artifact extraction, Artifact Viewer frontend |
| `session_04_stress_testing.md` | Adversarial prompt testing - cross-episode comparisons, hallucination probes, off-topic queries |
| `session_05_provider_and_models.md` | Dynamic provider/model selection, rate-limit handling, Groq model migration |
| `session_06_rag_hybrid_scoring_and_history_bias.md` | RAG guest priority, exclusive context isolation, hybrid topic keyword scoring, chat history turn bias override |
| `demo_notes.md` | Demo script and notable test results for evaluator reference |

## How to read these logs

Each session log follows this format:
- **User prompt** - what was asked
- **Agent response** - including reasoning, code written, decisions made
- **Corrections** - failed attempts and how they were fixed (not redacted - this is honest engineering)

## Note on secrets

All occurrences of `GEMINI_API_KEY`, `GROQ_API_KEY`, `NEON_DATABASE_URL`, and any token values have been replaced with `[REDACTED]` before committing.
