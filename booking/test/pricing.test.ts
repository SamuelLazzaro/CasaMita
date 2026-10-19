import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { app } from '../src/index';
import { computeQuote, quoteStay } from '../src/pricing';
import { requestDetails } from '../src/texts';
import { daysAhead, get, hotelBody, postJson } from './helpers';

async function adminCookie(): Promise<string> {
    const response = await app.request('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '10.0.5.1' }, body: JSON.stringify({ password: 'test-password' }) }, env);
    return response.headers.get('set-cookie')!.split(';')[0];
}

async function adminCall(method: string, path: string, cookie: string, body?: unknown): Promise<Response> {
    return await app.request(path, { method, headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }, env);
}

async function json<T>(response: Response): Promise<T> {
    return (await response.json()) as T;
}

describe('computeQuote', () => {
    it('prices every night with its period or the base price and applies the best discount', () => {
        const periods = [{ date_from: '2027-08-01', date_to: '2027-08-31', price_per_night: 150 }];
        const rules = [{ min_nights: 3, percent: 10 }, { min_nights: 7, percent: 20 }];
        // 30 and 31 July at 100, 1 and 2 August at 150: subtotal 500, 4 nights → 10%.
        const quote = computeQuote('2027-07-30', '2027-08-03', 100, periods, rules)!;
        expect(quote.nights.map((night) => night.price)).toEqual([100, 100, 150, 150]);
        expect(quote.subtotal).toBe(500);
        expect(quote.discount_percent).toBe(10);
        expect(quote.discount_amount).toBe(50);
        expect(quote.total).toBe(450);
    });

    it('rounds to the cent only at the end and applies no discount below every threshold', () => {
        const quote = computeQuote('2027-03-01', '2027-03-03', 33.335, [], [{ min_nights: 3, percent: 15 }])!;
        expect(quote.subtotal).toBe(66.67);
        expect(quote.discount_percent).toBe(0);
        expect(quote.total).toBe(66.67);
    });

    it('quotes from periods alone when they cover every night, and not otherwise', () => {
        const periods = [{ date_from: '2027-08-01', date_to: '2027-08-02', price_per_night: 150 }];
        // No base price: 1 and 2 August are covered, 3 August is not.
        expect(computeQuote('2027-08-01', '2027-08-03', null, periods, [])!.total).toBe(300);
        expect(computeQuote('2027-08-01', '2027-08-04', null, periods, [])).toBeNull();
        expect(computeQuote('2027-07-31', '2027-08-02', null, periods, [])).toBeNull();
    });
});

describe('pricing administration and public quote', () => {
    it('needs a price for every night before quoting, then quotes with periods and discounts', async () => {
        const cookie = await adminCookie();
        const checkIn = daysAhead(200);
        const checkOut = daysAhead(204);
        const unpriced = await json<{ priced: boolean }>(await get(`/api/quote?room_type=Camera%20tripla&check_in=${checkIn}&check_out=${checkOut}`));
        expect(unpriced.priced).toBe(false);

        // A period covering the whole stay is enough even without a base price.
        const covering = await adminCall('POST', '/api/admin/pricing/periods', cookie, { room_type: 'Camera tripla', date_from: checkIn, date_to: daysAhead(203), price_per_night: 100 });
        expect(covering.status).toBe(201);
        const periodOnly = await json<{ priced: boolean; total: number }>(await get(`/api/quote?room_type=Camera%20tripla&check_in=${checkIn}&check_out=${checkOut}`));
        expect(periodOnly).toMatchObject({ priced: true, total: 400 });
        // One uncovered night, no base price: no quote.
        expect((await json<{ priced: boolean }>(await get(`/api/quote?room_type=Camera%20tripla&check_in=${checkIn}&check_out=${daysAhead(205)}`))).priced).toBe(false);
        const coveringId = (await json<{ id: number }>(covering)).id;
        expect((await adminCall('DELETE', `/api/admin/pricing/periods/${coveringId}`, cookie)).status).toBe(200);

        expect((await adminCall('PUT', '/api/admin/pricing/base', cookie, { room_type: 'Camera tripla', price_per_night: 120 })).status).toBe(200);
        expect((await adminCall('PUT', '/api/admin/pricing/base', cookie, { room_type: 'Attico', price_per_night: 120 })).status).toBe(400);
        expect((await adminCall('PUT', '/api/admin/pricing/base', cookie, { room_type: 'Camera tripla', price_per_night: -1 })).status).toBe(400);

        const period = await adminCall('POST', '/api/admin/pricing/periods', cookie, { room_type: 'Camera tripla', date_from: daysAhead(202), date_to: daysAhead(210), price_per_night: 180, label: 'Alta stagione' });
        expect(period.status).toBe(201);
        const overlap = await adminCall('POST', '/api/admin/pricing/periods', cookie, { room_type: 'Camera tripla', date_from: daysAhead(205), date_to: daysAhead(206), price_per_night: 200 });
        expect(overlap.status).toBe(409);
        expect((await json<{ error: string }>(overlap)).error).toBe('period_overlap');
        // Same dates on another room type are fine.
        expect((await adminCall('POST', '/api/admin/pricing/periods', cookie, { room_type: 'Camera singola', date_from: daysAhead(205), date_to: daysAhead(206), price_per_night: 90 })).status).toBe(201);

        expect((await adminCall('POST', '/api/admin/pricing/discounts', cookie, { min_nights: 4, percent: 10 })).status).toBe(201);
        expect((await adminCall('POST', '/api/admin/pricing/discounts', cookie, { min_nights: 4, percent: 15 })).status).toBe(409);
        expect((await adminCall('POST', '/api/admin/pricing/discounts', cookie, { min_nights: 1, percent: 15 })).status).toBe(400);

        // 2 nights at 120 + 2 nights at 180 = 600, 4 nights → 10% → 540.
        const quote = await json<{ priced: boolean; subtotal: number; discount_percent: number; total: number }>(await get(`/api/quote?room_type=Camera%20tripla&check_in=${checkIn}&check_out=${checkOut}`));
        expect(quote).toMatchObject({ priced: true, subtotal: 600, discount_percent: 10, total: 540 });

        const pricing = await json<{ base: { room_type: string; price_per_night: number | null }[]; periods: unknown[]; discounts: unknown[] }>(await adminCall('GET', '/api/admin/pricing', cookie));
        expect(pricing.base.find((row) => row.room_type === 'Camera tripla')!.price_per_night).toBe(120);
        expect(pricing.base.find((row) => row.room_type === 'Camera doppia')!.price_per_night).toBeNull();
        expect(pricing.periods.length).toBe(2);
        expect(pricing.discounts.length).toBe(1);

        // A public request freezes the quote.
        const created = await postJson('/api/requests', hotelBody({ room_type: 'Camera tripla', adults: 2, check_in: checkIn, check_out: checkOut }), undefined, '10.0.5.50');
        expect(created.status).toBe(201);
        const id = (await json<{ id: number }>(created)).id;
        const row = await env.DB.prepare('SELECT quoted_subtotal, quoted_discount_percent, quoted_total FROM requests WHERE id = ?1').bind(id).first<{ quoted_subtotal: number; quoted_discount_percent: number; quoted_total: number }>();
        expect(row).toEqual({ quoted_subtotal: 600, quoted_discount_percent: 10, quoted_total: 540 });

        // Changing the price afterwards does not touch the frozen quote.
        await adminCall('PUT', '/api/admin/pricing/base', cookie, { room_type: 'Camera tripla', price_per_night: 999 });
        const again = await env.DB.prepare('SELECT quoted_total FROM requests WHERE id = ?1').bind(id).first<{ quoted_total: number }>();
        expect(again!.quoted_total).toBe(540);
        expect((await quoteStay(env.DB, 'Camera tripla', checkIn, checkOut))!.subtotal).toBe(999 * 2 + 180 * 2);
    });

    it('direct bookings take the computed quote or the agreed total typed by the venue', async () => {
        const cookie = await adminCookie();
        await adminCall('PUT', '/api/admin/pricing/base', cookie, { room_type: 'Camera singola', price_per_night: 80 });
        const checkIn = daysAhead(230);
        const checkOut = daysAhead(232);
        const computed = await adminCall('POST', '/api/admin/bookings', cookie, hotelBody({ room_type: 'Camera singola', adults: 1, check_in: checkIn, check_out: checkOut }));
        expect(computed.status).toBe(201);
        const first = await env.DB.prepare('SELECT quoted_total, quoted_discount_percent FROM requests WHERE id = ?1').bind((await json<{ id: number }>(computed)).id).first<{ quoted_total: number; quoted_discount_percent: number }>();
        expect(first!.quoted_total).toBe(160);

        const agreed = await adminCall('POST', '/api/admin/bookings', cookie, { ...hotelBody({ room_type: 'Camera singola', adults: 1, check_in: checkIn, check_out: checkOut }), total: 140 });
        expect(agreed.status).toBe(201);
        const second = await env.DB.prepare('SELECT quoted_subtotal, quoted_total, quoted_discount_percent FROM requests WHERE id = ?1').bind((await json<{ id: number }>(agreed)).id).first<{ quoted_subtotal: number; quoted_total: number; quoted_discount_percent: number }>();
        expect(second).toEqual({ quoted_subtotal: 140, quoted_total: 140, quoted_discount_percent: 0 });

        const invalid = await adminCall('POST', '/api/admin/bookings', cookie, { ...hotelBody({ room_type: 'Camera singola', adults: 1, check_in: checkIn, check_out: checkOut }), total: 'molto' });
        expect(invalid.status).toBe(400);
    });

    it('writes the total, the discount and the tax wording in the email details', () => {
        const rows = requestDetails({ type: 'hotel', check_in: '2027-07-30', check_out: '2027-08-03', adults: 2, children: 0, room_type: 'Camera tripla', date: null, start_time: null, end_time: null, party_size: null, notes: null, quoted_subtotal: 500, quoted_discount_percent: 10, quoted_total: 450 }, 'it', false);
        expect(rows.some((row) => row.startsWith('Prezzo totale: 450,00') && row.includes('Tasse incluse, tassa di soggiorno esclusa'))).toBe(true);
        expect(rows.some((row) => row.includes('Sconto 10%') && row.includes('50,00'))).toBe(true);
        const english = requestDetails({ type: 'hotel', check_in: '2027-07-30', check_out: '2027-08-03', adults: 2, children: 0, room_type: 'Camera tripla', date: null, start_time: null, end_time: null, party_size: null, notes: null, quoted_subtotal: 500, quoted_discount_percent: 0, quoted_total: 500 }, 'en', false);
        expect(english.some((row) => row.startsWith('Total price: €500.00') && row.includes('tourist tax excluded'))).toBe(true);
        expect(english.some((row) => row.includes('discount'))).toBe(false);
    });
});
