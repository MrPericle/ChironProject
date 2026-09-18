# Setup sviluppatore

Questa guida porta un clone nuovo fino a un ambiente locale funzionante usando
Docker. Non richiede Python, PostgreSQL o Node installati sul computer per il
normale sviluppo dell'app.

## Prerequisiti

- Git;
- Docker Desktop con `docker compose`;
- almeno 4 GB liberi per immagini, database e browser E2E;
- Node.js 20 o successivo soltanto per eseguire Playwright dal computer host.

Verificare gli strumenti:

```bash
git --version
docker --version
docker compose version
```

## Primo avvio

1. Clonare e aprire il repository.

   ```bash
   git clone git@github.com:MrPericle/ChironProject.git
   cd ChironProject
   ```

2. Creare l'ambiente locale. Il file risultante non va committato.

   ```bash
   cp .env.example .env
   ```

3. Costruire le immagini e avviare prima PostgreSQL.

   ```bash
   docker compose build
   docker compose up -d db
   ```

4. Applicare tutte le migrazioni.

   ```bash
   docker compose run --rm api alembic upgrade head
   ```

5. Avviare API e frontend.

   ```bash
   docker compose up -d api web
   docker compose ps
   ```

Servizi disponibili:

- frontend: `http://localhost:5173`;
- API: `http://localhost:8000`;
- Swagger: `http://localhost:8000/docs`;
- health check: `http://localhost:8000/health`.

Il codice API e web e montato nei container: le modifiche normali ricaricano i
server automaticamente.

## Account locale

Un utente puo registrarsi dal frontend. Per creare o promuovere un admin:

```bash
docker compose exec api python -m chiron_api.cli create-admin
```

Il comando chiede email, nome, cognome e, per un account nuovo, una password di
almeno 12 caratteri. Al primo login il backoffice richiede il setup 2FA tramite
QR code e codice TOTP.

Non esistono credenziali admin predefinite nel repository.

## Comandi quotidiani

```bash
# Stato e log
docker compose ps
docker compose logs -f api web

# Arresto senza perdere dati
docker compose down

# Riavvio
docker compose up -d

# Rebuild dopo modifiche a dipendenze o Dockerfile
docker compose build api web
docker compose up -d api web
```

Non usare `docker compose down -v` salvo quando si vuole eliminare
deliberatamente il database locale e tutti i dati persistenti.

## Migrazioni database

Dopo aver aggiornato il branch:

```bash
docker compose run --rm api alembic upgrade head
```

Dopo una modifica intenzionale ai modelli SQLAlchemy, generare una revisione,
leggerla e poi provarla sia in upgrade sia su un database pulito:

```bash
docker compose exec api alembic revision --autogenerate -m "descrizione breve"
docker compose exec api alembic upgrade head
```

Le migrazioni sono in `apps/api/migrations/versions` e devono essere incluse nel
commit insieme al cambiamento di schema.

## Test e controlli

```bash
# Backend
docker compose exec api ruff check src tests
docker compose exec api pytest

# Frontend
npm ci
npm run lint:web
npm run test:web
npm run build:web

# Flussi critici desktop e mobile in stack isolato
npx playwright install chromium
npm run test:e2e:local
```

La suite E2E usa porte e volumi dedicati, poi rimuove il proprio stack. Dettagli
in `docs/testing/E2E.md`.

## Configurazione

Le variabili documentate sono in `.env.example`. Le piu comuni in locale sono:

- `API_PORT` e `WEB_PORT`, se 8000 o 5173 sono occupate;
- `APP_CORS_ORIGINS`, da allineare all'URL effettivo del frontend;
- `VITE_API_BASE_URL`, da allineare alla porta API;
- `API_DOCS_ENABLED`, per Swagger, ReDoc e OpenAPI;
- `BOOKING_HORIZON_DAYS`, per la finestra prenotabile.

Le variabili production e i secret non devono essere inseriti in `.env` locale
o committati. Il deploy usa `.env.production` soltanto sul VPS.

## Diagnostica rapida

Se il frontend non raggiunge l'API:

```bash
docker compose ps
docker compose logs --tail=100 api web
curl -i http://localhost:8000/health
```

Se compare un errore di tabella mancante, rieseguire `alembic upgrade head`. Se
una nuova dipendenza non viene trovata, ricostruire il relativo container. Per
un errore CORS, controllare insieme `APP_CORS_ORIGINS`, `WEB_PORT` e l'origine
mostrata dalla console del browser.
