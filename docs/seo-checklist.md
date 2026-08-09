# SEO Casa Mita — checklist operativa off-page

L'ottimizzazione on-page (meta tag, dati strutturati, sitemap, robots) è nel codice.
Per le ricerche locali ("ristorante Marina di Pulsano", "B&B Pulsano") il fattore più
pesante è però fuori dal sito: scheda Google Business, recensioni e coerenza dei dati.
Questa checklist raccoglie le attività da fare a mano, in ordine di impatto.

## 1. Dati da farsi confermare dal proprietario

Bloccano il completamento dell'on-page: oggi NON sono pubblicati da nessuna parte
(nemmeno sul sito live) e per questo sono stati omessi dai dati strutturati.

- [ ] **Orari di apertura del ristorante** (giorni, orari pranzo/cena, giorno di
      chiusura, eventuale stagionalità) → poi aggiungere `openingHoursSpecification`
      al JSON-LD in `index.html` e alla scheda Google Business.
- [ ] **Fascia di prezzo** (es. `€€`) → proprietà `priceRange` del JSON-LD.
- [ ] **Numero di camere** → proprietà `numberOfRooms` del JSON-LD.

## 2. Google Business Profile (impatto massimo)

- [ ] Rivendicare (o creare) la scheda su https://business.google.com — la struttura
      esiste già su Maps come "Casa Mita".
- [ ] Categoria **primaria: Ristorante**, **secondaria: Bed & breakfast** (una sola
      scheda con due categorie; due schede separate hanno senso solo se le due
      attività hanno insegne, ingressi e telefoni distinti).
- [ ] Dati identici a quelli del sito (vedi NAP sotto), link al sito, orari, menu.
- [ ] Caricare foto di qualità (sala, terrazza, piatti, camere, piscina) e
      aggiornarle a ogni stagione.
- [ ] Attributi: piscina, Wi-Fi gratuito, animali ammessi, ascensore.
- [ ] **Recensioni**: chiederle attivamente agli ospiti (QR code sul tavolo/in camera
      funziona bene) e rispondere a tutte, positive e negative. È il singolo segnale
      più forte per il posizionamento nel local pack.

## 3. NAP: nome, indirizzo e telefono SEMPRE identici

Usare ovunque esattamente questa forma (la stessa del sito e del JSON-LD):

> **Casa Mita**
> Contrada Rotondella, Viale del Posto, 16
> 74026 Marina di Pulsano (TA)
> +39 392 984 7501 — info@ristorantealbergocasamita.it

Google incrocia queste "citazioni": varianti diverse (es. "C.da Rotondella",
numeri diversi) diluiscono il segnale.

## 4. Search Console e Bing

- [ ] Verificare la proprietà su **Google Search Console** e inviare
      `https://www.ristorantealbergocasamita.it/sitemap.xml`.
- [ ] Ripetere su **Bing Webmaster Tools** (si può importare da Search Console)
      e creare la scheda su **Bing Places**.

## 5. Directory e citazioni locali

- [ ] TripAdvisor (ristorante + B&B): rivendicare le schede se esistono.
- [ ] Portali turistici: viaggiareinpuglia.it (portale regionale), pro loco /
      comune di Pulsano.
- [ ] PagineGialle / PagineBianche.
- [ ] Se si usano Booking/Airbnb: stessi dati NAP e link al sito dove possibile.

## 6. Social e backlink locali

- [ ] Bio di Facebook e Instagram: link al sito e NAP coerente.
- [ ] Chiedere link da partner citati sul sito (es. Scirocco Escursioni),
      blog food/travel pugliesi, siti di eventi locali.

## 7. Al momento del deploy sul dominio

- [ ] Configurare i **redirect 301** dalle URL del vecchio sito Elementor
      (pagine interne, se esistono) verso la home o l'ancora corrispondente:
      il meccanismo dipende dall'hosting scelto (`.htaccess`, `_redirects`, ecc.).
- [ ] Forzare HTTPS e un solo host: tutto deve rispondere su
      `https://www.ristorantealbergocasamita.it/` (la canonical scelta), con
      redirect da `http://` e dalla variante senza `www`.
- [ ] Verificare i dati strutturati con il Rich Results Test:
      https://search.google.com/test/rich-results
- [ ] Verificare l'anteprima social con il Facebook Sharing Debugger:
      https://developers.facebook.com/tools/debug/
- [ ] Misurare le Core Web Vitals con PageSpeed Insights:
      https://pagespeed.web.dev/
