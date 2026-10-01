# Review TODO — glassmorphism (post commit `ff785c6`)

Punti ancora aperti emersi dalla code review del 2026-08-21 sulle modifiche
glassmorphism/neomorphism. I fix già applicati (transition di `.btn--ghost`,
hover delle frecce a 0.6, token bubble, `-webkit-backdrop-filter`, tinta del
nav panel) sono nel commit `ff785c6` e non sono ripetuti qui.

## 🔴 Da risolvere

- [ ] **Contrasto WCAG del FAB lingua** — `styles/components.css` (~riga 675)
  Testo "EN"/"IT" bianco su `--bc-bubble` (teal al 75%): sulle sezioni
  bianche/off-white il contrasto è ~3.15:1, sotto il 4.5:1 richiesto (AA,
  testo normale: 0.95rem/600 non è "large text"). Opzioni: alzare il mix a
  teal pieno (5.0:1) o partire da `--c-teal-dark`. L'icona del FAB cookie
  (non-testo, soglia 3:1) passa al pelo.

- [ ] **`color-mix()` senza fallback per `--bc-bubble`** — `styles/main.css` (~riga 99)
  Supporto da Safari/iOS 16.2, Chrome 111, Firefox 113: sotto iOS 16.2 il
  background dei FAB diventa `transparent` e il bottone sparisce.
  Attenzione: il classico fallback "due dichiarazioni in cascata" NON
  funziona con `var()` (la sostituzione fallita è invalid at
  computed-value time → la proprietà va al valore iniziale, non alla
  dichiarazione precedente). Servono `@supports` con ramo solido di
  default, oppure — via più semplice — un `rgba()` fisso come fatto per il
  nav panel.

## 🟡 Migliorie consigliate

- [ ] **Token morti**: `--bs-c-teal` e `--bs-c-teal-hover` (`styles/main.css`
  ~righe 103-104) non hanno più usi attivi; gli unici riferimenti sono
  commentati (`components.css` ~righe 892, 969). Rimuovere token e commenti.

- [ ] **Pulizia codice commentato** in `styles/components.css`:
  - `/* border: 2px solid ; */` (dichiarazione monca, ~riga 205)
  - i quattro `/* transform: translateY(-2px); */` negli hover dei bottoni
  - background commentati di FAB e nav panel, `--fab-cookie-bg*`
  - commenti ora orfani/fuorvianti: "hover/tap share the resting values
    through these properties" e "translucent look: the page content stays
    visible underneath" in `.fab-cookie`
  - ripristinare il commento esplicativo sullo `z-index: 130` dei FAB
    (posizione rispetto a pannello 120 e cookie banner 140)

- [ ] **Scale delle frecce carousel senza transizione**: `transform:
  scale(1.1)` su `:hover svg` / `.is-tapped svg` scatta perché non esiste
  una regola base `.carousel-arrow svg` con `transition`. Aggiungere
  `transition: transform var(--t-hover)` e ripeterla con `var(--t-tap)`
  nel ramo tapped (`.is-tapped` non propaga la transition ai discendenti).

- [ ] **Dot del carousel**: la `transition` (~riga 406) non include
  `box-shadow` (l'ombra appare di scatto in hover); a monte, un inset da
  5px con blur 5px su un cerchio di 11px ne copre quasi tutto il colore.
  Probabilmente meglio togliere l'ombra da hover e tap che aggiungerla
  alla transition.

- [ ] **Voci inerti nelle liste di transition**: `transform` in `.btn`
  (nessun bottone lo anima più) e `background-color` nei FAB (l'hover non
  cambia più il background). Innocue ma fuorvianti.

- [ ] **Naming e documentazione dei nuovi token**: `--bs-big` non descrive
  nulla (sono inset da 5px); il gruppo in `:root` è l'unico senza commento
  di intestazione. `--bs-big`/`--bs-bubble` differiscono solo per la
  dimensione (5px vs 3px) e le varianti hover sono pure inversioni:
  valutare un consolidamento.

- [ ] **Indentazione mista tab/spazi**: le righe nuove usano tab in un file
  storicamente a 4 spazi, a volte nello stesso ruleset (`.fab-lang`).
  Decidere la direzione (la regola in `~/.claude/rules/web.md` prescrive
  il tab; il file usa spazi) e uniformare tutto il file.

- [ ] **Semantica hover vs pressed**: nel neomorfismo l'inversione delle
  ombre inset è la resa del "premuto"; qui è usata identica su hover e
  tap, quindi su desktop non c'è differenza percepita tra "ci sto sopra"
  e "ho premuto". Valutare un hover più leggero riservando l'inversione a
  `:active`/`.is-tapped`.

- [ ] **`prefers-reduced-transparency`**: se si vuole un fallback opaco per
  chi riduce la trasparenza di sistema, oggi è solo Chromium (Safari non
  lo implementa — WebKit bug 175497 — e in Firefox è dietro flag):
  trattarlo come progressive enhancement.

## 👁 Verifiche visive da fare nel browser

- [ ] Il blur delle frecce cattura davvero le foto del carousel (le slide
  stanno in `.carousel-viewport`, fratello della freccia, e
  `.carousel-track` riceve un `transform` da JS: la catena dovrebbe
  reggere, ma va visto a occhio).
- [ ] Lift dei FAB a −5px: elemento ancorato al bordo inferiore, il lift può
  farlo scappare da sotto il puntatore e generare flicker sull'hover.
- [ ] Fluidità di apertura del menu su hardware datato (blur 20px su
  pannello a tutta altezza animato in transform): se scatta, ridurre il
  raggio a ~12px.
- [ ] Resa del vetro dei FAB e del pannello sulle sezioni bianche (tinta
  sufficiente? lattiginoso?).
