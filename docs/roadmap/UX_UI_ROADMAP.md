# Roadmap miglioramento UI/UX — MAKA

**Branch di lavoro:** `ux-ui-mobile-improvements`  
**Data revisione:** 2026-09-22  
**Fonte:** [`ui-audit/report.md`](../../ui-audit/report.md)  
**Ambito:** frontend Utente/Atleta e Admin/Istruttore, mobile e desktop.

## Stato di partenza

L’audit più recente assegna al frontend **60/100 — da migliorare**:

| Dimensione | Punteggio | Sintesi |
|---|---:|---|
| A. Rumore visivo e gerarchia | 15/25 | Prenotazione più chiara, ma editor e azioni Admin competono ancora. |
| B. Usabilità e carico cognitivo | 15/25 | I flussi sono completabili, ma restano detour e un next step debole. |
| C. Accessibilità | 12/20 | Base solida; contrasto dell’editor e listbox destinatari da correggere. |
| D. Design system | 9/15 | Mancano varianti comuni per i gruppi di azioni e persistono override. |
| E. Modernità | 9/15 | Responsive valido, ma desktop Allenamento e liste dense non sono ancora intenzionali. |
| **Totale** | **60/100** | **Fascia: da migliorare** |

Non risultano Blocker confermati e non viene applicato alcun cap. Il report conferma però una priorità funzionale: **la scheda dell’utente deve essere ottimizzata per la consultazione**, mentre la registrazione della sessione e le note devono rimanere facoltative. Conferma inoltre una priorità trasversale: **i pulsanti Admin devono seguire una composizione stabile e prevedibile**, senza elementi che cambiano larghezza o posizione solo perché sono l’ultimo figlio della griglia.

## Stato implementazione P0

- [x] **UX-UI-01** — scheda Utente in modalità consultazione-first; registrazione e nota dentro un pannello opzionale.
- [x] **UX-UI-02** — gruppi di azioni Admin con griglia mobile uniforme, ordine stabile e nessuna espansione automatica dell’ultimo pulsante dispari.
- [x] Test web aggiornati: **45/45** passati.
- [x] Lint web e build web verificati.
- [ ] Verifica su iOS Safari/Android Chrome reali ancora da eseguire.

**File coinvolti nel P0:** `apps/web/src/app/App.tsx`, `apps/web/src/styles/global.css`, `apps/web/src/app/App.test.tsx`.

## Stato implementazione P1

- [x] **UX-UI-03** — Admin > Allenamento desktop con lista schede full-width e senza colonna libera.
- [x] **UX-UI-04** — CTA Dashboard aggiornata a “Apri calendario e iscritti” con destinazione Calendario.
- [x] **UX-UI-05** — feedback inline dopo il salvataggio, focus sul feedback e azioni per continuare, pubblicare o tornare all’elenco.
- [x] **UX-UI-06** — selettore destinatari convertito a checkbox nativi e testo secondario dark ricondotto a token con contrasto AA.
- [x] Test web: **45/45** passati; lint e build verificati.
- [ ] Verifica visuale autenticata su desktop reale e test con screen reader ancora da eseguire.

## Stato implementazione P2

- [x] **UX-UI-07** — picker destinatari con ricerca, caricamento progressivo a blocchi di 8 e conteggio degli utenti mostrati.
- [x] **UX-UI-08** — token semantici aggiunti per superfici/testi/bordi/focus e rimossi i selector CSS del builder v2 non referenziati dal markup attivo.
- [ ] **UX-UI-09** — trend analytics non implementato: l’API espone ancora solo `member_count` corrente per corsi e sedi, senza serie storica, periodo o timezone.
- [x] Test web, lint, build e `git diff --check` verificati dopo il P2.

## Aggiornamento post-P2 — storico schede Utente

- [x] **UX-UI-10** — storico allenamenti riorganizzato in sessioni consultabili e richiudibili, senza confondere la lettura con la modifica.
- [x] Filtri in menu popup per **scheda** e **giorno della scheda**, con conteggio delle sessioni e azzeramento rapido.
- [x] Layout mobile dedicato: filtri a colonna singola, storico richiudibile e superfici dark coerenti.
- [x] Test web: **45/45** passati; lint, build e `git diff --check` verificati.

## Aggiornamento — gestione Admin di molte schede

