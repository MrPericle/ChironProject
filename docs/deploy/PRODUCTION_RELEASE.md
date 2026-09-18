# Promozione di MAKA in produzione

Ultimo aggiornamento: 18 settembre 2026

Questa procedura chiude la Milestone 9 senza creare una seconda infrastruttura.
Lo stack attualmente pubblicato su `staging.makastudio.it` viene promosso in
place a `makastudio.it`: database, account, corsi, prenotazioni, upload e volumi
restano gli stessi. Al termine, gli hostname di staging vengono ritirati.

Il cutover deve essere eseguito insieme durante una finestra concordata. Non
avviare il workflow di produzione prima di avere completato i prerequisiti e
aggiornato DNS e `.env.production`.

## Prerequisiti

- collaudo staging approvato dal cliente;
- branch `main` aggiornato e pipeline CI verde;
- accesso SSH `deploy` verificato;
- backup applicativo recente copiato fuori dal VPS;
- restore del backup gia provato;
- accesso al DNS di `makastudio.it`;
- environment GitHub `production` protetto da approvazione;
- finestra di manutenzione comunicata.

## Configurazione GitHub una tantum

In GitHub aprire `Settings > Environments`, creare `production` e configurare:

1. almeno un revisore obbligatorio;
2. deployment consentito soltanto dal branch `main`;
3. i secret `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_PRIVATE_KEY` e
   `DEPLOY_KNOWN_HOSTS`.

| Secret | Contenuto |
| --- | --- |
| `DEPLOY_HOST` | IP pubblico o hostname SSH del VPS |
| `DEPLOY_USER` | `deploy` |
| `DEPLOY_SSH_PRIVATE_KEY` | chiave privata dedicata esclusivamente a GitHub Actions |
| `DEPLOY_KNOWN_HOSTS` | chiave host SSH verificata del VPS |

Creare una chiave SSH dedicata, senza riutilizzare quella personale o la Deploy
key con cui il server legge GitHub. La chiave pubblica va aggiunta a
`/home/deploy/.ssh/authorized_keys`; la privata va salvata soltanto nel secret
dell'environment. Verificare separatamente il fingerprint del server prima di
salvare `DEPLOY_KNOWN_HOSTS`.

Configurare inoltre una ruleset di `main` che richieda il completamento della
pipeline `CI` prima del merge.

## Preparazione del cutover

### 1. Backup finale dello staging

Sul VPS:

```bash
cd /srv/maka/app
BACKUP_DIR=/srv/maka-backups ./scripts/backup.sh
./scripts/verify-backup.sh /srv/maka-backups/maka-TIMESTAMP.sha256
```

Copiare il set verificato anche nello storage esterno prima di continuare.

### 2. Record DNS di produzione

Nel pannello DNS configurare:

| Tipo | Nome | Destinazione |
| --- | --- | --- |
| `A` | `@` | IP pubblico del VPS |
| `A` | `api` | IP pubblico del VPS |
| `CNAME` | `www` | `makastudio.it` |

Usare temporaneamente un TTL di 300 secondi. Verificare la propagazione:

```bash
dig +short makastudio.it
dig +short api.makastudio.it
dig +short www.makastudio.it
```

### 3. Variabili sul VPS

Conservare una copia protetta della configurazione staging:

```bash
cd /srv/maka/app
cp .env.production .env.production.staging-backup
chmod 600 .env.production.staging-backup
```

Modificare esclusivamente questi valori in `.env.production`:

```dotenv
APP_DOMAIN=makastudio.it
API_DOMAIN=api.makastudio.it
APP_CORS_ORIGINS=https://makastudio.it
VITE_API_BASE_URL=https://api.makastudio.it
```

Non cambiare credenziali PostgreSQL o nomi dei volumi durante la promozione.
Questo preserva tutti i dati collaudati nello staging.

Validare senza avviare il deploy:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml config --quiet
```

## Avvio controllato

1. Pubblicare su `main` tutti i commit approvati.
2. Attendere che la pipeline `CI` sia verde.
3. Aprire `Actions > Deploy production > Run workflow`.
4. Selezionare `main`, inserire esattamente `DEPLOY` e avviare.
5. Il revisore dell'environment controlla commit e finestra di manutenzione,
   quindi approva il job.

Il workflow aggiorna il repository solo con fast-forward, verifica il commit e
i domini attesi, quindi esegue `scripts/deploy-release.sh`. Lo script:

1. impedisce deploy concorrenti;
2. rifiuta repository sporchi o configurazioni non production;
3. valida Docker Compose;
4. crea il backup pre-release;
5. ricostruisce API e frontend;
6. applica le migrazioni Alembic;
7. aggiorna lo stack e attende i container healthy;
8. esegue smoke test HTTPS su web e API.

## Collaudo immediato

Verificare dall'esterno:

```bash
curl -fsS https://api.makastudio.it/health
curl -I https://makastudio.it
curl -I https://www.makastudio.it
```

Poi eseguire almeno:

- login utente e amministratore con 2FA;
- consultazione corsi e calendario;
- prenotazione e cancellazione di una lezione di prova;
- creazione e modifica di un corso dal backoffice;
- verifica partecipanti nel calendario admin;
- caricamento e visualizzazione di una foto corso;
- controllo mobile su un telefono reale.

Solo dopo il collaudo eliminare i record DNS di staging. Conservare il backup e
`.env.production.staging-backup` fino alla chiusura della finestra.

## Gestione di un errore

Lo script mostra automaticamente stato e ultimi log di API, web e Caddy. Non
esegue rollback automatici del database: una migrazione potrebbe non essere
compatibile con una versione precedente dell'applicazione.

- Se l'errore avviene prima delle migrazioni, correggere la causa e rilanciare
  lo stesso commit.
- Se riguarda soltanto DNS o domini, ripristinare la configurazione staging e
  ricreare lo stack durante la stessa finestra.
- Se una migrazione ha modificato dati o schema, seguire
  `docs/deploy/BACKUP_RESTORE.md` e procedere soltanto con approvazione esplicita.
- Non usare mai `docker compose down -v`.

## Punto di arresto attuale

Workflow, script e documentazione sono pronti. Restano volutamente manuali e da
eseguire insieme: creazione dei secret GitHub, modifica DNS, aggiornamento di
`.env.production`, approvazione del workflow e collaudo finale.
