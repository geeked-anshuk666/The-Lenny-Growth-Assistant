import os
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy import String, Text, DateTime, ForeignKey, text, ARRAY, JSON
from pgvector.sqlalchemy import Vector
import datetime
from typing import List, Optional
import uuid

from dotenv import load_dotenv
load_dotenv()
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

DATABASE_URL = os.getenv("DATABASE_URL") or os.getenv("NEON_DATABASE_URL")

if not DATABASE_URL:
    DATABASE_URL = "postgresql+asyncpg://placeholder_user:placeholder_pass@placeholder_host.neon.tech/placeholder_db"

if DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)

# Remove query params from URL that asyncpg doesn't support
if "?" in DATABASE_URL:
    db_url_base, _ = DATABASE_URL.split("?", 1)
    DATABASE_URL = db_url_base

# Use standard asyncpg connect_args for SSL require
connect_args = {}
if "neon.tech" in DATABASE_URL:
    connect_args = {"ssl": True}

engine = create_async_engine(DATABASE_URL, connect_args=connect_args, pool_pre_ping=True, pool_recycle=300, echo=True)
async_session = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

class Base(DeclarativeBase):
    pass

class SessionModel(Base):
    __tablename__ = "sessions"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))
    metadata_: Mapped[dict] = mapped_column("metadata", JSON, default=dict, server_default=text("'{}'::jsonb"))

class MessageModel(Base):
    __tablename__ = "messages"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    session_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sessions.id", ondelete="CASCADE"), index=True)
    role: Mapped[str] = mapped_column(String)  # 'user' | 'assistant'
    content: Mapped[str] = mapped_column(Text)
    provider: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    citations: Mapped[Optional[dict]] = mapped_column("citations", JSON, nullable=True, server_default=text("'[]'::jsonb"))
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))

class ArtifactModel(Base):
    __tablename__ = "artifacts"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    session_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sessions.id", ondelete="CASCADE"), index=True)
    message_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("messages.id", ondelete="SET NULL"), nullable=True)
    type: Mapped[str] = mapped_column(String) # 'markdown' | 'html'
    content: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))

class TranscriptChunkModel(Base):
    __tablename__ = "transcript_chunks"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    guest: Mapped[str] = mapped_column(String)
    source_title: Mapped[str] = mapped_column(String)
    source_url: Mapped[str] = mapped_column(String)
    video_id: Mapped[str] = mapped_column(String)
    keywords: Mapped[List[str]] = mapped_column(ARRAY(String), default=list)
    chunk_text: Mapped[str] = mapped_column(Text)
    embedding: Mapped[Optional[List[float]]] = mapped_column(Vector(384), nullable=True)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))

async def get_db():
    async with async_session() as session:
        yield session

async def init_db():
    async with engine.begin() as conn:
        # Create vector extension if not exists
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector;"))
        await conn.run_sync(Base.metadata.create_all)
        # Ensure citations column exists on messages table
        await conn.execute(text("ALTER TABLE messages ADD COLUMN IF NOT EXISTS citations JSONB DEFAULT '[]'::jsonb;"))

