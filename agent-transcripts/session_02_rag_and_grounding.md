# Session 02 - RAG Retrieval, pgvector Integration, Citation System, Hallucination Guardrail

**Date:** 2026-08-24  
**Focus:** Wire RAG retrieval into the API request path, format citations with clickable YouTube timestamps, enforce no-hallucination guardrail

---

## Prompt 1 - Connect retrieval to message endpoint

> When POST /sessions/{id}/messages is called, embed the user's message, search pgvector for top-k similar chunks, and pass those as context to the agent service. Return the agent's response.

**Agent action:** Extended `api/main.py` `POST /sessions/{id}/messages` handler:

```python
# 1. Embed the user message
query_vector = embeddings_model.encode(user_message).tolist()

# 2. Search top-8 most similar chunks via pgvector cosine distance
stmt = select(TranscriptChunkModel).order_by(
    TranscriptChunkModel.embedding.cosine_distance(query_vector)
).limit(8)
result = await db.execute(stmt)
chunks = result.scalars().all()

# 3. Format as context string for agent service
context = "\n\n".join([
    f"[Source: {c.source_title} | {c.source_url}]\n{c.chunk_text}"
    for c in chunks
])
```

**Initial k=4 used.** Changed to k=8 after noticing that specific quotes were being missed — wider recall means the agent has better chance of surfacing the exact moment. Documented trade-off: more tokens consumed per request.

---

## Prompt 2 - Build the citation system

> Each answer must include clickable citations. The format should be: guest name + timestamp, linking to the exact YouTube moment. Don't just cite the episode - cite the specific second.

**Citation construction logic:**
```python
citations = []
for chunk in chunks:
    citations.append({
        "guest": chunk.guest,
        "source_title": chunk.source_title,
        "source_url": chunk.source_url,   # already includes ?t=N
        "timestamp_seconds": chunk.timestamp_seconds,
    })
```

**System prompt updated** in `agent-service/src/index.ts` to instruct the model:
```
When answering, cite each claim with the format:
(Source: [Episode Title], [Guest Name] at [HH:MM:SS])
where the timestamp is a hyperlink to source_url.
```

**Frontend citation rendering:** Added `CitationBadge` component — renders as a pill with `guest name · HH:MM:SS`, clicking opens `source_url` in a new tab.

---

## Prompt 3 - Enforce the no-hallucination guardrail

> If no relevant chunks come back, the assistant must refuse to answer rather than make something up. How do we enforce this?

**Two-layer guardrail:**

**Layer 1 — Cosine distance threshold (retrieval side):**
```python
MIN_SIMILARITY_THRESHOLD = 0.6  # cosine distance; lower = more similar

if not chunks or all(c.distance > MIN_SIMILARITY_THRESHOLD for c in chunks):
    return MessageResponse(
        content="I couldn't find relevant information in Lenny's Podcast transcripts to answer that question reliably. Could you rephrase, or ask about a specific guest or topic?",
        citations=[],
        provider_used="none",
    )
```

**Layer 2 — System prompt instruction (LLM side):**
```
You are a grounded assistant. You MUST ONLY answer using the provided Grounded Context below.
If the context is empty or does not contain relevant information, respond:
"This topic is not covered in the available Lenny's Podcast transcripts."
NEVER fabricate facts, guests, episodes, or timestamps.
```

**Test validation:** Queried "What did Lenny say about quantum computing?" → LLM refused correctly. Queried "What did Brian Chesky say about culture?" → retrieved relevant chunks from the Chesky episode, cited correctly.

---

## Prompt 4 - Persist citations to the messages table

> The citations should be saved with each message so they survive page reload.

**Schema update:** Added `citations = Column(JSONB, default=list)` to `MessageModel`.

**Retrieval:** On `GET /sessions/{id}/messages`, citations JSONB is returned alongside message content, and frontend re-renders the `CitationBadge` pills from persisted data.

---

## Prompt 5 - Test end-to-end grounding

> Run a few test queries and paste the actual citations you get back.

**Test 1 — High-confidence retrieval:**
> *"What does Lenny say about finding product-market fit?"*

**Returned citations:**
- `Lenny Rachitsky (00:12:44)` → linked to `https://youtu.be/...&t=764`
- `Rahul Vohra (00:08:21)` → linked to correct timestamp in Superhuman episode

**Test 2 — Off-topic query:**
> *"What is the capital of France?"*

**Response:** `"This topic is not covered in the available Lenny's Podcast transcripts."` ✅ No hallucination.

**Test 3 — Guest-specific query:**
> *"What did Kevin Systrom say about Instagram's early growth?"*

**Result:** 3 citations from the Kevin Systrom episode, all timestamped. ✅

---

## Prompt 6 - Failed first attempt at session context (multi-turn)

> When I ask a follow-up question "what else did he say about that?", the assistant loses context and acts like it's a new conversation.

**Root cause:** The `POST /sessions/{id}/messages` handler was not fetching conversation history — it only sent the new user message to the agent service.

**Fix:** Fetched previous `N=10` messages from DB and included them as `pi_history` in the agent service payload:

```python
history_stmt = select(MessageModel)\
    .where(MessageModel.session_id == session_id)\
    .order_by(MessageModel.created_at.desc())\
    .limit(10)
history_result = await db.execute(history_stmt)
prior_messages = list(reversed(history_result.scalars().all()))

pi_history = [
    {"role": m.role, "content": m.content}
    for m in prior_messages
]
```

**Verified:** Follow-up "what else did he say about that?" now correctly continues context from the preceding assistant turn.

---

## Session outcome

Full RAG pipeline operational:
- Retrieval → citation construction → LLM grounding → response → citation persistence → frontend rendering
- Hallucination guardrail active at both retrieval (cosine threshold) and LLM (system prompt) layers
- Multi-turn session context working
