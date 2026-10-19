import { Hono } from 'hono';
import type { Bindings, BookingType, RequestRow } from '../types';
import { COOKIE_REQUESTER, createSession, hashToken, REQUESTER_SESSION_S, writeSessionCookie } from '../auth';
import { embedOriginOf, venueConfig } from '../config';
import { romeNow } from '../dates';
import { notifyCancelledByGuest, notifyRequestSubmitted } from '../notifications';
import { attemptAllowed } from '../ratelimit';
import { quoteStay } from '../pricing';
import { roomAvailability, roomTypeByName, roomTypes } from '../rooms';
import { clientIp, langOf, randomToken, readJson, TOKEN_RE, writeAudit } from '../util';
import { guestFields, hotelFields, restaurantFields, validateStay } from '../validation';

/*
 * Public routes: venue configuration, hotel availability, submission of a
 * guest request (hotel, restaurant) and the guest's personal page.
 *
 * Error answers carry a machine-readable `error` code that the frontend
 * translates (public/js/translations.js, keys "error.<code>"), so the Worker
 * stays language-neutral.
 */

/** Anti-spam (owner's decision): at most 5 submissions per IP every 10 minutes. */
const SUBMIT_MAX_ATTEMPTS = 5;
const SUBMIT_WINDOW_SECONDS = 10 * 60;

/** Name of the honeypot field: hidden by CSS, humans leave it empty, bots fill it. */
const HONEYPOT_FIELD = 'website';

export const publicRoutes = new Hono<{ Bindings: Bindings }>();

/** Configuration subset the frontend needs to render the right form. */
publicRoutes.get('/api/config', (c) => {
    const venue = venueConfig(c.env);
    return c.json({ type: venue.type, name: venue.name, defaultLang: venue.defaultLang, facility: venue.facility, restaurant: venue.restaurant });
});

/** Hotel: rooms left per type for a stay. Public, so guests see availability before asking. */
publicRoutes.get('/api/availability', async (c) => {
    const venue = venueConfig(c.env);
    if (venue.type !== 'hotel') return c.json({ error: 'not_found' }, 404);
    const checkIn = c.req.query('check_in') ?? '';
    const checkOut = c.req.query('check_out') ?? '';
    const stayError = validateStay(checkIn, checkOut, romeNow(new Date()).date);
    if (stayError) return c.json({ error: stayError }, 400);
    return c.json({ check_in: checkIn, check_out: checkOut, rooms: await roomAvailability(c.env.DB, checkIn, checkOut) });
});

/**
 * Hotel: price of a stay for a room type, as the form shows it live. `priced`
 * is false when the venue has not configured a base price for the room yet.
 */
publicRoutes.get('/api/quote', async (c) => {
    const venue = venueConfig(c.env);
    if (venue.type !== 'hotel') return c.json({ error: 'not_found' }, 404);
    const checkIn = c.req.query('check_in') ?? '';
    const checkOut = c.req.query('check_out') ?? '';
    const stayError = validateStay(checkIn, checkOut, romeNow(new Date()).date);
    if (stayError) return c.json({ error: stayError }, 400);
    const roomType = c.req.query('room_type') ?? '';
    if (roomTypeByName(roomType) === undefined) return c.json({ error: 'unknown_room' }, 400);
    const quote = await quoteStay(c.env.DB, roomType, checkIn, checkOut);
    if (quote === null) return c.json({ priced: false });
    return c.json({ priced: true, ...quote });
});

/**
 * Guest request (hotel, restaurant). Facility requests go through the
 * requesters' reserved area, never through this public endpoint.
 * Order of checks: honeypot (silent accept, nothing stored), rate limit,
 * then field validation; a hotel request also needs a room left for the
 * stay, otherwise 409.
 */
