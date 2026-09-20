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

Stato deploy al 19 settembre 2026: il commit applicativo `6a6fe2e` e in
produzione su `makastudio.it`, con API su `api.makastudio.it`, HTTPS e redirect
`www` attivi. Il rilascio e stato eseguito dal workflow GitHub protetto dopo il
collaudo dello staging e l'approvazione del cliente. Stack Docker, smoke test,
backup e restore temporaneo risultano verificati; una copia del backup finale e
conservata anche fuori dal VPS.

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

Stato: **completato**; lo staging ha validato deploy manuale, HTTPS, migrazioni
controllate e smoke test prima della promozione in produzione.

### `chore: configura deploy produzione`

Descrizione: deploy produzione manualmente approvato o protetto da environment GitHub.

Definition of done: produzione deployabile in modo riproducibile e documentato.

Stato: **completato**. Il cutover e stato eseguito il 19 settembre 2026 tramite
environment GitHub protetto e workflow manualmente approvato. DNS, Caddy, CORS
e frontend puntano ai domini definitivi; healthcheck, certificati, redirect,
header di sicurezza e documentazione API disabilitata sono stati verificati
dall'esterno.

### `docs: runbook backup e restore`

Descrizione: documentare backup PostgreSQL, restore e responsabilita operative.

Definition of done: procedura provata almeno una volta in staging.

Stato: **completato**; dump PostgreSQL e archivio upload sono stati verificati
tramite checksum e restore temporaneo sia prima sia dopo il rilascio. Il backup
production `maka-20260919T062851Z` e presente sul VPS e in copia esterna.

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

Stato: **completato** sul commit applicativo `6a6fe2e`; gate automatici, prove
utente/admin mobile e desktop, sicurezza e operativita sono stati verificati.
Il cliente ha approvato staging e produzione. I pagamenti restano confermati
fuori scope.

## Milestone 11 - Affidabilita account e recupero accesso

Stato: **implementazione completata localmente; collaudo email reale e deploy
non ancora eseguiti**.

Obiettivo: correggere i difetti emersi dopo il rilascio e introdurre verifica
email e recupero accesso senza compromettere gli account gia presenti in
produzione. La milestone procede per incrementi distribuibili e prevede backup,
migrazione, test in staging e approvazione prima del deploy production.

### Decisioni preliminari

- L'applicazione usa oggi l'email come identificativo di accesso e non possiede
  uno username separato. L'opzione consigliata e mantenere questo modello,
  chiamando la credenziale `Email di accesso` in tutta la UI. Un vero username
  richiederebbe un nuovo campo univoco, backfill degli utenti production e
  modifica di login, registrazione e amministrazione: va approvato esplicitamente
  prima di estendere lo schema.
- Scegliere il servizio email transazionale e verificare mittente, SPF, DKIM e
  DMARC. Il codice deve dipendere da un'interfaccia email e non dal provider;
  SMTP autenticato e la base prevista per il primo rilascio.
- Definire indirizzo mittente, URL frontend pubblico, durata dei token e testi
  delle email prima del collaudo end-to-end.

### `fix: correggi upload immagine durante modifica corso`

Descrizione: allineare il contratto multipart tra React e FastAPI. Il frontend
invia attualmente il campo `image`, mentre l'endpoint accetta `file`.

Attivita:

- correggere il nome del campo multipart e mantenere il limite di 5 MB e i
  formati JPG, PNG e WebP;
- mostrare un errore comprensibile senza perdere le modifiche del form;
- verificare sostituzione dell'immagine e rimozione del file precedente;
- aggiungere test frontend sul `FormData`, integrazione API e scenario E2E di
  modifica corso con immagine.

Definition of done: un admin modifica un corso, carica o sostituisce la foto e
vede subito la nuova immagine su backoffice e catalogo, anche dopo un restart.

Stato: **completato**; contratto multipart corretto, sostituzione e rimozione
del file precedente coperte da test API e frontend.

### `fix: elimina definitivamente utenti e dati collegati`

Descrizione: sostituire la soft-delete con cancellazione fisica amministrativa.
La risposta API non deve restituire un utente anonimizzato e la UI deve rimuovere
immediatamente la riga.

Attivita:

- eliminare tutte le prenotazioni dell'utente, incluse quelle confermate, in
  attesa, cancellate e storiche, liberando immediatamente la capienza futura;
- eliminare profilo, iscrizioni, refresh token, configurazione 2FA e token email;
- impostare a `NULL` l'eventuale riferimento istruttore nei corsi e preservare i
  soli audit log tecnici senza dati personali o riferimento attore attivo;
- usare vincoli `ON DELETE` coerenti e una singola transazione atomica;
- impedire a un admin di eliminare se stesso o l'ultimo amministratore attivo;
- restituire `204 No Content`, rimuovere l'utente dallo stato React e aggiornare
  contatori, partecipanti e posti senza refresh;
- aggiornare conferma distruttiva e test API, UI ed E2E verificando l'assenza di
  ogni riga collegata.

Definition of done: dopo la conferma l'utente non compare piu nel backoffice,
non puo autenticarsi, non ha dati collegati nel database e tutti i posti delle
sue prenotazioni risultano disponibili.

Stato: **completato**; cancellazione fisica atomica, cascata dei dati collegati,
vincoli amministrativi e aggiornamento immediato della UI coperti da test.

### `feat: aggiungi infrastruttura email transazionale`

