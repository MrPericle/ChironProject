# Roadmap progetto ASD corsi

## Obiettivo iniziale

Creare una web app production-ready per una ASD che gestisce corsi, sedi, utenti iscritti, prenotazioni con posti limitati e backoffice admin. Il pagamento resta fuori dall'app: la piattaforma mostra solo la scadenza informativa dell'abbonamento calcolata dalla data di iscrizione.

## Stack proposto

- Backend: Python FastAPI, SQLAlchemy 2, Alembic, Pydantic.
- Frontend: React, Vite, TypeScript.
- Database: PostgreSQL.
- Test: pytest per backend, Playwright per end-to-end, test component/unit per frontend.
- Infra: Docker Compose su VPS singolo, reverse proxy Caddy, HTTPS automatico.
- CI/CD: GitHub Actions con lint, test, build e deploy via SSH/Docker Compose.

Motivazione: lo stack resta semplice da gestire su un singolo VPS, ha buona manutenibilita, testabilita alta e non introduce complessita da microservizi o Kubernetes.

## Scheletro creato

```text
apps/
  api/
    src/
      admin/
      auth/
      bookings/
      common/
      config/
      courses/
      db/
      locations/
      subscriptions/
      users/
    tests/
      fixtures/
      integration/
      unit/
  web/
    public/
    src/
      app/
      components/
      features/
      lib/
      styles/
docs/
  api/
  architecture/
  data-model/
  deploy/
  roadmap/
  testing/
infra/
  deploy/
  docker/
  github-actions/
  nginx/
packages/
  shared/
    src/
scripts/
tests/
  e2e/
```

## Modello dati atteso

Entita principali:

- users: account applicativi con email, password hash, ruolo e stato.
- user_profiles: dati anagrafici separati dall'account.
- locations: sedi fisiche della ASD.
- courses: corsi associati a una sede e a un referente.
- course_sessions: ricorrenze/orari dei corsi e capienza.
- bookings: prenotazioni utente su sessione, con stato e vincoli anti-overbooking.
- subscriptions: iscrizione informativa con data inizio, durata e scadenza calcolata.
- audit_logs: eventi admin e azioni sensibili.
- admin_2fa: configurazione 2FA per ruoli admin/staff.

Scelte chiave:

- Separare course e course_session permette di gestire piu orari settimanali per lo stesso corso.
- La disponibilita dei posti deve essere protetta lato database tramite transazioni e lock, non solo con controlli applicativi.
- La scadenza abbonamento e informativa e calcolata da data inizio + durata, senza stato pagamento.

## API principali attese

- Auth: registrazione, login, refresh/logout, setup/verifica 2FA admin.
- Utente: profilo, storico prenotazioni, scadenza abbonamento.
- Catalogo: lista corsi, filtri per sede/orario/disponibilita, dettaglio corso.
- Prenotazioni: crea prenotazione, cancella prenotazione entro soglia, leggi stato.
- Admin sedi: CRUD sedi.
- Admin corsi: CRUD corsi e sessioni/orari.
- Admin iscritti: elenco iscritti, dettaglio prenotazioni, scadenze informative.
- Dashboard: iscritti attivi, corsi richiesti, abbonamenti in scadenza.

## Milestone 1 - Setup iniziale progetto e infrastruttura

### `chore: definisci struttura monorepo`

Descrizione: creare struttura base per backend, frontend, documentazione, infra e test end-to-end.

Definition of done: directory presenti, roadmap iniziale documentata, nessun codice applicativo non necessario.

### `chore: inizializza backend FastAPI`

Descrizione: aggiungere configurazione backend minima, dependency manager, entrypoint applicativo e health check.

Definition of done: app avviabile in locale, health check testato, struttura coerente con moduli previsti.

### `chore: inizializza frontend React`

Descrizione: aggiungere progetto React con Vite, TypeScript, layout base e configurazione lint.

Definition of done: frontend avviabile in locale, build base verde.

### `chore: configura ambienti locali`

