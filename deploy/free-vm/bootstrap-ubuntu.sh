#!/usr/bin/env bash
set -Eeuo pipefail

REPO_URL="https://github.com/Rishikeshsanin/NoCodeML.git"
BRANCH="release/v3-revival"
APP_DIR="${NOCODEML_APP_DIR:-/opt/nocodeml}"

if [[ "${EUID}" -eq 0 ]]; then
  SUDO=""
  OWNER="${SUDO_USER:-root}"
else
  SUDO="sudo"
  OWNER="${USER}"
fi

printf '\n==> Installing host prerequisites\n'
${SUDO} apt-get update
${SUDO} apt-get install -y ca-certificates curl git docker.io docker-compose-v2 ufw
${SUDO} systemctl enable --now docker

printf '\n==> Applying host firewall rules\n'
${SUDO} ufw allow OpenSSH
${SUDO} ufw allow 80/tcp
${SUDO} ufw allow 443/tcp
${SUDO} ufw --force enable

printf '\n==> Preparing NoCodeML checkout\n'
if [[ -d "${APP_DIR}/.git" ]]; then
  ${SUDO} git -C "${APP_DIR}" fetch origin "${BRANCH}"
  ${SUDO} git -C "${APP_DIR}" checkout "${BRANCH}"
  ${SUDO} git -C "${APP_DIR}" pull --ff-only origin "${BRANCH}"
else
  ${SUDO} mkdir -p "$(dirname "${APP_DIR}")"
  ${SUDO} git clone --branch "${BRANCH}" --single-branch "${REPO_URL}" "${APP_DIR}"
fi

${SUDO} chown -R "${OWNER}:${OWNER}" "${APP_DIR}" 2>/dev/null || true

ENV_FILE="${APP_DIR}/Backend/.env.production"
if [[ ! -f "${ENV_FILE}" ]]; then
  cp "${APP_DIR}/Backend/.env.production.example" "${ENV_FILE}"
  chmod 600 "${ENV_FILE}"
fi

PUBLIC_IP="$(curl -4fsS --max-time 8 https://api.ipify.org || true)"
if [[ -n "${PUBLIC_IP}" ]]; then
  FREE_HOSTNAME="${PUBLIC_IP}.sslip.io"
  if grep -q '^PUBLIC_HOSTNAME=REPLACE_WITH_BACKEND_HOSTNAME$' "${ENV_FILE}"; then
    sed -i "s#^PUBLIC_HOSTNAME=.*#PUBLIC_HOSTNAME=${FREE_HOSTNAME}#" "${ENV_FILE}"
  fi
  printf '\nDetected public IPv4: %s\nSuggested free HTTPS hostname: https://%s\n' "${PUBLIC_IP}" "${FREE_HOSTNAME}"
fi

cat <<EOF

Host bootstrap complete.

IMPORTANT: Oracle/your cloud firewall must also allow inbound TCP 80 and 443.
The Linux firewall has already been configured, but the cloud network security
rule is controlled outside this VM.

Next:
  1. Edit ${ENV_FILE}
  2. Replace DATABASE_URL, SECRET_KEY and BACKEND_CORS_ORIGINS.
  3. Optional: add GEMINI_API_KEY.
  4. Run:
       cd ${APP_DIR}
       ./deploy/free-vm/start.sh

NoCodeML has NOT been started automatically because production secrets must be
configured first.
EOF
