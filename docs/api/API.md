# API MAKA

L'API FastAPI espone lo schema OpenAPI e due interfacce consultabili quando
`API_DOCS_ENABLED=true`:

- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`
- Schema JSON: `http://localhost:8000/openapi.json`

In production le tre route sono disabilitate. Per un collaudo controllato in
staging si puo impostare `API_DOCS_ENABLED=true` in `.env.production` e
ricreare il solo container API; al termine del collaudo va riportato a `false`.

## Autenticazione

Le route protette richiedono:

```http
Authorization: Bearer <access_token>
```

`POST /auth/login` restituisce direttamente access e refresh token agli utenti.
Per `admin` e `staff` restituisce invece una challenge 2FA: `403` richiede il
primo setup, `202` richiede il codice TOTP gia configurato. I refresh token sono
monouso e vengono ruotati da `POST /auth/refresh`.

Errori comuni:

- `401`: credenziali o token non validi;
- `403`: ruolo insufficiente o setup 2FA richiesto;
- `409`: conflitto con dati esistenti o stato non compatibile;
- `422`: payload o parametri non validi;
- `429`: troppi tentativi di autenticazione; rispettare `Retry-After`.

## Ruoli

| Ruolo | Permessi |
| --- | --- |
| `user` | Profilo, catalogo, abbonamento personale e proprie prenotazioni |
| `staff` | Permessi utente piu gestione corsi, sedi, calendario e dashboard |
| `admin` | Tutti i permessi, inclusi utenti, abbonamenti e discipline |

La modifica del ruolo revoca i refresh token esistenti. Utenti disabilitati o
eliminati non possono usare access token gia emessi.

## Route principali

### Account e sessione

| Metodo e route | Accesso | Funzione |
| --- | --- | --- |
| `POST /auth/register` | Pubblico | Registra un utente e apre la sessione |
| `POST /auth/login` | Pubblico | Verifica credenziali e avvia eventuale 2FA |
| `POST /auth/2fa/setup` | Setup token | Genera il secret TOTP iniziale |
| `POST /auth/2fa/confirm` | Setup token | Conferma il primo codice TOTP |
| `POST /auth/2fa/verify` | Challenge token | Completa il login backoffice |
| `POST /auth/refresh` | Refresh token | Ruota la coppia di token |
| `POST /auth/logout` | Refresh token | Revoca il refresh token |
| `GET /auth/me` | Autenticato | Restituisce l'identita corrente |
| `DELETE /auth/me` | Autenticato | Anonimizza l'account e libera le prenotazioni |

### Catalogo e prenotazioni

| Metodo e route | Accesso | Funzione |
| --- | --- | --- |
| `GET /courses` | Pubblico | Catalogo, date disponibili e posti residui |
| `GET /subscriptions/me` | Autenticato | Stato dell'abbonamento personale |
| `GET /bookings/me` | Autenticato | Prenotazioni future dell'utente |
| `POST /bookings` | Autenticato | Prenota una specifica lezione |
| `DELETE /bookings/{booking_id}` | Proprietario | Cancella la prenotazione |

I corsi marcati come liberi non richiedono un abbonamento attivo. Per gli altri
la prenotazione viene rifiutata se l'iscrizione non copre la data della lezione.

### Backoffice corsi

Admin e staff possono gestire sedi, corsi, immagini, ricorrenze e singole
lezioni sotto `/admin/locations`, `/admin/courses` e
`/admin/course-sessions`. `POST /admin/courses/{course_id}/schedule` crea piu
ricorrenze settimanali in una sola richiesta. Solo l'admin puo aggiungere una
disciplina con `POST /admin/disciplines`.

Le route `GET /admin/calendar/availability` e
`GET /admin/course-sessions/{id}/attendees` alimentano calendario, posti liberi
ed elenco prenotati. `GET /admin/stats` alimenta le dashboard per corso e sede.

### Backoffice utenti

Le route `/admin/users` e `/admin/subscriptions` sono riservate agli admin.
Consentono CRUD utenti, nomina/rimozione collaboratori e gestione iscrizioni.
La disattivazione o eliminazione di un utente cancella le sue prenotazioni
future; la cancellazione di corsi o sedi elimina a cascata sessioni e
prenotazioni collegate.

## Esempio rapido

```bash
curl -sS http://localhost:8000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"utente@example.it","password":"password-personale"}'

curl -sS http://localhost:8000/bookings/me \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

I modelli completi di richiesta e risposta restano la fonte canonica nello
schema OpenAPI generato dal codice.
