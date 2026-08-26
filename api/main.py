import os
import uuid
import httpx
import logging
from typing import List, Optional
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from sentence_transformers import SentenceTransformer
from database import (
    get_db,
    init_db,
    SessionModel,
    MessageModel,
    ArtifactModel,
    TranscriptChunkModel
)

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Initialize FastAPI App
app = FastAPI(title="The Lenny Growth Assistant Backend", version="1.0.0")

# Setup CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def timestamp_from_url(url: str) -> str:
    import re
    m = re.search(r'[?&]t=(\d+)', url)
    if m:
        secs = int(m.group(1))
        mins = secs // 60
        remaining_secs = secs % 60
        return f"{mins}:{remaining_secs:02d}"
    return "Link"


# Load local sentence embeddings model
logger.info("Initializing SentenceTransformer...")
try:
    embedding_model = SentenceTransformer('all-MiniLM-L6-v2')
except Exception as e:
    logger.error(f"Failed to load sentence-transformer: {e}")
    embedding_model = None

# Service URLs
AGENT_SERVICE_URL = os.getenv("AGENT_SERVICE_URL", "http://agent-service:3000")

# Pydantic Schemas
class SessionCreate(BaseModel):
    metadata: Optional[dict] = Field(default_factory=dict)

class SessionResponse(BaseModel):
    id: uuid.UUID
    created_at: str
    metadata: dict

    class Config:
        from_attributes = True

class MessageCreate(BaseModel):
    session_id: uuid.UUID
    content: str
    provider: Optional[str] = None # Force override if selected in UI
    model_override: Optional[str] = None # Specific model ID chosen in UI dropdown

class MessageResponse(BaseModel):
    id: uuid.UUID
    session_id: uuid.UUID
    role: str
    content: str
    provider: Optional[str]
    citations: Optional[List[dict]] = None
    created_at: str

    class Config:
        from_attributes = True

class ArtifactResponse(BaseModel):
    id: uuid.UUID
    session_id: uuid.UUID
    message_id: Optional[uuid.UUID]
    type: str
    content: str
    created_at: str

    class Config:
        from_attributes = True

@app.on_event("startup")
async def on_startup():
    try:
        await init_db()
        logger.info("Database initialized successfully.")
    except Exception as e:
        logger.error(f"Failed to initialize database: {e}")

@app.get("/health")
async def health(db: AsyncSession = Depends(get_db)):
    health_status = {"status": "ok", "database": "connected", "embeddings_model": "loaded" if embedding_model else "unloaded"}
    try:
        # Check DB connection
        await db.execute(select(1))
    except Exception as e:
        logger.error(f"Health check failed for database: {e}")
        health_status["status"] = "degraded"
        health_status["database"] = f"disconnected: {str(e)}"
    return health_status

@app.post("/sessions", response_model=SessionResponse)
async def create_session(session_data: SessionCreate, db: AsyncSession = Depends(get_db)):
    try:
        new_session = SessionModel(metadata_=session_data.metadata)
        db.add(new_session)
        await db.commit()
        await db.refresh(new_session)
        return SessionResponse(
            id=new_session.id,
            created_at=new_session.created_at.isoformat(),
            metadata=new_session.metadata_
        )
    except Exception as e:
        logger.error(f"Error creating session: {e}")
        raise HTTPException(status_code=500, detail="Database failure while creating session")

@app.get("/sessions", response_model=List[SessionResponse])
async def get_sessions(db: AsyncSession = Depends(get_db)):
    try:
        result = await db.execute(select(SessionModel).order_by(desc(SessionModel.created_at)))
        sessions = result.scalars().all()
        return [
            SessionResponse(
                id=s.id,
                created_at=s.created_at.isoformat(),
                metadata=s.metadata_
            ) for s in sessions
        ]
    except Exception as e:
        logger.error(f"Error listing sessions: {e}")
        return []

class SessionPatch(BaseModel):
    name: Optional[str] = None
    pinned: Optional[bool] = None

