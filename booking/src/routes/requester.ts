import { Hono } from 'hono';
import type { Bindings, RequesterVariables, RequestRow } from '../types';
import { clearSessionCookie, COOKIE_REQUESTER, requireRequester } from '../auth';
import { calendarRange, isValidDate, romeNow, type CalendarView } from '../dates';
import { notifyCancelledByGuest, notifyRequestSubmitted } from '../notifications';
import { keysOf, occupiedSlots } from '../slots';
import { auditStatement, positiveInt, readJson, writeAudit } from '../util';
import { facilityFields } from '../validation';

/*
 * Reserved area of the facility requesters (sports clubs...) of one venue
 * (/:slug/api/requester): they sign in through the personal link
 * (GET /:slug/access/:token in public.ts), see the shared calendar, send
 * booking requests and cancel their own ones.
 */

const MAX_LIST = 300;

type CalendarRow = Pick<RequestRow, 'id' | 'status' | 'requester_id' | 'date' | 'start_time' | 'end_time'> & { requester_name: string; requester_color: string };

export const requester = new Hono<{ Bindings: Bindings; Variables: RequesterVariables }>();

// Logout needs no valid session: it only drops the cookie.
requester.post('/logout', (c) => {
    clearSessionCookie(c, COOKIE_REQUESTER);
    return c.json({ ok: true });
});

requester.use('*', requireRequester());

requester.get('/me', (c) => {
    const me = c.get('requester');
    return c.json({ id: me.id, name: me.name, contact_name: me.contact_name, email: me.email, phone: me.phone, color: me.color });
});

/**
 * Shared calendar: every approved booking of the facility with the name and
 * color of the organisation that holds it (so everybody sees WHO occupies a
 * slot), plus the caller's own pending requests. Notes never leave the API.
 */
requester.get('/calendar', async (c) => {
    const me = c.get('requester');
    const view = c.req.query('view') ?? 'week';
    const date = c.req.query('date') ?? romeNow(new Date()).date;
    if (!['day', 'week', 'month'].includes(view) || !isValidDate(date)) return c.json({ error: 'invalid_body' }, 400);
    const { from, to } = calendarRange(view as CalendarView, date);
    const { results } = await c.var.db
        .prepare(
            `SELECT r.id, r.status, r.requester_id, r.date, r.start_time, r.end_time, q.name AS requester_name, q.color AS requester_color
             FROM requests r JOIN requesters q ON q.id = r.requester_id
             WHERE r.type = 'facility' AND r.date >= ?1 AND r.date <= ?2 AND (r.status = 'approved' OR (r.status = 'pending' AND r.requester_id = ?3))
             ORDER BY r.date, r.start_time`,
        )
        .bind(from, to, me.id)
        .all<CalendarRow>();
    const items = results.map((row) => ({ ...row, type: 'facility', own: row.requester_id === me.id }));
    return c.json({ view, date, from, to, items });
});

/** The caller's own requests: everything from today on, plus the recent past. */
requester.get('/requests', async (c) => {
    const me = c.get('requester');
    const { results } = await c.var.db.prepare(`SELECT * FROM requests WHERE requester_id = ?1 ORDER BY date DESC, start_time DESC LIMIT ${MAX_LIST}`).bind(me.id).all<RequestRow>();
    return c.json({ items: results });
});

/** New request, pending until the venue decides; slots already taken are refused at once. */
requester.post('/requests', async (c) => {
    const me = c.get('requester');
    const venue = c.var.venue;
    if (venue.type !== 'facility') return c.json({ error: 'not_found' }, 404);
    const body = await readJson(c);
    if (body === null) return c.json({ error: 'invalid_body' }, 400);
    const fields = facilityFields(body, venue, romeNow(new Date()));
    if ('error' in fields) return c.json({ error: fields.error }, 400);
    const keys = keysOf({ date: fields.date, start_time: fields.startTime, end_time: fields.endTime }, venue.facility.slotMinutes);
    const taken = await occupiedSlots(c.var.db, keys);
    if (taken.length > 0) return c.json({ error: 'slots_taken', slots: taken }, 409);
    const result = await c.var.db.prepare("INSERT INTO requests (type, requester_id, lang, notes, date, start_time, end_time) VALUES ('facility', ?1, ?2, ?3, ?4, ?5, ?6)").bind(me.id, venue.defaultLang, fields.notes, fields.date, fields.startTime, fields.endTime).run();
    const id = result.meta.last_row_id;
    const request = await c.var.db.prepare('SELECT * FROM requests WHERE id = ?1').bind(id).first<RequestRow>();
    await writeAudit(c.var.db, 'request_submitted', `facility request #${id}`, `requester:${me.id}`);
    if (request) notifyRequestSubmitted(c, request, { name: me.name, email: me.email });
    return c.json({ id, status: 'pending' }, 201);
});

/** Cancels one of the caller's own pending or approved future requests; approved ones free their slots. */
requester.post('/requests/:id/cancel', async (c) => {
    const me = c.get('requester');
    const id = positiveInt(c.req.param('id'));
    const request = id === null ? null : await c.var.db.prepare('SELECT * FROM requests WHERE id = ?1 AND requester_id = ?2').bind(id, me.id).first<RequestRow>();
    if (request === null) return c.json({ error: 'not_found' }, 404);
    const today = romeNow(new Date()).date;
    const stillActive = request.status === 'pending' || request.status === 'approved';
    if (!stillActive || (request.date ?? '') < today) return c.json({ error: 'cannot_cancel' }, 409);
    await c.var.db.batch([
        c.var.db.prepare('DELETE FROM slots WHERE request_id = ?1').bind(request.id),
        c.var.db.prepare("UPDATE requests SET status = 'cancelled', cancelled_at = datetime('now') WHERE id = ?1 AND status IN ('pending', 'approved')").bind(request.id),
        auditStatement(c.var.db, 'request_cancelled', `request #${request.id} cancelled by the requester`, `requester:${me.id}`),
    ]);
    notifyCancelledByGuest(c, { ...request, status: 'cancelled' }, { name: me.name, email: me.email });
    return c.json({ ok: true, status: 'cancelled' });
});
