#!/usr/bin/env bash

set -Eeuo pipefail

if [[ $# -ne 1 ]]; then
  echo "Uso: $0 /percorso/maka-TIMESTAMP.sha256" >&2
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-.env.production}"
checksums="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
backup_dir="$(dirname "${checksums}")"
prefix="$(basename "${checksums}" .sha256)"
database_backup="${backup_dir}/${prefix}.database.dump"
uploads_backup="${backup_dir}/${prefix}.uploads.tar.gz"

if [[ ! -f "${ROOT_DIR}/${COMPOSE_FILE}" || ! -f "${ROOT_DIR}/${ENV_FILE}" ]]; then
  echo "Compose file o environment file non trovato." >&2
  exit 1
fi

if [[ ! -f "${checksums}" || ! -f "${database_backup}" || ! -f "${uploads_backup}" ]]; then
  echo "Set di backup incompleto per ${prefix}." >&2
  exit 1
fi

read_env_value() {
  local key="$1"
  awk -F= -v key="${key}" '$1 == key {sub(/^[^=]*=/, ""); print; exit}' "${ROOT_DIR}/${ENV_FILE}"
}

POSTGRES_DB="${POSTGRES_DB:-$(read_env_value POSTGRES_DB)}"
POSTGRES_USER="${POSTGRES_USER:-$(read_env_value POSTGRES_USER)}"
restore_database="${POSTGRES_DB}_restore_check_$(date -u +%s)"
compose=(docker compose --env-file "${ROOT_DIR}/${ENV_FILE}" -f "${ROOT_DIR}/${COMPOSE_FILE}")

cleanup() {
  "${compose[@]}" exec -T db dropdb \
    --username "${POSTGRES_USER}" \
    --if-exists "${restore_database}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "Verifico i checksum..."
if command -v sha256sum >/dev/null 2>&1; then
  (cd "${backup_dir}" && sha256sum --check "$(basename "${checksums}")")
else
  (cd "${backup_dir}" && shasum -a 256 --check "$(basename "${checksums}")")
fi

echo "Verifico l'archivio upload..."
tar -tzf "${uploads_backup}" >/dev/null

echo "Ripristino il dump nel database temporaneo ${restore_database}..."
"${compose[@]}" exec -T db createdb \
  --username "${POSTGRES_USER}" \
  "${restore_database}"
"${compose[@]}" exec -T db pg_restore \
  --username "${POSTGRES_USER}" \
  --dbname "${restore_database}" \
  --exit-on-error \
  --no-owner \
  --no-privileges < "${database_backup}"

table_count="$(
  "${compose[@]}" exec -T db psql \
    --username "${POSTGRES_USER}" \
    --dbname "${restore_database}" \
    --tuples-only \
    --no-align \
    --command "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';"
)"

if [[ "${table_count}" -eq 0 ]]; then
  echo "Verifica fallita: il database ripristinato non contiene tabelle." >&2
  exit 1
fi

echo "Backup verificato: ${table_count} tabelle ripristinate, database temporaneo in rimozione."
