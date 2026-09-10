#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-.env.production}"
BACKUP_DIR="${BACKUP_DIR:-${ROOT_DIR}/backups}"

if [[ ! -f "${ROOT_DIR}/${COMPOSE_FILE}" ]]; then
  echo "Compose file non trovato: ${ROOT_DIR}/${COMPOSE_FILE}" >&2
  exit 1
fi

if [[ ! -f "${ROOT_DIR}/${ENV_FILE}" ]]; then
  echo "Environment file non trovato: ${ROOT_DIR}/${ENV_FILE}" >&2
  exit 1
fi

read_env_value() {
  local key="$1"
  awk -F= -v key="${key}" '$1 == key {sub(/^[^=]*=/, ""); print; exit}' "${ROOT_DIR}/${ENV_FILE}"
}

POSTGRES_DB="${POSTGRES_DB:-$(read_env_value POSTGRES_DB)}"
POSTGRES_USER="${POSTGRES_USER:-$(read_env_value POSTGRES_USER)}"

if [[ -z "${POSTGRES_DB}" || -z "${POSTGRES_USER}" ]]; then
  echo "POSTGRES_DB e POSTGRES_USER devono essere definiti in ${ENV_FILE}." >&2
  exit 1
fi

mkdir -p "${BACKUP_DIR}"
chmod 700 "${BACKUP_DIR}"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
prefix="maka-${timestamp}"
database_backup="${BACKUP_DIR}/${prefix}.database.dump"
uploads_backup="${BACKUP_DIR}/${prefix}.uploads.tar.gz"
checksums="${BACKUP_DIR}/${prefix}.sha256"

cleanup_temporary_files() {
  rm -f "${database_backup}.tmp" "${uploads_backup}.tmp"
}
trap cleanup_temporary_files EXIT

compose=(docker compose --env-file "${ROOT_DIR}/${ENV_FILE}" -f "${ROOT_DIR}/${COMPOSE_FILE}")

echo "Creo il backup PostgreSQL..."
"${compose[@]}" exec -T db pg_dump \
  --username "${POSTGRES_USER}" \
  --dbname "${POSTGRES_DB}" \
  --format custom \
  --no-owner > "${database_backup}.tmp"

echo "Creo il backup degli upload..."
"${compose[@]}" run --rm --no-deps --entrypoint tar api \
  -C /app/uploads -czf - . > "${uploads_backup}.tmp"

if [[ ! -s "${database_backup}.tmp" || ! -s "${uploads_backup}.tmp" ]]; then
  echo "Backup fallito: uno degli archivi e vuoto." >&2
  exit 1
fi

mv "${database_backup}.tmp" "${database_backup}"
mv "${uploads_backup}.tmp" "${uploads_backup}"

if command -v sha256sum >/dev/null 2>&1; then
  (
    cd "${BACKUP_DIR}"
    sha256sum "$(basename "${database_backup}")" "$(basename "${uploads_backup}")"
  ) > "${checksums}"
else
  (
    cd "${BACKUP_DIR}"
    shasum -a 256 "$(basename "${database_backup}")" "$(basename "${uploads_backup}")"
  ) > "${checksums}"
fi

chmod 600 "${database_backup}" "${uploads_backup}" "${checksums}"

echo "Backup completato: ${prefix}"
echo "Manifest checksum: ${checksums}"
