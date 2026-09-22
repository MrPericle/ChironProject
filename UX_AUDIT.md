# Audit UX mobile

Audit eseguito il 21 settembre 2026 sui flussi utente mobile della web app, con focus su iPhone Safari e Chrome Android. Oltre ai flussi utente, questa sessione include il pannello admin della scheda e lo storico di `test@test.it`; le prove browser usano l’ambiente locale Docker/API e viewport 360×640, 390×844 e 412×915.

## Priorità e stato

| ID | Problema | Priorità | Stato |
| --- | --- | --- | --- |
| UX-01 | La scelta di data/orario era un `<select>` poco comodo e lontano dal contenuto principale della card corso; con molte date anche un elenco tappabile diventava interminabile. | P1 | Risolto: su mobile le date sono progressive per mese → strip orizzontale del giorno → orario; viene mostrato solo il mese scelto e, oltre 4 orari nello stesso giorno, compare uno scroll verticale contenuto. Su desktop resta il selettore completo. |
| UX-02 | Home con due percorsi di prenotazione concorrenti e gerarchia poco chiara. | P1 | Risolto: il blocco rapido è esplicitamente “Prossima lezione”, il catalogo “Prenota una lezione”. |
| UX-03 | La striscia di date non comunicava chiaramente che fosse scorrevole. | P1 | Risolto: aggiunti titolo “Seleziona una data” e controlli precedente/successiva da 44 px. |
| UX-04 | Header e tab bar fissi consumavano spazio verticale sui telefoni. | P2 | Mitigato: header mobile compatto, contenuto con spazio per la tab bar e safe area. |
| UX-05 | L’azione di uscita appariva come sola icona e il chip profilo sembrava interattivo. | P2 | Risolto: “Esci” è esplicito su mobile e il chip resta non interattivo. |
| UX-06 | La conferma globale poteva apparire fuori viewport dopo una prenotazione. | P1 | Mitigato: la card aggiorna inline stato, CTA e disponibilità; resta anche il feedback globale accessibile. |
| UX-07 | Uso alternato di “sessione” e “lezione”. | P2 | Risolto nel percorso utente mobile: copy coerente su prenotazione e scelta della lezione. |
| UX-08 | `100vh` poteva creare salti o contenuti tagliati in Safari. | P2 | Mitigato: il workspace mobile usa `100svh`; serve ancora una prova su dispositivi fisici. |
| UX-09 | “Corsi” e “Calendario” mostravano entrambi lezioni disponibili e permettevano di prenotare: la stessa azione compariva in due percorsi. | P1 | Risolto: “Corsi” resta il luogo per scoprire e prenotare; la voce è stata sostituita da “Allenamento”, dedicata a scheda, diario e storico. |
| UX-10 | Nella card mobile il nome, la scelta degli orari e l’immagine erano in un ordine che interrompeva la lettura del corso. | P2 | Risolto: immagine compatta → nome e metadati → date/orari → prenotazione. |
| UX-11 | Lo stato e l’azione di verifica email potevano comparire mentre l’utente gestiva le prenotazioni. | P2 | Risolto: verifica email visibile solo in “Profilo”; rimossa dalla schermata “Prenotazioni”. |
| UX-12 | Durante l’allenamento l’utente doveva ricordare carichi e ripetizioni e non aveva un’azione primaria vicina alla tastiera. | P1 | Risolto: scheda per giorno, campi numerici con tastiera corretta, ultimo risultato precompilato, bozza locale e barra “Salva allenamento” sticky con safe area. |
| UX-13 | L’editor admin mostrava tutti i giorni e tutti gli esercizi in una pagina lineare; con 2-3+ giorni diventava lungo da scorrere e la lista destinatari richiedeva una selezione manuale poco scalabile. | P1 | Risolto: editor a blocchi con tab del giorno attivo, riepilogo giorni/esercizi/destinatari, destinatari richiudibili con ricerca e “Seleziona tutti”, un solo giorno modificabile alla volta e azioni touch ampie. |
| UX-14 | Lo storico utente cresceva senza filtro né paginazione visiva e mostrava poco contesto prima dell’apertura. | P1 | Risolto: filtro per scheda, riepilogo data/scheda/giorno/serie, dettaglio espandibile, modifica della sessione sulla scheda corretta e caricamento progressivo di 6 sessioni. |
| UX-15 | La creazione di una scheda mostrava contemporaneamente dati, giorni, esercizi e destinatari, rendendo poco chiaro il prossimo passo. | P1 | Risolto: nuovo percorso guidato in 4 step — dati base, giorni/esercizi, destinatari, riepilogo — con riepilogo persistente, CTA contestuali e navigazione avanti/indietro. La modifica resta libera e rapida. |
| UX-16 | La creazione di un corso mescolava dati descrittivi, sede, accesso, foto e pubblicazione nello stesso modulo. | P1 | Risolto: nuovo percorso guidato in 3 step — dati del corso, sede/accesso, riepilogo — con creazione solo nell’ultimo passaggio; lo stato Bozza resta disponibile nel secondo step. La configurazione degli orari resta nel pannello del corso dopo la creazione, senza cambiare il contratto API. |
| UX-17 | Nel secondo step della scheda, i giorni apparivano come una barra di tab e gli esercizi come una lista lunga: il rapporto tra giorno attivo ed esercizi non era immediato, soprattutto su mobile. | P1 | Risolto: selettore verticale dei giorni con numero, obiettivo e conteggio esercizi; a destra/sotto compare un solo giorno attivo con intestazione, campi del giorno e blocco esercizi separato. |
| UX-18 | La gerarchia visiva era quasi monocromatica e non distingueva bene struttura, giorno ed esercizio. | P2 | Risolto: accenti cromatici leggeri per step/giorni/esercizi, numerazione persistente, kicker tipografici e titoli più gerarchici, mantenendo la palette MAKA e il layout esistente. |
| UX-19 | Dopo l’aggiunta di un esercizio o di un giorno il nuovo elemento non restava nel punto di lavoro: l’admin doveva ripercorrere la lista con lo scroll. | P1 | Risolto: il nuovo elemento riceve il focus e viene portato in vista; sono presenti anche azioni “Aggiungi …” in fondo al blocco attivo. |
| UX-20 | “Continua” nello step Giorni ed esercizi suggeriva di avanzare anche quando l’attività principale era ancora l’inserimento degli esercizi. | P1 | Risolto: CTA rinominata “Ho finito gli esercizi”; il passaggio successivo è esplicito e separato dall’azione primaria “Aggiungi esercizio”. |
| UX-21 | Lo storico degli allenamenti occupava anche la schermata Allenamento, allungando il flusso operativo e duplicando il punto di accesso. | P1 | Risolto: lo storico è ora disponibile solo nel pannello Profilo; mantiene filtro, dettaglio, modifica ed eliminazione. La modifica da Profilo riporta direttamente alla sessione in Allenamento. |

