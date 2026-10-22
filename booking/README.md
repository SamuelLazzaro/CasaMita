# Booking

Sistema di prenotazione riusabile, configurabile per tipologia di struttura:

| `BOOKING_TYPE` | Chi prenota | Cosa chiede |
|---|---|---|
| `hotel` | cliente anonimo, form pubblico | nome, cognome, email, telefono, check-in, check-out, adulti, bambini, tipologia di camera (dalla sezione Camere), note |
| `restaurant` | cliente anonimo, form pubblico | nome, cognome, email, telefono, data, servizio pranzo/cena, orario a passi di 15 minuti, numero persone, note |
| `facility` | società registrata dall'admin, area riservata con link personale | data, orario dalle/alle a slot di 30 minuti, note |

In tutti i casi la richiesta nasce `pending` e l'accettazione è **sempre
manuale** dalla dashboard del gestore. A ogni evento partono email in testo
semplice via Brevo, al richiedente e al gestore.

Derivato da `CardanoSkating/prenotazioni` (stesso stack, stesse scelte di
sicurezza), con codice e commenti in inglese e testi UI in `it`/`en`.

**Stack**: Cloudflare Workers + [Hono](https://hono.dev) (TypeScript),
database D1, frontend statico vanilla servito dallo stesso Worker, test vitest
su D1 reale. Pensato per il piano gratuito di Workers.

## Stato di avanzamento

- [x] Iterazione 1: scaffolding, schema D1, configurazione per tipologia,
      camere con disponibilità, API pubbliche, form hotel e
      ristorante, link personale del cliente, notifiche di invio/annullamento,
      job di anonimizzazione (GDPR), i18n it/en.
- [x] Iterazione 2: dashboard del gestore (`/admin`): login, calendario
      giorno/settimana/mese, notifiche con approva/rifiuta/annulla,
      prenotazione diretta per tutte le tipologie (nasce confermata, email al
      cliente), sezione Camere (hotel), sezione Società (impianto) con link
      personale, sospensione e rigenerazione.
- [x] Iterazione 3: area riservata delle società (`/access/<token>`, `/area`: richieste
      e annullamenti dalla società), pagina demo con selettore delle tre
      varianti.
- [ ] Iterazione 4, multi-cliente: un solo deploy serve più strutture, ognuna
      con il proprio database D1 e il proprio prefisso `/<slug>/`; direttorio
      (strutture, configurazione, utenti), login con username e password.
      Fatte la fase 1 (backend e test) e la fase 2 (frontend con prefisso,
      pagina di accesso unica `/admin`, cambio password, informativa privacy
      per struttura) e la fase 3 (script `tenant:add`, `tenant:password`,
      `migrate:all`) e la fase 4 (guida di installazione riscritta per il
      modello multi-cliente).

## Struttura

```
booking/
├── wrangler.jsonc        # binding D1 (direttorio + uno per struttura), vars, cron
├── migrations/           # migrazioni SQL del database di ogni struttura
├── migrations-directory/ # migrazioni SQL del direttorio (tenants, users)
├── src/
│   ├── index.ts          # entry Hono (security header, rotte /<slug>/..., cron handler)
│   ├── tenant.ts         # risoluzione della struttura dal prefisso: riga del direttorio, binding D1, configurazione
│   ├── config.ts         # normalizzazione della configurazione di una struttura
│   ├── password.ts       # hash PBKDF2 delle password, politica, controllo Have I Been Pwned
│   ├── dates.ts          # helper puri su date/orari civili Europe/Rome
│   ├── rooms.ts          # parsing del CSV e calcolo disponibilità
│   ├── notifications.ts  # Brevo, best effort, un evento per funzione
│   ├── texts.ts          # testi delle email, it/en
│   ├── retention.ts      # anonimizzazione dei dati scaduti
│   ├── ratelimit.ts      # finestra fissa su D1
│   ├── validation.ts     # regole dei campi, condivise da form pubblico e prenotazione diretta
│   ├── auth.ts           # sessioni con cookie firmati HMAC (utenti della dashboard, società)
│   ├── slots.ts          # impianto: slot da 30 minuti, conflitti
│   └── routes/           # session.ts (login), public.ts (pagine, config, disponibilità, richiesta, link personale), admin.ts (dashboard), requester.ts (area società)
├── public/               # frontend statico
│   ├── index.html        # form pubblico (hotel / ristorante; avviso per facility)
│   ├── booking.html      # pagina personale del cliente (/booking/<token>)
│   ├── admin.html        # dashboard del gestore
│   ├── privacy.html      # informativa art. 13 GDPR (template da compilare)
│   ├── css/              # base / layout / components / password-toggle / dashboard / main (@import)
│   └── js/               # constants / translations / i18n / utils / tenant / api / ui / form-* / calendar-* / slot-calendar / add-shortcut / password-toggle / main / booking / admin / area / privacy
└── test/                 # vitest + @cloudflare/vitest-pool-workers
```

## Sviluppo locale

```bash
npm install
cp .dev.vars.example .dev.vars   # secret locali (ignorato da git)
npm run migrate:local            # crea i database locali (direttorio e struttura demo) in .wrangler/
npm run dev                      # http://localhost:8787
npm test                         # suite completa su D1 isolato
npm run typecheck
```

### Script di gestione delle strutture (`scripts/`)

Ogni script vuole `--local` (database di `wrangler dev`, sotto `.wrangler/`)
oppure `--remote` (Cloudflare): senza uno dei due si ferma, così nessuno
tocca la produzione per sbaglio. Girano con Node senza dipendenze in più e
usano `src/password.ts` per l'hash, lo stesso codice del Worker.

```bash
npm run tenant:add -- hotel-rossi --type hotel --name "Hotel Rossi" --username rossi --remote
npm run tenant:password -- rossi --remote
npm run migrate:all -- --remote
npm run test:scripts
```

- `tenant:add <slug> --type --name --username`: crea il database D1 della
  struttura (`booking-<slug>`; con `--local` non crea nulla, lo fa `wrangler
  dev` al primo uso), aggiunge il binding `DB_<SLUG>` a `wrangler.jsonc`
  conservando i commenti, applica le migrazioni, scrive la riga di `tenants`
  e il primo utente con una password generata (20 caratteri, stampata una
  sola volta). Opzioni: `--lang`, `--email-sender`, `--email-admin`,
  `--retention-days`, `--embed-origin`, `--privacy-controller`,
  `--privacy-address`, `--privacy-email`. Con `--remote` rifiuta di superare
  i 10 database del piano Free, salvo `--allow-many-databases`. Poi
  `npm run deploy`: il binding nuovo è attivo solo da lì.
- `tenant:password <username>`: nuova password generata, sblocco
  dell'account, fine di tutte le sessioni dell'utente.
- `migrate:all`: applica le migrazioni in sospeso a tutti i database di
  `wrangler.jsonc` (direttorio compreso); `migrate:local` e `migrate:remote`
  sono scorciatoie.

## Multi-cliente: direttorio e una struttura per prefisso

Un solo deploy serve più strutture. Il database **direttorio** (binding
`DIRECTORY`, migrazioni in `migrations-directory/`) contiene le strutture
(`tenants`), la loro configurazione e gli utenti della dashboard (`users`).
Ogni struttura ha il proprio database D1, dichiarato in `wrangler.jsonc` con
un binding (`DB_<SLUG>`) il cui nome è scritto nella colonna `binding` della
sua riga: `src/tenant.ts` lo cerca in `env` a ogni richiesta. I binding sono
statici, quindi una struttura nuova richiede un deploy.

Tutto ciò che riguarda una struttura sta sotto il suo prefisso `/<slug>/`
(form pubblico, `admin`, `area`, `booking/<token>`, `access/<token>`,
`embed`, `privacy`, `api/...`); CSS e JS restano alla radice, uguali per
tutte. Slug sconosciuti, malformati, riservati (`api`, `css`, `js`, `assets`)
o sospesi rispondono 404.

Configurazione per struttura (colonne di `tenants`):

| Colonna | Significato |
|---|---|
| `slug` | prefisso dei percorsi, `[a-z0-9-]`, da 2 a 40 caratteri |
| `binding` | nome del binding D1 della struttura in `wrangler.jsonc` |
| `type` | `hotel`, `facility` o `restaurant` |
| `name` | nome della struttura (titoli, mittente e prefisso oggetto delle email) |
| `default_lang` | lingua iniziale dell'interfaccia (`it` o `en`), se l'utente non ne ha scelta una |
| `email_sender` | mittente delle notifiche (dominio autenticato in Brevo) |
| `email_admin` | casella del gestore: riceve la copia di ogni evento ed è il Reply-To delle email ai clienti |
| `facility_open`, `facility_close` | orari di apertura dell'impianto, slot da 30 minuti |
| `lunch_open`, `lunch_close`, `dinner_open`, `dinner_close` | finestre di pranzo e cena, orari a passi di 15 minuti (l'ultimo posto è prima della chiusura) |
| `retention_days` | giorni dopo la fine della prenotazione prima dell'anonimizzazione dei dati del cliente (`0` = mai) |
| `embed_origin` | origine del sito della struttura autorizzata a incorporare il form (`NULL` = disabilitato) |
| `privacy_controller`, `privacy_address`, `privacy_email` | titolare del trattamento mostrato nell'informativa (fase 2) |
| `status` | `active` o `suspended` |

Variabili del deploy (`wrangler.jsonc`, chiave `vars`): `PASSWORD_HASH_ITERATIONS`
(iterazioni PBKDF2 dei nuovi hash: `20000` sul piano Free, `600000` sul Paid;
gli hash esistenti si aggiornano al login successivo) e `PASSWORD_BREACH_CHECK`
(`off` salta il controllo Have I Been Pwned). Secret (mai nel file,
`wrangler secret put`): `ADMIN_SECRET`, `BREVO_API_KEY`.

I valori attuali rispettano i limiti del piano Workers **Free** (10 ms di
CPU per richiesta, 10 database, 50 query per invocazione): cosa si può
cambiare passando al piano Paid è in `docs/piano-paid.md`.

### Camere (tabella `room_types`, migrazione 0004)

Le tipologie di camera (nome, ospiti massimi, numero di camere, prezzo base a
notte) le gestisce il gestore dalla sezione **Camere** della dashboard, senza
deploy. Prenotazioni e periodi di prezzo referenziano la tipologia per nome:
rinominarla aggiorna entrambi nello stesso batch; eliminarla è rifiutato (409
`room_in_use`) finché esiste anche una sola prenotazione futura, in attesa o
confermata, di quella tipologia (va prima annullata), e cancella con sé i suoi
periodi di prezzo. Ridurre il numero di camere sotto le prenotazioni confermate
è permesso: la risposta riporta in `overbooked` le camere mancanti nella notte
più piena e la dashboard lo segnala. La migrazione 0004 non crea tipologie:
il database di una struttura nuova parte senza camere.

Una tipologia risulta occupata **solo** dalle prenotazioni approvate che si
sovrappongono al soggiorno (check-out escluso). Il form pubblico mostra le
camere rimaste per le date scelte; il server rifiuta con 409 una richiesta su
una tipologia esaurita.

## API pubbliche (sotto `/<slug>`)

| Metodo e percorso | Descrizione |
|---|---|
| `GET /<slug>/`, `/<slug>/admin`, `/<slug>/area`, `/<slug>/privacy` | pagine della struttura (gli stessi file di `public/`) |
| `GET /<slug>/api/config` | slug, tipologia, nome, lingua di default, finestre orarie |
| `GET /<slug>/api/availability?check_in&check_out` | hotel: camere rimaste per tipologia |
| `POST /<slug>/api/requests` | invio richiesta (hotel, ristorante); campo honeypot `website`; 5 invii per IP ogni 10 minuti |
| `GET /<slug>/booking/:token` | pagina personale del cliente |
| `GET /<slug>/api/booking/:token` | dettagli e stato della richiesta |
| `POST /<slug>/api/booking/:token/cancel` | annullamento da parte del cliente (richiesta non ancora iniziata) |

Gli errori rispondono con un codice (`{"error": "room_unavailable"}`) che il
frontend traduce con le chiavi `error.<codice>` di `public/js/translations.js`.

## Sicurezza e privacy

- Header di sicurezza su ogni risposta (`src/index.ts` e `public/_headers`),
  CSP `default-src 'self'`.
- Email solo testo: i contenuti scritti dagli utenti non possono iniettare
  markup; le note multilinea sono citate riga per riga.
- Il link personale è la credenziale del cliente: viaggia solo nell'email a
  lui destinata, mai nella copia al gestore.
- Anonimizzazione automatica (cron giornaliero, struttura per struttura) dei
  dati identificativi dopo `retention_days` dalla fine della prenotazione,
  art. 5.1.e GDPR.
- Password degli utenti della dashboard: hash PBKDF2-HMAC-SHA256 con sale,
  numero di iterazioni salvato nell'hash e configurabile; politica OWASP
  (almeno 12 caratteri, nessuna regola di composizione, rifiuto delle
  password presenti nelle violazioni note tramite l'API k-anonymity di Have
  I Been Pwned: solo i primi 5 caratteri dello SHA-1 lasciano il Worker);
  blocco dell'account per 15 minuti dopo 10 password errate, oltre al limite
  per IP. Sul piano Free le 10 ms di CPU per richiesta impongono 20.000
  iterazioni invece delle 600.000 di OWASP: deroga dichiarata, da chiudere
  alzando `PASSWORD_HASH_ITERATIONS` col piano Paid.
- `public/privacy.html` è un template: compilare i segnaposto prima della
  pubblicazione.

## Dashboard del gestore (`/admin`)

Un solo link per tutti i gestori: `/admin` (la `admin.html` alla radice) con
nome utente e password (tabella `users` del direttorio; `POST /api/admin/login`
alla radice del deploy, senza struttura nell'URL, risponde con lo slug della
struttura dell'utente e il browser passa a `/<slug>/admin`, dove la dashboard
si apre direttamente finché la sessione vale). Sessione di 8 ore legata alla
struttura, 10 tentativi per IP ogni 15 minuti, blocco dell'account dopo 10
password errate. Il bottone **Cambia password** in testata apre la finestra
con password attuale, nuova e conferma (`js/tenant.js` ricava lo slug dal
percorso, `api.js` lo antepone a ogni chiamata); il cambio chiude le altre
sessioni dell'utente. I campi password hanno il bottone "mostra / nascondi" (copia del
componente `components/password-toggle`, file `password-toggle.css` /
`password-toggle.js`); al submit il campo torna nascosto. Sezioni:

- **Calendario**: per l'hotel viste settimana e mese a celle giornaliere
  (un soggiorno non ha un orario); per ristorante e impianto anche la vista
  giorno, e settimana e giorno sono una griglia oraria (`slot-calendar.js`):
  una colonna per giorno, una riga per fascia (15 minuti nelle finestre di
  pranzo e cena per il ristorante, 30 minuti nell'orario di apertura per
  l'impianto). Nell'impianto una prenotazione occupa le sue fasce, colorate
  con il colore della società (richieste in attesa a righe); nel ristorante
  ogni fascia elenca i tavoli seduti a quell'ora. Ogni voce apre il popup con
  i dettagli e le azioni (approva, rifiuta con messaggio facoltativo, modifica,
  annulla; per l'hotel anche i pagamenti, vedi sotto).
  "Modifica" riapre la prenotazione (in attesa o confermata, non ancora
  conclusa) nella stessa finestra della prenotazione diretta, con tutti i
  campi precompilati; al salvataggio la finestra mostra il riepilogo dei soli
  campi cambiati (prima → dopo) con la spunta "Avvisa il cliente via email", e
  scrive solo dopo la conferma. Valgono le regole di una nuova prenotazione
  (per una prenotazione confermata anche la disponibilità di camere o fasce,
  escludendo se stessa dal conteggio); un soggiorno già iniziato conserva il
  suo check-in. Il prezzo resta quello registrato finché date, camera e totale
  non cambiano; altrimenti viene ricalcolato, con l'eventuale cifra concordata.
  L'importo già pagato resta registrato e il suo stato segue il nuovo totale:
  se non lo copre più, la prenotazione torna "Acconto pagato" con il saldo da
  pagare; se lo copre o lo supera resta "Pagata" e il popup mostra
  "Da rimborsare" per l'eccedenza. Il riepilogo delle modifiche anticipa la
  conseguenza (stato del pagamento e saldo prima → dopo) e l'email al cliente
  riporta importo già pagato e saldo da pagare (mai il rimborso).
  "Nuova prenotazione" registra una prenotazione già confermata con le stesse
  regole e gli stessi campi del cliente; il cliente riceve l'email di
  conferma con il link personale, il gestore nessuna email. La stessa
  finestra si apre dal calendario con il bottone **+** che compare passando
  col mouse su una casella (sul touch: un tocco rivela il +, il secondo lo
  preme), già compilata con la data (hotel: check-in quel giorno, una notte)
  e, da una fascia della griglia oraria, con servizio e orario (ristorante) o
  con l'intervallo di una fascia (impianto). Il + compare solo sui giorni e
  sulle fasce non ancora passati; nell'impianto solo sulle fasce libere, nel
  ristorante su tutte (un orario non si esaurisce). Logica in
  `add-shortcut.js`, un solo listener delegato per calendario.
  Per l'hotel la sezione ha un secondo calendario, **Prezzi** (selettore
  Prenotazioni / Prezzi in alto): per ogni giorno il prezzo a notte di ogni
  tipologia, calcolato nel browser dai dati della sezione Prezzi con la
  stessa regola del preventivo (periodo che copre la notte, altrimenti prezzo
  base, altrimenti nessun prezzo). Vista settimana (tabella tipologie ×
  giorni) e mese (griglia con una riga per tipologia in ogni cella); niente
  vista giorno. Premendo il prezzo di un giorno non ancora passato si apre
  il popup **Prezzo del giorno** (tipologia, data, provenienza del prezzo
  attuale): il nuovo prezzo vale solo per quel giorno, salvato come periodo
  di un giorno; se il giorno sta dentro un periodo più lungo, il server lo
  spezza attorno al giorno (le parti prima e dopo conservano prezzo ed
  etichetta). "Torna al prezzo base" rimuove l'eccezione, lasciando un buco
  nel periodo se ce n'era uno. Periodi e sconti restano nella sezione Prezzi;
  i due calendari si aggiornano da soli.
  Per l'hotel, sotto "Nuova prenotazione", **Esporta CSV** scarica i
  soggiorni che toccano un intervallo di date (check-out escluso, come nel
  calendario): confermati, rifiutati e annullati, non quelli in attesa. Una
  riga per soggiorno: check-in, check-out, nome, cognome, email, telefono,
  tipologia, adulti, bambini, prezzo totale concordato, cifra pagata, stato
  pagamento, stato prenotazione. Il file è costruito nel browser
  (`utils.js`, `csvDocument`) per Excel in italiano: separatore `;`, decimali
  con la virgola, date `gg/mm/aaaa`, BOM UTF-8, intestazione e stati nella
  lingua della dashboard. Le celle che iniziano con `=`, `+`, `-`, `@` sono
  precedute da un apostrofo (CSV injection, OWASP): vale anche per i telefoni
  con prefisso `+39`.
  Le viste settimana e mese mostrano i sette giorni per intero (la dashboard
  è più larga delle pagine pubbliche); se lo schermo è più stretto si scorre
  in orizzontale, col dito sul touch e trascinando col mouse sul desktop
  (`drag-scroll.js`).
- **Notifiche**: richieste in attesa con approvazione e rifiuto immediati.
- **Camere** (solo hotel): tipologie di camera con prezzo base, create,
  modificate ed eliminate da un popup, più le camere libere per le date
  scelte.
- **Società** (solo impianto): creazione, modifica, sospensione (annulla le
  prenotazioni future e libera gli slot), rigenerazione e reinvio del link
  personale. La prenotazione diretta richiede una società già registrata.

Approvazioni atomiche: per l'hotel l'`UPDATE` contiene il conteggio delle
prenotazioni approvate sovrapposte, così due approvazioni concorrenti non
possono superare le camere disponibili; per l'impianto gli slot vengono
inseriti in un `db.batch()` e il vincolo di unicità fa fallire tutto il blocco
se una fascia è già occupata.

Percorsi sotto `/<slug>`, tranne login e logout:

| Metodo e percorso | Descrizione |
|---|---|
| `POST /api/admin/login` (`username`, `password`), `POST /api/admin/logout` | sessione; il login risponde con `slug` e `username`; 401 `invalid_credentials`, 429 `too_many_requests` o `account_locked` |
| `GET /api/admin/me` | struttura e utente della sessione |
| `POST /api/admin/password` (`current_password`, `new_password`) | cambio password; 400 `password_too_short`, `password_too_long`, `password_breached` |
| `GET /api/admin/calendar?view=day\|week\|month&date=` | voci del calendario (in attesa e confermate) |
| `GET /api/admin/requests?status=` | richieste per stato |
| `POST /api/admin/requests/:id/approve\|reject\|cancel` | decisioni (il rifiuto accetta `reason`) |
| `POST /api/admin/requests/:id/deposit\|paid` | hotel: pagamenti (l'acconto accetta `amount`) |
| `PATCH /api/admin/requests/:id` | modifica di una prenotazione in attesa o confermata: stessi campi della prenotazione diretta più `notify` (false per non avvisare il cliente); risponde con `changed` (colonne cambiate, incluso `payment_status` quando il nuovo totale lo fa cambiare) e `item`; 409 `cannot_edit`, `in_past`, `room_unavailable`, `slots_taken` |
| `GET /api/admin/availability?check_in=&check_out=&exclude=` | hotel: camere libere escludendo una prenotazione dal conteggio (quella in modifica) |
| `GET /api/admin/export?from=&to=` | hotel: righe dell'export CSV, soggiorni che toccano l'intervallo (confermati, rifiutati, annullati), solo le colonne esportate; 400 `invalid_date`, `period_reversed` |
| `POST /api/admin/bookings` | prenotazione diretta, campi per tipologia |
| `GET /api/admin/pricing`, `POST /api/admin/pricing/periods`, `PATCH/DELETE /api/admin/pricing/periods/:id`, `POST/DELETE /api/admin/pricing/discounts[/:id]` | hotel: prezzi base, periodi (409 `period_overlap`) e sconti |
| `PUT /api/admin/pricing/days/:date` | hotel: prezzo di una tipologia (`room_type`) in un giorno, come periodo di un giorno che spezza quello che lo copre; `price_per_night: null` riporta il giorno al prezzo base; 409 `day_past` |
| `GET/POST /api/admin/rooms`, `PATCH/DELETE /api/admin/rooms/:id` | hotel: tipologie di camera con prezzo base (`PATCH` risponde con `overbooked`, `DELETE` 409 `room_in_use` con prenotazioni future) |
| `GET/POST /api/admin/requesters`, `PATCH /api/admin/requesters/:id` | impianto: società |
| `POST /api/admin/requesters/:id/suspend\|reactivate\|regenerate-link\|send-link` | impianto: azioni sulla società |

## Area riservata delle società (`/<slug>/area`, solo impianto)

La società entra dal link personale `/<slug>/access/<token>` ricevuto via email
(cookie di sessione firmato, 30 giorni; sospensione e rigenerazione del link
invalidano subito le sessioni). Nell'area vede il calendario condiviso (stessa
griglia oraria della dashboard) con nome e colore di chi occupa ogni fascia
(le note restano riservate), invia richieste sulla griglia dei 30 minuti con
rifiuto immediato delle fasce già occupate, anche con il **+** di una fascia
libera che apre il form già compilato, ritira le richieste in attesa e
annulla le proprie prenotazioni future; ogni evento notifica la struttura via
email.

Percorsi sotto `/<slug>`:

| Metodo e percorso | Descrizione |
|---|---|
| `GET /access/:token` | accesso dal link personale, redirect a `/<slug>/area` |
| `GET /api/requester/me`, `POST /api/requester/logout` | sessione |
| `GET /api/requester/calendar?view=&date=` | prenotazioni confermate di tutti più le proprie in attesa |
| `GET /api/requester/requests`, `POST /api/requester/requests` | proprie richieste, nuova richiesta |
| `POST /api/requester/requests/:id/cancel` | ritiro o annullamento di una propria richiesta futura |

## Pagina demo (`/demo`)

Mostra i tre form pubblici con un selettore di tipologia. Usa la stessa logica
di `index.html` (`main.js`), ma uno shim di `fetch` in `demo.js` simula nel
browser le API di configurazione, disponibilità e invio: nessun dato parte
dalla pagina. Funziona anche servendo `public/` con un server statico qualsiasi.

## Prezzi delle camere (hotel, migrazione 0002)

Gestiti dal gestore nella sezione **Prezzi** della dashboard, senza deploy.
Prezzi per camera a notte, in euro, tasse incluse (tassa di soggiorno esclusa,
dicitura mostrata al cliente e nelle email):

- **Prezzo base** per tipologia: vale per ogni notte non coperta da un
  periodo. Si imposta nel popup della tipologia, sezione Camere (campo
  obbligatorio); una tipologia importata dalla migrazione 0004 senza prezzo
  resta "non impostato" finché il gestore non la modifica.
- **Periodi**: intervallo di date (estremi inclusi) e tipologia con un prezzo
  a notte che sostituisce il base. Niente sovrapposizioni sulla stessa
  tipologia (409 `period_overlap`); un periodo di un giorno copre le
  eccezioni, ed è quello che crea il calendario Prezzi quando si cambia il
  prezzo di un giorno (spezzando il periodo che lo copre).
- Il preventivo esiste solo se **ogni notte** del soggiorno ha un prezzo, dal
  periodo che la copre o dal base: bastano i soli periodi se coprono tutte le
  notti. Se una notte resta senza prezzo, il form pubblico non mostra il
  prezzo e la prenotazione diretta lascia vuoto il totale (il gestore lo
  scrive a mano).
- **Sconti per durata**: regole globali "da N notti: X%". Si applica quella
  con la soglia più alta raggiunta.
- Ogni campo prezzo (prezzo base, periodo, totale concordato, acconto) accetta
  al massimo due decimali e li mostra sempre con due decimali
  (`bindPriceInput` in `ui.js`); il server rifiuta una terza cifra decimale
  (400 `invalid_price` / `invalid_amount`) invece di arrotondarla.

Totale = somma dei prezzi delle singole notti meno lo sconto, arrotondato ai
centesimi solo alla fine (`src/pricing.ts`). Il form pubblico lo aggiorna al
cambio di camera o date (`GET /api/quote`) con il dettaglio per notte. Il
preventivo viene **congelato sulla richiesta** all'invio (`quoted_*`): è la
cifra che il gestore vede in dashboard e che compare nelle email, anche se i
prezzi cambiano dopo. Nella prenotazione diretta il campo "Prezzo totale
concordato" è precompilato con il calcolo e il gestore può sovrascriverlo.

| Metodo e percorso | Descrizione |
|---|---|
| `GET /api/quote?room_type&check_in&check_out` | pubblico: preventivo del soggiorno (`priced: false` se una notte non ha prezzo) |
| `GET /api/admin/pricing` | prezzi base (letti dalle tipologie), periodi e sconti |
| `POST /api/admin/pricing/periods`, `PATCH/DELETE .../:id` | periodi |
| `POST /api/admin/pricing/discounts`, `DELETE .../:id` | sconti |

L'import CSV dei periodi è rimandato a una versione successiva.

## Pagamenti (hotel, migrazione 0003)

Una prenotazione confermata può essere segnata dal gestore, dal popup dei
dettagli, come **Acconto pagato** (si digita l'importo ricevuto, che deve
essere inferiore al totale) oppure come **Pagata**; un acconto si completa poi
con "Segna come pagata", che è definitiva. Il popup di una prenotazione con
acconto mostra l'acconto versato e il **saldo da pagare** (totale meno
acconto). Senza un prezzo totale sulla prenotazione (listino incompleto al
momento della richiesta) l'acconto non si può registrare, perché il saldo non
sarebbe calcolabile; resta possibile segnarla come pagata.

Lo stato della prenotazione resta `approved`: cambia solo `payment_status`
(`none` / `deposit` / `paid`, con `paid_amount` e `paid_at`), così
disponibilità, calendario e annullamenti non cambiano. La dashboard mostra il
pagamento al posto di "Confermata" nel badge e con un colore proprio nel
calendario e nella legenda. Il cliente non vede lo stato del pagamento e non
riceve email. Ristorante e impianto non hanno pagamenti.

## Incorporare il form nel sito della struttura

Il form pubblico può essere incluso in una pagina del sito esistente tramite
iframe ad altezza automatica. Scrivere in `embed_origin` della struttura
(direttorio) l'origine del sito (`https://www.nomehotel.it`); poi nella pagina
del sito, con lo slug della struttura in `data-slug`:

```html
<div id="booking"></div>
<script src="https://<indirizzo-del-worker>/embed.js" data-slug="<slug-della-struttura>" data-target="#booking" defer></script>
```

`GET /<slug>/embed` serve la stessa `index.html` con `frame-ancestors` limitato
a quell'origine (404 finché `embed_origin` è vuoto); tutte le altre pagine
restano non incorporabili. In modalità incorporata la pagina nasconde testata
e piè di pagina, apre i link in una nuova scheda e comunica la propria altezza
allo script con `postMessage`. Lo script, a sua volta, invia all'iframe la
lingua della pagina (attributo `lang` di `<html>`, al caricamento e a ogni
cambio): il form la segue senza salvarla, così un sito bilingue resta
coerente con il proprio selettore di lingua.

## Documentazione

`docs/guida-installazione-hotel.md` e il PDF generato da
`python docs/build-pdf.py docs/guida-installazione-hotel.md`: guida passo
passo per pubblicare il deploy (Cloudflare, Brevo) e registrare una
struttura con `tenant:add` (hotel come esempio), incorporare il form nel suo
sito, configurazione a carico del gestore, manutenzione, limiti dei piani
gratuiti. `docs/piano-paid.md`: cosa cambia passando al piano Paid.
