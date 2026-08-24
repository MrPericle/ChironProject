# Prompt di sviluppo — Web App gestione corsi ASD

## Ruolo
Agisci come **sviluppatore full stack senior** con esperienza in progetti production-ready su VPS, CI/CD, TDD e architetture multi-sede scalabili al bisogno (non enterprise-scale). Il tuo compito è progettare e implementare, in modo incrementale e verificabile tramite commit, una web app per la gestione di una ASD (Associazione Sportiva Dilettantistica).

## Contesto di business
L'ASD gestisce diversi **corsi** (es. yoga, nuoto, fitness), ciascuno con:
- orario/i settimanali
- capienza massima (posti limitati)
- sede di riferimento (in previsione di apertura di nuove sedi in futuro)
- eventuale istruttore/referente

Gli iscritti devono poter usare l'app per **prenotarsi ai corsi**. Il pagamento della quota mensile/abbonamento **avviene fuori dall'app** (bonifico, contanti, POS fisico in sede) — l'app non gestisce transazioni, non integra gateway di pagamento e non invia alert di scadenza. Mostra solo, a titolo informativo, la data di scadenza calcolata automaticamente dalla data di iscrizione (es. iscrizione + 30 giorni).

## Obiettivo
Realizzare una web app production-ready, deployata su VPS, con le seguenti componenti:

### 1. Area utente (iscritti)
- Registrazione/login (email+password, opzionale login social)
- Visualizzazione elenco corsi filtrabile per sede/orario/disponibilità
- Prenotazione a un corso con **gestione posti limitati** (no overbooking, gestione concorrenza sulle prenotazioni)
- Cancellazione prenotazione entro una soglia configurabile
- Storico prenotazioni personale
- Visualizzazione informativa della **data di scadenza abbonamento** (calcolata automaticamente da data iscrizione + durata, es. 30gg) — nessun pagamento in app, nessuna notifica automatica

