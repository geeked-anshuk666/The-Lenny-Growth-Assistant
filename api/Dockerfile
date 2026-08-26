# Stage 1: Builder — install all deps + pre-download the sentence-transformers model
FROM python:3.11-slim AS builder

WORKDIR /app

# Install build deps (needed to compile asyncpg, pgvector wheels)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Create a virtual environment so we can copy it cleanly in the next stage
RUN python -m venv /app/venv
ENV PATH="/app/venv/bin:$PATH"

COPY requirements.txt .
# --no-cache-dir keeps the layer lean; all wheels compile here
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download the sentence-transformers model into the venv's cache directory.
# This bakes the ~80MB model into the image at build time so containers start
# instantly with no network dependency at runtime.
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('all-MiniLM-L6-v2')"


# Stage 2: Runner — slim image with only what's needed to run
FROM python:3.11-slim AS runner

WORKDIR /app

# Runtime system lib only (libpq for asyncpg at runtime)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    && rm -rf /var/lib/apt/lists/*

# Copy the pre-built venv (includes installed packages + cached ST model)
COPY --from=builder /app/venv /app/venv

# Copy only application source — .dockerignore excludes venv/, __pycache__, tests/, .env
COPY . .

ENV PATH="/app/venv/bin:$PATH"
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
