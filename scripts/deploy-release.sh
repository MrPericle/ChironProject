#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-.env.production}"
BACKUP_DIR="${BACKUP_DIR:-/srv/maka-backups}"
DEPLOY_LOCK_FILE="${DEPLOY_LOCK_FILE:-/tmp/maka-deploy.lock}"
EXPECTED_SHA="${EXPECTED_SHA:-}"
EXPECTED_APP_DOMAIN="${EXPECTED_APP_DOMAIN:-}"
EXPECTED_API_DOMAIN="${EXPECTED_API_DOMAIN:-}"
EXPECTED_SERVICE_COUNT="${EXPECTED_SERVICE_COUNT:-4}"

cd "${ROOT_DIR}"

if [[ ! -f "${COMPOSE_FILE}" || ! -f "${ENV_FILE}" ]]; then
  echo "File Compose o environment di produzione non trovato." >&2
  exit 1
fi

if ! command -v flock >/dev/null 2>&1; then
  echo "Il comando flock e richiesto per impedire deploy concorrenti." >&2
  exit 1
fi

exec 9>"${DEPLOY_LOCK_FILE}"
if ! flock -n 9; then
  echo "Un altro deploy MAKA e gia in esecuzione." >&2
  exit 1
fi

read_env_value() {
  local key="$1"
  awk -F= -v key="${key}" '$1 == key {sub(/^[^=]*=/, ""); print; exit}' "${ENV_FILE}"
}

APP_ENV_VALUE="$(read_env_value APP_ENV)"
APP_DOMAIN_VALUE="$(read_env_value APP_DOMAIN)"
API_DOMAIN_VALUE="$(read_env_value API_DOMAIN)"

if [[ "${APP_ENV_VALUE}" != "production" ]]; then
  echo "APP_ENV deve essere production, trovato: ${APP_ENV_VALUE:-vuoto}." >&2
  exit 1
fi

if [[ -n "${EXPECTED_APP_DOMAIN}" && "${APP_DOMAIN_VALUE}" != "${EXPECTED_APP_DOMAIN}" ]]; then
  echo "Dominio app inatteso: ${APP_DOMAIN_VALUE:-vuoto}. Atteso: ${EXPECTED_APP_DOMAIN}." >&2
  exit 1
fi

if [[ -n "${EXPECTED_API_DOMAIN}" && "${API_DOMAIN_VALUE}" != "${EXPECTED_API_DOMAIN}" ]]; then
  echo "Dominio API inatteso: ${API_DOMAIN_VALUE:-vuoto}. Atteso: ${EXPECTED_API_DOMAIN}." >&2
  exit 1
fi

if [[ -n "${EXPECTED_SHA}" ]]; then
  current_sha="$(git rev-parse HEAD)"
  if [[ "${current_sha}" != "${EXPECTED_SHA}" ]]; then
    echo "Commit inatteso sul server: ${current_sha}. Atteso: ${EXPECTED_SHA}." >&2
    exit 1
  fi
fi

if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
  echo "Il repository sul server contiene modifiche tracciate non committate." >&2
  exit 1
fi

compose=(docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}")

show_diagnostics() {
  local exit_code=$?
  trap - ERR
  echo "Deploy fallito. Stato corrente dei servizi:" >&2
  "${compose[@]}" ps >&2 || true
  "${compose[@]}" logs --tail=100 api web caddy >&2 || true
  exit "${exit_code}"
}
trap show_diagnostics ERR

echo "Valido la configurazione Compose..."
"${compose[@]}" config --quiet

echo "Creo il backup pre-release..."
BACKUP_DIR="${BACKUP_DIR}" COMPOSE_FILE="${COMPOSE_FILE}" ENV_FILE="${ENV_FILE}" \
  "${ROOT_DIR}/scripts/backup.sh"

echo "Costruisco le immagini applicative..."
"${compose[@]}" build --pull api web

echo "Applico le migrazioni..."
"${compose[@]}" run --rm api alembic upgrade head

echo "Aggiorno lo stack..."
"${compose[@]}" up -d --remove-orphans

echo "Attendo i servizi healthy..."
for attempt in {1..24}; do
  unhealthy="$("${compose[@]}" ps --format json | grep -Ec '"Health":"(starting|unhealthy)"' || true)"
  running="$("${compose[@]}" ps --services --status running | grep -c . || true)"
  if [[ "${unhealthy}" -eq 0 && "${running}" -eq "${EXPECTED_SERVICE_COUNT}" ]]; then
    break
  fi
  if [[ "${attempt}" -eq 24 ]]; then
    echo "I container non hanno raggiunto uno stato sano entro il tempo previsto." >&2
    false
  fi
  sleep 5
done

"${compose[@]}" ps

echo "Eseguo gli smoke test HTTPS..."
curl --fail --silent --show-error --retry 8 --retry-delay 3 \
  "https://${API_DOMAIN_VALUE}/health" >/dev/null
curl --fail --silent --show-error --head --retry 8 --retry-delay 3 \
  "https://${APP_DOMAIN_VALUE}" >/dev/null

trap - ERR
echo "Deploy completato: $(git rev-parse --short HEAD) su https://${APP_DOMAIN_VALUE}"
