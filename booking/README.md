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
| `rooms.csv` | le cinque tipologie del sito; **quantità provvisorie (1 per tipologia), da confermare con il gestore** |
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
| `hotel` | cliente anonimo, form pubblico | nome, cognome, email, telefono, check-in, check-out, adulti, bambini, tipologia di camera (da `rooms.csv`), note |
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
      camere da `rooms.csv` con disponibilità, API pubbliche, form hotel e
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
├── rooms.csv             # hotel: tipologie di camera (name;max_guests;quantity)
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
│   └── js/               # constants / translations / i18n / utils / api / ui / form-* / calendar-* / main / booking / admin
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

### Camere (`rooms.csv`)

File con separatore `;`, intestazione obbligatoria `name;max_guests;quantity`,
una riga per tipologia. Viene incorporato nel Worker al deploy: dopo una
modifica serve un nuovo `npm run deploy`. Una tipologia risulta occupata
**solo** dalle prenotazioni approvate che si sovrappongono al soggiorno
(check-out escluso). Il form pubblico mostra le camere rimaste per le date
scelte; il server rifiuta con 409 una richiesta su una tipologia esaurita.

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

- **Calendario**: viste giorno, settimana e mese; ogni voce apre il popup con
  i dettagli e le azioni (approva, rifiuta con messaggio facoltativo, annulla).
  "Nuova prenotazione" registra una prenotazione già confermata con le stesse
  regole e gli stessi campi del cliente; il cliente riceve l'email di
  conferma con il link personale, il gestore nessuna email.
- **Notifiche**: richieste in attesa con approvazione e rifiuto immediati.
- **Camere** (solo hotel): tipologie di `rooms.csv` e camere libere per le
  date scelte.
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
| `POST /api/admin/bookings` | prenotazione diretta, campi per tipologia |
| `GET /api/admin/rooms` | hotel: tipologie del CSV |
| `GET/POST /api/admin/requesters`, `PATCH /api/admin/requesters/:id` | impianto: società |
| `POST /api/admin/requesters/:id/suspend\|reactivate\|regenerate-link\|send-link` | impianto: azioni sulla società |

## Area riservata delle società (`/area`, solo impianto)

La società entra dal link personale `/access/<token>` ricevuto via email
(cookie di sessione firmato, 30 giorni; sospensione e rigenerazione del link
invalidano subito le sessioni). Nell'area vede il calendario condiviso con
nome e colore di chi occupa ogni fascia (le note restano riservate), invia
richieste sulla griglia dei 30 minuti con rifiuto immediato delle fasce già
occupate, ritira le richieste in attesa e annulla le proprie prenotazioni
future; ogni evento notifica la struttura via email.

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
  periodo.
- **Periodi**: intervallo di date (estremi inclusi) e tipologia con un prezzo
  a notte che sostituisce il base. Niente sovrapposizioni sulla stessa
  tipologia (409 `period_overlap`); un periodo di un giorno copre le eccezioni.
- Il preventivo esiste solo se **ogni notte** del soggiorno ha un prezzo, dal
  periodo che la copre o dal base: bastano i soli periodi se coprono tutte le
  notti. Se una notte resta senza prezzo, il form pubblico non mostra il
  prezzo e la prenotazione diretta lascia vuoto il totale (il gestore lo
  scrive a mano).
- **Sconti per durata**: regole globali "da N notti: X%". Si applica quella
  con la soglia più alta raggiunta.

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
| `GET /api/admin/pricing` | prezzi base, periodi e sconti |
| `PUT /api/admin/pricing/base` | imposta il prezzo base di una tipologia |
| `POST /api/admin/pricing/periods`, `PATCH/DELETE .../:id` | periodi |
| `POST /api/admin/pricing/discounts`, `DELETE .../:id` | sconti |

L'import CSV dei periodi è rimandato a una versione successiva.

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
