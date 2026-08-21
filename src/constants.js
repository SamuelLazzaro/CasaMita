/*
 * constants.js — shared constants: no logic here.
 */

/** @type {string} localStorage key holding the chosen language */
export const LANG_STORAGE_KEY = "casamita-lang";

/** @type {string} language the page ships in (the HTML source is Italian) */
export const DEFAULT_LANG = "it";

/** @type {number} scroll offset (px) after which the top bar turns solid */
export const TOPBAR_SOLID_SCROLL_Y = 40;

/**
 * @type {number} safety timeout (ms) used to end a programmatic scroll on
 * browsers that do not fire the `scrollend` event
 */
export const SCROLLEND_FALLBACK_MS = 1500;

/** @type {string} translation key of the hamburger label while the menu is closed */
export const NAV_OPEN_LABEL_KEY = "a11y.openMenu";

/** @type {string} translation key of the hamburger label while the menu is open */
export const NAV_CLOSE_LABEL_KEY = "a11y.closeMenu";

/* ----- touch tap feedback (see tap-feedback.js) ----- */

/**
 * @type {number} how long (ms) the tap feedback stays on screen before the
 * tapped element's own action runs
 */
export const TAP_FEEDBACK_MS = 150;

/** @type {string} class carrying the tap feedback style (see main.css) */
export const TAP_FEEDBACK_CLASS = "is-tapped";

/**
 * @type {string} elements whose taps deserve the feedback: everything that
 * performs an action when activated. A tap anywhere else is left alone.
 */
export const TAP_FEEDBACK_SELECTOR = 'a[href], button, [role="button"]';

/* ----- booking form (see booking.js) ----- */

/** @type {string} address the booking request email is sent to */
export const BOOKING_EMAIL = "info@ristorantealbergocasamita.it";

/* ----- cookie consent (see cookie-banner.js and where-map.js) ----- */

/** @type {string} localStorage key recording the visitor's banner choice */
export const COOKIE_CONSENT_STORAGE_KEY = "casamita-cookie-consent";

/** @type {string} banner choice value: every cookie category accepted */
export const COOKIE_CONSENT_ALL = "all";

/** @type {string} banner choice value: technical storage only */
export const COOKIE_CONSENT_TECHNICAL = "technical";

/** @type {string} localStorage consent key gating the Google Maps embed */
export const MAPS_CONSENT_STORAGE_KEY = "casamita-maps-consent";

/**
 * @type {string} Google Maps embed URL of the venue. Never referenced from
 * the HTML: the iframe is created by the consent gate only after consent.
 */
export const MAPS_EMBED_URL = "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3040.264188542294!2d17.34757367558445!3d40.358666071449!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x1346e162c7ce19f3%3A0x30e8baa3d6ee5575!2sCasa%20Mita!5e0!3m2!1sit!2sit!4v1786285578381!5m2!1sit!2sit";

/* ----- dishes carousel (see carousel.js) ----- */

/** @type {number} autoplay interval (ms) between automatic slide changes */
export const CAROUSEL_AUTOPLAY_MS = 2000;

/**
 * @type {number} idle time (ms) after a manual interaction (arrow, dot,
 * swipe) before the autoplay starts rotating again
 */
export const CAROUSEL_RESUME_MS = 6000;

/** @type {number} minimum horizontal swipe distance (px) to change slide */
export const CAROUSEL_SWIPE_MIN_PX = 40;

/**
 * Translation dictionaries, flat "section.key" keys.
 * The HTML elements reference them through data attributes:
 *   data-i18n         -> text content
 *   data-i18n-label   -> aria-label attribute
 *   data-i18n-alt     -> alt attribute (images)
 *   data-i18n-content -> content attribute (meta tags)
 *   data-i18n-ph      -> placeholder attribute (form fields)
 * @type {Object<string, Object<string, string>>}
 */