- [x] **UX-UI-12** — ricerca client-side per titolo con conteggio dei risultati.
- [x] Filtri per stato con conteggi: tutte, pubblicate, bozze e archiviate.
- [x] Ordinamento per ultima modifica, nome alfabetico o data di creazione.
- [x] Azioni secondarie spostate in un menu `…`; ogni riga mantiene una sola azione primaria: **Modifica**.
- [x] Layout mobile adattato con toolbar a colonna singola e menu azioni touch-friendly.
- [x] Elenco schede contenuto in una regione scrollabile, con un massimo visivo di circa tre schede alla volta e focus da tastiera.
- [x] Test web: **47/47** passati; lint, build e `git diff --check` verificati.

**File coinvolti:** `apps/web/src/app/App.tsx`, `apps/web/src/styles/global.css`, `apps/web/src/app/App.test.tsx`.

**Nota di prodotto:** lo storico resta focalizzato sulla consultazione delle sessioni; non è stato introdotto un nuovo endpoint né una superficie progressi sempre visibile.

## Aggiornamento — menu azioni e creazione schede più sicura

- [x] Il menu `…` delle schede resta dentro il viewport: ha una larghezza massima, uno scroll verticale interno e si apre verso l’alto quando è vicino al bordo inferiore.
- [x] **UX-UI-13 P0 — Guardrail prima del salvataggio:** bloccare l’avanzamento quando mancano titolo, giorni o esercizi validi; mostrare errori inline collegati ai campi e portare il focus sul primo errore.
- [ ] **UX-UI-14 P1 — Revisione prima della pubblicazione:** aggiungere un quarto step di riepilogo esplicito con giorni, numero esercizi, destinatari, stato e differenza tra “Salva bozza” e “Pubblica”. La pubblicazione deve sempre richiedere un’azione separata.
- [ ] **UX-UI-15 P1 — Protezione dal lavoro perso:** salvare la bozza a ogni cambio step e prima di chiudere, mostrare lo stato “Salvato/Non salvato” e chiedere conferma se si abbandonano modifiche non salvate.
- [ ] **UX-UI-16 P2 — Azioni distruttive e destinatari:** preferire duplica/archivia, richiedere una conferma specifica per eliminare e mostrare un’anteprima dei destinatari con avviso per zero destinatari o selezione troppo ampia.

**Stato UX-UI-13:** implementato in `WorkoutEditorPanel` e `WorkoutDayBuilder`; test web aggiornati (**48/48** passati). La validazione completa resta attiva anche al salvataggio come protezione finale.

- [x] Dopo la pubblicazione dalla schermata di riepilogo, l’editor viene chiuso e l’elenco mostra la scheda nello stato **Pubblicata**; in caso di errore l’editor resta aperto.
- [x] Le notifiche globali dell’admin restano visibili nel viewport mobile, con chiusura esplicita tramite `X`; gli errori non vengono rimossi automaticamente.

### Piano operativo per ridurre gli errori nella creazione

1. **P0 — Validazione guidata:** titolo obbligatorio, almeno un giorno e almeno un esercizio per giorno; nome esercizio, serie/ripetizioni e valori numerici controllati prima di avanzare. Ogni errore deve comparire vicino al campo, con `aria-describedby`, e il primo campo invalido riceve il focus.
2. **P1 — Stepper con riepilogo:** mantenere il flusso a passi già presente, ma rendere visibile lo stato di completamento. Prima del salvataggio mostrare una review compatta con struttura della scheda, destinatari e stato; “Pubblica” non deve essere implicito nel salvataggio.
3. **P1 — Recupero e abbandono sicuri:** persistere la bozza durante il flusso, ripristinarla dopo refresh e segnalare chiaramente modifiche pendenti. Chiudi/indietro deve chiedere conferma solo quando esistono modifiche non salvate.
4. **P2 — Errori irreversibili sotto controllo:** duplicazione come percorso preferito per varianti, archiviazione come default al posto dell’eliminazione, conferma distruttiva con nome/titolo della scheda e feedback di successo con possibilità di tornare all’elenco.

### Criteri di accettazione

- Non è possibile arrivare alla review o salvare una scheda strutturalmente invalida.
- Il primo errore è annunciato e raggiungibile da tastiera; i target touch restano almeno 44×44 px.
- Un refresh o una chiusura accidentale non cancella una bozza già salvata.
- Pubblicazione, archiviazione ed eliminazione sono azioni distinguibili, confermate e con feedback.
- Il menu `…` non produce overflow orizzontale e resta interamente utilizzabile a 320, 360, 390, 412 e 768 px di altezza viewport.

