import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { daysAhead, envOfType, get, hotelBody, postJson, ROOM_A, setStatus, today, tokenOf, UNKNOWN_ROOM } from './helpers';

describe('GET /api/config', () => {
    it('exposes the venue type, name and service windows', async () => {
        const response = await get('/api/config');
        expect(response.status).toBe(200);
        const config = (await response.json()) as { type: string; name: string; restaurant: { lunch: { open: string } } };
        expect(config.type).toBe('hotel');
        // The name comes from the instance's wrangler.jsonc, whatever it is.
        expect(config.name).toBe(env.VENUE_NAME);
        expect(config.restaurant.lunch.open).toBe('12:00');
    });

    it('falls back to safe defaults on malformed vars', async () => {
        const response = await get('/api/config', envOfType('spa', { VENUE_NAME: '', LUNCH_OPEN: '25:00' }));
        const config = (await response.json()) as { type: string; name: string; restaurant: { lunch: { open: string } } };
        expect(config.type).toBe('hotel');
        expect(config.name).toBe('Booking');
        expect(config.restaurant.lunch.open).toBe('12:00');
    });
});

describe('GET /api/availability', () => {
    it('lists every room type with the rooms left', async () => {
        const response = await get(`/api/availability?check_in=${daysAhead(30)}&check_out=${daysAhead(32)}`);
        expect(response.status).toBe(200);
        const body = (await response.json()) as { rooms: { name: string; available: number; quantity: number }[] };
        expect(body.rooms.length).toBeGreaterThan(0);
        for (const room of body.rooms) expect(room.available).toBe(room.quantity);
    });

    it('validates the stay', async () => {
        const past = await get(`/api/availability?check_in=2020-01-01&check_out=2020-01-02`);
        expect(past.status).toBe(400);
        expect(((await past.json()) as { error: string }).error).toBe('date_in_past');
        const reversed = await get(`/api/availability?check_in=${daysAhead(5)}&check_out=${daysAhead(5)}`);
        expect(((await reversed.json()) as { error: string }).error).toBe('checkout_before_checkin');
        const long = await get(`/api/availability?check_in=${daysAhead(5)}&check_out=${daysAhead(40)}`);
        expect(((await long.json()) as { error: string }).error).toBe('too_many_nights');
    });

    it('is not exposed by non-hotel deployments', async () => {
        const response = await get(`/api/availability?check_in=${daysAhead(5)}&check_out=${daysAhead(6)}`, envOfType('restaurant'));
        expect(response.status).toBe(404);
    });
});

describe('POST /api/requests (hotel)', () => {
    it('stores a pending request with a personal token and audits it', async () => {
        const response = await postJson('/api/requests', hotelBody(), undefined, '198.51.100.10');
        expect(response.status).toBe(201);
        const body = (await response.json()) as { id: number; status: string };
        expect(body.status).toBe('pending');
        const row = await env.DB.prepare('SELECT * FROM requests WHERE id = ?1').bind(body.id).first<Record<string, unknown>>();
        expect(row!.type).toBe('hotel');
        expect(row!.room_type).toBe(ROOM_A.name);
        expect(row!.adults).toBe(1);
        expect(String(row!.guest_token)).toMatch(/^[a-f0-9]{32}$/);
        const audit = await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'request_submitted'").first<{ n: number }>();
        expect(audit!.n).toBeGreaterThan(0);
    });

    it('rejects invalid guest and stay fields with a code', async () => {
        const cases: [Record<string, unknown>, string][] = [
            [{ first_name: '' }, 'invalid_name'],
            [{ email: 'not-an-email' }, 'invalid_email'],
            [{ phone: '12' }, 'invalid_phone'],
            [{ notes: 'x'.repeat(501) }, 'notes_too_long'],
            [{ privacy_accepted: false }, 'privacy_required'],
            [{ check_in: '2020-01-01', check_out: '2020-01-03' }, 'date_in_past'],
            [{ check_in: daysAhead(400), check_out: daysAhead(402) }, 'date_too_far'],
            [{ check_out: daysAhead(10) }, 'checkout_before_checkin'],
            [{ room_type: UNKNOWN_ROOM }, 'unknown_room'],
            [{ adults: 0 }, 'invalid_guests'],
            [{ adults: ROOM_A.max_guests, children: 1 }, 'too_many_guests'],
        ];
        for (const [index, [overrides, code]] of cases.entries()) {
            const response = await postJson('/api/requests', hotelBody(overrides), undefined, `198.51.100.${100 + index}`);
            expect(response.status, code).toBe(400);
            expect(((await response.json()) as { error: string }).error).toBe(code);
        }
    });

    it('answers 409 when the chosen room type is sold out for the stay', async () => {
        const checkIn = daysAhead(60);
        const checkOut = daysAhead(61);
        // Approve as many stays as the type has rooms: the next request must fail.
        for (let i = 0; i < ROOM_A.quantity; i++) {
            const response = await postJson('/api/requests', hotelBody({ check_in: checkIn, check_out: checkOut }), undefined, `198.51.100.${150 + i}`);
            expect(response.status).toBe(201);
            await setStatus(((await response.json()) as { id: number }).id, 'approved');
        }
        const soldOut = await postJson('/api/requests', hotelBody({ check_in: checkIn, check_out: checkOut }), undefined, '198.51.100.199');
        expect(soldOut.status).toBe(409);
        expect(((await soldOut.json()) as { error: string }).error).toBe('room_unavailable');
    });

    it('silently drops honeypot submissions', async () => {
        const before = await env.DB.prepare('SELECT COUNT(*) AS n FROM requests').first<{ n: number }>();
        const response = await postJson('/api/requests', hotelBody({ website: 'http://spam.example' }), undefined, '198.51.100.160');
        expect(response.status).toBe(201);
        const after = await env.DB.prepare('SELECT COUNT(*) AS n FROM requests').first<{ n: number }>();
        expect(after!.n).toBe(before!.n);
    });

    it('rate limits the sixth submission of the same IP within the window', async () => {
        const ip = '198.51.100.200';
        for (let i = 0; i < 5; i++) {
            const response = await postJson('/api/requests', hotelBody({ check_in: daysAhead(100 + i), check_out: daysAhead(101 + i) }), undefined, ip);
            expect(response.status).toBe(201);
        }
        const sixth = await postJson('/api/requests', hotelBody(), undefined, ip);
        expect(sixth.status).toBe(429);
        expect(((await sixth.json()) as { error: string }).error).toBe('too_many_requests');
    });

    it('is closed on facility deployments', async () => {
        const response = await postJson('/api/requests', hotelBody(), envOfType('facility'), '198.51.100.210');
        expect(response.status).toBe(403);
    });
});

