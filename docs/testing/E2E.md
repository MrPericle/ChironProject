# Test end-to-end

La suite Playwright verifica i flussi critici con browser Chromium desktop e
mobile contro API, web e PostgreSQL reali.

## Prima esecuzione

Installare dipendenze e browser:

```bash
npm ci
npx playwright install chromium
```

Eseguire la suite completa:

```bash
npm run test:e2e:local
```

Il runner usa il progetto Docker Compose isolato `maka-e2e`, le porte `15173`,
`18000` e `55432`, e un volume PostgreSQL dedicato. Al termine rimuove container,
rete e volume E2E senza modificare lo stack di sviluppo.

## Copertura

Gli stessi percorsi vengono eseguiti in viewport desktop e mobile:

- primo accesso admin e configurazione TOTP 2FA;
- creazione di sede, utente, iscrizione, corso e lezione datata;
- login utente e caricamento del catalogo;
- prenotazione con aggiornamento immediato dei posti e dello stato pulsante;
- rifiuto dell'accesso utente alle API amministrative;
- cancellazione e rimozione immediata dalla lista prenotazioni.

In caso di errore Playwright conserva trace, screenshot e video in
`test-results/e2e`; il runner stampa inoltre stato e log dei container prima
della pulizia.

Per aprire il report dell'ultimo run:

```bash
npx playwright show-report
```