## Aggiornamento post-P2 — prenotazioni corso

- [x] **UX-UI-11** — card corso con immagine, nome e contesto sempre visibili; il selettore data/orario e l’azione di prenotazione sono dentro un menu richiudibile **Prenota**.
- [x] Separazione visiva rafforzata tra le card con maggiore spazio, bordo e ombra coerenti su desktop e mobile.
- [x] Affordance esplicita con icona e stato aperto/chiuso per i menu Storico e Prenota.
- [x] Test web: **45/45** passati; lint, build e `git diff --check` verificati.

## Principi di prodotto

1. **Consultazione prima della compilazione.** L’atleta apre la scheda per leggere esercizi, serie, ripetizioni, recuperi e indicazioni. Note, valutazione e registrazione della sessione sono un secondo livello opzionale.
2. **Una gerarchia per gruppo di azioni.** Ogni gruppo ha una sola primaria, secondarie uniformi e un ordine costante su mobile e desktop.
3. **Responsive intenzionale.** Mobile usa card, stepper e pannelli leggibili; desktop usa una composizione esplicita, non colonne vuote prodotte da regole generiche.
4. **Feedback senza ambiguità.** Loading, lista vuota, errore, salvataggio e successo devono avere stato, copy e azione distinti.
5. **Accessibilità verificabile.** Target touch almeno 44×44 px, contrasto AA, focus visibile e semantica coerente con il pattern dichiarato.

## Priorità e ordine di rilascio

```text
P0-A Scheda Utente: consultazione-first ─┐
                                         ├─> baseline leggibile e prevedibile
P0-B Action group Admin coerenti ────────┘
                 ↓
P1 Desktop Admin Allenamento + CTA iscritti + chiusura del salvataggio
                 ↓
P1 Accessibilità editor e destinatari
                 ↓
P2 Scalabilità, token, debito CSS e trend analytics
```

---

## P0 — Correggere le superfici che incidono sui task principali

### UX-UI-01 — Ridisegnare la scheda Utente come superficie di consultazione

**Priorità:** P0 · Alta  
**Finding collegati:** RUM-03, USA-03, MOD-02; richiesta prodotto esplicita.

**Obiettivo**

Quando l’utente apre **Allenamento**, deve poter capire rapidamente quale scheda e quale giorno sta consultando e leggere gli esercizi senza essere spinto a compilare campi. L’aggiunta di note deve essere possibile, ma solo su scelta esplicita dell’utente.

**Dove intervenire**

- `apps/web/src/app/App.tsx` — `WorkoutWorkspace`;
- `apps/web/src/app/App.tsx` — `WorkoutHistoryPanel`, per mantenere la distinzione tra consultazione e modifica di una sessione già salvata;
- `apps/web/src/styles/global.css` — classi `training-*`, stepper esercizi e barra di salvataggio;
- `apps/web/src/app/App.test.tsx` — test del percorso di lettura, apertura note e salvataggio opzionale.

**Implementazione proposta**

1. Rendere la vista iniziale una modalità **“Consulta scheda”**: titolo, descrizione, selezione giorno, elenco esercizi e dati essenziali devono essere la parte dominante.
2. Mostrare per ogni esercizio, già in lettura, nome, serie previste, ripetizioni, recupero e indicazioni dell’istruttore senza richiedere input.
3. Conservare il passaggio a un esercizio successivo, ma senza dare ai campi numerici lo stesso peso gerarchico del contenuto della scheda.
4. Spostare data, valutazione e nota dentro un disclosure secondario, ad esempio **“Registra allenamento”** / **“Aggiungi una nota (facoltativo)”**.
5. Non mostrare una textarea vuota nel primo viewport. La nota appare solo dopo il tap sull’azione opzionale; il suo placeholder deve chiarire che non è obbligatoria.
6. Mostrare **Salva allenamento** solo quando l’utente ha aperto la registrazione o modificato dati della sessione. In consultazione pura non deve sembrare necessario salvare.
7. Preservare autosave/draft, modifica dello storico e cancellazione, ma separarli visivamente dalla consultazione corrente.
8. Durante la lettura mantenere un’unica azione primaria per volta; su mobile evitare che barra di salvataggio e navigazione esercizi competano nello stesso livello.

**Criteri di accettazione**

