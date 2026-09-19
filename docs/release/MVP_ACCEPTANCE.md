# Collaudo MVP MAKA

Questa checklist e il verbale di accettazione dell'MVP. Va compilata sul commit
esatto destinato alla release, prima in staging e poi con un controllo breve sul
dominio production. Un punto non verificato non equivale a un punto superato.

## Dati del collaudo

| Campo | Valore |
| --- | --- |
| Commit | `6a6fe2e` |
| Ambiente | `staging.makastudio.it`, poi `makastudio.it` |
| Data e ora | 19 settembre 2026 |
| Tecnico | Pericle Pergamo |
| Referente cliente | Mattia Spaziani |
| Dispositivo mobile reale | Verificato, dettaglio non annotato |
| Browser desktop | Verificato, dettaglio non annotato |

Esiti ammessi: `OK`, `KO`, `N/A`. Ogni `KO` deve avere issue, responsabile e
decisione di rilascio associati.

## Gate automatici

- [x] CI GitHub verde sul commit indicato.
- [x] Lint e test backend verdi.
- [x] Lint, test e build frontend verdi.
- [x] E2E Chromium desktop e Pixel 5 verdi.
- [x] Immagini API e web production costruite.
- [x] Docker Compose production e Caddy validati.
- [x] Audit dipendenze senza vulnerabilita bloccanti accettate tacitamente.

## Area utente

- [x] Registrazione, login, refresh automatico e logout funzionano.
- [x] Errori di credenziali e rete sono comprensibili e non cancellano dati UI.
- [x] Catalogo usabile con molti corsi: ricerca, filtri, date e sedi.
- [x] Schede corso mostrano immagine corretta, orario, sede e posti effettivi.
- [x] Un corso libero e prenotabile senza iscrizione attiva.
- [x] Un corso protetto rifiuta utenti senza iscrizione valida per quella data.
- [x] Prenotando, i posti si aggiornano senza refresh e il pulsante diventa
  `Prenotato` non azionabile.
- [x] Cancellando, la prenotazione scompare subito e il posto torna disponibile.
- [x] Le lezioni terminate non si accumulano in `Le tue prenotazioni`.
- [x] Il layout mobile non sovrappone pulsanti, filtri, modali o navigazione.
- [x] Tastiera, focus visibile, label e messaggi sono utilizzabili senza mouse.

## Backoffice accesso

- [x] Admin e collaboratore inseriscono prima email/password e poi il codice 2FA.
- [x] Il primo setup 2FA funziona con QR code e inserimento manuale del secret.
- [x] Sessione admin e collaboratore resta valida secondo le regole definite.
- [x] Le notifiche restano visibili durante lo scorrimento senza coprire azioni.

## Backoffice corsi e calendario

- [x] Dashboard riepiloga iscritti per corso e sede con dati coerenti.
- [x] CRUD sedi funziona; disattivazione ed eliminazione rimuovono corsi e
  prenotazioni collegate.
- [x] CRUD corsi funziona, inclusa eliminazione definitiva e pulizia prenotazioni.
- [x] Foto JPG, PNG e WebP valida viene caricata e persiste dopo il restart.
- [x] File non supportato o oltre 5 MB viene rifiutato con messaggio comprensibile.
- [x] Discipline predefinite sono presenti e un admin puo aggiungerne una nuova.
- [x] Si possono creare corsi con e senza iscrizione obbligatoria.
- [x] Si possono creare lezioni singole senza periodizzazione.
- [x] La creazione batch aggiunge piu giorni allo stesso orario senza reinserire i
  dati comuni.
- [x] Duplicati e sovrapposizioni nella stessa sede vengono rifiutati.
- [x] Capienza non puo scendere sotto le prenotazioni confermate.
- [x] Calendario mostra posti disponibili su totali, per esempio `5 su 6`.
- [x] Dal calendario si apre e chiude l'elenco prenotati senza perdere posizione.
- [x] Con molti corsi, ricerca e pannelli scorrevoli restano rapidi su mobile.

## Backoffice utenti e ruoli

- [x] Admin crea, modifica, disabilita ed elimina utenti con azioni comprensibili.
- [x] Admin attiva e modifica iscrizioni; una scaduta appare non attiva.
- [x] Disabilitare o eliminare un utente libera le prenotazioni future.
- [x] Admin promuove e rimuove un collaboratore.
- [x] Collaboratore gestisce sedi, corsi, calendario e partecipanti.
- [x] Collaboratore puo usare anche l'area utente e prenotarsi.
- [x] Collaboratore non vede e non puo chiamare API utenti o iscrizioni.

## Sicurezza e operativita

- [x] Tentativi ripetuti di login e 2FA ricevono `429` e `Retry-After`.
- [x] Un'origine CORS non autorizzata non riceve accesso dal browser.
- [x] Swagger, ReDoc e OpenAPI non sono pubblici sul dominio production.
- [x] Header HSTS, CSP, anti-frame, `nosniff` e referrer policy sono presenti.
- [x] Porte database, API e dev server non sono esposte direttamente da Internet.
- [x] Tutti i container risultano healthy e ripartono dopo reboot del VPS.
- [x] Log recenti non contengono traceback, panic o errori critici.
- [x] Backup database/upload creato, checksum valido e restore temporaneo riuscito.
- [x] Rollback e contatti operativi sono disponibili durante la finestra release.

## Fuori scope MVP

L'MVP non incassa pagamenti, non memorizza carte e non integra gateway di
pagamento. La gestione iscrizione registra solo stato e durata amministrativa.
Ogni richiesta di pagamento online richiede una milestone separata con analisi
legale, fiscale, privacy e sicurezza.

## Difetti accettati

| ID | Descrizione | Impatto | Decisione/Scadenza |
| --- | --- | --- | --- |
| Nessuno | Nessun difetto bloccante rilevato | N/A | MVP approvato |

## Approvazione

- [x] Il tecnico conferma commit, backup e piano di rollback.
- [x] Il referente cliente approva i flussi utente e backoffice.
- [x] Non restano `KO` bloccanti o vulnerabilita critiche/high non valutate.
- [x] E autorizzata la promozione al dominio definitivo.

| Ruolo | Nome | Data | Conferma |
| --- | --- | --- | --- |
| Tecnico | Pericle Pergamo | 19 settembre 2026 | Verificato |
| Cliente | Mattia Spaziani | 19 settembre 2026 | Approvazione confermata |
