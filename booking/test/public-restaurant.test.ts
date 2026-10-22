import { describe, expect, it } from 'vitest';
import { daysAhead, dbOf, postJson, RESTAURANT, restaurantBody, setTenant } from './helpers';

describe('POST /:slug/api/requests (restaurant)', () => {
    it('stores a pending request with date, seating time and party size', async () => {
        const response = await postJson('/api/requests', restaurantBody(), RESTAURANT, '192.0.2.10');
        expect(response.status).toBe(201);
        const id = ((await response.json()) as { id: number }).id;
        const row = await dbOf(RESTAURANT).prepare('SELECT type, status, date, start_time, party_size, lang FROM requests WHERE id = ?1').bind(id).first<Record<string, unknown>>();
        expect(row).toEqual({ type: 'restaurant', status: 'pending', date: daysAhead(3), start_time: '20:00', party_size: 4, lang: 'en' });
    });

    it('accepts only seating times inside lunch or dinner, on the 15-minute grid', async () => {
        const cases: [string, number][] = [['12:00', 201], ['12:45', 201], ['14:15', 201], ['14:30', 400], ['16:00', 400], ['19:05', 400], ['22:15', 201], ['22:30', 400]];
        for (const [index, [time, status]] of cases.entries()) {
            const response = await postJson('/api/requests', restaurantBody({ time }), RESTAURANT, `192.0.2.${20 + index}`);
            expect(response.status, time).toBe(status);
        }
    });

    it('honours the service windows of the venue', async () => {
        await setTenant(RESTAURANT, { dinner_open: '20:00', dinner_close: '23:00' });
        try {
            const early = await postJson('/api/requests', restaurantBody({ time: '19:30' }), RESTAURANT, '192.0.2.40');
            expect(early.status).toBe(400);
            const late = await postJson('/api/requests', restaurantBody({ time: '22:45' }), RESTAURANT, '192.0.2.41');
            expect(late.status).toBe(201);
        } finally {
            await setTenant(RESTAURANT, { dinner_open: null, dinner_close: null });
        }
    });

    it('rejects invalid party sizes and past dates', async () => {
        const zero = await postJson('/api/requests', restaurantBody({ party_size: 0 }), RESTAURANT, '192.0.2.50');
        expect(((await zero.json()) as { error: string }).error).toBe('invalid_party_size');
        const huge = await postJson('/api/requests', restaurantBody({ party_size: 31 }), RESTAURANT, '192.0.2.51');
        expect(((await huge.json()) as { error: string }).error).toBe('invalid_party_size');
        const past = await postJson('/api/requests', restaurantBody({ date: '2020-01-01' }), RESTAURANT, '192.0.2.52');
        expect(((await past.json()) as { error: string }).error).toBe('date_in_past');
    });
});
