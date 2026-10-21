import { Hono } from 'hono';
import type { Bindings, PaymentStatus, RequesterRow, RequestRow } from '../types';
import { ADMIN_SESSION_S, clearSessionCookie, constantTimeEqual, COOKIE_ADMIN, createSession, requireAdmin, writeSessionCookie } from '../auth';
import { venueConfig, type VenueConfig } from '../config';
import { calendarRange, isValidDate, romeNow, type CalendarView } from '../dates';
import { notifyAccessLink, notifyApproved, notifyCancelledByAdmin, notifyChangedByAdmin, notifyRegisteredByAdmin, notifyRejected, type AccessLinkReason, type Recipient } from '../notifications';
import { attemptAllowed } from '../ratelimit';
import { periodFields, periodOverlaps, quoteStay, setDayPrice, type DiscountRule, type RatePeriod } from '../pricing';
import { createRoomType, deleteRoomType, futureBookingsOf, overbookedRooms, roomAvailability, roomFields, roomNameTaken, roomTypeById, roomTypeByName, roomTypes, updateRoomType } from '../rooms';
import { isSlotConflict, keysOf, occupiedSlots, slotInserts } from '../slots';
import { auditStatement, clientIp, integerBetween, isValidEmail, isValidPhone, langOf, optionalText, positiveInt, priceValue, randomToken, readJson, text, writeAudit } from '../util';
import { facilityFields, guestFields, hotelFields, restaurantFields, validateStay, type HotelFields } from '../validation';

/*
 * Admin dashboard routes: login, calendar, decisions on the requests, direct
 * bookings (every type) and, for facilities, the registered requesters.
 */

const LOGIN_MAX_ATTEMPTS = 10;
const LOGIN_WINDOW_SECONDS = 15 * 60;
const MAX_REASON = 300;
const MAX_LIST = 300;
const DEFAULT_COLOR = '#3b82f6';

/** A request row joined with the requester it belongs to (facility), as read by every admin query. */
type AdminRequestRow = RequestRow & { requester_name: string | null; requester_email: string | null; requester_color: string | null };

const SELECT_REQUEST = `SELECT r.*, q.name AS requester_name, q.email AS requester_email, q.color AS requester_color FROM requests r LEFT JOIN requesters q ON q.id = r.requester_id`;

/** What the dashboard sees of a request: everything but the guest's credential. */
function adminView(row: AdminRequestRow): Record<string, unknown> {
    const { guest_token: _token, ...rest } = row;
    return rest;
}

/** The recipient of the notifications about a request: the requester organisation, or null for guests. */
function requesterRecipient(row: AdminRequestRow): Recipient | null {
    if (row.requester_id === null) return null;
    return { name: row.requester_name ?? '', email: row.requester_email ?? '' };
}

/** Start date of a booking, whatever its type. */
function startDate(row: RequestRow): string {
    return row.check_in ?? row.date ?? '';
}

/** True once the booking is behind us: a stay after its check-out day, the other types after their day. */
function isOver(row: RequestRow, today: string): boolean {
    if (row.type === 'hotel') return (row.check_out ?? '') <= today;
    return (row.date ?? '') < today;
}

async function loadRequest(db: D1Database, id: number): Promise<AdminRequestRow | null> {
    return await db.prepare(`${SELECT_REQUEST} WHERE r.id = ?1`).bind(id).first<AdminRequestRow>();
}

/**
 * Hotel approval and direct booking share one condition: the approved
 * stays of the same room type overlapping the requested one must be fewer
 * than the rooms of that type. Evaluated INSIDE the write statement, so the
 * check and the write are one atomic step and two concurrent approvals
 * cannot both pass. `alias` is the row being written (requests in UPDATE, the
 * bound values in INSERT ... SELECT).
 */
const OVERLAPPING_APPROVED = `(SELECT COUNT(*) FROM requests o WHERE o.type = 'hotel' AND o.status = 'approved' AND o.room_type = %ROOM% AND o.check_in < %OUT% AND o.check_out > %IN% AND o.id != %ID%)`;

function overlappingSql(room: string, checkIn: string, checkOut: string, id: string): string {
    return OVERLAPPING_APPROVED.replace('%ROOM%', room).replace('%OUT%', checkOut).replace('%IN%', checkIn).replace('%ID%', id);
}

export const admin = new Hono<{ Bindings: Bindings }>();

admin.post('/login', async (c) => {
    if (!(await attemptAllowed(c.env.DB, `login:${clientIp(c)}`, LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_SECONDS))) return c.json({ error: 'too_many_requests' }, 429);
    const body = await readJson(c);
    const password = typeof body?.password === 'string' ? body.password : '';
    if (password === '' || !(await constantTimeEqual(password, c.env.ADMIN_PASSWORD))) {
        await writeAudit(c.env.DB, 'admin_login_failed', `ip ${clientIp(c)}`, 'system');
        return c.json({ error: 'invalid_credentials' }, 401);
    }
    const cookie = await createSession(c.env.ADMIN_SECRET, ['admin'], ADMIN_SESSION_S, new Date());
    writeSessionCookie(c, COOKIE_ADMIN, cookie, ADMIN_SESSION_S);
    await writeAudit(c.env.DB, 'admin_login', '', 'admin');
    return c.json({ ok: true });
});

admin.post('/logout', (c) => {
    clearSessionCookie(c, COOKIE_ADMIN);
    return c.json({ ok: true });
});

admin.use('*', requireAdmin());

admin.get('/me', (c) => c.json({ ok: true }));

/**
 * Calendar items of a view: pending and approved requests touching the
 * range. Hotel stays overlap it (check-out excluded), the others fall on a
 * date inside it.
 */
admin.get('/calendar', async (c) => {
    const venue = venueConfig(c.env);
    const view = c.req.query('view') ?? 'week';
    const date = c.req.query('date') ?? romeNow(new Date()).date;
    if (!['day', 'week', 'month'].includes(view) || !isValidDate(date)) return c.json({ error: 'invalid_body' }, 400);
    const { from, to } = calendarRange(view as CalendarView, date);
    const condition = venue.type === 'hotel' ? `r.type = ?3 AND r.check_in <= ?2 AND r.check_out > ?1` : `r.type = ?3 AND r.date >= ?1 AND r.date <= ?2`;
    const { results } = await c.env.DB.prepare(`${SELECT_REQUEST} WHERE r.status IN ('pending', 'approved') AND ${condition} ORDER BY COALESCE(r.check_in, r.date), r.start_time`).bind(from, to, venue.type).all<AdminRequestRow>();
    return c.json({ view, date, from, to, items: results.map(adminView) });
});

