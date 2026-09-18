# Hardening applicativo

Questa checklist descrive le protezioni attive nell'MVP MAKA e i controlli da
ripetere dopo modifiche all'autenticazione o all'infrastruttura.

## Autenticazione

- Login e verifica/conferma 2FA applicano un limite a finestra mobile per
  indirizzo client e identita richiesta.
- Il valore predefinito e di 8 errori in 60 secondi. Una richiesta bloccata
  restituisce `429` e l'header `Retry-After`.
- I contatori vengono azzerati dopo un'autenticazione riuscita e non conservano
  email o token in chiaro: la chiave usa un'impronta SHA-256 troncata.
- Le variabili `AUTH_RATE_LIMIT_ATTEMPTS` e
  `AUTH_RATE_LIMIT_WINDOW_SECONDS` permettono di cambiare la soglia senza
  ricostruire l'immagine.

Il limiter e locale al processo. L'attuale deploy usa una singola istanza API;
prima di aumentare repliche o worker va sostituito con un contatore condiviso,
per esempio Redis.

## Token e browser

L'app non usa cookie di autenticazione: invia access token bearer nell'header
`Authorization` e conserva la sessione nel `localStorage`. Di conseguenza non
sono necessarie opzioni `SameSite`, `Secure` o una difesa CSRF basata sui cookie.
La Content Security Policy limita script e connessioni per ridurre il rischio
XSS associato al salvataggio locale dei token.

I refresh token sono monouso, vengono ruotati al refresh e revocati al logout,
alla disattivazione o all'eliminazione dell'utente.

## CORS e configurazione production

- CORS ammette solo le origini dichiarate in `APP_CORS_ORIGINS`.
- Metodi e header consentiti sono espliciti; le credenziali browser sono
  disabilitate perche l'app usa bearer token e non cookie.
- In `APP_ENV=production` l'avvio fallisce con secret inferiore a 64 caratteri,
  origini non HTTPS, wildcard, credenziali nell'URL o origini contenenti path.
- Swagger e ReDoc restano disponibili in sviluppo e disabilitati in production.

## Header HTTP

FastAPI aggiunge `nosniff`, `DENY`, una referrer policy restrittiva, una
Permissions Policy e `Cache-Control: no-store` alle aree sensibili. Nginx replica
gli header di base nell'immagine web. Caddy applica inoltre HSTS e una CSP che
consente al frontend di collegarsi soltanto all'API configurata.

## Protezione input

- I payload sono validati da Pydantic con limiti di lunghezza e tipi espliciti.
- Le query applicative usano SQLAlchemy e non concatenano input in SQL testuale.
- Le immagini corso sono limitate a JPG, PNG o WebP, massimo 5 MB, e vengono
  salvate con un nome generato dal server.

## Verifica tecnica

```bash
docker compose exec api ruff check src tests
docker compose exec api pytest
docker compose --env-file .env.production.example -f docker-compose.prod.yml config --quiet
docker run --rm \
  -e ACME_EMAIL=admin@example.it \
  -e APP_DOMAIN=example.it \
  -e API_DOMAIN=api.example.it \
  -v "$PWD/infra/caddy/Caddyfile:/etc/caddy/Caddyfile:ro" \
  caddy:2-alpine caddy validate --config /etc/caddy/Caddyfile
```

In staging, controllare anche gli header effettivamente esposti:

```bash
curl -sSI https://staging.makastudio.it
curl -sSI https://api.staging.makastudio.it/health
```
