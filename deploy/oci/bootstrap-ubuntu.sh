#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run with sudo: sudo bash deploy/oci/bootstrap-ubuntu.sh"
  exit 1
fi

if [[ ! -f deploy/oci/docker-compose.yml ]]; then
  echo "Run this script from the NoCodeML repository root."
  exit 1
fi

ARCH="$(uname -m)"
if [[ "${ARCH}" != "aarch64" && "${ARCH}" != "arm64" ]]; then
  echo "Warning: expected Oracle Ampere ARM64, found ${ARCH}. The stack can still run if the ML wheels support this architecture."
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl git docker.io docker-compose-v2
systemctl enable --now docker

PUBLIC_IP="$(curl -fsS https://api.ipify.org)"
if [[ -z "${PUBLIC_IP}" ]]; then
  echo "Could not determine the public IPv4 address."
  exit 1
fi

HOST="nocodeml-api.${PUBLIC_IP}.sslip.io"
ENV_FILE="deploy/oci/.env"

if [[ ! -f "${ENV_FILE}" ]]; then
  cp deploy/oci/.env.example "${ENV_FILE}"
fi

python3 - "${ENV_FILE}" "${HOST}" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
host = sys.argv[2]
lines = path.read_text().splitlines()
out = []
seen = False
for line in lines:
    if line.startswith("NOCODEML_HOST="):
        out.append(f"NOCODEML_HOST={host}")
        seen = True
    else:
        out.append(line)
if not seen:
    out.append(f"NOCODEML_HOST={host}")
path.write_text("\n".join(out) + "\n")
PY

# Oracle's VCN/security list must also allow inbound TCP 80 and 443.
# UFW may be disabled on a fresh image; these commands are harmless either way.
ufw allow 22/tcp >/dev/null 2>&1 || true
ufw allow 80/tcp >/dev/null 2>&1 || true
ufw allow 443/tcp >/dev/null 2>&1 || true

DOCKER_COMPOSE=(docker compose --env-file "${ENV_FILE}" -f deploy/oci/docker-compose.yml)
"${DOCKER_COMPOSE[@]}" up -d --build

for attempt in $(seq 1 60); do
  if curl -fsS "https://${HOST}/health" >/dev/null 2>&1; then
    echo
    echo "NoCodeML backend is live: https://${HOST}"
    echo "Readiness: https://${HOST}/ready"
    echo
    echo "Next: create/import the Vercel frontend, set VITE_API_URL=https://${HOST},"
    echo "then replace FRONTEND_ORIGIN=* in ${ENV_FILE} with the exact Vercel origin"
    echo "and run: docker compose --env-file ${ENV_FILE} -f deploy/oci/docker-compose.yml up -d"
    exit 0
  fi
  sleep 5
done

echo "Backend did not become healthy in time. Recent logs:"
"${DOCKER_COMPOSE[@]}" logs --tail=120
exit 1
