# Booking — istanza Casa Mita

Istanza **hotel** del modulo `D:\Personal\Claude\modules\booking` per il sito
di Casa Mita (`../index.html`, sezione «Prenotazioni camere»). Guida completa
all'installazione: `modules/booking/docs/guida-installazione-hotel.md` nel
repository di origine.

Configurazione specifica di questa istanza:

| Dove | Valore |
|---|---|
| `wrangler.jsonc` → `name` | `booking-casamita` (parte dell'indirizzo `workers.dev`) |
| `wrangler.jsonc` → `vars` | `VENUE_NAME` Casa Mita, `EMAIL_SENDER` `prenotazioni@ristorantealbergocasamita.it`, `EMAIL_ADMIN` `info@ristorantealbergocasamita.it`, `EMBED_ORIGIN` `https://www.ristorantealbergocasamita.it`, `RETENTION_DAYS` 90 |
| `wrangler.jsonc` → `database_id` | DA COMPILARE con l'id stampato da `npx wrangler d1 create booking-casamita` |
| `migrations/0004_room_types.sql` | importa le cinque tipologie del sito nella tabella `room_types`; **quantità provvisorie (1 per tipologia), da confermare con il gestore**, che poi le gestisce dalla sezione Camere |
| `public/css/base.css` | palette teal del sito nel blocco `[data-booking-type="hotel"]` |
| `public/privacy.html` | informativa del servizio: ragione sociale, P.IVA e data da completare (stessi dati del footer del sito) |

Indirizzo del Worker: dopo `npm run deploy` sostituire il segnaposto
`booking-casamita.samuellazzaro.workers.dev` in `../index.html`
(script `embed.js` e link di fallback) e in `../admin.html`.

Modifiche al codice vanno fatte prima nel modulo di origine e poi ricopiate
qui (escludendo `node_modules/`, `.wrangler/`, `.dev.vars`), così le altre
istanze restano allineate.

---

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

## Struttura

```
booking/
├── wrangler.jsonc        # vars per istanza, binding D1, regola Text per il CSV, cron
├── migrations/           # migrazioni SQL
├── src/
│   ├── index.ts          # entry Hono (security header, rotte, cron handler)
│   ├── config.ts         # lettura e normalizzazione delle vars
│   ├── dates.ts          # helper puri su date/orari civili Europe/Rome
│   ├── rooms.ts          # parsing del CSV e calcolo disponibilità
│   ├── notifications.ts  # Brevo, best effort, un evento per funzione
│   ├── texts.ts          # testi delle email, it/en
│   ├── retention.ts      # anonimizzazione dei dati scaduti
│   ├── ratelimit.ts      # finestra fissa su D1
│   ├── validation.ts     # regole dei campi, condivise da form pubblico e prenotazione diretta
│   ├── auth.ts           # sessioni con cookie firmati HMAC (admin, società)
│   ├── slots.ts          # impianto: slot da 30 minuti, conflitti
│   └── routes/           # public.ts (config, disponibilità, richiesta, link personale), admin.ts (dashboard)
├── public/               # frontend statico
│   ├── index.html        # form pubblico (hotel / ristorante; avviso per facility)
│   ├── booking.html      # pagina personale del cliente (/booking/<token>)
│   ├── admin.html        # dashboard del gestore
│   ├── privacy.html      # informativa art. 13 GDPR (template da compilare)
│   ├── css/              # base / layout / components / dashboard / main (@import)
│   └── js/               # constants / translations / i18n / utils / api / ui / form-* / calendar-* / slot-calendar / add-shortcut / main / booking / admin / area
└── test/                 # vitest + @cloudflare/vitest-pool-workers
```

## Sviluppo locale

```bash
npm install
cp .dev.vars.example .dev.vars   # secret locali (ignorato da git)
npm run migrate:local            # crea il database locale in .wrangler/
npm run dev                      # http://localhost:8787
npm test                         # suite completa su D1 isolato
npm run typecheck
```

Per provare un'altra tipologia in locale: `npx wrangler dev --var BOOKING_TYPE:restaurant`.

## Configurazione per istanza (`wrangler.jsonc`, chiave `vars`)

| Var | Significato |
|---|---|
| `BOOKING_TYPE` | `hotel`, `facility` o `restaurant` |
| `VENUE_NAME` | nome della struttura (titoli, mittente e prefisso oggetto delle email) |
| `DEFAULT_LANG` | lingua iniziale dell'interfaccia (`it` o `en`), se l'utente non ne ha scelta una |
| `EMAIL_SENDER` | mittente delle notifiche (dominio autenticato in Brevo) |
| `EMAIL_ADMIN` | casella del gestore: riceve la copia di ogni evento ed è il Reply-To delle email ai clienti |
| `FACILITY_OPEN`, `FACILITY_CLOSE` | orari di apertura dell'impianto, slot da 30 minuti |
| `LUNCH_OPEN`, `LUNCH_CLOSE`, `DINNER_OPEN`, `DINNER_CLOSE` | finestre di pranzo e cena, orari a passi di 15 minuti (l'ultimo posto è prima della chiusura) |
| `RETENTION_DAYS` | giorni dopo la fine della prenotazione prima dell'anonimizzazione dei dati del cliente (`0` = mai) |

Secret (mai nel file, `wrangler secret put`): `ADMIN_SECRET`, `ADMIN_PASSWORD`,
`BREVO_API_KEY`.

### Camere (tabella `room_types`, migrazione 0004)

Le tipologie di camera (nome, ospiti massimi, numero di camere, prezzo base a
notte) le gestisce il gestore dalla sezione **Camere** della dashboard, senza
deploy. Prenotazioni e periodi di prezzo referenziano la tipologia per nome:
rinominarla aggiorna entrambi nello stesso batch; eliminarla è rifiutato (409
`room_in_use`) finché esiste anche una sola prenotazione futura, in attesa o
confermata, di quella tipologia (va prima annullata), e cancella con sé i suoi
periodi di prezzo. Ridurre il numero di camere sotto le prenotazioni confermate
è permesso: la risposta riporta in `overbooked` le camere mancanti nella notte
più piena e la dashboard lo segnala. La migrazione 0004 importa le tipologie
del vecchio `rooms.csv` dell'istanza con i prezzi base già impostati.

Una tipologia risulta occupata **solo** dalle prenotazioni approvate che si
sovrappongono al soggiorno (check-out escluso). Il form pubblico mostra le
camere rimaste per le date scelte; il server rifiuta con 409 una richiesta su
una tipologia esaurita.

## API pubbliche

| Metodo e percorso | Descrizione |
|---|---|
| `GET /api/config` | tipologia, nome, lingua di default, finestre orarie |
| `GET /api/availability?check_in&check_out` | hotel: camere rimaste per tipologia |
| `POST /api/requests` | invio richiesta (hotel, ristorante); campo honeypot `website`; 5 invii per IP ogni 10 minuti |
| `GET /booking/:token` | pagina personale del cliente |
| `GET /api/booking/:token` | dettagli e stato della richiesta |
| `POST /api/booking/:token/cancel` | annullamento da parte del cliente (richiesta non ancora iniziata) |

Gli errori rispondono con un codice (`{"error": "room_unavailable"}`) che il
frontend traduce con le chiavi `error.<codice>` di `public/js/translations.js`.

## Sicurezza e privacy

- Header di sicurezza su ogni risposta (`src/index.ts` e `public/_headers`),
  CSP `default-src 'self'`.
- Email solo testo: i contenuti scritti dagli utenti non possono iniettare
  markup; le note multilinea sono citate riga per riga.
- Il link personale è la credenziale del cliente: viaggia solo nell'email a
  lui destinata, mai nella copia al gestore.
- Anonimizzazione automatica (cron giornaliero) dei dati identificativi dopo
  `RETENTION_DAYS` dalla fine della prenotazione, art. 5.1.e GDPR.
- `public/privacy.html` è un template: compilare i segnaposto prima della
  pubblicazione.

## Dashboard del gestore (`/admin`)

Accesso con `ADMIN_PASSWORD` (sessione di 8 ore, 10 tentativi per IP ogni 15
minuti). Sezioni:

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
  I pagamenti già registrati non vengono toccati: il popup mostra il nuovo
  saldo.
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

| Metodo e percorso | Descrizione |
|---|---|
| `POST /api/admin/login`, `POST /api/admin/logout`, `GET /api/admin/me` | sessione |
| `GET /api/admin/calendar?view=day\|week\|month&date=` | voci del calendario (in attesa e confermate) |
| `GET /api/admin/requests?status=` | richieste per stato |
| `POST /api/admin/requests/:id/approve\|reject\|cancel` | decisioni (il rifiuto accetta `reason`) |
| `POST /api/admin/requests/:id/deposit\|paid` | hotel: pagamenti (l'acconto accetta `amount`) |
| `PATCH /api/admin/requests/:id` | modifica di una prenotazione in attesa o confermata: stessi campi della prenotazione diretta più `notify` (false per non avvisare il cliente); risponde con `changed` (colonne cambiate) e `item`; 409 `cannot_edit`, `in_past`, `room_unavailable`, `slots_taken` |
| `GET /api/admin/availability?check_in=&check_out=&exclude=` | hotel: camere libere escludendo una prenotazione dal conteggio (quella in modifica) |
| `POST /api/admin/bookings` | prenotazione diretta, campi per tipologia |
| `GET /api/admin/pricing`, `POST /api/admin/pricing/periods`, `PATCH/DELETE /api/admin/pricing/periods/:id`, `POST/DELETE /api/admin/pricing/discounts[/:id]` | hotel: prezzi base, periodi (409 `period_overlap`) e sconti |
| `PUT /api/admin/pricing/days/:date` | hotel: prezzo di una tipologia (`room_type`) in un giorno, come periodo di un giorno che spezza quello che lo copre; `price_per_night: null` riporta il giorno al prezzo base; 409 `day_past` |
| `GET/POST /api/admin/rooms`, `PATCH/DELETE /api/admin/rooms/:id` | hotel: tipologie di camera con prezzo base (`PATCH` risponde con `overbooked`, `DELETE` 409 `room_in_use` con prenotazioni future) |
| `GET/POST /api/admin/requesters`, `PATCH /api/admin/requesters/:id` | impianto: società |
| `POST /api/admin/requesters/:id/suspend\|reactivate\|regenerate-link\|send-link` | impianto: azioni sulla società |

## Area riservata delle società (`/area`, solo impianto)

La società entra dal link personale `/access/<token>` ricevuto via email
(cookie di sessione firmato, 30 giorni; sospensione e rigenerazione del link
invalidano subito le sessioni). Nell'area vede il calendario condiviso (stessa
griglia oraria della dashboard) con nome e colore di chi occupa ogni fascia
(le note restano riservate), invia richieste sulla griglia dei 30 minuti con
rifiuto immediato delle fasce già occupate, anche con il **+** di una fascia
libera che apre il form già compilato, ritira le richieste in attesa e
annulla le proprie prenotazioni future; ogni evento notifica la struttura via
email.

| Metodo e percorso | Descrizione |
|---|---|
| `GET /access/:token` | accesso dal link personale, redirect a `/area` |
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
iframe ad altezza automatica. Impostare `EMBED_ORIGIN` in `wrangler.jsonc` con
l'origine del sito (`https://www.nomehotel.it`) e pubblicare; poi nella pagina
del sito:

```html
<div id="booking"></div>
<script src="https://<indirizzo-del-worker>/embed.js" data-target="#booking" defer></script>
```

`GET /embed` serve la stessa `index.html` con `frame-ancestors` limitato a
quell'origine (404 finché `EMBED_ORIGIN` è vuoto); tutte le altre pagine
restano non incorporabili. In modalità incorporata la pagina nasconde testata
e piè di pagina, apre i link in una nuova scheda e comunica la propria altezza
allo script con `postMessage`. Lo script, a sua volta, invia all'iframe la
lingua della pagina (attributo `lang` di `<html>`, al caricamento e a ogni
cambio): il form la segue senza salvarla, così un sito bilingue resta
coerente con il proprio selettore di lingua.

## Documentazione

`docs/guida-installazione-hotel.md` e il PDF generato da
`python docs/build-pdf.py docs/guida-installazione-hotel.md`: guida passo
passo per pubblicare un'istanza hotel (Cloudflare, Brevo, incorporamento nel
sito, configurazione del gestore, manutenzione, limiti dei piani gratuiti).
