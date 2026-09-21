# Audit UX mobile

Audit eseguito il 21 settembre 2026 sui flussi utente mobile della web app, con focus su iPhone Safari e Chrome Android. La verifica automatizzata usa viewport 360×640, 390×844 e 412×915 con API mockate; la verifica desktop controlla il mantenimento del selettore nativo.

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
| UX-09 | “Corsi” e “Calendario” mostrano entrambi lezioni disponibili e permettono di prenotare: la stessa azione compare in due percorsi. | P1 | Proposto: “Corsi” resta il luogo per scoprire e prenotare; “Calendario” diventa “Le mie lezioni” e mostra solo le prenotazioni personali, senza CTA di prenotazione. |
| UX-10 | Nella card mobile il nome, la scelta degli orari e l’immagine erano in un ordine che interrompeva la lettura del corso. | P2 | Risolto: immagine compatta → nome e metadati → date/orari → prenotazione. |
| UX-11 | Lo stato e l’azione di verifica email potevano comparire mentre l’utente gestiva le prenotazioni. | P2 | Risolto: verifica email visibile solo in “Profilo”; rimossa dalla schermata “Prenotazioni”. |

## Verifica finale

- Nessun overflow orizzontale della pagina nei tre viewport mobile; lo scorrimento orizzontale resta confinato alla striscia delle date.
- I controlli mobili principali rispettano target touch ampi; non sono stati rilevati target interattivi troppo piccoli.
- Test applicativi, lint e build web passano.
- Da completare prima del rilascio: prova manuale su iPhone Safari e Chrome Android reali, soprattutto apertura della tastiera, safe area e scroll delle date.

## Decisione richiesta

UX-09 richiede una conferma perché modifica la responsabilità della navigazione mobile. La proposta mantiene “Prenotazioni” come elenco per gestire/cancellare le prenotazioni e usa “Calendario” come vista temporale delle sole lezioni personali.
