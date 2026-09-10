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
tests/e2e     Test end-to-end futuri
```

## Avvio locale

```bash
docker compose up --build
```

Servizi attesi:

- API: `http://localhost:8000`
- Health check API: `http://localhost:8000/health`
- Frontend: `http://localhost:5173`

## Preparazione production

Gli artefatti production possono essere validati e costruiti localmente senza
avviare un deploy:

```bash
docker compose --env-file .env.production.example -f docker-compose.prod.yml config
docker compose --env-file .env.production.example -f docker-compose.prod.yml build api web
```

La procedura VPS e in `docs/deploy/DIGITALOCEAN.md`; backup e verifica restore
sono descritti in `docs/deploy/BACKUP_RESTORE.md`.

## Roadmap

La roadmap incrementale e' in `docs/roadmap/ROADMAP.md`.