describe('personal link', () => {
    it('shows the request and lets the guest cancel it once', async () => {
        const created = await postJson('/api/requests', hotelBody({ check_in: daysAhead(20), check_out: daysAhead(22) }), undefined, '198.51.100.220');
        const id = ((await created.json()) as { id: number }).id;
        const token = await tokenOf(id);

        const page = await get(`/booking/${token}`);
        expect(page.status).toBe(200);
        expect(page.headers.get('content-type')).toContain('text/html');

        const view = await get(`/api/booking/${token}`);
        expect(view.status).toBe(200);
        const body = (await view.json()) as { status: string; can_cancel: boolean; room_type: string; email?: string };
        expect(body.status).toBe('pending');
        expect(body.can_cancel).toBe(true);
        expect(body.email).toBeUndefined();

        const cancelled = await postJson(`/api/booking/${token}/cancel`, {});
        expect(cancelled.status).toBe(200);
        const again = await postJson(`/api/booking/${token}/cancel`, {});
        expect(again.status).toBe(409);
        const row = await env.DB.prepare('SELECT status, cancelled_at FROM requests WHERE id = ?1').bind(id).first<{ status: string; cancelled_at: string | null }>();
        expect(row!.status).toBe('cancelled');
        expect(row!.cancelled_at).not.toBeNull();
    });

    it('refuses to cancel a stay that already started', async () => {
        const result = await env.DB.prepare("INSERT INTO requests (type, first_name, last_name, email, phone, check_in, check_out, adults, children, room_type, guest_token, status) VALUES ('hotel', 'Old', 'Guest', 'old@example.com', '3331234567', ?1, ?2, 1, 0, 'Camera singola', ?3, 'approved')").bind('2020-01-01', '2020-01-05', 'a'.repeat(32)).run();
        expect(result.success).toBe(true);
        const response = await postJson(`/api/booking/${'a'.repeat(32)}/cancel`, {});
        expect(response.status).toBe(409);
        expect(((await response.json()) as { error: string }).error).toBe('cannot_cancel');
    });

    it('answers 404 for unknown or malformed tokens', async () => {
        expect((await get(`/api/booking/${'f'.repeat(32)}`)).status).toBe(404);
        expect((await get('/api/booking/short')).status).toBe(404);
        expect((await get('/booking/short')).status).toBe(404);
    });

    it('keeps today as a cancellable start date', async () => {
        const created = await postJson('/api/requests', hotelBody({ check_in: today(), check_out: daysAhead(1) }), undefined, '198.51.100.230');
        expect(created.status).toBe(201);
        const token = await tokenOf(((await created.json()) as { id: number }).id);
        const view = (await (await get(`/api/booking/${token}`)).json()) as { can_cancel: boolean };
        expect(view.can_cancel).toBe(true);
    });
});

describe('embedding', () => {
    it('is disabled without EMBED_ORIGIN and framable by that origin only when set', async () => {
        // Explicitly empty: an instance's wrangler.jsonc may set EMBED_ORIGIN.
        const off = await get('/embed', envOfType('hotel', { EMBED_ORIGIN: '' }));
        expect(off.status).toBe(404);
        const on = await get('/embed', envOfType('hotel', { EMBED_ORIGIN: 'https://www.hotel.example/' }));
        expect(on.status).toBe(200);
        expect(on.headers.get('content-security-policy')).toContain('frame-ancestors https://www.hotel.example;');
        expect(on.headers.get('x-frame-options')).toBeNull();
        const other = await get('/api/config', envOfType('hotel', { EMBED_ORIGIN: 'https://www.hotel.example' }));
        expect(other.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
        expect(other.headers.get('x-frame-options')).toBe('DENY');
        const malformed = await get('/embed', envOfType('hotel', { EMBED_ORIGIN: 'hotel.example' }));
        expect(malformed.status).toBe(404);
    });
});