Descrizione: aggiungere file esempio per variabili ambiente, convenzioni per dev/staging/prod e gestione segreti fuori repo.

Definition of done: `.env.example` documentato, nessun segreto reale nel repository.

### `chore: docker compose sviluppo`

Descrizione: predisporre Docker Compose per API, web e PostgreSQL in ambiente locale.

Definition of done: stack locale avviabile con un solo comando e database persistente in volume locale.

### `ci: pipeline base lint test build`

Descrizione: creare GitHub Actions base con lint, test backend, test frontend e build.

Definition of done: pipeline verde su push/PR, fallisce correttamente in caso di test rotti.

## Milestone 2 - Modello dati e migrazioni

### `test: copri invarianti modello dati`

Descrizione: scrivere test sulle regole principali prima delle migrazioni: utenti unici, sedi, corsi, sessioni, prenotazioni, scadenza.

Definition of done: test inizialmente rossi e aderenti ai requisiti core.

### `feat: configura database e migrazioni`

Descrizione: integrare PostgreSQL, SQLAlchemy e Alembic.

Definition of done: migrazione iniziale applicabile e rollback verificato in ambiente locale.

### `feat: modello dati utenti e ruoli`

Descrizione: creare tabelle utenti, profili, ruoli minimi admin/staff/user e vincoli di unicita.

Definition of done: migrazione applicata, test unitari e integration test verdi.

### `feat: modello dati sedi corsi sessioni`

Descrizione: creare sedi, corsi e sessioni con orari, capienza, referente opzionale.

Definition of done: vincoli principali testati, capienza positiva, sede obbligatoria.

### `feat: modello dati prenotazioni`

Descrizione: creare prenotazioni con stati planned/cancelled/waitlisted e relazione a utente/sessione.

Definition of done: vincolo anti-duplicazione utente-sessione testato.

### `feat: modello dati abbonamenti informativi`

Descrizione: creare subscriptions con data inizio, durata giorni e scadenza calcolata.

Definition of done: test sul calcolo scadenza verdi, nessun campo relativo a pagamento.

## Milestone 3 - Autenticazione e ruoli

### `test: specifica flussi auth e permessi`

Descrizione: testare registrazione, login, accesso protetto e divieti tra ruoli.

Definition of done: test rossi per scenari utente/admin/staff.

### `feat: registrazione e login email password`

Descrizione: implementare registrazione e login con password hash sicuro.

Definition of done: test auth verdi, password mai salvata in chiaro.

### `feat: sessioni jwt e refresh token`

Descrizione: implementare access token breve, refresh token e logout.

Definition of done: endpoint protetti funzionanti, refresh revocabile.

### `feat: middleware rbac`

Descrizione: aggiungere controllo ruoli per endpoint admin, staff e utente.

Definition of done: test permessi verdi su endpoint protetti.

### `feat: 2fa obbligatoria per admin`

Descrizione: implementare setup e verifica TOTP per account admin/staff.

Definition of done: admin senza 2FA non puo completare accesso a backoffice.

### `feat: cancellazione account gdpr`

Descrizione: predisporre cancellazione/anonymization account secondo vincoli di storico operativo.

Definition of done: dati personali rimossi o anonimizzati, integrita storico prenotazioni preservata.

## Milestone 4 - Gestione corsi e sedi

### `test: specifica crud sedi e corsi`

Descrizione: testare creazione, modifica, eliminazione e lettura di sedi, corsi e sessioni.

Definition of done: test rossi per CRUD admin e staff.

### `feat: api crud sedi`

Descrizione: endpoint backoffice per creare, modificare, disattivare e listare sedi.

Definition of done: integration test verdi e accesso limitato a ruoli autorizzati.

### `feat: api crud corsi`

Descrizione: endpoint per corsi con sede, referente, descrizione e stato pubblicazione.

Definition of done: CRUD testato, validazione input attiva.

### `feat: api crud sessioni corso`

Descrizione: endpoint per orari settimanali, capienza e finestre di cancellazione.

Definition of done: test su modifica capienza e sessioni future verdi.

