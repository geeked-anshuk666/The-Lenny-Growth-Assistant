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

    # 2. Vector similarity query (RAG)
    context_text = ""
    citations = []
    
    if embedding_model:
        try:
            query_vector = embedding_model.encode(msg.content).tolist()
            # Perform Cosine distance query in pgvector
            # Distance <= 0.45 threshold represents sufficient match
            stmt = select(TranscriptChunkModel).order_by(
                TranscriptChunkModel.embedding.cosine_distance(query_vector)
            ).limit(4)
            res = await db.execute(stmt)
            chunks = res.scalars().all()
            
            if chunks:
                context_chunks = []
                for chunk in chunks:
                    context_chunks.append(chunk.chunk_text)
                    citations.append({
                        "guest": chunk.guest,
                        "title": chunk.source_title,
                        "url": chunk.source_url,
                        "video_id": chunk.video_id
                    })
                context_text = "\n\n---\n\n".join(context_chunks)
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
    provider = msg.provider or os.getenv("LLM_PROVIDER", "gemini")
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

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            res = await client.post(f"{AGENT_SERVICE_URL}/agent/generate", json=payload)
            if res.status_code == 200:
                data = res.json()
                assistant_response_text = data.get("text", "")
                provider_used = data.get("provider_used", provider)
                
                # Check if artifact generated
                artifact = data.get("artifact")
                if artifact:
                    artifact_created = artifact
            else:
                logger.error(f"Agent service returned status code {res.status_code}: {res.text}")
                assistant_response_text = "I'm having trouble contacting the reasoning agent. Please try again."
    except Exception as e:
        logger.error(f"Agent service connection error: {e}")
        # Graceful fallback error response
        assistant_response_text = "The reasoning agent is currently unreachable. Please check the logs."

    # If similarity matches were empty or context was non-existent and the query expected grounding
    if not context_text and not payload["is_essay_request"] and "hello" not in msg.content.lower():
        assistant_response_text = "I do not have transcript coverage for this topic in Lenny's Podcast transcripts."
        citations = []

    # 6. Save assistant message
    assistant_msg = MessageModel(
        session_id=msg.session_id,
        role="assistant",
        content=assistant_response_text,
        provider=provider_used
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
        "artifact": artifact_response_data
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
