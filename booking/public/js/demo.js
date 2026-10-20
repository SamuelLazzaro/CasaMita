/*
 * demo.js — stand-alone showcase of the three public forms. The real page
 * logic (main.js) runs unchanged; only the network is replaced: a fetch
 * shim answers the three public endpoints in the browser, so the demo works
 * without a Worker and never sends anything anywhere. The chosen type is
 * kept in localStorage and the page reloads on change, because main.js reads
 * the configuration once at start-up.
 */

/** @type {string} localStorage key of the demo type */
const DEMO_TYPE_KEY = 'booking-demo-type';

/** @type {string[]} */
const TYPES = ['hotel', 'restaurant', 'facility'];

const savedType = localStorage.getItem(DEMO_TYPE_KEY);
const demoType = TYPES.includes(savedType) ? savedType : 'hotel';

const NAMES = { hotel: 'Hotel Demo', restaurant: 'Trattoria Demo', facility: 'Palazzetto Demo' };

/** @type {{name: string, max_guests: number, quantity: number}[]} sample room types (the real ones live in the room_types table) */
const ROOMS = [{ name: 'Camera singola', max_guests: 1, quantity: 4 }, { name: 'Camera doppia', max_guests: 2, quantity: 10 }, { name: 'Camera tripla', max_guests: 3, quantity: 3 }, { name: 'Suite familiare', max_guests: 4, quantity: 2 }];

const CONFIG = { type: demoType, name: NAMES[demoType], defaultLang: 'it', facility: { open: '08:00', close: '24:00', slotMinutes: 30 }, restaurant: { lunch: { open: '12:00', close: '14:30' }, dinner: { open: '19:00', close: '22:30' }, stepMinutes: 15 } };

/**
 * @param {unknown} body
 * @param {number} [status]
 * @returns {Response}
 */
function jsonResponse(body, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/**
 * Pretend availability: a deterministic number of rooms left, derived from
 * the check-in date so the list changes when the dates do, with the suite
 * sold out on even days to show the disabled option.
 * @param {string} checkIn
 * @returns {object[]}
 */
function fakeAvailability(checkIn) {
    const dayNumber = Number(checkIn.slice(8, 10));
    return ROOMS.map((room, index) => ({ ...room, available: room.name === 'Suite familiare' && dayNumber % 2 === 0 ? 0 : Math.max(1, (dayNumber + index) % (room.quantity + 1)) }));
}

/** @type {Record<string, number>} pretend base prices per night */
const BASE_PRICES = { 'Camera singola': 70, 'Camera doppia': 110, 'Camera tripla': 140, 'Suite familiare': 190 };

/**
 * Pretend quote: weekend nights cost 20% more, stays of 3+ nights get 10% off,
 * 7+ nights 15% off, mirroring the shape of the real rules.
 * @param {string} roomType
 * @param {string} checkIn
 * @param {string} checkOut
 * @returns {object}
 */
function fakeQuote(roomType, checkIn, checkOut) {
    const base = BASE_PRICES[roomType];
    if (base === undefined) return { priced: false };
    const nights = [];
    for (let date = new Date(`${checkIn}T00:00:00Z`); date.toISOString().slice(0, 10) < checkOut; date.setUTCDate(date.getUTCDate() + 1)) {
        const weekend = date.getUTCDay() === 5 || date.getUTCDay() === 6;
        nights.push({ date: date.toISOString().slice(0, 10), price: weekend ? Math.round(base * 1.2) : base });
    }
    const subtotal = nights.reduce((sum, night) => sum + night.price, 0);
    const discountPercent = nights.length >= 7 ? 15 : nights.length >= 3 ? 10 : 0;
    const discountAmount = Math.round(subtotal * discountPercent) / 100;
    return { priced: true, nights, subtotal, discount_percent: discountPercent, discount_amount: discountAmount, total: subtotal - discountAmount };
}

const realFetch = window.fetch.bind(window);

window.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input.url, window.location.origin);
    if (url.pathname === '/api/config') return jsonResponse(CONFIG);
    if (url.pathname === '/api/availability') return jsonResponse({ check_in: url.searchParams.get('check_in'), check_out: url.searchParams.get('check_out'), rooms: fakeAvailability(url.searchParams.get('check_in') ?? '') });
    if (url.pathname === '/api/quote') return jsonResponse(fakeQuote(url.searchParams.get('room_type') ?? '', url.searchParams.get('check_in') ?? '', url.searchParams.get('check_out') ?? ''));
    if (url.pathname === '/api/requests' && init?.method === 'POST') {
        const payload = JSON.parse(init.body);
        console.info('demo: request that would be sent', payload);
        await new Promise((resolve) => setTimeout(resolve, 400));
        return jsonResponse({ id: 1, status: 'pending' }, 201);
    }
    return realFetch(input, init);
};

for (const button of document.querySelectorAll('[data-demo-type]')) {
    button.setAttribute('aria-pressed', String(button.dataset.demoType === demoType));
    button.addEventListener('click', () => {
        localStorage.setItem(DEMO_TYPE_KEY, button.dataset.demoType);
        window.location.reload();
    });
}

// The shim is in place: start the real page.
await import('./main.js');
