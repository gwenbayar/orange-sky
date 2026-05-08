FROM python:3.12-slim

WORKDIR /app

# Install system deps required by shapely / fastkml.
RUN apt-get update -y \
    && apt-get install --no-install-recommends -y libgeos-c1v5 \
    && rm -rf /var/lib/apt/lists/*

# Project metadata + deps first (better layer caching).
COPY pyproject.toml ./
COPY pipeline ./pipeline
COPY api ./api
COPY events ./events

# Editable install. Skips the 759 MB FPA SQLite (lives in data/, mounted at runtime).
RUN pip install --no-cache-dir -e ".[dev]"

ENV SNAPSHOT_DIR=/app/data/snapshot/2020-labor-day
EXPOSE 8000

CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]