- Al primo viewport mobile 360×640 e 390×844 sono visibili scheda, giorno corrente e contenuto dell’esercizio senza textarea di nota aperta.
- Un utente può leggere una scheda completa senza compilare, selezionare o salvare nulla.
- La nota è chiaramente facoltativa e richiede un’azione esplicita per essere aperta.
- La nota e la valutazione possono restare vuote; quando l’utente salva una sessione, il comportamento esistente continua a richiedere almeno una serie valida e il draft viene mantenuto dopo refresh.
- Se l’utente non apre la registrazione, non viene mostrato un avviso di “dati mancanti” né una CTA di salvataggio obbligatoria.
- Loading, errore e scheda vuota restano distinti; nessun contenuto di consultazione viene sostituito da un array vuoto dopo un errore di rete.
- La modalità modifica dallo storico continua a riaprire i dati della sessione e mostra la nota esistente.
- Nessun overflow orizzontale e nessun target interattivo inferiore a 44×44 px ai viewport 360/390/412 px.

**Test da aggiungere o aggiornare**

- render con scheda assegnata e verifica della modalità consultazione;
- nota chiusa di default, apertura esplicita e salvataggio opzionale;
- consultazione senza salvataggio;
- modifica di una sessione esistente con nota già presente;
- stati loading/error/empty e retry.

### UX-UI-02 — Standardizzare tutti i gruppi di azioni Admin

**Priorità:** P0 · Alta  
**Finding collegati:** RUM-01, USA-02, DSY-01.

**Obiettivo**

Eliminare la composizione descritta come “tre pulsanti a sinistra, uno a destra e uno esteso su due colonne”. Azioni simili devono avere geometria, ordine e priorità riconoscibili in ogni breakpoint.

**Dove intervenire**

- `apps/web/src/app/App.tsx` — `WorkoutPlansManager`, `WorkoutEditorPanel` e gli altri pannelli che usano `admin-row-actions`;
- `apps/web/src/styles/global.css` — `.admin-row-actions`, regole mobile con `:last-child:nth-child(odd)`, regole desktop e `.workout-stepper-actions`;
- eventuale componente condiviso in `apps/web/src/components/` se il repository lo rende opportuno;
- `apps/web/src/app/App.test.tsx` — ordine, label e stato delle azioni.

**Implementazione proposta**

1. Definire un pattern comune `ActionGroup`/`admin-action-group` con varianti esplicite: `row`, `stack`, `stepper` e `danger`.
2. Stabilire un ordine dichiarato: azione primaria a destra su desktop e ultima nella sequenza di lettura su mobile, secondarie prima, distruttive separate o chiaramente marcate.
3. Usare colonne uguali nei gruppi mobile; eliminare le regole che fanno espandere automaticamente l’ultimo elemento dispari su due colonne.
4. Usare `width: 100%`, `min-height: 44px` e una gap costante per i pulsanti dello stesso gruppo.
5. Su desktop usare un’unica riga con allineamento coerente e larghezze minime comuni; se un gruppo è troppo lungo, passare a una toolbar intenzionale o a un menu “Altre azioni”, non a un wrap casuale.
6. Applicare la stessa variante alla lista schede (`Modifica`, `Duplica`, `Pubblica`, `Archivia`) e ai comandi dello stepper (`Indietro`, `Continua`, `Salva scheda`).
7. Separare le azioni distruttive o irreversibili dal percorso primario; non renderle accidentalmente la CTA più grande.

**Criteri di accettazione**

- A 360/390/412 px nessun pulsante del gruppo si estende su due colonne per effetto del numero dispari di azioni.
- A 1024/1280/1440 px le azioni dello stesso gruppo hanno altezza, baseline, gap e larghezza minima coerenti.
- La primaria è unica, riconoscibile e non cambia posizione arbitrariamente tra lista e editor.
- I gruppi non creano scroll orizzontale e non comprimono label o icone fino a renderle ambigue.
- Focus-visible e disabled mantengono la stessa geometria del controllo normale.
- Screenshot di riferimento aggiornati per lista schede, editor e almeno un pannello corsi/utenti.

**Test da aggiungere o aggiornare**

- snapshot/render delle varianti con 2, 3, 4 e 5 azioni;
- test responsive o screenshot a 360, 390, 412, 1024, 1280 e 1440 px;
- verifica automatica dei target touch e di `scrollWidth === clientWidth`.

---

