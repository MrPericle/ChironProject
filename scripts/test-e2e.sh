#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

export COMPOSE_PROJECT_NAME="maka-e2e"
export POSTGRES_PORT="55432"
export API_PORT="18000"
export WEB_PORT="15173"
export VITE_API_BASE_URL="http://127.0.0.1:${API_PORT}"
export APP_CORS_ORIGINS="http://127.0.0.1:${WEB_PORT}"
export E2E_API_URL="http://127.0.0.1:${API_PORT}"
export E2E_WEB_URL="http://127.0.0.1:${WEB_PORT}"

compose=(docker compose -p "${COMPOSE_PROJECT_NAME}" -f docker-compose.yml)
test_succeeded=false

cleanup() {
  if [[ "${test_succeeded}" != "true" ]]; then
    "${compose[@]}" ps || true
    "${compose[@]}" logs --tail=120 api web || true
  fi
  "${compose[@]}" down --volumes --remove-orphans
}
trap cleanup EXIT

"${compose[@]}" up -d --build db api web
"${compose[@]}" exec -T api alembic upgrade head
"${compose[@]}" exec -T api python - < tests/e2e/seed_admins.py

for attempt in {1..30}; do
  if curl --fail --silent "${E2E_API_URL}/health" >/dev/null && \
    curl --fail --silent "${E2E_WEB_URL}" >/dev/null; then
    break
  fi
  if [[ "${attempt}" -eq 30 ]]; then
    echo "Lo stack E2E non e diventato raggiungibile." >&2
    exit 1
  fi
  sleep 2
done

npm run test:e2e
test_succeeded=true
