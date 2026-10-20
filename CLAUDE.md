# Casa Mita — sito web

Sito one-page statico per **Casa Mita**, ristorante e B&B a Marina di Pulsano (TA), Puglia.
Rifacimento completo di https://www.ristorantealbergocasamita.it/ mantenendone la palette.

## Comandi

- `npm run dev` — dev server locale sulla root del progetto (`index.html` è servito su `/`)
- `cd booking && npm run dev` — Worker delle prenotazioni in locale (`http://localhost:8787`,
  dashboard su `/admin`); `npm test`, `npm run typecheck`, `npm run deploy` (vedi `booking/README.md`)

## Struttura

- `index.html` — la one-page, alla root del progetto
- `admin.html` — pagina non indicizzata che reindirizza alla dashboard del Worker (`/admin`)
- `public/` — asset statici: favicon, `assets/img/`, `assets/fonts/`
- `styles/` — CSS (reset e custom properties in `main.css`, moduli separati per componenti/layout)
- `src/` — JavaScript ES6+ a moduli (entry point `main.js`)
- `booking/` — servizio di prenotazione (Cloudflare Workers + Hono, D1, Brevo), istanza
  `hotel` del modulo `D:\Personal\Claude\modules\booking`: progetto Node separato con il
  proprio `package.json`, deploy indipendente dal sito

## Decisioni di progetto

- **One-page a sezioni** con ancore: Home, Chi siamo, Ristorante–Menu, B&B–Camere,
  Prenotazioni camere, Dove siamo, Contatti. Niente recensioni clienti.
- **Hamburger + nav off-canvas** ripresi dal progetto `d:\Personal\CardanoSkating`
  (3 barre → X guidate da `aria-expanded`, overlay, Esc, focus handling, tap-feedback).
- **Palette** estratta dal sito live (kit Elementor + CSS inline):
  - teal scuro `#237A87` (colore primario/brand)
  - teal chiaro `#1A87A6`
  - off-white `#F7F5F5` (sfondi sezioni)
  - grigio scuro `#4A4A4A` (testo)
  - bianco `#FFFFFF`
- **Logo** bianco su trasparente (`public/assets/img/logo-casa-mita.png`): usarlo solo
  su sfondo colorato (teal), mai su bianco.
- **Prenotazioni camere**: il form è servito dal Worker in `booking/` e incorporato in
  `index.html` come iframe ad altezza automatica tramite il suo `embed.js`
  (`<div id="booking">` + `<script src="https://<worker>/embed.js">`). Lo script invia
  all'iframe l'attributo `lang` di `<html>`, quindi il FAB lingua cambia anche il form.
  Il sito non tocca mai i dati della prenotazione. Il Worker accetta l'incorporamento
  solo da `EMBED_ORIGIN` (`wrangler.jsonc`): se cambia il dominio del sito va aggiornato.
  L'indirizzo del Worker compare in tre punti da tenere allineati: `index.html` (script
  e link di fallback) e `admin.html` (meta refresh e link).
  Tipologie, quantità e prezzi delle camere dalla dashboard (sezioni Camere e Prezzi).
- **Bilingue IT/EN** con i18n runtime stile CardanoSkating (attributi `data-i18n`).
- **Hosting non ancora deciso**: solo file statici, nessuna dipendenza dall'hosting.
- Font self-hosted (niente CDN esterne) in ottica GDPR.
- **GDPR/cookie**: l'unica risorsa esterna al caricamento pagina è l'iframe del form,
  servito da Cloudflare (responsabile del trattamento, dichiarato nella policy, sezioni
  4, 6 e 7 insieme a Brevo). Google Maps
  ("Dove siamo") è dietro il componente riusabile `consent-gate`
  (`src/consent-gate.js` + `styles/consent-gate.css`, copiato da
  `D:\Personal\Claude\components\consent-gate\`), chiave `casamita-maps-consent`.
  Banner cookie ("Accetta tutto" / "Solo tecnici", scelta salvata in
  `casamita-cookie-consent`) e FAB cookie di revoca: vanno inclusi in **ogni**
  pagina (markup in fondo a `privacy.html`/`index.html`, init `initCookieBanner()`).
  `privacy.html` contiene la Privacy & Cookie Policy (i18n): i segnaposto `<mark>`
  (ragione sociale/P.IVA e hosting) vanno completati prima della pubblicazione, e la
  policy va tenuta allineata a chiavi localStorage e servizi terzi reali.

## Convenzioni

- Vanilla HTML/CSS/JS, nessun framework né build step.
- JavaScript ES6+ a moduli, commenti JSDoc con i tipi per tutte le funzioni.
- Codice e commenti in inglese; contenuti del sito in italiano (+ traduzione inglese via i18n).
- Gli `:hover` vanno racchiusi in `@media (pointer: fine)` con controparte `.is-tapped`
  per il touch (pattern tap-feedback di CardanoSkating).
