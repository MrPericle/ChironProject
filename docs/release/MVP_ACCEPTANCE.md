# Collaudo MVP MAKA

Questa checklist e il verbale di accettazione dell'MVP. Va compilata sul commit
esatto destinato alla release, prima in staging e poi con un controllo breve sul
dominio production. Un punto non verificato non equivale a un punto superato.

## Dati del collaudo

| Campo | Valore |
| --- | --- |
| Commit | `DA_COMPILARE` |
| Ambiente | `staging.makastudio.it` |
| Data e ora | `DA_COMPILARE` |
| Tecnico | `DA_COMPILARE` |
| Referente cliente | `DA_COMPILARE` |
| Dispositivo mobile reale | `DA_COMPILARE` |
| Browser desktop | `DA_COMPILARE` |

Esiti ammessi: `OK`, `KO`, `N/A`. Ogni `KO` deve avere issue, responsabile e
decisione di rilascio associati.

## Gate automatici

- [ ] CI GitHub verde sul commit indicato.
- [ ] Lint e  test backend verdi.
- [ ] Lint, test e build frontend verdi.
- [ ] E2E Chromium desktop e Pixel 5 verdi.
- [ ] Immagini API e web production costruite.
- [ ] Docker Compose production e Caddy validati.
- [ ] Audit dipendenze senza vulnerabilita bloccanti accettate tacitamente.

## Area utente

- [ ] Registrazione, login, refresh automatico e logout funzionano.
- [ ] Errori di credenziali e rete sono comprensibili e non cancellano dati UI.
- [ ] Catalogo usabile con molti corsi: ricerca, filtri, date e sedi.
- [ ] Schede corso mostrano immagine corretta, orario, sede e posti effettivi.
- [ ] Un corso libero e prenotabile senza iscrizione attiva.
- [ ] Un corso protetto rifiuta utenti senza iscrizione valida per quella data.
- [ ] Prenotando, i posti si aggiornano senza refresh e il pulsante diventa
  `Prenotato` non azionabile.
- [ ] Cancellando, la prenotazione scompare subito e il posto torna disponibile.
- [ ] Le lezioni terminate non si accumulano in `Le tue prenotazioni`.
- [ ] Il layout mobile non sovrappone pulsanti, filtri, modali o navigazione.
- [ ] Tastiera, focus visibile, label e messaggi sono utilizzabili senza mouse.

## Backoffice accesso

- [ ] Admin e collaboratore inseriscono prima email/password e poi il codice 2FA.
- [ ] Il primo setup 2FA funziona con QR code e inserimento manuale del secret.
- [ ] Sessione admin e collaboratore resta valida secondo le regole definite.
- [ ] Le notifiche restano visibili durante lo scorrimento senza coprire azioni.

## Backoffice corsi e calendario

- [ ] Dashboard riepiloga iscritti per corso e sede con dati coerenti.
- [ ] CRUD sedi funziona; disattivazione ed eliminazione rimuovono corsi e
  prenotazioni collegate.
- [ ] CRUD corsi funziona, inclusa eliminazione definitiva e pulizia prenotazioni.
- [ ] Foto JPG, PNG e WebP valida viene caricata e persiste dopo il restart.
- [ ] File non supportato o oltre 5 MB viene rifiutato con messaggio comprensibile.
- [ ] Discipline predefinite sono presenti e un admin puo aggiungerne una nuova.
- [ ] Si possono creare corsi con e senza iscrizione obbligatoria.
- [ ] Si possono creare lezioni singole senza periodizzazione.
- [ ] La creazione batch aggiunge piu giorni allo stesso orario senza reinserire i
  dati comuni.
- [ ] Duplicati e sovrapposizioni nella stessa sede vengono rifiutati.
- [ ] Capienza non puo scendere sotto le prenotazioni confermate.
- [ ] Calendario mostra posti disponibili su totali, per esempio `5 su 6`.
- [ ] Dal calendario si apre e chiude l'elenco prenotati senza perdere posizione.
- [ ] Con molti corsi, ricerca e pannelli scorrevoli restano rapidi su mobile.

## Backoffice utenti e ruoli

- [ ] Admin crea, modifica, disabilita ed elimina utenti con azioni comprensibili.
- [ ] Admin attiva e modifica iscrizioni; una scaduta appare non attiva.
- [ ] Disabilitare o eliminare un utente libera le prenotazioni future.
- [ ] Admin promuove e rimuove un collaboratore.
- [ ] Collaboratore gestisce sedi, corsi, calendario e partecipanti.
- [ ] Collaboratore puo usare anche l'area utente e prenotarsi.
- [ ] Collaboratore non vede e non puo chiamare API utenti o iscrizioni.

## Sicurezza e operativita

- [ ] Tentativi ripetuti di login e 2FA ricevono `429` e `Retry-After`.
- [ ] Un'origine CORS non autorizzata non riceve accesso dal browser.
- [ ] Swagger, ReDoc e OpenAPI non sono pubblici sul dominio production.
- [ ] Header HSTS, CSP, anti-frame, `nosniff` e referrer policy sono presenti.
- [ ] Porte database, API e dev server non sono esposte direttamente da Internet.
- [ ] Tutti i container risultano healthy e ripartono dopo reboot del VPS.
- [ ] Log recenti non contengono traceback, panic o errori critici.
- [ ] Backup database/upload creato, checksum valido e restore temporaneo riuscito.
- [ ] Rollback e contatti operativi sono disponibili durante la finestra release.

## Fuori scope MVP

L'MVP non incassa pagamenti, non memorizza carte e non integra gateway di
pagamento. La gestione iscrizione registra solo stato e durata amministrativa.
Ogni richiesta di pagamento online richiede una milestone separata con analisi
legale, fiscale, privacy e sicurezza.

## Difetti accettati

| ID | Descrizione | Impatto | Decisione/Scadenza |
| --- | --- | --- | --- |
| | | | |

## Approvazione

- [ ] Il tecnico conferma commit, backup e piano di rollback.
- [ ] Il referente cliente approva i flussi utente e backoffice.
- [ ] Non restano `KO` bloccanti o vulnerabilita critiche/high non valutate.
- [ ] E autorizzata la promozione al dominio definitivo.

| Ruolo | Nome | Data | Conferma |
| --- | --- | --- | --- |
| Tecnico | | | |
| Cliente | | | |