@app.patch("/sessions/{session_id}", response_model=SessionResponse)
async def patch_session(session_id: uuid.UUID, patch: SessionPatch, db: AsyncSession = Depends(get_db)):
    """Update session metadata (name, pinned) without a schema change - stored in the existing JSONB metadata_ column."""
    session = await db.get(SessionModel, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    meta = dict(session.metadata_ or {})
    if patch.name is not None:
        meta["name"] = patch.name
    if patch.pinned is not None:
        meta["pinned"] = patch.pinned
    session.metadata_ = meta
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return SessionResponse(
        id=session.id,
        created_at=session.created_at.isoformat(),
        metadata=session.metadata_
    )

@app.delete("/sessions", status_code=204)
async def delete_all_sessions(db: AsyncSession = Depends(get_db)):
    """Deletes all sessions, messages, and artifacts from the database."""
    from sqlalchemy import delete as sql_delete
    await db.execute(sql_delete(ArtifactModel))
    await db.execute(sql_delete(MessageModel))
    await db.execute(sql_delete(SessionModel))
    await db.commit()
    logger.info("Cleared all sessions, messages, and artifacts from the database.")

@app.delete("/sessions/{session_id}", status_code=204)
async def delete_session(session_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Cascade-delete a session and all its messages and artifacts."""
    from sqlalchemy import delete as sql_delete
    session = await db.get(SessionModel, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    # Delete child records first (FK constraints), then the session itself
    await db.execute(sql_delete(ArtifactModel).where(ArtifactModel.session_id == session_id))
    await db.execute(sql_delete(MessageModel).where(MessageModel.session_id == session_id))
    await db.delete(session)
    await db.commit()
    logger.info(f"Deleted session {session_id} and all associated data.")

@app.get("/sessions/{session_id}/messages", response_model=List[MessageResponse])
async def get_messages(session_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    try:
        result = await db.execute(
            select(MessageModel)
            .filter(MessageModel.session_id == session_id)
            .order_by(MessageModel.created_at)
        )
        messages = result.scalars().all()
        return [
            MessageResponse(
                id=m.id,
                session_id=m.session_id,
                role=m.role,
                content=m.content,
                provider=m.provider,
                citations=m.citations,
                created_at=m.created_at.isoformat()
            ) for m in messages
        ]
    except Exception as e:
        logger.error(f"Error listing messages: {e}")
        return []

@app.get("/sessions/{session_id}/artifacts", response_model=List[ArtifactResponse])
async def get_artifacts(session_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    try:
        result = await db.execute(
            select(ArtifactModel)
            .filter(ArtifactModel.session_id == session_id)
            .order_by(ArtifactModel.created_at)
        )
        artifacts = result.scalars().all()
        return [
            ArtifactResponse(
                id=a.id,
                session_id=a.session_id,
                message_id=a.message_id,
                type=a.type,
                content=a.content,
                created_at=a.created_at.isoformat()
            ) for a in artifacts
        ]
    except Exception as e:
        logger.error(f"Error listing artifacts: {e}")
        return []

@app.post("/messages")
async def send_message(msg: MessageCreate, db: AsyncSession = Depends(get_db)):
    # 0. Ensure session exists in sessions table
    session_check = await db.get(SessionModel, msg.session_id)
    if not session_check:
        session_obj = SessionModel(id=msg.session_id)
        db.add(session_obj)
        await db.commit()

    # 1. Save user message
    user_msg = MessageModel(
        session_id=msg.session_id,
        role="user",
        content=msg.content
    )
    db.add(user_msg)
    await db.commit()
    await db.refresh(user_msg)

    # 2. Hybrid / Guest-Aware Vector similarity query (RAG)
    context_text = ""
    citations = []
    
    if embedding_model:
        try:
            query_vector = embedding_model.encode(msg.content).tolist()
            
            # Detect guest names or capitalized entities in query for targeted filtering
            import re
            words = re.findall(r'\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b', msg.content)
            
            guest_chunks = []
            guest_ids = set()
            
            # Attempt guest-filtered retrieval if potential name is present
            if words:
                # Extract non-guest topic keywords from message for hybrid keyword matching
                all_tokens = set(re.findall(r'\b[a-zA-Z]{4,}\b', msg.content.lower()))
                stopwords = {"what", "how", "why", "when", "where", "who", "tell", "explain", "does", "did", "list", "about", "with", "from", "that", "this", "have", "said", "says", "think", "talk", "talked", "mention", "mentioned"}
                topic_keywords = [t for t in all_tokens if t not in stopwords]
                
                for potential_guest in words:
                    if len(potential_guest) > 3 and potential_guest.lower() not in stopwords:
                        # Strip guest name tokens from topic keywords
                        guest_tokens = set(potential_guest.lower().split())
                        filtered_topics = [t for t in topic_keywords if t not in guest_tokens]

                        # 1a. Topic Keyword Boost: Fetch chunks for guest containing specific topic keywords (e.g., 'detail', 'details')
                        kw_matched = []
                        if filtered_topics:
                            for topic in filtered_topics:
                                # Match stemming (e.g. details -> detail)
                                stem_topic = topic.rstrip('s') if len(topic) > 4 else topic
                                kw_stmt = select(TranscriptChunkModel).where(
                                    TranscriptChunkModel.guest.ilike(f"%{potential_guest}%"),
                                    TranscriptChunkModel.chunk_text.ilike(f"%{stem_topic}%")
                                ).order_by(
                                    TranscriptChunkModel.embedding.cosine_distance(query_vector)
                                ).limit(4)
                                kw_res = await db.execute(kw_stmt)
                                for gc in kw_res.scalars().all():
                                    if gc.id not in guest_ids:
                                        kw_matched.append(gc)
                                        guest_ids.add(gc.id)

                        # 1b. Vector Similarity Search for remaining slots
                        guest_stmt = select(TranscriptChunkModel).where(
                            TranscriptChunkModel.guest.ilike(f"%{potential_guest}%")
                        ).order_by(
                            TranscriptChunkModel.embedding.cosine_distance(query_vector)
                        ).limit(6)
                        g_res = await db.execute(guest_stmt)
                        vector_matched = g_res.scalars().all()
                        
                        # 2. Fallback: If no guest column matches, search chunk_text
                        if not kw_matched and not vector_matched:
                            text_stmt = select(TranscriptChunkModel).where(
                                TranscriptChunkModel.chunk_text.ilike(f"%{potential_guest}%")
                            ).order_by(
                                TranscriptChunkModel.embedding.cosine_distance(query_vector)
                            ).limit(6)
                            g_res = await db.execute(text_stmt)
                            vector_matched = g_res.scalars().all()

                        # Combine keyword-boosted chunks FIRST, then vector chunks
                        matched = kw_matched + [gc for gc in vector_matched if gc.id not in guest_ids]

                        for gc in matched:
                            if gc.id not in guest_ids:
                                guest_chunks.append(gc)
                                guest_ids.add(gc.id)
            
            # If guest-specific chunks were found, use them exclusively to prevent context pollution from other guests!
            # Only run unconstrained global search if no guest match was found.
            if guest_chunks:
                chunks = guest_chunks[:6]
            else:
                stmt = select(TranscriptChunkModel).order_by(
                    TranscriptChunkModel.embedding.cosine_distance(query_vector)
                ).limit(6)
                res = await db.execute(stmt)
                chunks = res.scalars().all()
            
            if chunks:
                context_chunks = []
                for chunk in chunks:
                    context_chunks.append(f"--- Episode Guest: {chunk.guest} | Title: {chunk.source_title} ---\n{chunk.chunk_text}")
                    citations.append({
                        "guest": chunk.guest,
                        "title": chunk.source_title,
                        "url": chunk.source_url,
                        "video_id": chunk.video_id
                    })
                context_text = "\n\n".join(context_chunks)
                # Log context sent to LLM for debugging
                logger.info(f"RAG context: {len(chunks)} chunks | query: {msg.content[:80]}")
                for i, chunk in enumerate(chunks):
                    logger.info(f"  Chunk {i+1} [{chunk.guest}]: {chunk.chunk_text[:200]!r}")
        except Exception as err:
            logger.error(f"Failed RAG retrieval step: {err}")

    # 3. Retrieve history context (get latest 10 messages in chronological order)
    from sqlalchemy import desc
    history_stmt = select(MessageModel).filter(
        MessageModel.session_id == msg.session_id
    ).order_by(desc(MessageModel.created_at)).limit(10)
    history_res = await db.execute(history_stmt)
    history_msgs = list(history_res.scalars().all())
    history_msgs.reverse()
    
    pi_history = []
    for hm in history_msgs:
        pi_history.append({
            "role": hm.role,
            "content": hm.content
        })

    # 4. Formulate Agent request payload
    provider = msg.provider or os.getenv("LLM_PROVIDER", "ollama")
    payload = {
        "messages": pi_history,
        "context": context_text,
        "provider": provider,
        "model_override": msg.model_override,
        "is_essay_request": "essay" in msg.content.lower() or "ship 30/30" in msg.content.lower()
    }

    # 5. Call internal Node.js Agent Service
    assistant_response_text = ""
    provider_used = provider
    artifact_created = None
    rate_limited = False
    fallback_model: str | None = None
    error_detail: str | None = None

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            res = await client.post(f"{AGENT_SERVICE_URL}/agent/generate", json=payload)
            if res.status_code == 200:
                data = res.json()
                assistant_response_text = data.get("text", "")
                provider_used = data.get("provider_used", provider)
                rate_limited = bool(data.get("rate_limited", False))
                fallback_model = data.get("fallback_model")

                # Check if artifact generated
                artifact = data.get("artifact")
                if artifact:
                    artifact_created = artifact
            else:
                err_body = res.text
                logger.error(f"Agent service returned status code {res.status_code}: {err_body}")
                try:
                    err_json = res.json()
                    error_detail = err_json.get("message") or err_json.get("error") or err_body
                except Exception:
                    error_detail = err_body
                assistant_response_text = f"Error from AI provider: {error_detail}"
    except Exception as e:
        logger.error(f"Agent service connection error: {e}")
        # Graceful fallback error response
        assistant_response_text = "The reasoning agent is currently unreachable. Please check the logs."

    # If similarity matches were empty or context was non-existent and the query expected grounding
    if not context_text and not payload["is_essay_request"] and "hello" not in msg.content.lower():
        assistant_response_text = "I do not have transcript coverage for this topic in Lenny's Podcast transcripts."
        citations = []

    # Option B: Append Markdown source list to content for absolute fallback rendering
    if citations and not payload["is_essay_request"] and "coverage" not in assistant_response_text:
        sources_md = "\n\n**Sources:**\n" + "\n".join([
            f"- [{c['guest']} - {c['title']} ({timestamp_from_url(c['url'])})]({c['url']})"
            for c in citations if c.get("url")
        ])
        assistant_response_text += sources_md

    # 6. Save assistant message
    assistant_msg = MessageModel(
        session_id=msg.session_id,
        role="assistant",
        content=assistant_response_text,
        provider=provider_used,
        citations=citations
    )
    db.add(assistant_msg)
    await db.commit()
    await db.refresh(assistant_msg)

    # 7. Save artifact if created
    artifact_response_data = None
    if artifact_created:
        db_artifact = ArtifactModel(
            session_id=msg.session_id,
            message_id=assistant_msg.id,
            type=artifact_created.get("type", "markdown"),
            content=artifact_created.get("content", "")
        )
        db.add(db_artifact)
        await db.commit()
        await db.refresh(db_artifact)
        artifact_response_data = {
            "id": str(db_artifact.id),
            "type": db_artifact.type,
            "content": db_artifact.content
        }

    return {
        "message": {
            "id": str(assistant_msg.id),
            "session_id": str(assistant_msg.session_id),
            "role": assistant_msg.role,
            "content": assistant_msg.content,
            "provider": assistant_msg.provider,
            "created_at": assistant_msg.created_at.isoformat()
        },
        "citations": citations,
        "artifact": artifact_response_data,
        "rate_limited": rate_limited,
        "fallback_model": fallback_model,
        "error_detail": error_detail,
    }


@app.get("/provider/models")
async def get_provider_models(provider: str):
    """Proxy endpoint: fetches live model list from agent-service for the given provider."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.get(f"{AGENT_SERVICE_URL}/provider/models", params={"provider": provider})
            if res.status_code == 200:
                return res.json()
            else:
                logger.warning(f"Agent service returned {res.status_code} for provider models: {res.text}")
                return {"models": []}
    except Exception as e:
        logger.error(f"Failed to fetch provider models: {e}")
        return {"models": []}
