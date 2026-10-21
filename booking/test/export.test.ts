import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { app } from '../src/index';
import { adminCall, adminCookie, daysAhead, envOfType, hotelBody, postJson, ROOM_B, ROOM_C, setStatus } from './helpers';

/*
 * Hotel CSV export (GET /api/admin/export): the stays touching a date range,
 * every status but pending, with the exported columns only.
 */

type ExportRow = { check_in: string; check_out: string; first_name: string; last_name: string; email: string; phone: string; room_type: string; adults: number; children: number; quoted_total: number | null; paid_amount: number | null; payment_status: string; status: string; guest_token?: string; notes?: string };

async function exportRows(cookie: string, from: string, to: string): Promise<{ status: number; items: ExportRow[] }> {
    const response = await adminCall('GET', `/api/admin/export?from=${from}&to=${to}`, cookie);
    const body = (await response.json()) as { items?: ExportRow[] };
    return { status: response.status, items: body.items ?? [] };
}

/** A confirmed direct hotel booking from `checkIn` to `checkOut`, with the given agreed total. */
async function confirmedStay(cookie: string, checkIn: string, checkOut: string, total: number, overrides: Record<string, unknown> = {}): Promise<number> {
    const created = await adminCall('POST', '/api/admin/bookings', cookie, { ...hotelBody({ check_in: checkIn, check_out: checkOut, ...overrides }), total });
    expect(created.status).toBe(201);
    return ((await created.json()) as { id: number }).id;
}

describe('hotel CSV export', () => {
    it('lists the stays touching the range, pending ones excluded, with the exported columns only', async () => {
        const cookie = await adminCookie();
        const inside = await confirmedStay(cookie, daysAhead(200), daysAhead(202), 300, { last_name: 'Dentro' });
        await confirmedStay(cookie, daysAhead(198), daysAhead(200), 100, { last_name: 'Checkout sul from' });
        await confirmedStay(cookie, daysAhead(205), daysAhead(207), 100, { last_name: 'Checkin sul to' });
        await confirmedStay(cookie, daysAhead(206), daysAhead(208), 100, { last_name: 'Dopo', room_type: ROOM_B.name });
        const cancelled = await confirmedStay(cookie, daysAhead(201), daysAhead(203), 150, { last_name: 'Annullata', room_type: ROOM_B.name });
        await setStatus(cancelled, 'cancelled');
        const pendingResponse = await postJson('/api/requests', hotelBody({ check_in: daysAhead(201), check_out: daysAhead(202), last_name: 'In attesa', room_type: ROOM_C.name }));
        expect(pendingResponse.status).toBe(201);
        const rejectedResponse = await postJson('/api/requests', hotelBody({ check_in: daysAhead(202), check_out: daysAhead(203), last_name: 'Rifiutata', room_type: ROOM_C.name }), env, '203.0.113.11');
        expect(rejectedResponse.status).toBe(201);
        await setStatus(((await rejectedResponse.json()) as { id: number }).id, 'rejected');
        // A deposit on the stay inside the range.
        expect((await adminCall('POST', `/api/admin/requests/${inside}/deposit`, cookie, { amount: 120 })).status).toBe(200);

        const { status, items } = await exportRows(cookie, daysAhead(200), daysAhead(205));
        expect(status).toBe(200);
        const names = items.map((row) => row.last_name);
        expect(names).toEqual(['Dentro', 'Annullata', 'Rifiutata', 'Checkin sul to']);
        expect(names).not.toContain('In attesa');
        expect(names).not.toContain('Checkout sul from');
        expect(names).not.toContain('Dopo');

        const first = items[0];
        expect(first).toMatchObject({ check_in: daysAhead(200), check_out: daysAhead(202), first_name: 'Anna', last_name: 'Dentro', email: 'anna@example.com', phone: '+39 333 1234567', adults: 1, children: 0, quoted_total: 300, paid_amount: 120, payment_status: 'deposit', status: 'approved' });
        expect(first.guest_token).toBeUndefined();
        expect(first.notes).toBeUndefined();
        expect(items[1]).toMatchObject({ last_name: 'Annullata', status: 'cancelled', payment_status: 'none', paid_amount: null });
        expect(items[2]).toMatchObject({ last_name: 'Rifiutata', status: 'rejected', quoted_total: null });
    });

    it('validates the range and answers only for the hotel', async () => {
        const cookie = await adminCookie();
        expect((await exportRows(cookie, '', '')).status).toBe(400);
        expect((await exportRows(cookie, '2026-13-01', '2026-13-02')).status).toBe(400);
        const reversed = await adminCall('GET', `/api/admin/export?from=${daysAhead(10)}&to=${daysAhead(9)}`, cookie);
        expect(reversed.status).toBe(400);
        expect(((await reversed.json()) as { error: string }).error).toBe('period_reversed');
        const sameDay = await exportRows(cookie, daysAhead(10), daysAhead(10));
        expect(sameDay.status).toBe(200);

        const anonymous = await app.request(`/api/admin/export?from=${daysAhead(10)}&to=${daysAhead(11)}`, {}, env);
        expect(anonymous.status).toBe(401);
        const restaurant = await app.request(`/api/admin/export?from=${daysAhead(10)}&to=${daysAhead(11)}`, { headers: { Cookie: cookie } }, envOfType('restaurant'));
        expect(restaurant.status).toBe(404);
    });
});