export const TRANSLATIONS = {
    it: {
        "meta.title": "Casa Mita — Ristorante e B&B a Marina di Pulsano, Puglia",
        "meta.description": "Casa Mita: ristorante e bed & breakfast a pochi metri dal mare a Marina di Pulsano (Taranto). Cucina di famiglia, camere colorate e piscina nel cuore della Puglia.",

        "a11y.skip": "Salta al contenuto",
        "a11y.brandHome": "Casa Mita — Home",
        "a11y.openMenu": "Apri il menu",
        "a11y.closeMenu": "Chiudi il menu",
        "a11y.mainNav": "Navigazione principale",
        "a11y.switchLang": "Switch to English",

        "nav.home": "Home",
        "nav.about": "Chi siamo",
        "nav.restaurant": "Ristorante",
        "nav.menu": "Menu",
        "nav.rooms": "B&B – Camere",
        "nav.booking": "Prenotazioni camere",
        "nav.where": "Dove siamo",
        "nav.contacts": "Contatti",

        "hero.kicker": "Marina di Pulsano · Taranto · Puglia",
        "hero.h1": "Casa Mita: ristorante e bed & breakfast a Marina di Pulsano",
        "hero.sub": "Ristorante e bed & breakfast a pochi metri dal mare: buon cibo, camere accoglienti e l'ospitalità di una famiglia, dal 2013.",
        "hero.ctaBook": "Prenota il tuo soggiorno",
        "hero.ctaRestaurant": "Scopri il ristorante",

        "about.kicker": "Chi siamo",
        "about.title": "La storia di una famiglia",
        "about.p1": "Casa Mita è il luogo in cui si racconta anche la storia di una famiglia: la nostra. Arcangelo Mita, originario di Ceglie Messapica, a 16 anni si trasferisce a Monaco di Baviera per cercare lavoro senza sapere che, lontano da casa, avrebbe trovato molto di più: la ristorazione e Sandra, la donna della sua vita.",
        "about.p2": "A piccoli passi costruiscono una vita insieme: danno alla luce Laura, Rosangela e Rocco e rientrano in Italia, dove inaugurano La locanda al castello, la loro prima creatura professionale. Nel 2013 il sogno si completa: nasce il Ristorante B&B Casa Mita, per far conoscere le meraviglie della Puglia ai turisti vicini e lontani.",
        "about.p3": "Dal 2013 garantiamo ogni giorno accoglienza, professionalità e cortesia, in un'atmosfera intima e confortevole adatta a chi vuole immergersi nelle meraviglie pugliesi e a chi cerca solo relax.",
        "about.photoAlt": "La famiglia Mita al completo nella sala di Casa Mita",

        "restaurant.kicker": "Ristorante",
        "restaurant.title": "Se è fatto con amore, ha tutto un altro sapore",
        "restaurant.intro": "La passione per la buona cucina è una tradizione di famiglia che si tramanda da Arcangelo ai figli e offre tutti i doni di una terra da scoprire: il posto giusto per una cena romantica a lume di candela, un pranzo di pesce o un aperitivo al tramonto.",
        "restaurant.card1t": "La sala",
        "restaurant.card1p": "Ambiente curato ed elegante, con il camino acceso nelle sere d'inverno: la cornice ideale per una cena romantica o una ricorrenza in famiglia.",
        "restaurant.card1alt": "La sala interna del ristorante con tavolo apparecchiato e camino acceso",
        "restaurant.card2t": "Location estiva",
        "restaurant.card2p": "La location perfetta per eventi, cene o pranzi aziendali, o per godersi semplicemente la nostra cucina in un ambiente ampio, elegante e immerso nell'atmosfera della Marina di Pulsano.",
        "restaurant.card2alt": "I tavoli all'aperto della location estiva sotto gli alberi",
        "restaurant.card3t": "Terrazza sul mare",
        "restaurant.card3p": "Che cosa c'è di meglio di un aperitivo in terrazza alla fine di una giornata di mare? Dalla colazione all'aria aperta all'happy hour domenicale, bagnati dalla luce dorata del tramonto.",
        "restaurant.card3alt": "La terrazza sul mare con salottino e vista sulla costa",
        "restaurant.ctaMenu": "Sfoglia il menu",

        "dishes.title": "I piatti della casa",
        "dishes.intro": "Il mare Jonio in tavola: qualche assaggio dei piatti che raccontano la nostra cucina.",
        "dishes.carouselLabel": "Galleria dei piatti della casa",
        "dishes.prev": "Foto precedente",
        "dishes.next": "Foto successiva",
        "dishes.dotsLabel": "Scegli la foto da mostrare",
        "dishes.slide1alt": "Gambero gratinato servito su piatto azzurro",
        "dishes.slide2alt": "Piatto gourmet con calice di vino",
        "dishes.slide3alt": "Sauté di cozze e vongole con crostini di pane",
        "dishes.slide4alt": "Spaghetti alle vongole serviti al tavolo",
        "dishes.slide5alt": "Gran piatto di crudo di mare con ostriche, scampi e gamberi",
        "dishes.slide6alt": "Focaccia pugliese con pomodorini e olive pronta per il forno",

        /* ----- menu page (menu.html) ----- */
        "menu.metaTitle": "Menu — Casa Mita, Ristorante a Marina di Pulsano",
        "menu.metaDescription": "Il menu del ristorante Casa Mita a Marina di Pulsano (Taranto): antipasti di mare, primi della tradizione pugliese, pescato del giorno e dolci fatti in casa.",
        "menu.title": "Il nostro menu",
        "menu.intro": "Il mare Jonio in tavola: piatti della tradizione pugliese preparati con il pescato del giorno e i prodotti delle stagioni.",

        "menu.starters": "Antipasti",
        "menu.starter1t": "Crudo di mare pugliese",
        "menu.starter1p": "Tutta la bontà del pescato del giorno, servito crudo secondo la tradizione pugliese.",
        "menu.starter2t": "Polpo alla griglia",
        "menu.starter2p": "Su crema di fave e cicorie ripassate, come vuole la tradizione.",
        "menu.starter3t": "Focaccia pugliese",
        "menu.starter3p": "Un vero comfort food: la ricetta della tradizione, fragrante e dorata.",

        "menu.firsts": "Primi piatti",
        "menu.first1t": "Paccheri con la cernia",
        "menu.first1p": "Il pranzo dell'estate made in Casa Mita: un primo gustoso e leggero per gli amanti del pesce.",
        "menu.first2t": "Orecchiette alle cime di rapa",
        "menu.first2p": "Il piatto simbolo della Puglia, preparato come una volta.",
        "menu.first3t": "Spaghetti agli scampi",
        "menu.first3p": "Scampi freschissimi in un primo dal sapore del mare.",

        "menu.seconds": "Secondi piatti",
        "menu.second1t": "Pescato del giorno alla griglia",
        "menu.second1p": "Il pesce del Mar Jonio scelto ogni mattina, servito con verdure di stagione.",
        "menu.second2t": "Frittura di paranza",
        "menu.second2p": "Croccante e leggera, con il pescato piccolo del giorno.",
        "menu.second3t": "Tagliata di tonno",
        "menu.second3p": "Cuore rosa e crosta di sesamo, accompagnata da misticanza.",

        "menu.desserts": "Dolci",
        "menu.dessert1t": "Pasticciotto leccese",
        "menu.dessert1p": "Frolla dorata e crema pasticcera, servito tiepido.",
        "menu.dessert2t": "Tiramisù della casa",
        "menu.dessert2p": "La nostra versione del classico, preparata ogni giorno.",
        "menu.dessert3t": "Sporcamuss",
        "menu.dessert3p": "Sfoglia calda e crema: il dolce barese che \"sporca il muso\".",

        "menu.drinks": "Vini e bevande",
        "menu.drink1t": "Primitivo di Manduria DOP",
        "menu.drink1p": "Il rosso simbolo di questa terra.",
        "menu.drink2t": "Locorotondo DOC",
        "menu.drink2p": "Bianco fresco e minerale, perfetto con il pesce.",
        "menu.drink3t": "Vino della casa (½ litro)",
        "menu.drink3p": "Bianco o rosso, dalle cantine della zona.",

        "menu.note": "Il menu segue il pescato e le stagioni: chiedici i piatti del giorno.",
        "menu.backHome": "Torna alla home",

        "rooms.kicker": "B&B",
        "rooms.title": "Camere colorate come la Puglia",
        "rooms.intro": "Ogni camera è dipinta di un colore diverso: giallo come il sole della Puglia, azzurro come il nostro mare e verde come il paesaggio che circonda la location. Ampie, luminose e dotate di ogni comfort, per sentirsi come a casa.",
        "rooms.typesTitle": "Cinque tipologie disponibili",
        "rooms.type1": "Singola",
        "rooms.type2": "Matrimoniale",
        "rooms.type3": "Doppia",
        "rooms.type4": "Tripla",
        "rooms.type5": "Quadrupla",
        "rooms.bath": "Ogni camera dispone di bagno privato indipendente con cabina doccia e asciugacapelli.",
        "rooms.photo1alt": "Camera gialla con letto matrimoniale e letto a castello",
        "rooms.photo2alt": "Camera verde con letto matrimoniale",
        "rooms.photo3alt": "Bagno privato con doccia e piastrelle azzurre",
        "rooms.photo4alt": "Vista sulla piscina dalla finestra di una camera",

        "services.title": "I servizi",
        "services.s1t": "Spiaggia",
        "services.s1p": "A soli 350 metri dalla struttura ci sono spiagge bellissime e acque cristalline.",
        "services.s2t": "Piscina",
        "services.s2p": "Un'oasi di relax immersa nel verde, dove gustare ottimi cocktail a bordo piscina.",
        "services.s3t": "Colazione",
        "services.s3p": "Ricca colazione, sia tradizionale che internazionale.",
        "services.s4t": "Check-in / Check-out",
        "services.s4p": "Check-in: 12:00–14:00 e 17:00–22:00. Check-out: entro le 10:00.",
        "services.s5t": "Escursioni",
        "services.s5p": "Con Scirocco Escursioni, tutta la bellezza del Mar Jonio in barca.",
        "services.s6t": "Animali",
        "services.s6p": "Gli amici a quattro zampe di piccola taglia sono i benvenuti.",
        "services.s7t": "Biciclette",
        "services.s7p": "Biciclette di alta qualità, per la città e le zone escursionistiche.",
        "services.s8t": "Wi-Fi",
        "services.s8p": "Gratuito in tutta la struttura: la password viene consegnata al check-in.",
        "services.s9t": "TV satellitare",
        "services.s9p": "In camera, con canali nazionali e internazionali.",
        "services.s10t": "Ascensore",
        "services.s10p": "La struttura dispone di ascensore.",

        "booking.kicker": "Prenotazioni",
        "booking.title": "Pronto a soggiornare da noi?",
        "booking.intro": "Seleziona le date di arrivo e partenza, inserisci i tuoi dati e invia la richiesta: ti risponderemo al più presto per confermare la disponibilità.",
        "booking.name": "Nome e cognome",
        "booking.email": "Email",
        "booking.phone": "Telefono",
        "booking.checkin": "Check-in",
        "booking.checkout": "Check-out",
        "booking.room": "Camera",
        "booking.roomPlaceholder": "Seleziona la camera",
        "booking.message": "Messaggio (facoltativo)",
        "booking.send": "Invia la richiesta",
        "booking.dateError": "La data di check-out deve essere successiva a quella di check-in.",
        "booking.privacy": "Il pulsante apre il tuo programma di posta con la richiesta già compilata: nessun dato viene salvato o trasmesso da questo sito. I dati inviati via email saranno usati solo per rispondere alla richiesta.",
        "booking.subject": "Richiesta prenotazione camera — Casa Mita",

        "where.kicker": "Dove siamo",
        "where.title": "Nel cuore della Marina di Pulsano",
        "where.p1": "Casa Mita sorge a circa 300 metri dal mare, nell'area della Marina di Pulsano: un tratto di costa ricco di scogliere e baie sabbiose, punto di partenza ideale per scoprire il Salento e la Litoranea Salentina, una tavolozza di colori che attraversa tutte le sfumature di blu.",
        "where.addressTitle": "Indirizzo",
        "where.d1": "5 minuti da Pulsano",
        "where.d2": "20 minuti da Taranto, la città dei due mari",
        "where.d3": "1 ora da Lecce, la città del Barocco",
        "where.d4": "350 metri dalle spiagge",
        "where.mapLink": "Apri l'indirizzo su Google Maps",
        "where.photoAlt": "Il mare cristallino di Marina di Pulsano con la pineta sullo sfondo",
        "where.mapConsent": "Per mostrare la mappa interattiva serve il tuo consenso: al caricamento il browser si collega ai server di Google (Google Maps), che possono impostare cookie di terze parti.",
        "where.mapConsentBtn": "Accetta e mostra la mappa",
        "where.mapTitle": "Mappa di Casa Mita — Google Maps",

        "contacts.kicker": "Contatti",
        "contacts.title": "Scrivici o chiamaci",
        "contacts.intro": "Per prenotazioni del ristorante, richieste sulle camere o qualsiasi informazione siamo sempre a disposizione.",
        "contacts.emailTitle": "Email",
        "contacts.mobileTitle": "Cellulare",
        "contacts.landlineTitle": "Telefono fisso",
        "contacts.addressTitle": "Indirizzo",
        "contacts.addressLink": "Apri su Google Maps",

        "footer.copy": "Casa Mita — Ristorante e B&B, Marina di Pulsano (TA)",
        "footer.privacy": "Privacy & Cookie Policy",
        "footer.tagline": "Ristorante e bed & breakfast a Marina di Pulsano.",
        "footer.contactsTitle": "Contatti",
        "footer.followTitle": "Seguici",
        /* legal placeholders — replace with the real data before go-live
           (see the TODO note next to the footer in index.html) */
        "footer.legalName": "[Ragione sociale esatta — DA COMPLETARE] — P.IVA: [DA COMPLETARE]",
        "footer.legalSeat": "Sede legale: Contrada Rotondella, Viale del Posto, 16 — Marina di Pulsano (TA), Italia",
        "footer.legalRegister": "Registro Imprese di Taranto — REA: TA-[DA COMPLETARE] — Capitale sociale: [DA COMPLETARE]",
        "footer.legalCin": "CIN: [DA COMPLETARE] — CIS Puglia: [DA COMPLETARE]",

        "cookies.dialogLabel": "Preferenze cookie",
        "cookies.text": "Questo sito non usa cookie di profilazione propri: nel tuo browser salviamo solo preferenze tecniche (lingua e scelte sui cookie). La mappa di Google Maps nella sezione «Dove siamo» si carica solo con il tuo consenso e può impostare cookie di terze parti (Google). Maggiori informazioni:",
        "cookies.policyLink": "Privacy & Cookie Policy",
        "cookies.acceptAll": "Accetta tutto",
        "cookies.technicalOnly": "Solo tecnici",
        "cookies.fabLabel": "Gestisci le preferenze cookie",

        "policy.metaTitle": "Privacy & Cookie Policy — Casa Mita",
        "policy.metaDescription": "Informativa privacy e cookie del sito di Casa Mita: dati salvati nel browser, servizi di terze parti utilizzati e diritti degli interessati.",
        "policy.backHome": "Torna al sito",
        "policy.title": "Privacy & Cookie Policy",
        "policy.updated": "Ultimo aggiornamento: 9 agosto 2026",
        "policy.intro": "Questa pagina descrive quali dati personali tratta il sito di Casa Mita, quali tecnologie di memorizzazione usa e quali diritti hanno i visitatori, ai sensi del Regolamento (UE) 2016/679 (GDPR) e della Direttiva ePrivacy.",

        "policy.s1t": "1. Titolare del trattamento",
        "policy.s1name": "Casa Mita — Ristorante e B&B",
        "policy.s1todo": "[ragione sociale esatta e partita IVA da completare]",
        "policy.s1addr": "Contrada Rotondella, Viale del Posto, 16 — Marina di Pulsano (TA), Italia",
        "policy.s1p1": "Per qualsiasi richiesta relativa ai dati personali o per esercitare i tuoi diritti puoi scrivere a:",

        "policy.s2t": "2. Cookie e localStorage: che cosa sono",
        "policy.s2p1": "I cookie sono piccoli file di testo che i siti salvano sul tuo dispositivo tramite il browser. Il localStorage è un'area di memorizzazione del browser con uno scopo simile: i dati restano solo sul tuo dispositivo, non scadono automaticamente e non vengono trasmessi ad alcun server.",
        "policy.s2p2": "Questo sito non imposta alcun cookie HTTP proprio e non usa strumenti di profilazione o di statistica: utilizza esclusivamente il localStorage per ricordare alcune preferenze tecniche. Cookie di terze parti possono essere impostati da Google soltanto dopo il tuo consenso alla mappa (vedi sezione 4).",

        "policy.s3t": "3. Dati salvati nel tuo browser",
        "policy.s3intro": "Chiavi localStorage usate dal sito:",
        "policy.s3i1": "la lingua scelta per il sito (italiano o inglese). Tipo: tecnico. Durata: finché non la cancelli.",
        "policy.s3i2": "la scelta espressa nel banner cookie («Accetta tutto» o «Solo tecnici»). Tipo: tecnico. Durata: finché non la revochi o cancelli.",
        "policy.s3i3": "il consenso al caricamento della mappa Google Maps. Tipo: consenso a servizio di terza parte. Durata: finché non lo revochi o cancelli.",
        "policy.s3note": "Le chiavi tecniche non richiedono consenso: memorizzano soltanto scelte fatte da te e non permettono di identificarti. Base giuridica: legittimo interesse del titolare al funzionamento del sito (art. 6, par. 1, lett. f GDPR).",

        "policy.s4t": "4. Servizi di terze parti",
        "policy.s4mapsT": "Google Maps",
        "policy.s4p1": "La sezione «Dove siamo» può mostrare una mappa interattiva fornita da Google Maps (Google Ireland Limited, Gordon House, Barrow Street, Dublino 4, Irlanda, per gli utenti dello Spazio Economico Europeo; capogruppo Google LLC, USA).",
        "policy.s4p2": "La mappa non viene caricata all'apertura della pagina: al suo posto compare un riquadro informativo. Solo dopo il tuo consenso esplicito (pulsante nel riquadro oppure «Accetta tutto» nel banner) il browser si collega ai server di Google, che ricevono il tuo indirizzo IP e altri dati tecnici e possono impostare propri cookie. Base giuridica: consenso (art. 6, par. 1, lett. a GDPR), revocabile in ogni momento (vedi sezione 9).",
        "policy.s4p3": "Privacy policy di Google:",
        "policy.s4hostT": "Hosting",
        "policy.s4hostTodo": "[Da completare quando il fornitore di hosting sarà scelto: nome del provider, eventuale CDN sottostante, paese, log tecnici raccolti (indirizzo IP, user-agent, data e ora) e relativo periodo di conservazione.]",

        "policy.s5t": "5. Font, immagini e altre risorse",
        "policy.s5p1": "Tutti i font tipografici e tutte le immagini sono ospitati direttamente su questo sito (self-hosted): il loro caricamento non comporta alcuna trasmissione di dati a terze parti.",

        "policy.s6t": "6. Form di richiesta prenotazione",
        "policy.s6p1": "Il form della sezione «Prenotazioni camere» non invia dati a questo sito né a server di terzi: il pulsante apre il tuo programma di posta con un'email già compilata, che sei tu a inviare. I dati che ci comunichi via email (nome, email, telefono, date e camera richiesta) vengono usati solo per rispondere alla richiesta e gestire l'eventuale prenotazione (art. 6, par. 1, lett. b GDPR — misure precontrattuali) e conservati per il tempo necessario a tali finalità.",

        "policy.s7t": "7. Trasferimenti di dati fuori dall'Unione Europea",
        "policy.s7p1": "Se acconsenti alla mappa, i tuoi dati possono essere trattati anche da Google LLC negli Stati Uniti. Google LLC aderisce all'EU–U.S. Data Privacy Framework, il meccanismo riconosciuto dalla Commissione Europea come garanzia di un livello adeguato di protezione dei dati:",

        "policy.s8t": "8. I tuoi diritti",
        "policy.s8p1": "In qualità di interessato hai i diritti previsti dagli artt. 15–22 del GDPR: accesso, rettifica, cancellazione, limitazione del trattamento, portabilità, opposizione e revoca dei consensi prestati. Puoi esercitarli scrivendo a:",
        "policy.s8p2": "Hai inoltre il diritto di proporre reclamo al Garante per la protezione dei dati personali:",

        "policy.s9t": "9. Come gestire o cancellare i tuoi dati",
        "policy.s9i1": "Revoca dei consensi: usa il pulsante cookie fisso in basso a destra, presente in ogni pagina; azzera le scelte salvate e ripresenta il banner.",
        "policy.s9i2": "Cancellazione manuale: puoi eliminare in ogni momento le chiavi localStorage e i cookie di questo sito dalle impostazioni del tuo browser (di solito in Privacy e sicurezza → Dati dei siti).",

        "policy.s10t": "10. Aggiornamenti di questa policy",
        "policy.s10p1": "Eventuali modifiche a questa informativa saranno pubblicate su questa pagina, aggiornando la data riportata in alto. Ti invitiamo a consultarla periodicamente."
    },

    en: {
        "meta.title": "Casa Mita — Restaurant and B&B in Marina di Pulsano, Puglia",
        "meta.description": "Casa Mita: restaurant and bed & breakfast a few metres from the sea in Marina di Pulsano (Taranto), Italy. Family cooking, colourful rooms and a pool in the heart of Puglia.",

        "a11y.skip": "Skip to content",
        "a11y.brandHome": "Casa Mita — Home",
        "a11y.openMenu": "Open menu",
        "a11y.closeMenu": "Close menu",
        "a11y.mainNav": "Main navigation",
        "a11y.switchLang": "Passa all'italiano",

        "nav.home": "Home",
        "nav.about": "About us",
        "nav.restaurant": "Restaurant",
        "nav.menu": "Menu",
        "nav.rooms": "B&B – Rooms",
        "nav.booking": "Room booking",
        "nav.where": "Where we are",
        "nav.contacts": "Contacts",

        "hero.kicker": "Marina di Pulsano · Taranto · Puglia",
        "hero.h1": "Casa Mita: restaurant and bed & breakfast in Marina di Pulsano",
        "hero.sub": "Restaurant and bed & breakfast a few metres from the sea: good food, welcoming rooms and the hospitality of a family, since 2013.",
        "hero.ctaBook": "Book your stay",
        "hero.ctaRestaurant": "Discover the restaurant",

        "about.kicker": "About us",
        "about.title": "The story of a family",
        "about.p1": "Casa Mita also tells the story of a family: ours. Arcangelo Mita, born in Ceglie Messapica, moved to Munich at 16 to look for work, not knowing that far from home he would find much more: the restaurant trade and Sandra, the woman of his life.",
        "about.p2": "Step by step they built a life together: Laura, Rosangela and Rocco were born, and back in Italy they opened La locanda al castello, their first professional venture. In 2013 the dream came full circle: Ristorante B&B Casa Mita was born, to share the wonders of Puglia with visitors from near and far.",
        "about.p3": "Since 2013 we have been offering warmth, professionalism and courtesy every single day, in an intimate, comfortable atmosphere for those who want to dive into the wonders of Puglia — and for those who simply want to relax.",
        "about.photoAlt": "The whole Mita family in the Casa Mita dining room",

        "restaurant.kicker": "Restaurant",
        "restaurant.title": "Made with love, it tastes completely different",
        "restaurant.intro": "A passion for good cooking is a family tradition, handed down from Arcangelo to his children, offering all the gifts of a land waiting to be discovered: the right place for a candlelit dinner, a seafood lunch or an aperitif at sunset.",
        "restaurant.card1t": "The dining room",
        "restaurant.card1p": "An elegant, carefully kept room, with the fireplace lit on winter evenings: the ideal setting for a romantic dinner or a family celebration.",
        "restaurant.card1alt": "The restaurant dining room with a laid table and lit fireplace",
        "restaurant.card2t": "Summer venue",
        "restaurant.card2p": "The perfect venue for events, business lunches and dinners, or simply to enjoy our cooking in a spacious, elegant setting steeped in the atmosphere of Marina di Pulsano.",
        "restaurant.card2alt": "The summer venue's outdoor tables under the trees",
        "restaurant.card3t": "Terrace over the sea",
        "restaurant.card3p": "What could be better than an aperitif on the terrace at the end of a day by the sea? From open-air breakfast to Sunday happy hour, bathed in the golden light of sunset.",
        "restaurant.card3alt": "The terrace over the sea with lounge seating and coastal view",
        "restaurant.ctaMenu": "Browse the menu",

        "dishes.title": "Dishes of the house",
        "dishes.intro": "The Ionian Sea on your plate: a taste of the dishes that tell the story of our kitchen.",
        "dishes.carouselLabel": "Gallery of the dishes of the house",
        "dishes.prev": "Previous photo",
        "dishes.next": "Next photo",
        "dishes.dotsLabel": "Choose the photo to show",
        "dishes.slide1alt": "Prawn gratin served on a blue plate",
        "dishes.slide2alt": "Gourmet dish with a glass of wine",
        "dishes.slide3alt": "Sautéed mussels and clams with bread croutons",
        "dishes.slide4alt": "Spaghetti with clams served at the table",
        "dishes.slide5alt": "Large raw seafood platter with oysters, scampi and prawns",
        "dishes.slide6alt": "Apulian focaccia with cherry tomatoes and olives, ready for the oven",

        /* ----- menu page (menu.html) ----- */
        "menu.metaTitle": "Menu — Casa Mita, Restaurant in Marina di Pulsano, Puglia",
        "menu.metaDescription": "The menu of the Casa Mita restaurant in Marina di Pulsano (Taranto), Italy: seafood starters, traditional Apulian pasta dishes, catch of the day and homemade desserts.",
        "menu.title": "Our menu",
        "menu.intro": "The Ionian Sea on your plate: traditional Apulian dishes made with the day's catch and seasonal produce.",

        "menu.starters": "Starters",
        "menu.starter1t": "Apulian raw seafood",
        "menu.starter1p": "All the goodness of the day's catch, served raw following the Apulian tradition.",
        "menu.starter2t": "Grilled octopus",
        "menu.starter2p": "On broad-bean purée with sautéed chicory, as tradition demands.",
        "menu.starter3t": "Apulian focaccia",
        "menu.starter3p": "True comfort food: the traditional recipe, fragrant and golden.",

        "menu.firsts": "First courses",
        "menu.first1t": "Paccheri with grouper",
        "menu.first1p": "The summer lunch made in Casa Mita: a tasty, light pasta dish for fish lovers.",
        "menu.first2t": "Orecchiette with turnip tops",
        "menu.first2p": "Puglia's signature dish, made the old way.",
        "menu.first3t": "Spaghetti with scampi",
        "menu.first3p": "The freshest scampi in a pasta dish tasting of the sea.",

        "menu.seconds": "Main courses",
        "menu.second1t": "Grilled catch of the day",
        "menu.second1p": "Ionian Sea fish picked every morning, served with seasonal vegetables.",
        "menu.second2t": "Fried paranza",
        "menu.second2p": "Crisp and light, with the day's small catch.",
        "menu.second3t": "Seared tuna steak",
        "menu.second3p": "Pink at heart with a sesame crust, served with mixed leaves.",

        "menu.desserts": "Desserts",
        "menu.dessert1t": "Pasticciotto from Lecce",
        "menu.dessert1p": "Golden shortcrust pastry and custard, served warm.",
        "menu.dessert2t": "House tiramisù",
        "menu.dessert2p": "Our take on the classic, made fresh every day.",
        "menu.dessert3t": "Sporcamuss",
        "menu.dessert3p": "Warm puff pastry and custard: the Bari dessert that \"dirties your face\".",

        "menu.drinks": "Wines and drinks",
        "menu.drink1t": "Primitivo di Manduria DOP",
        "menu.drink1p": "The signature red of this land.",
        "menu.drink2t": "Locorotondo DOC",
        "menu.drink2p": "A fresh, mineral white, perfect with fish.",
        "menu.drink3t": "House wine (½ litre)",
        "menu.drink3p": "White or red, from local wineries.",

        "menu.note": "The menu follows the catch and the seasons: ask us about the dishes of the day.",
        "menu.backHome": "Back to the homepage",

        "rooms.kicker": "B&B",
        "rooms.title": "Rooms as colourful as Puglia",
        "rooms.intro": "Every room is painted a different colour: yellow like the Apulian sun, blue like our sea and green like the landscape around the house. Spacious, bright and fully equipped, to make you feel at home.",
        "rooms.typesTitle": "Five room types available",
        "rooms.type1": "Single",
        "rooms.type2": "Double (queen bed)",
        "rooms.type3": "Twin",
        "rooms.type4": "Triple",
        "rooms.type5": "Quadruple",
        "rooms.bath": "Every room has its own private bathroom with shower cabin and hairdryer.",
        "rooms.photo1alt": "Yellow room with a double bed and a bunk bed",
        "rooms.photo2alt": "Green room with a double bed",
        "rooms.photo3alt": "Private bathroom with shower and light-blue tiles",
        "rooms.photo4alt": "View of the pool from a room window",

        "services.title": "Services",
        "services.s1t": "Beach",
        "services.s1p": "Beautiful beaches and crystal-clear water just 350 metres away.",
        "services.s2t": "Pool",
        "services.s2p": "An oasis of relaxation surrounded by greenery, with cocktails by the pool.",
        "services.s3t": "Breakfast",
        "services.s3p": "A rich breakfast, both traditional and international.",
        "services.s4t": "Check-in / Check-out",
        "services.s4p": "Check-in: 12:00–14:00 and 17:00–22:00. Check-out: by 10:00.",
        "services.s5t": "Boat trips",
        "services.s5p": "With Scirocco Escursioni, all the beauty of the Ionian Sea by boat.",
        "services.s6t": "Pets",
        "services.s6p": "Small four-legged friends are welcome.",
        "services.s7t": "Bicycles",
        "services.s7p": "High-quality bikes, for town and the surrounding trails.",
        "services.s8t": "Wi-Fi",
        "services.s8p": "Free throughout the house: the password is handed over at check-in.",
        "services.s9t": "Satellite TV",
        "services.s9p": "In every room, with national and international channels.",
        "services.s10t": "Lift",
        "services.s10p": "The house has a lift.",

        "booking.kicker": "Booking",
        "booking.title": "Ready to stay with us?",
        "booking.intro": "Pick your arrival and departure dates, fill in your details and send the request: we will get back to you as soon as possible to confirm availability.",
        "booking.name": "Full name",
        "booking.email": "Email",
        "booking.phone": "Phone",
        "booking.checkin": "Check-in",
        "booking.checkout": "Check-out",
        "booking.room": "Room",
        "booking.roomPlaceholder": "Select a room",
        "booking.message": "Message (optional)",
        "booking.send": "Send the request",
        "booking.dateError": "The check-out date must be after the check-in date.",
        "booking.privacy": "The button opens your email client with the request already filled in: no data is stored or transmitted by this website. The details you send by email will only be used to answer your request.",
        "booking.subject": "Room booking request — Casa Mita",

        "where.kicker": "Where we are",
        "where.title": "In the heart of Marina di Pulsano",
        "where.p1": "Casa Mita stands about 300 metres from the sea, in the Marina di Pulsano area: a stretch of coast rich in cliffs and sandy bays, the ideal starting point to explore Salento and the Litoranea Salentina, a palette running through every shade of blue.",
        "where.addressTitle": "Address",
        "where.d1": "5 minutes from Pulsano",
        "where.d2": "20 minutes from Taranto, the city of the two seas",
        "where.d3": "1 hour from Lecce, the city of Baroque",
        "where.d4": "350 metres from the beaches",
        "where.mapLink": "Open the address on Google Maps",
        "where.photoAlt": "The crystal-clear sea of Marina di Pulsano with the pine wood in the background",
        "where.mapConsent": "Showing the interactive map requires your consent: when it loads, your browser connects to Google's servers (Google Maps), which may set third-party cookies.",
        "where.mapConsentBtn": "Accept and show the map",
        "where.mapTitle": "Map of Casa Mita — Google Maps",

        "contacts.kicker": "Contacts",
        "contacts.title": "Write to us or call us",
        "contacts.intro": "For restaurant reservations, questions about the rooms or any other information, we are always available.",
        "contacts.emailTitle": "Email",
        "contacts.mobileTitle": "Mobile",
        "contacts.landlineTitle": "Landline",
        "contacts.addressTitle": "Address",
        "contacts.addressLink": "Open on Google Maps",

        "footer.copy": "Casa Mita — Restaurant and B&B, Marina di Pulsano (TA), Italy",
        "footer.privacy": "Privacy & Cookie Policy",
        "footer.tagline": "Restaurant and bed & breakfast in Marina di Pulsano.",
        "footer.contactsTitle": "Contacts",
        "footer.followTitle": "Follow us",
        /* legal placeholders — replace with the real data before go-live
           (see the TODO note next to the footer in index.html) */
        "footer.legalName": "[Exact company name — TO BE COMPLETED] — VAT no. (P.IVA): [TO BE COMPLETED]",
        "footer.legalSeat": "Registered office: Contrada Rotondella, Viale del Posto, 16 — Marina di Pulsano (TA), Italy",
        "footer.legalRegister": "Taranto Register of Companies — REA no.: TA-[TO BE COMPLETED] — Share capital: [TO BE COMPLETED]",
        "footer.legalCin": "CIN: [TO BE COMPLETED] — Puglia CIS: [TO BE COMPLETED]",

        "cookies.dialogLabel": "Cookie preferences",
        "cookies.text": "This website sets no profiling cookies of its own: only technical preferences (language and cookie choices) are stored in your browser. The Google Maps map in the \"Where we are\" section is loaded only with your consent and may set third-party cookies (Google). More information:",
        "cookies.policyLink": "Privacy & Cookie Policy",
        "cookies.acceptAll": "Accept all",
        "cookies.technicalOnly": "Technical only",
        "cookies.fabLabel": "Manage cookie preferences",

        "policy.metaTitle": "Privacy & Cookie Policy — Casa Mita",
        "policy.metaDescription": "Privacy and cookie notice of the Casa Mita website: data stored in the browser, third-party services in use and the rights of data subjects.",
        "policy.backHome": "Back to the site",
        "policy.title": "Privacy & Cookie Policy",
        "policy.updated": "Last updated: 9 August 2026",
        "policy.intro": "This page describes which personal data the Casa Mita website processes, which storage technologies it uses and which rights visitors have, pursuant to Regulation (EU) 2016/679 (GDPR) and the ePrivacy Directive.",

        "policy.s1t": "1. Data controller",
        "policy.s1name": "Casa Mita — Restaurant and B&B",
        "policy.s1todo": "[exact company name and VAT number to be completed]",
        "policy.s1addr": "Contrada Rotondella, Viale del Posto, 16 — Marina di Pulsano (TA), Italy",
        "policy.s1p1": "For any request concerning personal data, or to exercise your rights, you can write to:",

        "policy.s2t": "2. Cookies and localStorage: what they are",
        "policy.s2p1": "Cookies are small text files that websites save on your device through the browser. localStorage is a browser storage area with a similar purpose: the data stays on your device only, never expires automatically and is not transmitted to any server.",
        "policy.s2p2": "This website sets no HTTP cookies of its own and uses no profiling or analytics tools: it only uses localStorage to remember a few technical preferences. Third-party cookies may be set by Google only after you consent to the map (see section 4).",

        "policy.s3t": "3. Data stored in your browser",
        "policy.s3intro": "localStorage keys used by the website:",
        "policy.s3i1": "the language chosen for the website (Italian or English). Type: technical. Duration: until you delete it.",
        "policy.s3i2": "the choice made in the cookie banner (\"Accept all\" or \"Technical only\"). Type: technical. Duration: until you withdraw or delete it.",
        "policy.s3i3": "the consent to loading the Google Maps map. Type: consent to a third-party service. Duration: until you withdraw or delete it.",
        "policy.s3note": "The technical keys do not require consent: they only record choices you made and cannot identify you. Legal basis: the controller's legitimate interest in the operation of the website (Art. 6(1)(f) GDPR).",

        "policy.s4t": "4. Third-party services",
        "policy.s4mapsT": "Google Maps",
        "policy.s4p1": "The \"Where we are\" section can show an interactive map provided by Google Maps (Google Ireland Limited, Gordon House, Barrow Street, Dublin 4, Ireland, for users in the European Economic Area; parent company Google LLC, USA).",
        "policy.s4p2": "The map is not loaded when the page opens: an information box is shown in its place. Only after your explicit consent (the button in the box, or \"Accept all\" in the banner) does your browser connect to Google's servers, which receive your IP address and other technical data and may set their own cookies. Legal basis: consent (Art. 6(1)(a) GDPR), withdrawable at any time (see section 9).",
        "policy.s4p3": "Google's privacy policy:",
        "policy.s4hostT": "Hosting",
        "policy.s4hostTodo": "[To be completed once the hosting provider is chosen: provider name, underlying CDN if any, country, technical logs collected (IP address, user agent, date and time) and their retention period.]",

        "policy.s5t": "5. Fonts, images and other assets",
        "policy.s5p1": "All fonts and images are hosted directly on this website (self-hosted): loading them involves no data transmission to third parties.",

        "policy.s6t": "6. Booking request form",
        "policy.s6p1": "The form in the \"Room booking\" section sends no data to this website or to third-party servers: the button opens your email client with a pre-filled message, which you send yourself. The data you share with us by email (name, email, phone, dates and requested room) is used only to answer your request and manage the booking (Art. 6(1)(b) GDPR — pre-contractual measures) and kept for the time needed for those purposes.",

        "policy.s7t": "7. Data transfers outside the European Union",
        "policy.s7p1": "If you consent to the map, your data may also be processed by Google LLC in the United States. Google LLC participates in the EU–U.S. Data Privacy Framework, the mechanism recognised by the European Commission as ensuring an adequate level of data protection:",

        "policy.s8t": "8. Your rights",
        "policy.s8p1": "As a data subject you have the rights set out in Articles 15–22 GDPR: access, rectification, erasure, restriction of processing, portability, objection and withdrawal of any consent given. You can exercise them by writing to:",
        "policy.s8p2": "You also have the right to lodge a complaint with the Italian supervisory authority (Garante per la protezione dei dati personali):",

        "policy.s9t": "9. How to manage or delete your data",
        "policy.s9i1": "Withdrawing consent: use the cookie button fixed at the bottom right, available on every page; it clears the saved choices and shows the banner again.",
        "policy.s9i2": "Manual deletion: you can delete this website's localStorage keys and cookies at any time from your browser settings (usually under Privacy and security → Site data).",

        "policy.s10t": "10. Updates to this policy",
        "policy.s10p1": "Any change to this notice will be published on this page, updating the date shown at the top. Please check it from time to time."
    }
};