### `feat: catalogo corsi filtrabile`

Descrizione: endpoint pubblico/autenticato per lista corsi filtrabile per sede, orario e disponibilita.

Definition of done: filtri testati con dataset fixture realistico.

## Milestone 5 - Prenotazioni e concorrenza

### `test: specifica prenotazione con posti limitati`

Descrizione: testare prenotazione, duplicati, cancellazione e corso pieno.

Definition of done: test rossi sui casi nominali e limite.

### `test: specifica concorrenza prenotazioni`

Descrizione: simulare richieste concorrenti sulla stessa sessione con capienza bassa.

Definition of done: test riproducibile che dimostra assenza di overbooking.

### `feat: crea prenotazione atomica`

Descrizione: implementare prenotazione in transazione con lock su sessione o strategia equivalente PostgreSQL.

Definition of done: test concorrenza verdi, numero prenotazioni confermate mai oltre capienza.

### `feat: cancella prenotazione entro soglia`

Descrizione: permettere cancellazione solo entro finestra configurabile.

Definition of done: test su cancellazione consentita e negata verdi.

### `feat: lista attesa opzionale`

Descrizione: introdurre stato waitlisted quando sessione piena, se abilitato da configurazione.

Definition of done: comportamento coperto da test e disattivabile.

### `feat: storico prenotazioni utente`

Descrizione: endpoint utente per visualizzare prenotazioni future, passate e cancellate.

Definition of done: storico ordinato e filtrabile, accesso limitato al proprietario.

## Milestone 6 - Scadenza abbonamento informativa

### `test: specifica calcolo scadenza abbonamento`

Descrizione: testare scadenza da data iscrizione e durata configurata.

Definition of done: test coprono timezone, default 30 giorni e durata personalizzata.

### `feat: servizio scadenza abbonamento`

Descrizione: implementare calcolo centralizzato senza stato pagamento.

Definition of done: servizio testato e riusato da API utente/admin.

### `feat: api scadenza utente`

Descrizione: endpoint utente per mostrare la scadenza informativa.

Definition of done: test autorizzazione e formato risposta verdi.

### `feat: api elenco scadenze admin`

Descrizione: endpoint backoffice per elenco iscritti e scadenze.

Definition of done: filtri per sede/scadenza testati, nessun workflow pagamento introdotto.

## Milestone 7 - Frontend area utente

### `test: definisci flussi utente principali`

Descrizione: testare navigazione catalogo, login, prenotazione, cancellazione e storico.

Definition of done: Playwright o test component predisposti prima dell'implementazione.

### `feat: shell frontend autenticata`

Descrizione: layout area utente, gestione sessione e guardie route.

Definition of done: route protette e stati logged in/out verificati.

### `feat: catalogo corsi utente`

Descrizione: UI per lista corsi con filtri sede/orario/disponibilita.

Definition of done: filtri usabili, stati loading/empty/error presenti.

### `feat: dettaglio corso e prenotazione`

Descrizione: UI dettaglio sessioni disponibili e azione prenota.

Definition of done: prenotazione confermata e casi corso pieno gestiti.

### `feat: storico e cancellazione prenotazioni`

Descrizione: UI per storico personale e cancellazione entro soglia.

Definition of done: cancellazione aggiorna lista e messaggi di errore chiari.

### `feat: vista scadenza abbonamento`

Descrizione: mostrare data scadenza informativa nell'area utente.

Definition of done: nessun riferimento a pagamento o solleciti automatici.

## Milestone 8 - Frontend backoffice admin

### `test: definisci flussi backoffice`

Descrizione: testare login admin, dashboard, CRUD sedi/corsi e consultazione iscritti.

Definition of done: test e2e o component per scenari critici pronti.

### `feat: shell backoffice con rbac`

Descrizione: layout admin/staff, navigazione e protezione route.

Definition of done: utente normale escluso dal backoffice.

### `feat: dashboard riepilogativa`

Descrizione: visualizzare iscritti attivi, corsi richiesti e scadenze imminenti.