/**
 * Hotel: rooms left for a stay as the edit form needs them, with the booking
 * being edited (`exclude`) left out of the count so its own room shows as
 * free. A stay already begun keeps its past check-in, so the horizon of the
 * validation starts there instead of today.
 */
admin.get('/availability', async (c) => {
    if (venueConfig(c.env).type !== 'hotel') return c.json({ error: 'not_found' }, 404);
    const checkIn = c.req.query('check_in') ?? '';
    const checkOut = c.req.query('check_out') ?? '';
    const exclude = positiveInt(c.req.query('exclude')) ?? 0;
    const today = romeNow(new Date()).date;
    const horizon = exclude > 0 && checkIn < today ? checkIn : today;
    const stayError = validateStay(checkIn, checkOut, horizon);
    if (stayError) return c.json({ error: stayError }, 400);
    return c.json({ check_in: checkIn, check_out: checkOut, rooms: await roomAvailability(c.env.DB, checkIn, checkOut, exclude) });
});

/**
 * Hotel: the rows of the CSV export, for the stays touching a date range
 * (both ends included, check-out excluded as in the calendar). Confirmed,
 * rejected and cancelled stays; pending ones are left out (owner's
 * decision). Only the exported columns: the browser builds the file, so the
 * header follows the language of the dashboard.
 */
admin.get('/export', async (c) => {
    if (venueConfig(c.env).type !== 'hotel') return c.json({ error: 'not_found' }, 404);
    const from = c.req.query('from') ?? '';
    const to = c.req.query('to') ?? '';
    if (!isValidDate(from) || !isValidDate(to)) return c.json({ error: 'invalid_date' }, 400);
    if (to < from) return c.json({ error: 'period_reversed' }, 400);
    const { results } = await c.env.DB.prepare(`SELECT check_in, check_out, first_name, last_name, email, phone, room_type, adults, children, quoted_total, paid_amount, payment_status, status FROM requests WHERE type = 'hotel' AND status IN ('approved', 'rejected', 'cancelled') AND check_in <= ?2 AND check_out > ?1 ORDER BY check_in, check_out, last_name, first_name, id`).bind(from, to).all();
    return c.json({ from, to, items: results });
});

/** Requests by status (pending by default), newest first for the inbox. */
admin.get('/requests', async (c) => {
    const status = c.req.query('status') ?? 'pending';
    if (!['pending', 'approved', 'rejected', 'cancelled'].includes(status)) return c.json({ error: 'invalid_body' }, 400);
    const order = status === 'pending' ? 'r.created_at ASC' : 'r.created_at DESC';
    const { results } = await c.env.DB.prepare(`${SELECT_REQUEST} WHERE r.status = ?1 ORDER BY ${order} LIMIT ${MAX_LIST}`).bind(status).all<AdminRequestRow>();
    return c.json({ status, items: results.map(adminView) });
});

admin.post('/requests/:id/approve', async (c) => {
    const id = positiveInt(c.req.param('id'));
    const request = id === null ? null : await loadRequest(c.env.DB, id);
    if (request === null) return c.json({ error: 'not_found' }, 404);
    if (request.status !== 'pending') return c.json({ error: 'not_pending' }, 409);
    const today = romeNow(new Date()).date;
    if (startDate(request) < today) return c.json({ error: 'in_past' }, 409);
    const venue = venueConfig(c.env);

    if (request.type === 'hotel') {
        const quantity = (await roomTypeByName(c.env.DB, request.room_type ?? ''))?.quantity ?? 0;
        const overlapping = overlappingSql('requests.room_type', 'requests.check_in', 'requests.check_out', 'requests.id');
        const result = await c.env.DB.prepare(`UPDATE requests SET status = 'approved', decided_at = datetime('now') WHERE id = ?1 AND status = 'pending' AND ${overlapping} < ?2`).bind(request.id, quantity).run();
        if (result.meta.changes === 0) return c.json({ error: 'room_unavailable' }, 409);
    } else if (request.type === 'facility') {
        const keys = keysOf({ date: request.date ?? '', start_time: request.start_time ?? '', end_time: request.end_time ?? '' }, venue.facility.slotMinutes);
        const taken = await occupiedSlots(c.env.DB, keys);
        if (taken.length > 0) return c.json({ error: 'slots_taken', slots: taken }, 409);
        try {
            await c.env.DB.batch([c.env.DB.prepare("UPDATE requests SET status = 'approved', decided_at = datetime('now') WHERE id = ?1 AND status = 'pending'").bind(request.id), ...slotInserts(c.env.DB, request.id, keys)]);
        } catch (error) {
            if (isSlotConflict(error)) return c.json({ error: 'slots_taken', slots: await occupiedSlots(c.env.DB, keys) }, 409);
            throw error;
        }
    } else {
        await c.env.DB.prepare("UPDATE requests SET status = 'approved', decided_at = datetime('now') WHERE id = ?1 AND status = 'pending'").bind(request.id).run();
    }

    await writeAudit(c.env.DB, 'request_approved', `request #${request.id}`, 'admin');
    notifyApproved(c, { ...request, status: 'approved' }, requesterRecipient(request));
    return c.json({ ok: true, status: 'approved' });
});

admin.post('/requests/:id/reject', async (c) => {
    const id = positiveInt(c.req.param('id'));
    const request = id === null ? null : await loadRequest(c.env.DB, id);
    if (request === null) return c.json({ error: 'not_found' }, 404);
    if (request.status !== 'pending') return c.json({ error: 'not_pending' }, 409);
    const body = (await readJson(c)) ?? {};
    const reason = optionalText(body.reason, MAX_REASON);
    if (reason === undefined) return c.json({ error: 'reason_too_long' }, 400);
    await c.env.DB.prepare("UPDATE requests SET status = 'rejected', decided_at = datetime('now') WHERE id = ?1 AND status = 'pending'").bind(request.id).run();
    await writeAudit(c.env.DB, 'request_rejected', `request #${request.id}${reason ? `: ${reason}` : ''}`, 'admin');
    notifyRejected(c, { ...request, status: 'rejected' }, reason, requesterRecipient(request));
    return c.json({ ok: true, status: 'rejected' });
});