### 2. Backoffice admin
- Autenticazione con ruolo admin (RBAC minimo: admin, staff, utente)
- CRUD completo sui corsi: creazione, modifica, rimozione, modifica orario, modifica capienza
- Gestione sedi: creazione/modifica sedi, associazione corsi↔sede
- Visualizzazione iscritti per corso e stato prenotazioni (lista d'attesa se corso pieno, opzionale)
- Visualizzazione elenco iscritti con data di scadenza abbonamento (solo consultazione, nessuna gestione pagamento)
- Dashboard riepilogativa (iscritti attivi, corsi più richiesti, abbonamenti in scadenza)

### 3. Requisiti non funzionali
- Architettura semplice ma **estendibile a multi-sede** (modello dati già pensato per N sedi, non serve multi-tenant complesso)
- Nessuna necessità di scalabilità estrema: dimensiona per traffico medio-basso (centinaia di utenti concorrenti al massimo), evita over-engineering
- Sicurezza: gestione password con hashing sicuro, protezione endpoint, validazione input, gestione segreti (env vars, mai in repo), 2FA per ruolo admin
- GDPR-friendly: gestione dati personali e possibilità di cancellazione account

### 4. Fuori scope (esplicitamente escluso)
- Pagamenti in-app / integrazione gateway (Stripe o altro)
- Gestione stato "pagato/non pagato" aggiornato manualmente o via automazione
- Sistema di notifiche/alert (email, push, in-app) per scadenza pagamento
- Qualsiasi trattamento di dati di carta o transazioni finanziarie

### 5. Metodologia di lavoro
- **TDD**: per ogni funzionalità, scrivi prima i test (unitari e/o di integrazione), poi il codice che li fa passare. Mantieni una coverage ragionevole sulle parti core (booking, concorrenza sui posti, permessi).
- **CI/CD**: pipeline automatizzata (build, lint, test, deploy) — GitHub Actions (o GitLab CI) con deploy automatico/manuale-approvato su VPS (es. via SSH + Docker, o Docker Compose + reverse proxy Nginx/Traefik con HTTPS via Let's Encrypt)
- **Versionamento**: ogni funzionalità va sviluppata tramite commit atomici e descrittivi, organizzati secondo una roadmap a microtask (vedi sotto)

## Stack tecnologico (proponi e motiva, indicativamente)
Proponi uno stack coerente con: semplicità di deploy su VPS singolo, manutenibilità, community/supporto. Esempio di riferimento (adattabile):
- **Backend**: Node.js (NestJS o Express) oppure Python (FastAPI/Django) — con ORM (Prisma/TypeORM o SQLAlchemy)
- **Frontend**: React/Next.js o Vue/Nuxt
- **DB**: PostgreSQL
- **Infra**: Docker + Docker Compose, Nginx come reverse proxy, Certbot per SSL, deploy su VPS (es. Hetzner/DigitalOcean)

## Deliverable richiesti
1. Definizione del **modello dati** (schema ER: utenti, sedi, corsi, prenotazioni, iscrizioni con data scadenza calcolata, ruoli)
2. Definizione delle **API** (endpoint REST o GraphQL, con specifica di autenticazione/autorizzazione)
3. Setup progetto (repo, struttura cartelle, configurazione ambienti dev/staging/prod)
4. Implementazione backend con test (TDD)
5. Implementazione frontend area utente + backoffice admin
6. Pipeline CI/CD funzionante
7. Configurazione deploy su VPS (documentata, riproducibile)
8. **Roadmap in microtask**, ciascuno mappabile a un commit (o piccola serie di commit), organizzata per milestone

## Formato della roadmap richiesta
Struttura la roadmap in **milestone**, ciascuna suddivisa in **microtask** con:
- titolo breve (da usare come messaggio di commit, es. `feat: modello dati corsi e sedi`)
- descrizione sintetica dell'attività
- criterio di completamento (definition of done, es. "test unitari verdi", "endpoint testato con integration test")

Milestone attese (da dettagliare in microtask):
1. Setup iniziale progetto e infrastruttura (repo, CI base, Docker, ambienti)
2. Modello dati e migrazioni (utenti, sedi, corsi, prenotazioni, iscrizioni)
3. Autenticazione e gestione ruoli (utente/admin, 2FA admin)
4. Gestione corsi e sedi (CRUD backoffice)
5. Sistema di prenotazione con gestione posti limitati e concorrenza
6. Calcolo automatico scadenza abbonamento (visualizzazione informativa)
7. Frontend area utente (catalogo corsi, prenotazione, storico, scadenza)
8. Frontend backoffice admin (dashboard, CRUD, elenco iscritti/scadenze)
9. CI/CD completa e deploy su VPS (staging + produzione)
10. Hardening sicurezza, test end-to-end, documentazione finale

## Output atteso da te (assistente)
1. Schema dati proposto (con breve spiegazione delle scelte)
2. Elenco endpoint API principali
3. Stack tecnologico scelto con motivazione
4. Roadmap completa in microtask (formato lista, pronta per essere trasformata in issue/commit)
5. Esempio di pipeline CI/CD (file di configurazione)
6. Note su come strutturare i test secondo TDD per le funzionalità critiche (prenotazione con posti limitati e concorrenza)

## Vincoli
- Non introdurre complessità non richiesta (no microservizi, no kubernetes, no multi-tenant avanzato, no pagamenti)
- Il sistema deve restare gestibile da un singolo sviluppatore/piccolo team su un singolo VPS
- Ogni scelta tecnica va motivata brevemente rispetto ai requisiti (semplicità, costo, manutenibilità)

---

## Appendice — Stima costi e preventivo (scope ridotto, senza pagamenti in-app)

### Costi infrastrutturali mensili (a carico del cliente/ASD)
| Voce | Costo/mese |
|---|---|
| VPS (es. Hetzner CX23 o equivalente) | €5–12 |
| Backup automatici VPS | €1–2 |
| Dominio | ~€1 (€10-15/anno) |
| SSL (Let's Encrypt) | €0 |
| CI/CD (GitHub Actions free tier) | €0 |
| **Totale** | **~€7–15/mese** |

Nota: account VPS e dominio vanno intestati e gestiti dal cliente (carta propria), con lo sviluppatore aggiunto come collaboratore/deploy user — mai in possesso dei dati di pagamento del cliente.

### Preventivo sviluppo (scope: prenotazioni + backoffice, no pagamenti in-app)
| Fase | Giorni stimati |
|---|---|
| Setup progetto, CI/CD, Docker | 2 |
| Modello dati + backend (auth, ruoli, 2FA admin) | 3–4 |
| CRUD corsi/sedi (backoffice) | 3–4 |
| Sistema prenotazione (gestione concorrenza posti) | 3–4 |
| Frontend area utente (catalogo, prenotazione, storico, scadenza) | 4–5 |
| Frontend backoffice admin | 3–4 |
| Testing, deploy VPS, documentazione | 3–4 |
| Buffer/PM | 2–3 |
| **Totale** | **~23–30 giorni** |

**Preventivo indicativo: €9.000–12.000** (a tariffa €400/giorno, profilo mid-senior freelance IT Italia).

Possibile suddivisione a milestone/pagamenti:
- **Milestone 1** – Setup + backend + auth: ~30% del totale
- **Milestone 2** – Prenotazioni + backoffice: ~40% del totale
- **Milestone 3** – Frontend completo + deploy + collaudo: ~30% del totale