Definition of done: dati caricati da API e stati vuoti gestiti.

### `feat: gestione sedi`

Descrizione: UI CRUD sedi.

Definition of done: creazione/modifica/disattivazione testate.

### `feat: gestione corsi e sessioni`

Descrizione: UI CRUD corsi, orari, capienza e associazione sede.

Definition of done: validazioni client/server coerenti.

### `feat: elenco iscritti e prenotazioni`

Descrizione: UI per consultare iscritti per corso, stato prenotazioni e scadenze.

Definition of done: filtri e ordinamenti principali funzionanti.

## Incremento completato - Programmazione corsi, media e calendari

### `feat: periodizzazione settimanale corsi`

Completato: l'admin puo creare in un'unica operazione ricorrenze su piu giorni, configurando ora di inizio, ora di fine, capienza e limite di cancellazione. Ogni ricorrenza puo essere modificata o disattivata singolarmente.

### `fix: vincoli su capienza e sovrapposizioni`

Completato: non e possibile duplicare lo stesso corso nella stessa sede o creare due ricorrenze attive identiche per corso, giorno e fascia oraria. La capienza non puo essere ridotta sotto il numero di prenotazioni confermate.

### `feat: immagini e discipline corso`

Completato: i corsi hanno una disciplina esplicita e una foto JPEG, PNG o WebP caricabile dall'admin. Il catalogo usa la foto caricata o un visual coerente con la disciplina, senza dedurla dal titolo.

### `feat: calendari utente e backoffice`

Completato: area utente e backoffice dispongono di un calendario adattivo per data. L'utente prenota la singola lezione selezionata; l'admin consulta orari, sedi, capienza e partecipanti del giorno.

### `security: login admin 2fa a due passaggi`

Completato: il primo passaggio verifica email e password, il secondo richiede il codice TOTP tramite una challenge breve; il backoffice viene aperto soltanto dopo entrambe le verifiche.
La prima configurazione mostra un QR Code generato localmente nel browser e
mantiene la chiave manuale come alternativa accessibile.

## Incremento completato - Occorrenze datate e consolidamento pre-deploy

### `feat: prenotazioni per singola occorrenza`

Completato: ogni ricorrenza settimanale genera lezioni prenotabili per data. Posti, lista attesa, cancellazione e partecipanti admin sono calcolati sulla singola occorrenza, permettendo allo stesso utente di prenotare settimane diverse dello stesso corso.

### `fix: invarianti iscrizioni, utenti e statistiche`

Completato: le statistiche conteggiano utenti unici abilitati e sole prenotazioni confermate. La disabilitazione o eliminazione di un account libera le prenotazioni future; l'utente puo eliminare il proprio account senza lasciare posti occupati.

### `test: consolida flussi critici prima del deploy`

Completato: test backend e frontend coprono concorrenza, capienza per data, validita dell'iscrizione nella data della lezione, partecipanti admin e rilascio delle prenotazioni.

## Incremento completato - Cancellazione corsi e collaboratori

### `feat: elimina definitivamente corsi e dati collegati`

Completato: l'admin e i collaboratori possono eliminare definitivamente un
corso con conferma esplicita. La cancellazione rimuove lezioni, prenotazioni e
immagini associate; le prenotazioni eliminate scompaiono anche dall'area
utente al successivo aggiornamento dei dati.

### `feat: ruolo collaboratore per la gestione corsi`

Completato: l'admin puo promuovere un utente a Collaboratore. Il collaboratore
accede al backoffice con 2FA e puo gestire sedi, corsi, calendario e
partecipanti, ma non puo visualizzare o modificare utenti e iscrizioni. Il
cambio di ruolo revoca le sessioni precedenti e richiede un nuovo accesso. Un
comando adattivo nell'header permette inoltre di passare all'area personale,
prenotare secondo le normali regole di iscrizione e tornare al backoffice.

## Incremento completato - Discipline e chiarezza gestione utenti

### `feat: discipline corsi configurabili`