## P1 — Rendere coerente il backoffice e chiudere i finding ad alto impatto

### UX-UI-03 — Rendere intenzionale il layout desktop Admin > Allenamento

**Priorità:** P1 · Alta  
**Finding collegati:** RUM-02, MOD-01.

**Dove intervenire**

- `apps/web/src/app/App.tsx` — struttura di `WorkoutPlansManager`;
- `apps/web/src/styles/global.css` — `.backoffice-grid`, `.workout-admin-grid`, `.workout-plan-list-panel` e `.workout-editor-panel-v2`.

**Implementazione proposta**

Scegliere e documentare una sola composizione:

- **lista full-width** quando l’editor è chiuso e editor full-width quando è aperto; oppure
- **master/detail** esplicito da 1040 px, con lista a sinistra di larghezza stabile e dettaglio a destra.

Non lasciare una seconda colonna vuota quando solo l’editor viene esteso su tutta la griglia. Su desktop il rapporto tra elenco e dettaglio deve spiegare chiaramente dove si lavora.

**Criteri di accettazione**

- Nessuna colonna libera o pannello isolato a 1024, 1280 e 1440 px.
- La lista resta raggiungibile senza perdere il contesto quando l’editor è aperto.
- A 360/390/412 px la composizione torna a una sola colonna senza duplicare heading o CTA.
- Il layout viene verificato con editor chiuso, editor aperto, lista vuota e lista con più schede.

### UX-UI-04 — Correggere la CTA Dashboard verso iscritti

**Priorità:** P1 · Media/Alta  
**Finding collegati:** RUM-04, USA-01.

**Dove intervenire:** `AdminDashboardPanel` in `apps/web/src/app/App.tsx`.

**Implementazione proposta:** sostituire la destinazione generica `courses` della CTA “Apri corsi e iscritti” con il Calendario, dove oggi vive il percorso `Prenotati`. Aggiornare label e, se disponibile, preservare data/sessione corrente.

**Criteri di accettazione:** un tap dalla Dashboard apre Calendario; il giorno/sessione rilevante è immediatamente individuabile; la CTA non promette una lista che la pagina di destinazione non mostra.

### UX-UI-05 — Dare una conclusione operativa al salvataggio della scheda Admin

**Priorità:** P1 · Media  
**Finding collegati:** MOD-02, USA-03.

**Dove intervenire:** `WorkoutPlansManager.savePlan` e `WorkoutEditorPanel` in `apps/web/src/app/App.tsx`.

**Implementazione proposta:** dopo un salvataggio riuscito mostrare feedback inline con azioni “Continua modifica”, “Pubblica” quando applicabile e “Torna alle schede”. Spostare il focus sul feedback senza chiudere automaticamente l’editor.

**Criteri di accettazione:** dopo il salvataggio l’Admin capisce cosa è successo e può scegliere il passo successivo in un tap; il draft non viene perso; errore e successo non usano la stessa semantica.

### UX-UI-06 — Correggere contrasto e semantica dell’editor

**Priorità:** P1 · Alta per accessibilità  
**Finding collegati:** ACC-01, ACC-02, DSY-02.

**Dove intervenire:** `apps/web/src/styles/global.css` per il testo secondario dark e `WorkoutEditorPanel` in `apps/web/src/app/App.tsx` per il selettore destinatari.

**Implementazione proposta:** sostituire `#777174` su fondo `#111113` con un token verificato almeno 4,5:1; trasformare il picker destinatari in checkbox nativi oppure implementare davvero il pattern listbox con frecce, Home/End, roving tabindex e annunci coerenti.

**Criteri di accettazione:** contrasto documentato ≥4,5:1; navigazione da tastiera completa; focus visibile; test con axe/equivalente senza errori sul picker; target touch invariati.

---

## P2 — Scalabilità e manutenzione del sistema visuale

### UX-UI-07 — Rendere scalabile il picker destinatari

**Dove intervenire:** `WorkoutEditorPanel` in `apps/web/src/app/App.tsx` e stili `.workout-assignment-list-v2` in `global.css`.

**Implementazione proposta:** mostrare conteggio totale, ricerca esplicita, paginazione o “Carica altri”, evitando che `.slice(0, 8)` sia l’unico limite. Ridurre i livelli di scroll interno e mantenere una sola regione scrollabile.

**Criteri:** un Admin può trovare e assegnare un utente oltre i primi otto; il risultato è annunciato; il picker resta usabile a 360 px e con tastiera.