## Verifica finale

- Nessun overflow orizzontale della pagina nei tre viewport mobile; lo scorrimento orizzontale resta confinato alla striscia delle date.
- I controlli mobili principali rispettano target touch ampi; non sono stati rilevati target interattivi troppo piccoli.
- Test applicativi, lint e build web passano.
- I flussi “Allenamento” sono stati verificati a livello di codice per 360/390/412 px: layout a colonna singola, input da almeno 16 px, target da almeno 44 px e nessuno scroll orizzontale della pagina.
- I nuovi stepper usano pulsanti touch ampi, due colonne su mobile, un solo contesto di scroll e non introducono scroll orizzontale; il percorso corso è coperto dal test applicativo di creazione.
- Il nuovo builder giorni/esercizi mantiene l’ordinamento, la rimozione e l’aggiunta di giorni/esercizi, senza cambiare API o modello dati; lint, 36 test e build sono verdi.
- L’aggiunta di esercizi/giorni mantiene il focus sul nuovo elemento tramite scroll programmatico e tastiera; su dispositivo reale va confermato il comportamento con tastiera iOS/Android aperta.
- La verifica browser locale a 390 px ha confermato per admin e `test@test.it`: `scrollWidth === clientWidth`, zero target sotto 44 px e zero input sotto 16 px; editor v2 e storico v2 risultano visibili nel rispettivo flusso.
- Screenshot di audit: [admin mobile](ux-audit/screens/after/admin-390-viewport.png) e [storico utente](ux-audit/screens/after/user-390-viewport.png).
- Da completare prima del rilascio: prova manuale su iPhone Safari e Chrome Android reali, soprattutto apertura della tastiera, safe area e scroll delle date.

## Decisione richiesta

Confermare in ambiente reale la tastiera numerica, il percorso completo degli stepper con account admin autenticato, il comportamento del nuovo builder giorni/esercizi, la barra di salvataggio admin e il recupero della bozza dopo refresh/perdita temporanea di connessione. La verifica live admin richiede un account demo con 2FA disponibile.