/** Immediate cancellation by the venue of a pending or approved booking; facility slots are freed. */
admin.post('/requests/:id/cancel', async (c) => {
    const id = positiveInt(c.req.param('id'));
    const request = id === null ? null : await loadRequest(c.env.DB, id);
    if (request === null) return c.json({ error: 'not_found' }, 404);
    if (request.status !== 'pending' && request.status !== 'approved') return c.json({ error: 'cannot_cancel' }, 409);
    await c.env.DB.batch([
        c.env.DB.prepare('DELETE FROM slots WHERE request_id = ?1').bind(request.id),
        c.env.DB.prepare("UPDATE requests SET status = 'cancelled', cancelled_at = datetime('now') WHERE id = ?1 AND status IN ('pending', 'approved')").bind(request.id),
        auditStatement(c.env.DB, 'request_cancelled', `request #${request.id} cancelled by the venue`, 'admin'),
    ]);
    notifyCancelledByAdmin(c, { ...request, status: 'cancelled' }, requesterRecipient(request));
    return c.json({ ok: true, status: 'cancelled' });
});

/*
 * Payments (hotel only, migration 0003). A confirmed stay goes
 *   none → deposit → paid   or   none → paid
 * and 'paid' is final. The status column stays 'approved' throughout: only
 * payment_status changes, so rooms, calendar and cancellations are untouched.
 * Both writes guard the previous payment state in the WHERE, so two
 * concurrent clicks cannot record a payment twice.
 */

/**
 * Payment state of a stay whose total is about to change (edited dates,
 * room or agreed total): derived from the figures, so what the guest paid
 * stays recorded and only the label follows. The amount paid covers the new
 * total (or exceeds it: the dashboard then shows the refund due) → paid;
 * otherwise what was paid is a deposit and the difference is still due.
 * Untouched while nothing was paid or the new total is unknown.
 */
function paymentStatusForTotal(request: AdminRequestRow, total: number | null): PaymentStatus {
    if (request.payment_status === 'none' || request.paid_amount === null || total === null) return request.payment_status;
    return request.paid_amount >= total ? 'paid' : 'deposit';
}

/** The common checks of both payment actions: an approved hotel stay, not yet fully paid. */
function paymentPrecondition(request: AdminRequestRow): string | null {
    if (request.type !== 'hotel') return 'not_hotel';
    if (request.status !== 'approved') return 'not_approved';
    if (request.payment_status === 'paid') return 'already_paid';
    return null;
}

/** Deposit received: a positive amount below the total (the amount left is total - deposit). */
admin.post('/requests/:id/deposit', async (c) => {
    const id = positiveInt(c.req.param('id'));
    const request = id === null ? null : await loadRequest(c.env.DB, id);
    if (request === null) return c.json({ error: 'not_found' }, 404);
    const blocked = paymentPrecondition(request);
    if (blocked !== null) return c.json({ error: blocked }, 409);
    if (request.payment_status === 'deposit') return c.json({ error: 'deposit_recorded' }, 409);
    // Without a total the amount left cannot be computed: the venue can only mark the stay as paid.
    if (request.quoted_total === null) return c.json({ error: 'no_total' }, 409);
    const body = (await readJson(c)) ?? {};
    const amount = priceValue(body.amount);
    if (amount === null || amount <= 0) return c.json({ error: 'invalid_amount' }, 400);
    if (amount >= request.quoted_total) return c.json({ error: 'deposit_not_partial' }, 400);
    const result = await c.env.DB.prepare("UPDATE requests SET payment_status = 'deposit', paid_amount = ?2, paid_at = datetime('now') WHERE id = ?1 AND status = 'approved' AND payment_status = 'none'").bind(request.id, amount).run();
    if (result.meta.changes === 0) return c.json({ error: 'deposit_recorded' }, 409);
    await writeAudit(c.env.DB, 'deposit_recorded', `request #${request.id}: ${amount} of ${request.quoted_total}`, 'admin');
    return c.json({ ok: true, payment_status: 'deposit', item: await updatedView(c.env.DB, request.id) });
});

/** Paid in full: the amount paid becomes the total (when known), whatever deposit was recorded before. */
admin.post('/requests/:id/paid', async (c) => {
    const id = positiveInt(c.req.param('id'));
    const request = id === null ? null : await loadRequest(c.env.DB, id);
    if (request === null) return c.json({ error: 'not_found' }, 404);
    const blocked = paymentPrecondition(request);
    if (blocked !== null) return c.json({ error: blocked }, 409);
    const paidAmount = request.quoted_total ?? request.paid_amount;
    const result = await c.env.DB.prepare("UPDATE requests SET payment_status = 'paid', paid_amount = ?2, paid_at = datetime('now') WHERE id = ?1 AND status = 'approved' AND payment_status IN ('none', 'deposit')").bind(request.id, paidAmount).run();
    if (result.meta.changes === 0) return c.json({ error: 'already_paid' }, 409);
    await writeAudit(c.env.DB, 'payment_recorded', `request #${request.id}: paid in full${paidAmount === null ? '' : ` (${paidAmount})`}`, 'admin');
    return c.json({ ok: true, payment_status: 'paid', item: await updatedView(c.env.DB, request.id) });
});

/** The request as the dashboard sees it after a write, so the dialog can redraw without a second round trip. */
async function updatedView(db: D1Database, id: number): Promise<Record<string, unknown> | null> {
    const row = await loadRequest(db, id);
    return row === null ? null : adminView(row);
}

/**
 * Direct booking by the venue, born approved (owner's decision): same fields
 * and same rules as a guest request; for a facility the requester must have
 * been registered first. The guest gets the confirmation email with the
 * personal link; the owner, being the author, gets none.
 */
