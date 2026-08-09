# Casa Mita — sito web

Sito one-page statico per **Casa Mita**, ristorante e B&B a Marina di Pulsano (TA), Puglia.
Rifacimento completo di https://www.ristorantealbergocasamita.it/ mantenendone la palette.

## Comandi

- `npm run dev` — dev server locale sulla root del progetto (`index.html` è servito su `/`)

## Struttura

- `index.html` — la one-page, alla root del progetto
- `public/` — asset statici: favicon, `assets/img/`, `assets/fonts/`
- `styles/` — CSS (reset e custom properties in `main.css`, moduli separati per componenti/layout)
- `src/` — JavaScript ES6+ a moduli (entry point `main.js`)

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
- **Prenotazioni camere**: form di richiesta che compone un'email precompilata (`mailto:`),
  senza backend; predisposto per un eventuale passaggio futuro a un servizio esterno.
- **Bilingue IT/EN** con i18n runtime stile CardanoSkating (attributi `data-i18n`).
- **Hosting non ancora deciso**: solo file statici, nessuna dipendenza dall'hosting.
- Font self-hosted (niente CDN esterne) in ottica GDPR.

## Convenzioni

- Vanilla HTML/CSS/JS, nessun framework né build step.
- JavaScript ES6+ a moduli, commenti JSDoc con i tipi per tutte le funzioni.
- Codice e commenti in inglese; contenuti del sito in italiano (+ traduzione inglese via i18n).
- Gli `:hover` vanno racchiusi in `@media (pointer: fine)` con controparte `.is-tapped`
  per il touch (pattern tap-feedback di CardanoSkating).
