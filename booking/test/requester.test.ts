import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import type { Bindings } from '../src/types';
import { app } from '../src/index';
import { daysAhead, envOfType } from './helpers';

const facility = envOfType('facility');

/** Creates an active requester straight in the database and returns its id and token. */
async function createRequester(name: string): Promise<{ id: number; token: string }> {
    const token = crypto.randomUUID().replace(/-/g, '');
    const result = await env.DB.prepare("INSERT INTO requesters (name, contact_name, email, phone, access_token) VALUES (?1, 'Contact', 'club@example.com', '3331234567', ?2)").bind(name, token).run();
    return { id: result.meta.last_row_id, token };
}

/** Visits the personal link and returns the session cookie. */
async function requesterCookie(token: string): Promise<string> {
    const response = await app.request(`/access/${token}`, {}, facility);
    if (response.status !== 302) throw new Error(`access failed (status ${response.status})`);
    return response.headers.get('set-cookie')!.split(';')[0];
}

async function post(path: string, cookie: string, body: unknown = {}, bindings: Bindings = facility): Promise<Response> {
    return await app.request(path, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, bindings);
}

async function get(path: string, cookie: string): Promise<Response> {
    return await app.request(path, { headers: { Cookie: cookie } }, facility);
}

async function json<T>(response: Response): Promise<T> {
    return (await response.json()) as T;
}

describe('access link', () => {
    it('signs an active requester in and redirects to the area', async () => {
        const { token } = await createRequester('Club A');
        const response = await app.request(`/access/${token}`, {}, facility);
        expect(response.status).toBe(302);
        expect(response.headers.get('location')).toBe('/area');
        expect(response.headers.get('set-cookie')).toContain('sess_requester=');
        const me = await json<{ name: string }>(await get('/api/requester/me', await requesterCookie(token)));
        expect(me.name).toBe('Club A');
    });

    it('refuses unknown tokens and suspended requesters alike', async () => {
        expect((await app.request(`/access/${'0'.repeat(32)}`, {}, facility)).status).toBe(404);
        expect((await app.request('/access/short', {}, facility)).status).toBe(404);
        const { id, token } = await createRequester('Club B');
        const cookie = await requesterCookie(token);
        await env.DB.prepare("UPDATE requesters SET status = 'suspended' WHERE id = ?1").bind(id).run();
        expect((await app.request(`/access/${token}`, {}, facility)).status).toBe(404);
        // A session issued before the suspension stops working at once.
        expect((await get('/api/requester/me', cookie)).status).toBe(401);
    });

    it('invalidates old sessions when the link is regenerated', async () => {
        const { id, token } = await createRequester('Club C');
        const cookie = await requesterCookie(token);
        await env.DB.prepare('UPDATE requesters SET access_token = ?2 WHERE id = ?1').bind(id, 'f'.repeat(32)).run();
        expect((await get('/api/requester/me', cookie)).status).toBe(401);
    });
});

describe('requests from the area', () => {
    it('creates a pending request, lists it, shows it in the calendar and lets the requester cancel it', async () => {
        const { token } = await createRequester('Club D');
        const cookie = await requesterCookie(token);
        const date = daysAhead(12);
        const created = await post('/api/requester/requests', cookie, { date, start_time: '18:00', end_time: '19:00', notes: 'Under 14' });
        expect(created.status).toBe(201);
        const { id } = await json<{ id: number }>(created);

        const list = await json<{ items: { id: number; status: string }[] }>(await get('/api/requester/requests', cookie));
        expect(list.items.find((item) => item.id === id)!.status).toBe('pending');

        const calendar = await json<{ items: { id: number; own: boolean; status: string; notes?: string }[] }>(await get(`/api/requester/calendar?view=day&date=${date}`, cookie));
        const mine = calendar.items.find((item) => item.id === id)!;
        expect(mine.own).toBe(true);
        expect(mine.status).toBe('pending');
        expect(mine.notes).toBeUndefined();

        const cancelled = await post(`/api/requester/requests/${id}/cancel`, cookie);
        expect(cancelled.status).toBe(200);
        expect((await post(`/api/requester/requests/${id}/cancel`, cookie)).status).toBe(409);
    });

    it('refuses slots already taken and applies the facility rules', async () => {
        const { token } = await createRequester('Club E');
        const cookie = await requesterCookie(token);
        const date = daysAhead(14);
        const other = await createRequester('Club F');
        const approved = await env.DB.prepare("INSERT INTO requests (type, requester_id, date, start_time, end_time, status) VALUES ('facility', ?1, ?2, '10:00', '11:00', 'approved')").bind(other.id, date).run();
        await env.DB.prepare('INSERT INTO slots (slot_key, request_id) VALUES (?1, ?2), (?3, ?2)').bind(`${date}_1000`, approved.meta.last_row_id, `${date}_1030`).run();

        const clash = await post('/api/requester/requests', cookie, { date, start_time: '10:30', end_time: '11:30' });
        expect(clash.status).toBe(409);
        expect((await json<{ slots: string[] }>(clash)).slots).toEqual([`${date}_1030`]);
        const outside = await post('/api/requester/requests', cookie, { date, start_time: '06:00', end_time: '07:00' });
        expect((await json<{ error: string }>(outside)).error).toBe('outside_opening_hours');

        // Other organisations' approved bookings are visible with their name, not cancellable by me.
        const calendar = await json<{ items: { id: number; own: boolean; requester_name: string }[] }>(await get(`/api/requester/calendar?view=week&date=${date}`, cookie));
        const theirs = calendar.items.find((item) => item.id === approved.meta.last_row_id)!;
        expect(theirs.own).toBe(false);
        expect(theirs.requester_name).toBe('Club F');
        expect((await post(`/api/requester/requests/${approved.meta.last_row_id}/cancel`, cookie)).status).toBe(404);
    });

    it('frees the slots when an approved booking is cancelled by its requester', async () => {
        const { id, token } = await createRequester('Club G');
        const cookie = await requesterCookie(token);
        const date = daysAhead(16);
        const approved = await env.DB.prepare("INSERT INTO requests (type, requester_id, date, start_time, end_time, status) VALUES ('facility', ?1, ?2, '20:00', '21:00', 'approved')").bind(id, date).run();
        await env.DB.prepare('INSERT INTO slots (slot_key, request_id) VALUES (?1, ?2), (?3, ?2)').bind(`${date}_2000`, approved.meta.last_row_id, `${date}_2030`).run();
        expect((await post(`/api/requester/requests/${approved.meta.last_row_id}/cancel`, cookie)).status).toBe(200);
        const left = await env.DB.prepare('SELECT COUNT(*) AS n FROM slots WHERE request_id = ?1').bind(approved.meta.last_row_id).first<{ n: number }>();
        expect(left!.n).toBe(0);
    });

    it('is closed without a session', async () => {
        expect((await app.request('/api/requester/me', {}, facility)).status).toBe(401);
        expect((await app.request('/api/requester/requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }, facility)).status).toBe(401);
    });
});
