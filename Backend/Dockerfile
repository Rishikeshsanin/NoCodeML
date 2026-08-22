# syntax=docker/dockerfile:1

FROM python:3.11-slim AS builder

WORKDIR /usr/src/app

ENV PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip wheel --wheel-dir /usr/src/app/wheels -r requirements.txt


FROM python:3.11-slim AS runtime

WORKDIR /app

ENV PYTHONPATH=/app \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    DATASETS_DIR=/app/datasets \
    MODELS_DIR=/app/models \
    PREDICTIONS_DIR=/app/predictions

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system --gid 10001 nocodeml \
    && useradd --system --uid 10001 --gid nocodeml --home-dir /app --shell /usr/sbin/nologin nocodeml

COPY --from=builder /usr/src/app/wheels /wheels
RUN pip install --no-cache-dir /wheels/* && rm -rf /wheels

COPY --chown=nocodeml:nocodeml ./app ./app
COPY --chown=nocodeml:nocodeml alembic.ini .
COPY --chown=nocodeml:nocodeml alembic ./alembic

RUN mkdir -p /app/datasets /app/models /app/predictions \
    && chown -R nocodeml:nocodeml /app/datasets /app/models /app/predictions

USER nocodeml

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=3)" || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
