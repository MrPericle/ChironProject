# Chiron Project

Web app per la gestione corsi di una ASD dedicata al movimento a corpo libero: calisthenics, arti marziali e pole dance.

## Stack

- Backend: FastAPI, Python, pytest.
- Frontend: React, Vite, TypeScript.
- Database: PostgreSQL.
- Infra locale: Docker Compose.
- CI/CD: GitHub Actions.

## Struttura

```text
apps/api      Backend FastAPI
apps/web      Frontend React/Vite
docs          Documentazione tecnica e roadmap
infra         Docker, Caddy e deploy
packages      Codice condiviso futuro
tests/e2e     Test end-to-end Playwright
```

## Avvio locale

```bash
cp .env.example .env
docker compose build
docker compose up -d db
docker compose run --rm api alembic upgrade head
docker compose up -d api web
```

Servizi attesi:

- API: `http://localhost:8000`
- Health check API: `http://localhost:8000/health`
- Frontend: `http://localhost:5173`
- Documentazione API: `http://localhost:8000/docs`

La panoramica di autenticazione, ruoli e route e in `docs/api/API.md`.
La guida completa per ambiente, migrazioni, test e diagnostica e in
`docs/development/SETUP.md`.

## Preparazione production

Gli artefatti production possono essere validati e costruiti localmente senza
avviare un deploy:

```bash
docker compose --env-file .env.production.example -f docker-compose.prod.yml config
docker compose --env-file .env.production.example -f docker-compose.prod.yml build api web
```

La procedura VPS e in `docs/deploy/DIGITALOCEAN.md`; backup e verifica restore
sono descritti in `docs/deploy/BACKUP_RESTORE.md`.

La checklist di sicurezza applicativa e in `docs/security/HARDENING.md`.

## Test end-to-end

La suite critica usa uno stack Docker isolato e copre desktop e mobile:

```bash
npm ci
npx playwright install chromium
npm run test:e2e:local
```

Dettagli e copertura sono in `docs/testing/E2E.md`.

## Roadmap

La roadmap incrementale e' in `docs/roadmap/ROADMAP.md`.