### UX-UI-08 — Centralizzare token e pulire il debito CSS

**Dove intervenire:** `apps/web/src/styles/global.css` e markup dell’editor in `apps/web/src/app/App.tsx`.

**Implementazione proposta:** introdurre token semantici per superfici, testo, bordo, focus, stato e gruppi di azioni; rimuovere i selector builder v2 non usati dopo parity test; sostituire il selettore SVG globale con regole per variante, senza imporre background alle icone dentro ogni controllo.

**Criteri:** colori e raggi principali derivano dai token; nessun selector v2 attivo; icone coerenti in light/dark; nessuna regressione visiva nei gruppi azione.

### UX-UI-09 — Definire trend per l’andamento palestra

**Dipendenza:** decisione prodotto e contratto API.

Prima di implementare il grafico definire metrica, periodi 7/30/90 giorni, timezone e autorizzazioni. Il componente dovrà avere alternativa tabellare/testuale, stati loading/error/empty e nessuno scroll orizzontale.

---

## Piano di rilascio

| Incremento | Contenuto | Gate di uscita |
|---|---|---|
| R0 — Baseline | Test e screenshot dei componenti attuali | baseline salvata per scheda Utente e gruppi Admin |
| R1 — Consultazione | UX-UI-01 | lettura completa senza compilazione; note opzionali; test verdi |
| R2 — Azioni coerenti | UX-UI-02 | nessun wrap casuale; varianti verificate su 6 viewport |
| R3 — Backoffice desktop | UX-UI-03, UX-UI-04, UX-UI-05 | composizione desktop intenzionale e percorsi CTA verificati |
| R4 — Accessibilità | UX-UI-06 | contrasto AA, tastiera e semantica picker verificate |
| R5 — Rifinitura | UX-UI-07, UX-UI-08, UX-UI-09 | scalabilità, token e contratto trend approvati |

## Matrice di verifica obbligatoria

Ogni incremento deve includere:

- `npm run lint:web`;
- `npm run test:web`;
- `npm run build:web`;
- screenshot o verifica browser a 360×640, 390×844, 412×915, 1024×768, 1280×800 e 1440×900;
- controllo `scrollWidth === clientWidth` sulle superfici principali;
- controllo target touch ≥44×44 px;
- contrasto dei nuovi colori e focus-visible;
- verifica di tastiera, tastiera virtuale, safe-area e Back su almeno un browser mobile reale quando il flusso coinvolge input o pannelli;
- aggiornamento del report/evidence se un finding cambia stato.

## Metriche di successo

| Metrica | Stato audit | Target |
|---|---:|---:|
| Utente che legge una scheda senza compilare | non misurato | 100% nel test di percorso |
| Note aperte senza richiesta esplicita | presente | 0 nel primo viewport |
| Gruppi Admin con wrap/colonne accidentali | presente | 0 nei viewport di verifica |
| Contrasto testo secondario editor | 3,95:1 | ≥4,5:1 |
| CTA Dashboard iscritti con destinazione coerente | no | sì, Calendario |
| Overflow orizzontale nelle superfici principali | 0 nei mock audit | 0 mantenuto |
| Target touch visibili sotto 44 px | 0 nei mock precedenti | 0 mantenuto |
| Destinatari oltre i primi otto raggiungibili | no | sì, con ricerca e/o paginazione |

## Decisioni aperte e rischi

- Decidere se la consultazione della scheda mostrerà tutti gli esercizi in una pagina mobile o manterrà lo stepper a esercizio singolo; in entrambi i casi la lettura viene prima della registrazione.
- Decidere se le azioni Admin oltre tre elementi devono restare visibili o passare in un menu “Altre azioni” su desktop stretto; la scelta deve essere una variante intenzionale, non un effetto del wrapping.
- Verificare il router prima di modificare destinazioni o stato del Calendario.
- Non introdurre trend analytics prima di avere serie storiche e autorizzazioni definite.
- L’audit precedente non ha verificato screen reader, zoom 200%, iOS Safari e Android Chrome reali: questi restano gate per P1/P2.

## Non incluso

- Rifacimento visuale completo o cambio obbligatorio del tema dark.
- Sostituzione indiscriminata del design system con una libreria UI.
- Modifiche backend non necessarie ai flussi già coperti.
- Rimozione di componenti o stati senza parity test.
