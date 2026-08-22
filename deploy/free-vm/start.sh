#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKEND_DIR="${ROOT_DIR}/Backend"
ENV_FILE="${BACKEND_DIR}/.env.production"
COMPOSE_FILE="${BACKEND_DIR}/docker-compose.production.yaml"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Missing ${ENV_FILE}. Run deploy/free-vm/bootstrap-ubuntu.sh first or copy Backend/.env.production.example." >&2
  exit 1
fi

fail_if_placeholder() {
  local key="$1"
  local value
  value="$(grep -E "^${key}=" "${ENV_FILE}" | tail -n1 | cut -d= -f2- || true)"
  if [[ -z "${value}" || "${value}" == *REPLACE_* || "${value}" == *"USER:PASSWORD@HOST"* ]]; then
    echo "Production value ${key} is missing or still contains a placeholder." >&2
    exit 1
  fi
}

fail_if_placeholder DATABASE_URL
fail_if_placeholder SECRET_KEY
fail_if_placeholder BACKEND_CORS_ORIGINS
fail_if_placeholder PUBLIC_HOSTNAME

if grep -Eq '^DB_SCHEMA=(?!nocodeml$)' "${ENV_FILE}" 2>/dev/null; then
  echo "DB_SCHEMA must remain exactly 'nocodeml'." >&2
  exit 1
fi

cd "${BACKEND_DIR}"

echo "==> Validating production Compose configuration"
docker compose --env-file .env.production -f docker-compose.production.yaml config >/dev/null

echo "==> Building NoCodeML V3 containers"
docker compose --env-file .env.production -f docker-compose.production.yaml build --pull

echo "==> Starting NoCodeML V3"
docker compose --env-file .env.production -f docker-compose.production.yaml up -d

echo "==> Waiting for API health"
for attempt in $(seq 1 40); do
  if docker compose --env-file .env.production -f docker-compose.production.yaml exec -T api \
      python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=4).read()" \
      >/dev/null 2>&1; then
    echo "API is healthy."
    HOSTNAME_VALUE="$(grep '^PUBLIC_HOSTNAME=' .env.production | cut -d= -f2-)"
    echo "Backend URL: https://${HOSTNAME_VALUE}"
    echo "API docs:    https://${HOSTNAME_VALUE}/docs"
    exit 0
  fi
  sleep 3
done

echo "API did not become healthy in time. Recent logs:" >&2
docker compose --env-file .env.production -f docker-compose.production.yaml logs --tail=120 api worker redis >&2
exit 1
