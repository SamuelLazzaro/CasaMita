import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import type { Bindings } from '../src/types';
import { app } from '../src/index';
import { daysAhead, envOfType, hotelBody, postJson, restaurantBody, setStatus } from './helpers';

/** Logs the admin in (fake password from vitest.config.ts) and returns the session cookie. */
async function adminCookie(bindings: Bindings = env): Promise<string> {
    const response = await app.request('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '10.0.0.1' }, body: JSON.stringify({ password: 'test-password' }) }, bindings);
    if (response.status !== 200) throw new Error(`admin login failed in tests (status ${response.status})`);
    return response.headers.get('set-cookie')!.split(';')[0];
}

async function adminPost(path: string, cookie: string, body: unknown = {}, bindings: Bindings = env): Promise<Response> {
    return await app.request(path, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, bindings);
}

async function adminGet(path: string, cookie: string, bindings: Bindings = env): Promise<Response> {
    return await app.request(path, { headers: { Cookie: cookie } }, bindings);
}

async function json<T>(response: Response): Promise<T> {
    return (await response.json()) as T;
}

async function statusOf(id: number): Promise<string> {
    const row = await env.DB.prepare('SELECT status FROM requests WHERE id = ?1').bind(id).first<{ status: string }>();
    return row!.status;
}

const facility = envOfType('facility');
const restaurant = envOfType('restaurant');

describe('admin login', () => {
    it('rejects a wrong password and accepts the right one', async () => {
        const wrong = await app.request('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '10.0.0.2' }, body: JSON.stringify({ password: 'nope' }) }, env);
        expect(wrong.status).toBe(401);
        const cookie = await adminCookie();
        expect(cookie.startsWith('sess_admin=')).toBe(true);
        expect((await adminGet('/api/admin/me', cookie)).status).toBe(200);
        expect((await app.request('/api/admin/me', {}, env)).status).toBe(401);
    });
});

describe('decisions on hotel requests', () => {
    it('approves a pending request and refuses to approve it twice', async () => {
        const cookie = await adminCookie();
        const created = await postJson('/api/requests', hotelBody({ check_in: daysAhead(40), check_out: daysAhead(41) }), undefined, '10.0.1.1');
        const id = (await json<{ id: number }>(created)).id;
        const approved = await adminPost(`/api/admin/requests/${id}/approve`, cookie);
        expect(approved.status).toBe(200);
        expect(await statusOf(id)).toBe('approved');
        const again = await adminPost(`/api/admin/requests/${id}/approve`, cookie);
        expect(again.status).toBe(409);
        expect((await json<{ error: string }>(again)).error).toBe('not_pending');
    });

    it('cannot approve beyond the rooms of the type (atomic count in the UPDATE)', async () => {
        const cookie = await adminCookie();
        const checkIn = daysAhead(70);
        const checkOut = daysAhead(72);
        const ids: number[] = [];
        for (let i = 0; i < 3; i++) {
            const created = await postJson('/api/requests', hotelBody({ room_type: 'Suite familiare', adults: 2, check_in: checkIn, check_out: checkOut }), undefined, `10.0.1.${10 + i}`);
            expect(created.status).toBe(201);
            ids.push((await json<{ id: number }>(created)).id);
        }
        expect((await adminPost(`/api/admin/requests/${ids[0]}/approve`, cookie)).status).toBe(200);
        expect((await adminPost(`/api/admin/requests/${ids[1]}/approve`, cookie)).status).toBe(200);
        const third = await adminPost(`/api/admin/requests/${ids[2]}/approve`, cookie);
        expect(third.status).toBe(409);
        expect((await json<{ error: string }>(third)).error).toBe('room_unavailable');
        expect(await statusOf(ids[2])).toBe('pending');
    });

    it('rejects with an optional reason and cancels approved bookings', async () => {
        const cookie = await adminCookie();
        const first = (await json<{ id: number }>(await postJson('/api/requests', hotelBody({ check_in: daysAhead(80), check_out: daysAhead(81) }), undefined, '10.0.1.20'))).id;
        const rejected = await adminPost(`/api/admin/requests/${first}/reject`, cookie, { reason: 'Chiusura per lavori' });
        expect(rejected.status).toBe(200);
        expect(await statusOf(first)).toBe('rejected');
        const tooLong = await adminPost(`/api/admin/requests/${first}/reject`, cookie, { reason: 'x'.repeat(301) });
        expect(tooLong.status).toBe(409); // already decided: not pending wins

        const second = (await json<{ id: number }>(await postJson('/api/requests', hotelBody({ check_in: daysAhead(82), check_out: daysAhead(83) }), undefined, '10.0.1.21'))).id;
        await setStatus(second, 'approved');
        const cancelled = await adminPost(`/api/admin/requests/${second}/cancel`, cookie);
        expect(cancelled.status).toBe(200);
        expect(await statusOf(second)).toBe('cancelled');
        expect((await adminPost(`/api/admin/requests/${second}/cancel`, cookie)).status).toBe(409);
    });

    it('lists pending requests and the calendar items of a range', async () => {
        const cookie = await adminCookie();
        const created = (await json<{ id: number }>(await postJson('/api/requests', hotelBody({ check_in: daysAhead(90), check_out: daysAhead(93) }), undefined, '10.0.1.30'))).id;
        const pending = await json<{ items: { id: number; guest_token?: string }[] }>(await adminGet('/api/admin/requests?status=pending', cookie));
        const mine = pending.items.find((item) => item.id === created)!;
        expect(mine).toBeDefined();
        expect(mine.guest_token).toBeUndefined();

        // The stay covers day 91: a day view on it must list the booking, a day view on the check-out day must not.
        const onDay = await json<{ items: { id: number }[] }>(await adminGet(`/api/admin/calendar?view=day&date=${daysAhead(91)}`, cookie));
        expect(onDay.items.some((item) => item.id === created)).toBe(true);
        const checkoutDay = await json<{ items: { id: number }[] }>(await adminGet(`/api/admin/calendar?view=day&date=${daysAhead(93)}`, cookie));
        expect(checkoutDay.items.some((item) => item.id === created)).toBe(false);
        const month = await json<{ from: string; to: string }>(await adminGet(`/api/admin/calendar?view=month&date=${daysAhead(91)}`, cookie));
        expect(month.from <= daysAhead(91) && month.to >= daysAhead(91)).toBe(true);
    });
});

describe('direct bookings', () => {
    it('hotel: born approved, respects availability', async () => {
        const cookie = await adminCookie();
        const checkIn = daysAhead(120);
        const checkOut = daysAhead(121);
        const body = { ...hotelBody({ room_type: 'Suite familiare', adults: 2, check_in: checkIn, check_out: checkOut }), lang: 'en' };
        const first = await adminPost('/api/admin/bookings', cookie, body);
        expect(first.status).toBe(201);
        const id = (await json<{ id: number; status: string }>(first)).id;
        expect(await statusOf(id)).toBe('approved');
        const row = await env.DB.prepare('SELECT lang, guest_token, decided_at FROM requests WHERE id = ?1').bind(id).first<{ lang: string; guest_token: string; decided_at: string }>();
        expect(row!.lang).toBe('en');
        expect(row!.guest_token).toMatch(/^[a-f0-9]{32}$/);
        expect(row!.decided_at).not.toBeNull();

        expect((await adminPost('/api/admin/bookings', cookie, body)).status).toBe(201);
        const third = await adminPost('/api/admin/bookings', cookie, body);
        expect(third.status).toBe(409);
        expect((await json<{ error: string }>(third)).error).toBe('room_unavailable');
    });

    it('hotel: applies the guest validation rules', async () => {
        const cookie = await adminCookie();
        const missingEmail = await adminPost('/api/admin/bookings', cookie, hotelBody({ email: '' }));
        expect(missingEmail.status).toBe(400);
        expect((await json<{ error: string }>(missingEmail)).error).toBe('invalid_email');
    });

    it('restaurant: born approved inside the service windows', async () => {
        const cookie = await adminCookie(restaurant);
        const ok = await adminPost('/api/admin/bookings', cookie, restaurantBody({ time: '13:00' }), restaurant);
        expect(ok.status).toBe(201);
        expect(await statusOf((await json<{ id: number }>(ok)).id)).toBe('approved');
        const outside = await adminPost('/api/admin/bookings', cookie, restaurantBody({ time: '17:00' }), restaurant);
        expect(outside.status).toBe(400);
    });

    it('facility: needs a registered requester and free slots', async () => {
        const cookie = await adminCookie(facility);
        const created = await adminPost('/api/admin/requesters', cookie, { name: 'Polisportiva Test', contact_name: 'Giulia', email: 'polis@example.com', phone: '0331 123456' }, facility);
        expect(created.status).toBe(201);
        const { id: requesterId, access_link } = await json<{ id: number; access_link: string }>(created);
        expect(access_link).toMatch(/\/access\/[a-f0-9]{32}$/);

        const date = daysAhead(15);
        const booking = { requester_id: requesterId, date, start_time: '18:00', end_time: '19:30', notes: 'Allenamento' };
        const first = await adminPost('/api/admin/bookings', cookie, booking, facility);
        expect(first.status).toBe(201);
        const id = (await json<{ id: number }>(first)).id;
        const slots = await env.DB.prepare('SELECT slot_key FROM slots WHERE request_id = ?1 ORDER BY slot_key').bind(id).all<{ slot_key: string }>();
        expect(slots.results.map((row) => row.slot_key)).toEqual([`${date}_1800`, `${date}_1830`, `${date}_1900`]);

        const overlapping = await adminPost('/api/admin/bookings', cookie, { ...booking, start_time: '19:00', end_time: '20:00' }, facility);
        expect(overlapping.status).toBe(409);
        const conflict = await json<{ error: string; slots: string[] }>(overlapping);
        expect(conflict.error).toBe('slots_taken');
        expect(conflict.slots).toEqual([`${date}_1900`]);

        const unknown = await adminPost('/api/admin/bookings', cookie, { ...booking, requester_id: 9999 }, facility);
        expect(unknown.status).toBe(404);
        const outside = await adminPost('/api/admin/bookings', cookie, { ...booking, start_time: '07:00', end_time: '08:00' }, facility);
        expect((await json<{ error: string }>(outside)).error).toBe('outside_opening_hours');
        const offGrid = await adminPost('/api/admin/bookings', cookie, { ...booking, start_time: '10:15', end_time: '11:00' }, facility);
        expect((await json<{ error: string }>(offGrid)).error).toBe('invalid_time');

        // Cancelling frees the slots.
        expect((await adminPost(`/api/admin/requests/${id}/cancel`, cookie, {}, facility)).status).toBe(200);
        const left = await env.DB.prepare('SELECT COUNT(*) AS n FROM slots WHERE request_id = ?1').bind(id).first<{ n: number }>();
        expect(left!.n).toBe(0);
    });
});

describe('requesters', () => {
    it('creates, edits, suspends (cancelling future bookings) and regenerates the link', async () => {
        const cookie = await adminCookie(facility);
        const created = await json<{ id: number; access_link: string }>(await adminPost('/api/admin/requesters', cookie, { name: 'Skating Club', contact_name: 'Marco', email: 'club@example.com', phone: '+39 02 1234567', color: '#FF8800' }, facility));
        const list = await json<{ items: { id: number; color: string; status: string; access_link: string }[] }>(await adminGet('/api/admin/requesters', cookie, facility));
        const mine = list.items.find((item) => item.id === created.id)!;
        expect(mine.color).toBe('#ff8800');
        expect(mine.status).toBe('active');
        expect(mine.access_link).toBe(created.access_link);

        const edited = await app.request(`/api/admin/requesters/${created.id}`, { method: 'PATCH', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ contact_name: 'Marco Rossi' }) }, facility);
        expect(edited.status).toBe(200);
        const badEmail = await app.request(`/api/admin/requesters/${created.id}`, { method: 'PATCH', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'nope' }) }, facility);
        expect(badEmail.status).toBe(400);

        const date = daysAhead(25);
        const booking = await json<{ id: number }>(await adminPost('/api/admin/bookings', cookie, { requester_id: created.id, date, start_time: '09:00', end_time: '10:00' }, facility));
        const suspended = await json<{ ok: boolean; slots_freed: number; requests_cancelled: number }>(await adminPost(`/api/admin/requesters/${created.id}/suspend`, cookie, {}, facility));
        expect(suspended.slots_freed).toBe(2);
        expect(suspended.requests_cancelled).toBe(1);
        expect(await statusOf(booking.id)).toBe('cancelled');
        const blocked = await adminPost('/api/admin/bookings', cookie, { requester_id: created.id, date, start_time: '11:00', end_time: '12:00' }, facility);
        expect(blocked.status).toBe(404);

        expect((await adminPost(`/api/admin/requesters/${created.id}/reactivate`, cookie, {}, facility)).status).toBe(200);
        const regenerated = await json<{ access_link: string }>(await adminPost(`/api/admin/requesters/${created.id}/regenerate-link`, cookie, {}, facility));
        expect(regenerated.access_link).not.toBe(created.access_link);
        expect((await adminPost(`/api/admin/requesters/${created.id}/send-link`, cookie, {}, facility)).status).toBe(200);
    });

    it('validates the fields', async () => {
        const cookie = await adminCookie(facility);
        const noPhone = await adminPost('/api/admin/requesters', cookie, { name: 'X', contact_name: 'Y', email: 'x@example.com' }, facility);
        expect((await json<{ error: string }>(noPhone)).error).toBe('invalid_phone');
        const badColor = await adminPost('/api/admin/requesters', cookie, { name: 'X', contact_name: 'Y', email: 'x@example.com', phone: '3331234567', color: 'red' }, facility);
        expect((await json<{ error: string }>(badColor)).error).toBe('invalid_color');
    });
});