admin.post('/bookings', async (c) => {
    const venue = venueConfig(c.env);
    const body = await readJson(c);
    if (body === null) return c.json({ error: 'invalid_body' }, 400);
    const lang = langOf(body.lang, venue.defaultLang);
    const now = romeNow(new Date());

    const outcome = venue.type === 'hotel' ? await directHotel(c.env.DB, body, lang, now.date) : venue.type === 'restaurant' ? await directRestaurant(c.env.DB, body, venue, lang, now) : await directFacility(c.env.DB, body, venue, lang, now);
    if ('error' in outcome) return c.json({ error: outcome.error, ...(outcome.slots ? { slots: outcome.slots } : {}) }, outcome.status);

    const request = await loadRequest(c.env.DB, outcome.id);
    await writeAudit(c.env.DB, 'booking_registered', `${venue.type} booking #${outcome.id} registered by the venue`, 'admin');
    if (request) notifyRegisteredByAdmin(c, request, requesterRecipient(request));
    return c.json({ id: outcome.id, status: 'approved' }, 201);
});

type DirectOutcome = { id: number } | { error: string; status: 400 | 404 | 409; slots?: string[] };

/** The price columns of a hotel booking. */
type StayPrice = { subtotal: number | null; discountPercent: number | null; total: number | null };

/**
 * Price of a stay registered or edited by the venue: the computed quote,
 * unless the venue typed an agreed total (owner's decision, e.g. a price
 * settled by phone); then the subtotal is that total and no discount is
 * recorded.
 */
async function stayPrice(db: D1Database, body: Record<string, unknown>, stay: HotelFields): Promise<StayPrice | { error: string }> {
    const quote = await quoteStay(db, stay.roomType, stay.checkIn, stay.checkOut);
    const computed: StayPrice = { subtotal: quote?.subtotal ?? null, discountPercent: quote?.discount_percent ?? null, total: quote?.total ?? null };
    if (body.total === undefined || body.total === null || body.total === '') return computed;
    const agreed = priceValue(body.total);
    if (agreed === null) return { error: 'invalid_price' };
    if (agreed === computed.total) return computed;
    return { subtotal: agreed, discountPercent: 0, total: agreed };
}

async function directHotel(db: D1Database, body: Record<string, unknown>, lang: string, today: string): Promise<DirectOutcome> {
    const guest = guestFields(body);
    if ('error' in guest) return { error: guest.error, status: 400 };
    const stay = await hotelFields(db, body, today);
    if ('error' in stay) return { error: stay.error, status: 400 };
    const quantity = (await roomTypeByName(db, stay.roomType))?.quantity ?? 0;
    const price = await stayPrice(db, body, stay);
    if ('error' in price) return { error: price.error, status: 400 };
    // INSERT ... SELECT ... WHERE: the row is written only if a room is still free, atomically.
    const overlapping = overlappingSql('?11', '?7', '?8', '0');
    const result = await db
        .prepare(
            `INSERT INTO requests (type, first_name, last_name, email, phone, lang, notes, check_in, check_out, adults, children, room_type, guest_token, status, decided_at, quoted_subtotal, quoted_discount_percent, quoted_total)
             SELECT 'hotel', ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, 'approved', datetime('now'), ?14, ?15, ?16
             WHERE ${overlapping} < ?13`,
        )
        .bind(guest.firstName, guest.lastName, guest.email, guest.phone, lang, guest.notes, stay.checkIn, stay.checkOut, stay.adults, stay.children, stay.roomType, randomToken(), quantity, price.subtotal, price.discountPercent, price.total)
        .run();
    if (result.meta.changes === 0) return { error: 'room_unavailable', status: 409 };
    return { id: result.meta.last_row_id };
}

async function directRestaurant(db: D1Database, body: Record<string, unknown>, venue: VenueConfig, lang: string, now: { date: string; time: string }): Promise<DirectOutcome> {
    const guest = guestFields(body);
    if ('error' in guest) return { error: guest.error, status: 400 };
    const seating = restaurantFields(body, venue, now);
    if ('error' in seating) return { error: seating.error, status: 400 };
    const result = await db
        .prepare(
            `INSERT INTO requests (type, first_name, last_name, email, phone, lang, notes, date, start_time, party_size, guest_token, status, decided_at)
             VALUES ('restaurant', ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 'approved', datetime('now'))`,
        )
        .bind(guest.firstName, guest.lastName, guest.email, guest.phone, lang, guest.notes, seating.date, seating.time, seating.partySize, randomToken())
        .run();
    return { id: result.meta.last_row_id };
}

async function directFacility(db: D1Database, body: Record<string, unknown>, venue: VenueConfig, lang: string, now: { date: string; time: string }): Promise<DirectOutcome> {
    const requesterId = typeof body.requester_id === 'number' ? positiveInt(String(body.requester_id)) : null;
    const requester = requesterId === null ? null : await db.prepare("SELECT id FROM requesters WHERE id = ?1 AND status = 'active'").bind(requesterId).first<{ id: number }>();
    if (requester === null) return { error: 'unknown_requester', status: 404 };
    const fields = facilityFields(body, venue, now);
    if ('error' in fields) return { error: fields.error, status: 400 };
    const keys = keysOf({ date: fields.date, start_time: fields.startTime, end_time: fields.endTime }, venue.facility.slotMinutes);
    const taken = await occupiedSlots(db, keys);
    if (taken.length > 0) return { error: 'slots_taken', status: 409, slots: taken };
    // The request row is written first (pending), then the slots and the
    // approval go in one batch: if a slot was taken meanwhile the batch
    // fails as a whole and the row is removed again.
    const inserted = await db.prepare("INSERT INTO requests (type, requester_id, lang, notes, date, start_time, end_time) VALUES ('facility', ?1, ?2, ?3, ?4, ?5, ?6)").bind(requester.id, lang, fields.notes, fields.date, fields.startTime, fields.endTime).run();
    const id = inserted.meta.last_row_id;
    try {
        await db.batch([...slotInserts(db, id, keys), db.prepare("UPDATE requests SET status = 'approved', decided_at = datetime('now') WHERE id = ?1").bind(id)]);
    } catch (error) {
        await db.prepare('DELETE FROM requests WHERE id = ?1').bind(id).run();
        if (isSlotConflict(error)) return { error: 'slots_taken', status: 409, slots: await occupiedSlots(db, keys) };
        throw error;
    }
    return { id };
}

/*
 * Editing a booking (owner's decision): every field of the direct booking
 * form can change while the booking is pending or approved and not yet
 * over. The rules are those of a new booking, with one allowance: a stay
 * already begun keeps its past check-in. Room and slot availability are
 * re-checked for approved bookings only (a pending one is checked when it
 * gets approved), with the booking itself left out of the count. Payments
 * recorded on a hotel stay are left as they are: the dashboard shows the
 * new balance. The guest is told by email unless the venue opts out
 * (`notify: false`). Nothing is written, logged or sent when no field
 * actually changes.
 */