Descrizione: introdurre un servizio email sostituibile, configurazione via
secret e template MAKA responsive in testo e HTML.

Attivita:

- aggiungere configurazione per host, porta, TLS, credenziali, mittente e URL
  frontend, con validazione obbligatoria in production;
- fornire un backend locale di test che non invii email reali e documentare la
  configurazione staging/production;
- evitare credenziali nei log e rendere osservabili consegna ed errori senza
  esporre token o indirizzi completi;
- configurare SPF, DKIM e DMARC prima dell'abilitazione production.

Definition of done: staging invia un messaggio reale dal dominio MAKA e gli
errori di consegna producono un esito gestibile senza creare account incoerenti.

Stato: **codice completato, configurazione esterna pendente**; sono disponibili
backend console locale e SMTP sostituibile, validazione production, template
testo/HTML e variabili documentate. Restano scelta del provider, credenziale
SMTP dedicata e record SPF, DKIM e DMARC del dominio.

### `feat: verifica indirizzo email`

Descrizione: ogni indirizzo viene considerato non verificato finche il titolare
non conferma un link monouso. La verifica guida l'utente con un avviso non
bloccante al primo accesso e dalla sezione Profilo.

Attivita:

- aggiungere `email_verified_at` e token monouso memorizzati solo come hash, con
  scadenza, finalita, data di utilizzo e revoca;
- cambiare la registrazione: creare l'account non verificato, inviare il link e
  consentire comunque accesso e utilizzo dell'app con un invito alla conferma;
- aggiungere conferma e reinvio con risposte anti-enumerazione, rate limit e
  invalidazione dei token precedenti;
- marcare gli account esistenti come da verificare senza disattivarli;
- aggiungere un cambio email protetto dalla password corrente e dalla conferma
  sul nuovo indirizzo, con revoca delle sessioni dopo il completamento;
- aggiungere il cambio password autenticato, con revoca delle sessioni; il reset
  via email conferma anche l'indirizzo raggiunto;
- creare schermate mobile-first per conferma, link scaduto, reinvio e Profilo,
  con focus e annunci accessibili.

Definition of done: il link e monouso, ogni indirizzo esistente viene invitato
alla conferma senza interrompere l'attivita e il nuovo indirizzo non diventa
utilizzabile prima della conferma.

Stato: **implementazione completata localmente**; conferma, reinvio, cambio
email, cambio password, rate limit, token hashati e migrazione compatibile sono
coperti da test. Il collaudo con consegna reale e aperto.

### `feat: recupero credenziale e password`

Descrizione: aggiungere un unico percorso `Problemi di accesso?`. Nel modello
attuale l'email e il nome utente: la UI lo rende esplicito e il recupero password
avviene tramite l'indirizzo verificato. Se viene approvato uno username separato,
questo incremento verra esteso con campo univoco e promemoria username via email.

Attivita:

- endpoint di richiesta sempre generico, per non rivelare se un account esiste;
- token di reset casuale, monouso, hashato e con scadenza breve;
- schermate richiesta, email inviata, nuova password, token scaduto e successo;
- dopo il reset revocare tutti i refresh token e mantenere il 2FA dei ruoli
  backoffice;
- applicare rate limit per IP e identificativo, requisiti password esistenti e
  audit privo di segreti;
- offrire un percorso di contatto con la segreteria quando l'utente non ricorda
  l'email usata per l'account, senza lookup pubblico basato su dati personali.

Definition of done: un utente con email verificata reimposta la password da un
link monouso; le vecchie sessioni vengono revocate e nessuna risposta consente
di enumerare gli account.

Stato: **implementazione completata localmente**; l'email resta l'unico
identificativo di accesso. Richiesta generica, token monouso, nuova password,
revoca refresh token e UI mobile-first sono coperte da test API e React.

### `test: collauda lifecycle account in staging`

Descrizione: coprire migrazione e flussi critici prima del deploy production.

Attivita:

- test unitari per token, scadenze, hashing e template;
- test di integrazione PostgreSQL per verifica, reinvio, reset, cancellazione e
  cascata completa;
- test frontend ed E2E desktop/mobile per form, errori, link scaduti e ritorno al
  login;
- backup e restore prima della migrazione production, smoke test email reale e
  piano di rollback senza riutilizzare token gia emessi.

Definition of done: CI verde, migrazione provata su copia dei dati, email staging
consegnate, nessun difetto bloccante e deploy production approvato insieme.

Stato: **da eseguire** dopo la configurazione SMTP. La suite locale e la
migrazione di sviluppo sono verdi; backup, prova su copia production, smoke
test email reale, verifica E2E e approvazione restano gate obbligatori.

## Note TDD per aree critiche

- Booking: prima testare capienza, duplicati, cancellazione, corso pieno e accesso non autorizzato.
- Concorrenza: usare integration test su PostgreSQL reale, non solo mock o SQLite.
- Permessi: ogni endpoint admin deve avere almeno un test positivo e uno negativo.
- Scadenza abbonamento: mantenere il calcolo in un servizio puro e testabile.
- Frontend: coprire i flussi utente e admin con pochi e2e ad alto valore, evitando test fragili su dettagli visuali.

## Prossimo passo consigliato

Scegliere il provider SMTP con il cliente, configurare mittente e DNS, quindi
eseguire backup e collaudo della Milestone 11 in un ambiente controllato. Non
aggiornare la produzione finche verifica e recupero non consegnano email reali
e la checklist staging non e stata approvata.