publicRoutes.post('/api/requests', async (c) => {
    const venue = venueConfig(c.env);
    if (venue.type === 'facility') return c.json({ error: 'reserved_area_required' }, 403);
    const body = await readJson(c);
    if (body === null) return c.json({ error: 'invalid_body' }, 400);

    // Honeypot: answer like a success so the bot learns nothing, store nothing.
    if (typeof body[HONEYPOT_FIELD] === 'string' && body[HONEYPOT_FIELD] !== '') return c.json({ id: 0, status: 'pending' }, 201);

    if (!(await attemptAllowed(c.env.DB, `submit:${clientIp(c)}`, SUBMIT_MAX_ATTEMPTS, SUBMIT_WINDOW_SECONDS))) return c.json({ error: 'too_many_requests' }, 429);

    if (body.privacy_accepted !== true) return c.json({ error: 'privacy_required' }, 400);
    const guest = guestFields(body);
    if ('error' in guest) return c.json({ error: guest.error }, 400);
    const lang = langOf(body.lang, venue.defaultLang);
    const now = romeNow(new Date());
    const token = randomToken();

    let id: number;
    if (venue.type === 'hotel') {
        const stay = hotelFields(body, now.date);
        if ('error' in stay) return c.json({ error: stay.error }, 400);
        const availability = await roomAvailability(c.env.DB, stay.checkIn, stay.checkOut);
        const room = availability.find((candidate) => candidate.name === stay.roomType);
        if (room === undefined || room.available < 1) return c.json({ error: 'room_unavailable' }, 409);
        // The quote is frozen on the request: what the guest saw is what the venue sees, whatever the prices become.
        const quote = await quoteStay(c.env.DB, stay.roomType, stay.checkIn, stay.checkOut);
        const result = await c.env.DB
            .prepare(
                `INSERT INTO requests (type, requester_id, first_name, last_name, email, phone, lang, notes, check_in, check_out, adults, children, room_type, guest_token, quoted_subtotal, quoted_discount_percent, quoted_total)
                 VALUES ('hotel', NULL, ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)`,
            )
            .bind(guest.firstName, guest.lastName, guest.email, guest.phone, lang, guest.notes, stay.checkIn, stay.checkOut, stay.adults, stay.children, stay.roomType, token, quote?.subtotal ?? null, quote?.discount_percent ?? null, quote?.total ?? null)
            .run();
        id = result.meta.last_row_id;
    } else {
        const seating = restaurantFields(body, venue, now);
        if ('error' in seating) return c.json({ error: seating.error }, 400);
        const result = await c.env.DB
            .prepare(
                `INSERT INTO requests (type, requester_id, first_name, last_name, email, phone, lang, notes, date, start_time, party_size, guest_token)
                 VALUES ('restaurant', NULL, ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`,
            )
            .bind(guest.firstName, guest.lastName, guest.email, guest.phone, lang, guest.notes, seating.date, seating.time, seating.partySize, token)
            .run();
        id = result.meta.last_row_id;
    }

    const request = await c.env.DB.prepare('SELECT * FROM requests WHERE id = ?1').bind(id).first<RequestRow>();
    await writeAudit(c.env.DB, 'request_submitted', `${venue.type} request #${id}`, `guest:${id}`);
    if (request) notifyRequestSubmitted(c, request);
    return c.json({ id, status: 'pending' }, 201);
});

/**
 * Facility requesters sign in through their personal link: an active
 * requester with that token gets the signed session cookie and lands on the
 * reserved area. Unknown token and suspended requester give the same answer,
 * so the page reveals neither.
 */
publicRoutes.get('/access/:token', async (c) => {
    const token = c.req.param('token');
    if (!TOKEN_RE.test(token)) return c.text('Invalid access link.', 404);
    const row = await c.env.DB.prepare("SELECT id, access_token FROM requesters WHERE access_token = ?1 AND status = 'active'").bind(token).first<{ id: number; access_token: string }>();
    if (!row) return c.text('Invalid access link.', 404);
    const parts = ['requester', String(row.id), await hashToken(row.access_token)];
    const cookie = await createSession(c.env.ADMIN_SECRET, parts, REQUESTER_SESSION_S, new Date());
    writeSessionCookie(c, COOKIE_REQUESTER, cookie, REQUESTER_SESSION_S);
    await writeAudit(c.env.DB, 'requester_access', 'signed in through the personal link', `requester:${row.id}`);
    return c.redirect('/area', 302);
});