admin.patch('/requests/:id', async (c) => {
    const id = positiveInt(c.req.param('id'));
    const request = id === null ? null : await loadRequest(c.env.DB, id);
    if (request === null) return c.json({ error: 'not_found' }, 404);
    if (request.status !== 'pending' && request.status !== 'approved') return c.json({ error: 'cannot_edit' }, 409);
    const now = romeNow(new Date());
    if (isOver(request, now.date)) return c.json({ error: 'in_past' }, 409);
    const body = await readJson(c);
    if (body === null) return c.json({ error: 'invalid_body' }, 400);
    const venue = venueConfig(c.env);

    const outcome = request.type === 'hotel' ? await editHotel(c.env.DB, request, body, now.date) : request.type === 'restaurant' ? await editRestaurant(c.env.DB, request, body, venue, now) : await editFacility(c.env.DB, request, body, venue, now);
    if ('error' in outcome) return c.json({ error: outcome.error, ...(outcome.slots ? { slots: outcome.slots } : {}) }, outcome.status);

    if (outcome.changed.length > 0) {
        await writeAudit(c.env.DB, 'booking_edited', `request #${request.id}: ${outcome.changed.join(', ')}`, 'admin');
        const updated = await loadRequest(c.env.DB, request.id);
        if (updated && body.notify !== false) notifyChangedByAdmin(c, updated, requesterRecipient(updated));
    }
    return c.json({ ok: true, changed: outcome.changed, item: await updatedView(c.env.DB, request.id) });
});

type EditOutcome = { changed: string[] } | { error: string; status: 400 | 404 | 409; slots?: string[] };

/** Names of the columns whose new value differs from the stored one. */
function changedColumns(request: RequestRow, next: Record<string, unknown>): string[] {
    const current = request as unknown as Record<string, unknown>;
    return Object.keys(next).filter((column) => next[column] !== current[column]);
}

async function editHotel(db: D1Database, request: AdminRequestRow, body: Record<string, unknown>, today: string): Promise<EditOutcome> {
    const guest = guestFields(body);
    if ('error' in guest) return { error: guest.error, status: 400 };
    // A stay already begun keeps its check-in: the horizon of the validation starts there.
    const requestedCheckIn = typeof body.check_in === 'string' ? body.check_in.trim() : '';
    const checkInKept = requestedCheckIn === request.check_in;
    const horizon = checkInKept && request.check_in !== null && request.check_in < today ? request.check_in : today;
    const stay = await hotelFields(db, body, horizon);
    if ('error' in stay) return { error: stay.error, status: 400 };
    // Price: untouched while the stay (dates and room) and the total stay the
    // same, so a price list changed meanwhile does not rewrite the quote;
    // otherwise computed again, with the agreed total when the venue typed one.
    const stayKept = checkInKept && stay.checkOut === request.check_out && stay.roomType === request.room_type;
    const totalKept = body.total === undefined || body.total === null || body.total === '' ? request.quoted_total === null : priceValue(body.total) === request.quoted_total;
    const price: StayPrice | { error: string } = stayKept && totalKept ? { subtotal: request.quoted_subtotal, discountPercent: request.quoted_discount_percent, total: request.quoted_total } : await stayPrice(db, body, stay);
    if ('error' in price) return { error: price.error, status: 400 };
    const lang = langOf(body.lang, request.lang);
    // A recorded payment keeps its amount; its state follows the new total (paid → deposit when more is due, and back).
    const paymentStatus = paymentStatusForTotal(request, price.total);
    const next = { first_name: guest.firstName, last_name: guest.lastName, email: guest.email, phone: guest.phone, lang, notes: guest.notes, check_in: stay.checkIn, check_out: stay.checkOut, adults: stay.adults, children: stay.children, room_type: stay.roomType, quoted_subtotal: price.subtotal, quoted_discount_percent: price.discountPercent, quoted_total: price.total, payment_status: paymentStatus };
    const changed = changedColumns(request, next);
    if (changed.length === 0) return { changed };
    const quantity = (await roomTypeByName(db, stay.roomType))?.quantity ?? 0;
    // An approved stay must still fit the rooms of its type, itself left out of the count (same atomic guard as the approval).
    const overlapping = overlappingSql('?12', '?8', '?9', '?1');
    const result = await db.prepare(`UPDATE requests SET first_name = ?2, last_name = ?3, email = ?4, phone = ?5, lang = ?6, notes = ?7, check_in = ?8, check_out = ?9, adults = ?10, children = ?11, room_type = ?12, quoted_subtotal = ?13, quoted_discount_percent = ?14, quoted_total = ?15, payment_status = ?17 WHERE id = ?1 AND status IN ('pending', 'approved') AND (status = 'pending' OR ${overlapping} < ?16)`).bind(request.id, next.first_name, next.last_name, next.email, next.phone, next.lang, next.notes, next.check_in, next.check_out, next.adults, next.children, next.room_type, next.quoted_subtotal, next.quoted_discount_percent, next.quoted_total, quantity, next.payment_status).run();
    if (result.meta.changes === 0) return { error: 'room_unavailable', status: 409 };
    return { changed };
}

async function editRestaurant(db: D1Database, request: AdminRequestRow, body: Record<string, unknown>, venue: VenueConfig, now: { date: string; time: string }): Promise<EditOutcome> {
    const guest = guestFields(body);
    if ('error' in guest) return { error: guest.error, status: 400 };
    const seating = restaurantFields(body, venue, now);
    if ('error' in seating) return { error: seating.error, status: 400 };
    const lang = langOf(body.lang, request.lang);
    const next = { first_name: guest.firstName, last_name: guest.lastName, email: guest.email, phone: guest.phone, lang, notes: guest.notes, date: seating.date, start_time: seating.time, party_size: seating.partySize };
    const changed = changedColumns(request, next);
    if (changed.length === 0) return { changed };
    await db.prepare("UPDATE requests SET first_name = ?2, last_name = ?3, email = ?4, phone = ?5, lang = ?6, notes = ?7, date = ?8, start_time = ?9, party_size = ?10 WHERE id = ?1 AND status IN ('pending', 'approved')").bind(request.id, next.first_name, next.last_name, next.email, next.phone, next.lang, next.notes, next.date, next.start_time, next.party_size).run();
    return { changed };
}

