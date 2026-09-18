# Audit dipendenze

La pipeline CI contiene il job `Dependency audit`. Il job blocca la build in
presenza di vulnerabilita npm di livello high o critical e controlla le
dipendenze Python installate usando il database OSV.

## JavaScript

Il lockfile radice include sia il workspace React sia Playwright. Il controllo
canonico e:

```bash
npm ci
npm audit --audit-level=high
```

L'immagine web usa anche `apps/web/package-lock.json`; una modifica alle
dipendenze frontend deve aggiornare entrambi i lockfile e superare:

```bash
cd apps/web
npm ci
npm audit --audit-level=high
```

Non usare `npm audit fix --force`: gli aggiornamenti major vanno applicati in
modo esplicito e verificati con lint, test, build production ed E2E.

## Python

La CI installa le dipendenze runtime dell'API e una versione fissata dello
scanner, poi esegue:

```bash
pip-audit --local --skip-editable --vulnerability-service osv
```

Per riprodurre il controllo nel container di sviluppo senza modificare il
progetto:

```bash
docker compose exec api pip install pip-audit==2.10.1
docker compose exec api \
  pip-audit --local --skip-editable --vulnerability-service osv
```

## Regola di aggiornamento

1. Leggere advisory, pacchetto coinvolto e percorso della dipendenza.
2. Distinguere runtime, build e sviluppo senza ignorare automaticamente questi
   ultimi due ambienti.
3. Aggiornare direttamente il pacchetto proprietario della dipendenza.
4. Rigenerare i lockfile con installazioni non forzate.
5. Eseguire suite backend, frontend, immagini production ed E2E.
6. Annotare esplicitamente eventuali vulnerabilita accettate, con motivazione,
   scadenza e responsabile, nella checklist di release.

Al 18 settembre 2026 gli audit npm e Python locali non riportano vulnerabilita
note dopo l'aggiornamento di Vite, Vitest, Playwright e `js-yaml`.
