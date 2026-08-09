/*
 * constants.js — shared constants: no logic here.
 */

/** @type {string} localStorage key holding the chosen language */
export const LANG_STORAGE_KEY = "casamita-lang";

/** @type {string} language the page ships in (the HTML source is Italian) */
export const DEFAULT_LANG = "it";

/** @type {number} scroll offset (px) after which the top bar turns solid */
export const TOPBAR_SOLID_SCROLL_Y = 40;

/** @type {number} duration (ms) of the nav overlay fade-out transition */
export const NAV_OVERLAY_FADE_MS = 350;

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
        "nav.restaurant": "Ristorante – Menu",
        "nav.rooms": "B&B – Camere",
        "nav.booking": "Prenotazioni camere",
        "nav.where": "Dove siamo",
        "nav.contacts": "Contatti",

        "hero.kicker": "Marina di Pulsano · Taranto · Puglia",
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

        "menu.title": "I piatti della casa",
        "menu.intro": "Il mare Jonio in tavola: qualche assaggio dei piatti che raccontano la nostra cucina.",
        "menu.d1t": "Crudo di mare pugliese",
        "menu.d1p": "Tutta la bontà del pescato del giorno, servito crudo secondo la tradizione pugliese.",
        "menu.d2t": "Paccheri con la cernia",
        "menu.d2p": "Il pranzo dell'estate made in Casa Mita: un primo gustoso e leggero per gli amanti del pesce.",
        "menu.d3t": "Scampi",
        "menu.d3p": "Da gustare crudi, insieme agli altri frutti di mare, o cotti in un primo dal sapore del mare.",
        "menu.d4t": "Focaccia pugliese",
        "menu.d4p": "Un vero comfort food: la ricetta della tradizione, fragrante e dorata.",
        "menu.note": "Il menu segue il pescato e le stagioni: chiedici i piatti del giorno.",
        "menu.dish1alt": "Gambero gratinato servito su piatto azzurro",
        "menu.dish2alt": "Piatto gourmet con calice di vino",

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

        "contacts.kicker": "Contatti",
        "contacts.title": "Scrivici o chiamaci",
        "contacts.intro": "Per prenotazioni del ristorante, richieste sulle camere o qualsiasi informazione siamo sempre a disposizione.",
        "contacts.emailTitle": "Email",
        "contacts.phoneTitle": "Telefono",
        "contacts.addressTitle": "Indirizzo",

        "footer.copy": "Casa Mita — Ristorante e B&B, Marina di Pulsano (TA)"
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
        "nav.restaurant": "Restaurant – Menu",
        "nav.rooms": "B&B – Rooms",
        "nav.booking": "Room booking",
        "nav.where": "Where we are",
        "nav.contacts": "Contacts",

        "hero.kicker": "Marina di Pulsano · Taranto · Puglia, Italy",
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

        "menu.title": "Dishes of the house",
        "menu.intro": "The Ionian Sea on your plate: a taste of the dishes that tell the story of our kitchen.",
        "menu.d1t": "Apulian raw seafood",
        "menu.d1p": "All the goodness of the day's catch, served raw following the Apulian tradition.",
        "menu.d2t": "Paccheri with grouper",
        "menu.d2p": "The summer lunch made in Casa Mita: a tasty, light pasta dish for fish lovers.",
        "menu.d3t": "Scampi",
        "menu.d3p": "Enjoy them raw with the rest of the seafood, or cooked in a pasta dish tasting of the sea.",
        "menu.d4t": "Apulian focaccia",
        "menu.d4p": "True comfort food: the traditional recipe, fragrant and golden.",
        "menu.note": "The menu follows the catch and the seasons: ask us about the dishes of the day.",
        "menu.dish1alt": "Prawn gratin served on a blue plate",
        "menu.dish2alt": "Gourmet dish with a glass of wine",

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

        "contacts.kicker": "Contacts",
        "contacts.title": "Write to us or call us",
        "contacts.intro": "For restaurant reservations, questions about the rooms or any other information, we are always available.",
        "contacts.emailTitle": "Email",
        "contacts.phoneTitle": "Phone",
        "contacts.addressTitle": "Address",

        "footer.copy": "Casa Mita — Restaurant and B&B, Marina di Pulsano (TA), Italy"
    }
};