Completato: la creazione corsi propone Sala, Arti marziali, Pole e Altro.
L'amministratore puo aggiungere nuove discipline, immediatamente disponibili
nei form di creazione e modifica; i collaboratori possono usare le discipline
registrate senza modificarne l'elenco.

### `fix: azioni utenti esplicite e contestuali`

Completato: la scheda utente distingue modifica dati e permessi, gestione
dell'iscrizione, sospensione dell'accesso ed eliminazione account. Ogni
salvataggio e collocato nella relativa sezione e l'eliminazione richiede una
conferma che ne descrive gli effetti.

## Incremento completato - Cascata distruttiva sedi

### `feat: disattiva o elimina sede con contenuti collegati`

Completato: disattivare una sede la mantiene nello storico ma elimina
definitivamente tutti i corsi, le lezioni, le prenotazioni e le immagini
collegate. L'eliminazione definitiva rimuove anche la sede. Entrambe le azioni
richiedono conferma e aggiornano immediatamente il backoffice; le API
impediscono inoltre di creare corsi in una sede inattiva.

## Milestone 9 - CI/CD e deploy VPS

Stato deploy al 11 settembre 2026: lo staging e raggiungibile su
`staging.makastudio.it`, con API su `api.staging.makastudio.it`, HTTPS e
redirect `www` attivi. Migrazioni applicate fino a `20260911_0006`, stack
Docker sano e primo amministratore tecnico verificato con login 2FA. Backup e
restore sono stati provati sul VPS: checksum validi e 12 tabelle ripristinate
nel database temporaneo di verifica.

### `ci: aggiungi test backend e frontend`

Descrizione: completare pipeline con lint, unit, integration e build frontend.

Definition of done: pipeline blocca merge con test rotti.

Stato: **completato**; la pipeline esegue lint, migrazioni e test backend su
PostgreSQL, oltre a lint, test e build frontend.

### `ci: aggiungi build immagini docker`

Descrizione: generare immagini Docker per API e web.

Definition of done: immagini buildabili in CI e localmente.

Stato: **completato**; la CI valida i file Compose e costruisce le immagini
production di API e web.

### `chore: configura reverse proxy caddy`

Descrizione: predisporre Caddy per API, web, HTTPS automatico e redirect da `www`.

Definition of done: configurazione documentata e validabile in staging.

Stato: **completato**; Caddy gestisce web, API, HTTPS automatico e redirect
`www`, con configurazione validata in CI e nello staging.

### `chore: configura deploy staging`

Descrizione: deploy via SSH su VPS con Docker Compose e variabili ambiente separate.

Definition of done: staging raggiungibile, migrazioni applicate in modo controllato.

Stato: **completato** nello staging con deploy manuale riproducibile, HTTPS,
migrazioni controllate e smoke test esterni superati.

### `chore: configura deploy produzione`

Descrizione: deploy produzione manualmente approvato o protetto da environment GitHub.

Definition of done: produzione deployabile in modo riproducibile e documentato.

Stato: **preparazione completata, cutover non eseguito**. Sono presenti un
workflow GitHub manuale protetto, uno script di release con backup, migrazioni,
healthcheck e smoke test, e il runbook `docs/deploy/PRODUCTION_RELEASE.md`.
Configurazione dei secret, DNS, modifica dell'environment sul VPS e approvazione
del rilascio verranno eseguite insieme.

### `docs: runbook backup e restore`

Descrizione: documentare backup PostgreSQL, restore e responsabilita operative.

Definition of done: procedura provata almeno una volta in staging.

Stato: **completato** nello staging; dump PostgreSQL e archivio upload verificati
tramite checksum e restore in un database temporaneo poi rimosso.

## Milestone 10 - Hardening, test finali e documentazione

### `test: copertura flussi critici e2e`

Descrizione: coprire login, booking, cancellazione, CRUD admin e autorizzazioni.

Definition of done: suite e2e verde in CI o job dedicato.