/**
 * The public form for the venue's own website: the same index.html, served
 * by the Worker so that the framing headers (see index.ts) allow the
 * EMBED_ORIGIN to put it in an iframe. public/embed.js on the website creates
 * the iframe and follows the height messages posted by main.js.
 */
publicRoutes.get('/embed', async (c) => {
    if (embedOriginOf(c.env) === null) return c.text('Embedding is not enabled on this deployment.', 404);
    const page = await c.env.ASSETS.fetch(new URL('/index.html', c.req.url));
    return new Response(page.body, { status: page.status, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
});

/** Personal page of a guest: the static booking.html, served under a clean URL carrying the token. */
publicRoutes.get('/booking/:token', async (c) => {
    if (!TOKEN_RE.test(c.req.param('token'))) return c.text('Not found', 404);
    const page = await c.env.ASSETS.fetch(new URL('/booking.html', c.req.url));
    return new Response(page.body, { status: page.status, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
});

/** Looks the request up by personal token; null when unknown or anonymised. */
async function requestByToken(db: D1Database, token: string): Promise<RequestRow | null> {
    if (!TOKEN_RE.test(token)) return null;
    return await db.prepare('SELECT * FROM requests WHERE guest_token = ?1').bind(token).first<RequestRow>();
}

/** What the guest page shows: the request without internal fields. */
function guestView(request: RequestRow, type: BookingType): Record<string, unknown> {
    return { id: request.id, type, status: request.status, first_name: request.first_name, last_name: request.last_name, check_in: request.check_in, check_out: request.check_out, adults: request.adults, children: request.children, room_type: request.room_type, date: request.date, time: request.start_time, party_size: request.party_size, notes: request.notes, quoted_subtotal: request.quoted_subtotal, quoted_discount_percent: request.quoted_discount_percent, quoted_total: request.quoted_total, created_at: request.created_at, can_cancel: canCancel(request, romeNow(new Date()).date) };
}

/** A guest may cancel a pending or approved booking that has not started yet. */
function canCancel(request: RequestRow, today: string): boolean {
    const stillActive = request.status === 'pending' || request.status === 'approved';
    const startDate = request.check_in ?? request.date ?? '';
    return stillActive && startDate >= today;
}

publicRoutes.get('/api/booking/:token', async (c) => {
    const request = await requestByToken(c.env.DB, c.req.param('token'));
    if (request === null) return c.json({ error: 'not_found' }, 404);
    return c.json(guestView(request, venueConfig(c.env).type));
});

publicRoutes.post('/api/booking/:token/cancel', async (c) => {
    const request = await requestByToken(c.env.DB, c.req.param('token'));
    if (request === null) return c.json({ error: 'not_found' }, 404);
    if (!canCancel(request, romeNow(new Date()).date)) return c.json({ error: 'cannot_cancel' }, 409);
    // The status guard in the WHERE makes two concurrent cancellations harmless.
    const result = await c.env.DB.prepare("UPDATE requests SET status = 'cancelled', cancelled_at = datetime('now') WHERE id = ?1 AND status IN ('pending', 'approved')").bind(request.id).run();
    if (result.meta.changes === 0) return c.json({ error: 'cannot_cancel' }, 409);
    await writeAudit(c.env.DB, 'request_cancelled', `request #${request.id} cancelled by the guest`, `guest:${request.id}`);
    notifyCancelledByGuest(c, { ...request, status: 'cancelled' });
    return c.json({ ok: true, status: 'cancelled' });
});

/** Exposed for the admin "Rooms" section and the tests. */
export function configuredRooms() {
    return roomTypes();
}