async function editFacility(db: D1Database, request: AdminRequestRow, body: Record<string, unknown>, venue: VenueConfig, now: { date: string; time: string }): Promise<EditOutcome> {
    // The requester may change (a booking registered under the wrong organisation); when the body leaves it out, it stays.
    let requesterId = request.requester_id;
    if (body.requester_id !== undefined) {
        const candidate = typeof body.requester_id === 'number' ? positiveInt(String(body.requester_id)) : null;
        const requester = candidate === null ? null : await db.prepare("SELECT id FROM requesters WHERE id = ?1 AND status = 'active'").bind(candidate).first<{ id: number }>();
        if (requester === null) return { error: 'unknown_requester', status: 404 };
        requesterId = requester.id;
    }
    const fields = facilityFields(body, venue, now);
    if ('error' in fields) return { error: fields.error, status: 400 };
    const lang = langOf(body.lang, request.lang);
    const next = { requester_id: requesterId, lang, notes: fields.notes, date: fields.date, start_time: fields.startTime, end_time: fields.endTime };
    const changed = changedColumns(request, next);
    if (changed.length === 0) return { changed };
    const update = db.prepare("UPDATE requests SET requester_id = ?2, lang = ?3, notes = ?4, date = ?5, start_time = ?6, end_time = ?7 WHERE id = ?1 AND status IN ('pending', 'approved')").bind(request.id, next.requester_id, next.lang, next.notes, next.date, next.start_time, next.end_time);
    const rangeChanged = changed.includes('date') || changed.includes('start_time') || changed.includes('end_time');
    if (request.status !== 'approved' || !rangeChanged) {
        await update.run();
        return { changed };
    }
    // An approved booking moves its slots: the old ones are released and the
    // new ones taken in one batch, so a slot taken meanwhile fails the whole
    // move and the booking keeps its old range.
    const keys = keysOf({ date: fields.date, start_time: fields.startTime, end_time: fields.endTime }, venue.facility.slotMinutes);
    const taken = await occupiedSlots(db, keys, request.id);
    if (taken.length > 0) return { error: 'slots_taken', status: 409, slots: taken };
    try {
        await db.batch([db.prepare('DELETE FROM slots WHERE request_id = ?1').bind(request.id), ...slotInserts(db, request.id, keys), update]);
    } catch (error) {
        if (isSlotConflict(error)) return { error: 'slots_taken', status: 409, slots: await occupiedSlots(db, keys, request.id) };
        throw error;
    }
    return { changed };
}

// ---------------------------------------------------------------------------
// Hotel room types (migration 0004): name, guests, quantity, base price
// ---------------------------------------------------------------------------

admin.get('/rooms', async (c) => c.json({ rooms: await roomTypes(c.env.DB) }));

admin.post('/rooms', async (c) => {
    const body = await readJson(c);
    if (body === null) return c.json({ error: 'invalid_body' }, 400);
    const fields = roomFields(body);
    if ('error' in fields) return c.json({ error: fields.error }, 400);
    if (await roomNameTaken(c.env.DB, fields.name)) return c.json({ error: 'room_exists' }, 409);
    const id = await createRoomType(c.env.DB, fields);
    await writeAudit(c.env.DB, 'room_type_created', `${fields.name}: ${fields.quantity} rooms, ${fields.maxGuests} guests, ${fields.price}/night`, 'admin');
    return c.json({ id }, 201);
});

/**
 * Edits a room type (every field, missing ones keep their value). A smaller
 * quantity than the approved future bookings need is accepted: the answer
 * carries `overbooked`, the rooms short at the busiest night, as a warning.
 */
admin.patch('/rooms/:id', async (c) => {
    const id = positiveInt(c.req.param('id'));
    const existing = id === null ? null : await roomTypeById(c.env.DB, id);
    if (existing === null) return c.json({ error: 'not_found' }, 404);
    const body = await readJson(c);
    if (body === null) return c.json({ error: 'invalid_body' }, 400);
    const fields = roomFields({ name: existing.name, max_guests: existing.max_guests, quantity: existing.quantity, price_per_night: existing.price_per_night, ...body });
    if ('error' in fields) return c.json({ error: fields.error }, 400);
    if (await roomNameTaken(c.env.DB, fields.name, existing.id)) return c.json({ error: 'room_exists' }, 409);
    await updateRoomType(c.env.DB, existing, fields);
    const renamed = fields.name === existing.name ? '' : ` (was "${existing.name}")`;
    await writeAudit(c.env.DB, 'room_type_updated', `${fields.name}${renamed}: ${fields.quantity} rooms, ${fields.maxGuests} guests, ${fields.price}/night`, 'admin');
    const overbooked = await overbookedRooms(c.env.DB, fields.name, fields.quantity, romeNow(new Date()).date);
    return c.json({ ok: true, overbooked });
});