Stato: **completato**; Playwright esegue su Chromium desktop e mobile i flussi
reali di setup 2FA admin, creazione dati operativi, prenotazione, aggiornamento
immediato della UI, cancellazione e autorizzazione negativa sulle API admin. La
suite usa uno stack Docker e un database isolati ed e inclusa nella CI.

### `security: hardening auth e headers`

Descrizione: rate limit login, CORS, security headers, cookie policy e protezione input.

Definition of done: controlli verificati con test o checklist tecnica.

Stato: **completato**; login e 2FA hanno rate limit configurabile con risposta
`429`, la configurazione production rifiuta secret e origini CORS insicuri, API,
Nginx e Caddy applicano header difensivi e CSP. Test automatici e checklist sono
documentati in `docs/security/HARDENING.md`.

### `security: audit dipendenze`

Descrizione: introdurre audit dipendenze e aggiornamenti sicuri.

Definition of done: job CI o procedura documentata.

Stato: **completato**; il job CI `Dependency audit` verifica l'intero lockfile
npm e le dipendenze Python tramite OSV. La remediation ha aggiornato Vite,
Vitest, Playwright e `js-yaml`; procedura e regole di aggiornamento sono in
`docs/security/DEPENDENCY_AUDIT.md`.

### `docs: documenta api principali`

Descrizione: pubblicare OpenAPI e note di autenticazione/autorizzazione.

Definition of done: documentazione accessibile in dev/staging.

Stato: **completato**; `docs/api/API.md` descrive autenticazione, 2FA, ruoli,
errori e route principali. Swagger, ReDoc e schema OpenAPI sono controllati da
`API_DOCS_ENABLED`: attivi in sviluppo, attivabili esplicitamente in staging e
disabilitati sul dominio production.

### `docs: documenta setup sviluppatore`

Descrizione: README operativo per installazione, test, migrazioni e avvio locale.

Definition of done: nuovo sviluppatore puo avviare il progetto seguendo la guida.

Stato: **completato**; `docs/development/SETUP.md` accompagna dal clone al primo
avvio con ordine corretto di build, database e migrazioni, poi documenta admin
locale, test, rebuild, configurazione e diagnostica senza dipendenze implicite.

### `docs: documenta deploy e manutenzione`

Descrizione: guida VPS, env vars, deploy, rollback, backup e restore.

Definition of done: procedura riproducibile senza conoscenza implicita.

Stato: **completato**; `docs/deploy/DIGITALOCEAN.md` copre preparazione VPS e
manutenzione, `docs/deploy/PRODUCTION_RELEASE.md` il rilascio protetto e il
rollback, `docs/deploy/BACKUP_RESTORE.md` backup, verifica, retention e restore.
Gli esempi ambiente includono documentazione API e limiti auth production.

### `release: collaudo mvp`

Descrizione: checklist finale con casi d'uso utente/admin e verifica fuori-scope pagamenti.

Definition of done: MVP approvabile, nessuna funzionalita di pagamento introdotta.

Stato: **in preparazione**; `docs/release/MVP_ACCEPTANCE.md` raccoglie gate
automatici, prove utente/admin mobile e desktop, sicurezza, operativita e firme.
La chiusura resta subordinata al collaudo del commit candidato con il cliente;
i pagamenti sono confermati fuori scope.

## Note TDD per aree critiche

- Booking: prima testare capienza, duplicati, cancellazione, corso pieno e accesso non autorizzato.
- Concorrenza: usare integration test su PostgreSQL reale, non solo mock o SQLite.
- Permessi: ogni endpoint admin deve avere almeno un test positivo e uno negativo.
- Scadenza abbonamento: mantenere il calcolo in un servizio puro e testabile.
- Frontend: coprire i flussi utente e admin con pochi e2e ad alto valore, evitando test fragili su dettagli visuali.

## Prossimo passo consigliato

Completare insieme il cutover controllato della Milestone 9 seguendo
`docs/deploy/PRODUCTION_RELEASE.md`. Dopo il collaudo sul dominio definitivo,
avviare la Milestone 10 dalla suite end-to-end dei flussi critici. Ogni
microtask resta un commit atomico.