/** Refused (409 room_in_use) while a pending or approved booking of the type has not checked out yet. */
admin.delete('/rooms/:id', async (c) => {
    const id = positiveInt(c.req.param('id'));
    const existing = id === null ? null : await roomTypeById(c.env.DB, id);
    if (existing === null) return c.json({ error: 'not_found' }, 404);
    const bookings = await futureBookingsOf(c.env.DB, existing.name, romeNow(new Date()).date);
    if (bookings > 0) return c.json({ error: 'room_in_use', bookings }, 409);
    await deleteRoomType(c.env.DB, existing);
    await writeAudit(c.env.DB, 'room_type_deleted', existing.name, 'admin');
    return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Hotel pricing (migration 0002): rate periods, discounts. The base price
// per room type lives on the type itself (migration 0004).
// ---------------------------------------------------------------------------

/** Everything the Prices section shows: base price per room type (null when missing), periods, discount rules. */
admin.get('/pricing', async (c) => {
    const [base, periods, discounts] = await c.env.DB.batch([
        c.env.DB.prepare('SELECT name AS room_type, price_per_night FROM room_types ORDER BY id'),
        c.env.DB.prepare('SELECT id, room_type, date_from, date_to, price_per_night, label FROM rate_periods ORDER BY date_from, room_type'),
        c.env.DB.prepare('SELECT id, min_nights, percent FROM discount_rules ORDER BY min_nights'),
    ]);
    return c.json({ base: base.results, periods: periods.results as RatePeriod[], discounts: discounts.results as DiscountRule[] });
});

admin.post('/pricing/periods', async (c) => {
    const body = await readJson(c);
    if (body === null) return c.json({ error: 'invalid_body' }, 400);
    const fields = await periodFields(c.env.DB, body);
    if ('error' in fields) return c.json({ error: fields.error }, 400);
    if (await periodOverlaps(c.env.DB, fields)) return c.json({ error: 'period_overlap' }, 409);
    const result = await c.env.DB.prepare('INSERT INTO rate_periods (room_type, date_from, date_to, price_per_night, label) VALUES (?1, ?2, ?3, ?4, ?5)').bind(fields.roomType, fields.dateFrom, fields.dateTo, fields.price, fields.label).run();
    await writeAudit(c.env.DB, 'price_period_created', `${fields.roomType} ${fields.dateFrom}..${fields.dateTo}: ${fields.price}`, 'admin');
    return c.json({ id: result.meta.last_row_id }, 201);
});

admin.patch('/pricing/periods/:id', async (c) => {
    const id = positiveInt(c.req.param('id'));
    const existing = id === null ? null : await c.env.DB.prepare('SELECT * FROM rate_periods WHERE id = ?1').bind(id).first<RatePeriod>();
    if (existing === null) return c.json({ error: 'not_found' }, 404);
    const body = await readJson(c);
    if (body === null) return c.json({ error: 'invalid_body' }, 400);
    const fields = await periodFields(c.env.DB, { room_type: existing.room_type, date_from: existing.date_from, date_to: existing.date_to, price_per_night: existing.price_per_night, label: existing.label ?? '', ...body });
    if ('error' in fields) return c.json({ error: fields.error }, 400);
    if (await periodOverlaps(c.env.DB, fields, existing.id)) return c.json({ error: 'period_overlap' }, 409);
    await c.env.DB.prepare('UPDATE rate_periods SET room_type = ?2, date_from = ?3, date_to = ?4, price_per_night = ?5, label = ?6 WHERE id = ?1').bind(existing.id, fields.roomType, fields.dateFrom, fields.dateTo, fields.price, fields.label).run();
    await writeAudit(c.env.DB, 'price_period_updated', `period #${existing.id}`, 'admin');
    return c.json({ ok: true });
});

admin.delete('/pricing/periods/:id', async (c) => {
    const id = positiveInt(c.req.param('id'));
    const result = id === null ? null : await c.env.DB.prepare('DELETE FROM rate_periods WHERE id = ?1').bind(id).run();
    if (result === null || result.meta.changes === 0) return c.json({ error: 'not_found' }, 404);
    await writeAudit(c.env.DB, 'price_period_deleted', `period #${id}`, 'admin');
    return c.json({ ok: true });
});

/**
 * Price calendar: the nightly price of one room type on one day, stored as a
 * one-day period (the period covering the day, if longer, is split around
 * it). A null price brings the day back to the base price. Past days are
 * read-only: no quote will ever use them.
 */
admin.put('/pricing/days/:date', async (c) => {
    const day = c.req.param('date');
    if (!isValidDate(day)) return c.json({ error: 'invalid_date' }, 400);
    const body = await readJson(c);
    if (body === null) return c.json({ error: 'invalid_body' }, 400);
    const roomType = typeof body.room_type === 'string' ? body.room_type.trim() : '';
    if ((await roomTypeByName(c.env.DB, roomType)) === null) return c.json({ error: 'unknown_room' }, 400);
    // An explicit null resets the day; anything else must be a valid price.
    const resetRequested = body.price_per_night === null;
    const price = resetRequested ? null : priceValue(body.price_per_night);
    if (!resetRequested && price === null) return c.json({ error: 'invalid_price' }, 400);
    if (day < romeNow(new Date()).date) return c.json({ error: 'day_past' }, 409);
    await setDayPrice(c.env.DB, roomType, day, price);
    await writeAudit(c.env.DB, price === null ? 'price_day_reset' : 'price_day_set', `${roomType} ${day}${price === null ? '' : `: ${price}`}`, 'admin');
    return c.json({ ok: true });
});

admin.post('/pricing/discounts', async (c) => {
    const body = await readJson(c);
    if (body === null) return c.json({ error: 'invalid_body' }, 400);
    const minNights = integerBetween(body.min_nights, 2, 365);
    const percent = integerBetween(body.percent, 1, 100);
    if (minNights === null || percent === null) return c.json({ error: 'invalid_discount' }, 400);
    const existing = await c.env.DB.prepare('SELECT id FROM discount_rules WHERE min_nights = ?1').bind(minNights).first<{ id: number }>();
    if (existing !== null) return c.json({ error: 'discount_exists' }, 409);
    const result = await c.env.DB.prepare('INSERT INTO discount_rules (min_nights, percent) VALUES (?1, ?2)').bind(minNights, percent).run();
    await writeAudit(c.env.DB, 'discount_created', `from ${minNights} nights: ${percent}%`, 'admin');
    return c.json({ id: result.meta.last_row_id }, 201);
});

admin.delete('/pricing/discounts/:id', async (c) => {
    const id = positiveInt(c.req.param('id'));
    const result = id === null ? null : await c.env.DB.prepare('DELETE FROM discount_rules WHERE id = ?1').bind(id).run();
    if (result === null || result.meta.changes === 0) return c.json({ error: 'not_found' }, 404);
    await writeAudit(c.env.DB, 'discount_deleted', `rule #${id}`, 'admin');
    return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Facility requesters
// ---------------------------------------------------------------------------

function accessLinkOf(origin: string, token: string): string {
    return `${origin}/access/${token}`;
}

function requesterView(row: RequesterRow, origin: string): Record<string, unknown> {
    return { id: row.id, name: row.name, contact_name: row.contact_name, email: row.email, phone: row.phone, status: row.status, color: row.color, created_at: row.created_at, access_link: accessLinkOf(origin, row.access_token) };
}

type RequesterFields = { name: string; contactName: string; email: string; phone: string; color: string };

function requesterFields(body: Record<string, unknown>): RequesterFields | { error: string } {
    const name = text(body.name, 100);
    const contactName = text(body.contact_name, 100);
    if (name === null || contactName === null) return { error: 'invalid_name' };
    const email = text(body.email, 200);
    if (email === null || !isValidEmail(email)) return { error: 'invalid_email' };
    const phone = text(body.phone, 30);
    if (phone === null || !isValidPhone(phone)) return { error: 'invalid_phone' };
    const colorValue = typeof body.color === 'string' && body.color.trim() !== '' ? body.color.trim().toLowerCase() : DEFAULT_COLOR;
    if (!/^#[0-9a-f]{6}$/.test(colorValue)) return { error: 'invalid_color' };
    return { name, contactName, email, phone, color: colorValue };
}

async function loadRequester(db: D1Database, idText: string | undefined): Promise<RequesterRow | null> {
    const id = positiveInt(idText);
    if (id === null) return null;
    return await db.prepare('SELECT * FROM requesters WHERE id = ?1').bind(id).first<RequesterRow>();
}

admin.get('/requesters', async (c) => {
    const origin = new URL(c.req.url).origin;
    const { results } = await c.env.DB.prepare('SELECT * FROM requesters ORDER BY name').all<RequesterRow>();
    return c.json({ items: results.map((row) => requesterView(row, origin)) });
});

admin.post('/requesters', async (c) => {
    const body = await readJson(c);
    if (body === null) return c.json({ error: 'invalid_body' }, 400);
    const fields = requesterFields(body);
    if ('error' in fields) return c.json({ error: fields.error }, 400);
    const token = randomToken();
    const result = await c.env.DB.prepare('INSERT INTO requesters (name, contact_name, email, phone, color, access_token) VALUES (?1, ?2, ?3, ?4, ?5, ?6)').bind(fields.name, fields.contactName, fields.email, fields.phone, fields.color, token).run();
    const id = result.meta.last_row_id;
    await writeAudit(c.env.DB, 'requester_created', `requester #${id} ${fields.name}`, 'admin');
    const link = accessLinkOf(new URL(c.req.url).origin, token);
    notifyAccessLink(c, { name: fields.name, email: fields.email }, venueConfig(c.env).defaultLang, link, 'creation');
    return c.json({ id, access_link: link }, 201);
});

admin.patch('/requesters/:id', async (c) => {
    const requester = await loadRequester(c.env.DB, c.req.param('id'));
    if (requester === null) return c.json({ error: 'not_found' }, 404);
    const body = await readJson(c);
    if (body === null) return c.json({ error: 'invalid_body' }, 400);
    const merged = { name: requester.name, contact_name: requester.contact_name, email: requester.email, phone: requester.phone, color: requester.color, ...body };
    const fields = requesterFields(merged);
    if ('error' in fields) return c.json({ error: fields.error }, 400);
    await c.env.DB.prepare('UPDATE requesters SET name = ?2, contact_name = ?3, email = ?4, phone = ?5, color = ?6 WHERE id = ?1').bind(requester.id, fields.name, fields.contactName, fields.email, fields.phone, fields.color).run();
    await writeAudit(c.env.DB, 'requester_updated', `requester #${requester.id}`, 'admin');
    return c.json({ ok: true });
});

/** Suspension also cancels the requester's future bookings and frees their slots (atomic). */
admin.post('/requesters/:id/suspend', async (c) => {
    const requester = await loadRequester(c.env.DB, c.req.param('id'));
    if (requester === null) return c.json({ error: 'not_found' }, 404);
    const today = romeNow(new Date()).date;
    const results = await c.env.DB.batch([
        c.env.DB.prepare("DELETE FROM slots WHERE request_id IN (SELECT id FROM requests WHERE requester_id = ?1 AND date >= ?2 AND status IN ('pending', 'approved'))").bind(requester.id, today),
        c.env.DB.prepare("UPDATE requests SET status = 'cancelled', cancelled_at = datetime('now') WHERE requester_id = ?1 AND date >= ?2 AND status IN ('pending', 'approved')").bind(requester.id, today),
        c.env.DB.prepare("UPDATE requesters SET status = 'suspended' WHERE id = ?1").bind(requester.id),
        auditStatement(c.env.DB, 'requester_suspended', `requester #${requester.id}`, 'admin'),
    ]);
    return c.json({ ok: true, slots_freed: results[0].meta.changes, requests_cancelled: results[1].meta.changes });
});

admin.post('/requesters/:id/reactivate', async (c) => {
    const requester = await loadRequester(c.env.DB, c.req.param('id'));
    if (requester === null) return c.json({ error: 'not_found' }, 404);
    await c.env.DB.prepare("UPDATE requesters SET status = 'active' WHERE id = ?1").bind(requester.id).run();
    await writeAudit(c.env.DB, 'requester_reactivated', `requester #${requester.id}`, 'admin');
    return c.json({ ok: true });
});

/** New access token: every session issued with the old one stops working at once. */
admin.post('/requesters/:id/regenerate-link', async (c) => {
    const requester = await loadRequester(c.env.DB, c.req.param('id'));
    if (requester === null) return c.json({ error: 'not_found' }, 404);
    const token = randomToken();
    await c.env.DB.prepare('UPDATE requesters SET access_token = ?2 WHERE id = ?1').bind(requester.id, token).run();
    await writeAudit(c.env.DB, 'requester_link_regenerated', `requester #${requester.id}`, 'admin');
    const link = accessLinkOf(new URL(c.req.url).origin, token);
    sendAccessLink(c, requester, link, 'regeneration');
    return c.json({ ok: true, access_link: link });
});

admin.post('/requesters/:id/send-link', async (c) => {
    const requester = await loadRequester(c.env.DB, c.req.param('id'));
    if (requester === null) return c.json({ error: 'not_found' }, 404);
    sendAccessLink(c, requester, accessLinkOf(new URL(c.req.url).origin, requester.access_token), 'resend');
    await writeAudit(c.env.DB, 'requester_link_sent', `requester #${requester.id}`, 'admin');
    return c.json({ ok: true });
});

function sendAccessLink(c: Parameters<typeof notifyAccessLink>[0], requester: RequesterRow, link: string, reason: AccessLinkReason): void {
    notifyAccessLink(c, { name: requester.name, email: requester.email }, venueConfig(c.env).defaultLang, link, reason);
}
