import { describe, expect, it } from 'vitest';
import { computeQuote, quoteStay } from '../src/pricing';
import { requestDetails } from '../src/texts';
import { addDays } from '../src/dates';
import { adminCall, adminCookie, daysAhead, dbOf, get, HOTEL, hotelBody, postJson, ROOM_A, ROOM_B, ROOM_C, setBasePrice, today, UNKNOWN_ROOM } from './helpers';

/** Query string of GET /api/quote for a stay in a room type. */
function quoteQuery(room: string, checkIn: string, checkOut: string): string {
    return `/api/quote?room_type=${encodeURIComponent(room)}&check_in=${checkIn}&check_out=${checkOut}`;
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
        const unpriced = await json<{ priced: boolean }>(await get(quoteQuery(ROOM_A.name, checkIn, checkOut)));
        expect(unpriced.priced).toBe(false);

        // A period covering the whole stay is enough even without a base price.
        const covering = await adminCall('POST', '/api/admin/pricing/periods', cookie, { room_type: ROOM_A.name, date_from: checkIn, date_to: daysAhead(203), price_per_night: 100 });
        expect(covering.status).toBe(201);
        const periodOnly = await json<{ priced: boolean; total: number }>(await get(quoteQuery(ROOM_A.name, checkIn, checkOut)));
        expect(periodOnly).toMatchObject({ priced: true, total: 400 });
        // One uncovered night, no base price: no quote.
        expect((await json<{ priced: boolean }>(await get(quoteQuery(ROOM_A.name, checkIn, daysAhead(205))))).priced).toBe(false);
        const coveringId = (await json<{ id: number }>(covering)).id;
        expect((await adminCall('DELETE', `/api/admin/pricing/periods/${coveringId}`, cookie)).status).toBe(200);

        expect((await setBasePrice(cookie, ROOM_A, 120)).status).toBe(200);
        expect((await setBasePrice(cookie, { id: 9999 }, 120)).status).toBe(404);
        expect((await setBasePrice(cookie, ROOM_A, -1)).status).toBe(400);
        // Prices carry two decimals at most: a third one is refused, not rounded.
        expect((await setBasePrice(cookie, ROOM_A, 120.005)).status).toBe(400);
        expect((await setBasePrice(cookie, ROOM_A, 120.5)).status).toBe(200);
        expect((await setBasePrice(cookie, ROOM_A, 120)).status).toBe(200);

        const period = await adminCall('POST', '/api/admin/pricing/periods', cookie, { room_type: ROOM_A.name, date_from: daysAhead(202), date_to: daysAhead(210), price_per_night: 180, label: 'Alta stagione' });
        expect(period.status).toBe(201);
        const overlap = await adminCall('POST', '/api/admin/pricing/periods', cookie, { room_type: ROOM_A.name, date_from: daysAhead(205), date_to: daysAhead(206), price_per_night: 200 });
        expect(overlap.status).toBe(409);
        expect((await json<{ error: string }>(overlap)).error).toBe('period_overlap');
        // Same dates on another room type are fine.
        expect((await adminCall('POST', '/api/admin/pricing/periods', cookie, { room_type: ROOM_B.name, date_from: daysAhead(205), date_to: daysAhead(206), price_per_night: 90 })).status).toBe(201);

        expect((await adminCall('POST', '/api/admin/pricing/discounts', cookie, { min_nights: 4, percent: 10 })).status).toBe(201);
        expect((await adminCall('POST', '/api/admin/pricing/discounts', cookie, { min_nights: 4, percent: 15 })).status).toBe(409);
        expect((await adminCall('POST', '/api/admin/pricing/discounts', cookie, { min_nights: 1, percent: 15 })).status).toBe(400);

        // 2 nights at 120 + 2 nights at 180 = 600, 4 nights → 10% → 540.
        const quote = await json<{ priced: boolean; subtotal: number; discount_percent: number; total: number }>(await get(quoteQuery(ROOM_A.name, checkIn, checkOut)));
        expect(quote).toMatchObject({ priced: true, subtotal: 600, discount_percent: 10, total: 540 });

        const pricing = await json<{ base: { room_type: string; price_per_night: number | null }[]; periods: unknown[]; discounts: unknown[] }>(await adminCall('GET', '/api/admin/pricing', cookie));
        expect(pricing.base.find((row) => row.room_type === ROOM_A.name)!.price_per_night).toBe(120);
        expect(pricing.base.find((row) => row.room_type === ROOM_C.name)!.price_per_night).toBeNull();
        expect(pricing.periods.length).toBe(2);
        expect(pricing.discounts.length).toBe(1);

        // A public request freezes the quote.
        const created = await postJson('/api/requests', hotelBody({ check_in: checkIn, check_out: checkOut }), undefined, '10.0.5.50');
        expect(created.status).toBe(201);
        const id = (await json<{ id: number }>(created)).id;
        const row = await dbOf(HOTEL).prepare('SELECT quoted_subtotal, quoted_discount_percent, quoted_total FROM requests WHERE id = ?1').bind(id).first<{ quoted_subtotal: number; quoted_discount_percent: number; quoted_total: number }>();
        expect(row).toEqual({ quoted_subtotal: 600, quoted_discount_percent: 10, quoted_total: 540 });

        // Changing the price afterwards does not touch the frozen quote.
        await setBasePrice(cookie, ROOM_A, 999);
        const again = await dbOf(HOTEL).prepare('SELECT quoted_total FROM requests WHERE id = ?1').bind(id).first<{ quoted_total: number }>();
        expect(again!.quoted_total).toBe(540);
        expect((await quoteStay(dbOf(HOTEL), ROOM_A.name, checkIn, checkOut))!.subtotal).toBe(999 * 2 + 180 * 2);
    });

    it('direct bookings take the computed quote or the agreed total typed by the venue', async () => {
        const cookie = await adminCookie();
        await setBasePrice(cookie, ROOM_B, 80);
        // Two nights at the base price; every booking on its own dates, so a type with a single room is enough.
        const checkIn = daysAhead(230);
        const checkOut = daysAhead(232);
        const computed = await adminCall('POST', '/api/admin/bookings', cookie, hotelBody({ room_type: ROOM_B.name, check_in: checkIn, check_out: checkOut }));
        expect(computed.status).toBe(201);
        const first = await dbOf(HOTEL).prepare('SELECT quoted_total, quoted_discount_percent FROM requests WHERE id = ?1').bind((await json<{ id: number }>(computed)).id).first<{ quoted_total: number; quoted_discount_percent: number }>();
        expect(first!.quoted_total).toBe(160);

        const agreed = await adminCall('POST', '/api/admin/bookings', cookie, { ...hotelBody({ room_type: ROOM_B.name, check_in: daysAhead(233), check_out: daysAhead(235) }), total: 140 });
        expect(agreed.status).toBe(201);
        const second = await dbOf(HOTEL).prepare('SELECT quoted_subtotal, quoted_total, quoted_discount_percent FROM requests WHERE id = ?1').bind((await json<{ id: number }>(agreed)).id).first<{ quoted_subtotal: number; quoted_total: number; quoted_discount_percent: number }>();
        expect(second).toEqual({ quoted_subtotal: 140, quoted_total: 140, quoted_discount_percent: 0 });

        const invalid = await adminCall('POST', '/api/admin/bookings', cookie, { ...hotelBody({ room_type: ROOM_B.name, check_in: daysAhead(236), check_out: daysAhead(238) }), total: 'molto' });
        expect(invalid.status).toBe(400);
    });

    it('prices one day from the calendar as a one-day period, splitting the period that covers it', async () => {
        const cookie = await adminCookie();
        /** The periods of ROOM_C, in calendar order, reduced to what matters. */
        async function periodsOfRoomC(): Promise<{ from: string; to: string; price: number; label: string | null }[]> {
            const pricing = await json<{ periods: { room_type: string; date_from: string; date_to: string; price_per_night: number; label: string | null }[] }>(await adminCall('GET', '/api/admin/pricing', cookie));
            return pricing.periods.filter((period) => period.room_type === ROOM_C.name).map((period) => ({ from: period.date_from, to: period.date_to, price: period.price_per_night, label: period.label }));
        }
        const setDay = (day: string, price: unknown) => adminCall('PUT', `/api/admin/pricing/days/${day}`, cookie, { room_type: ROOM_C.name, price_per_night: price });
        const lone = daysAhead(300);

        // No period covers the day: a one-day period appears; pricing it again replaces it; a reset removes it.
        expect((await setDay(lone, 70)).status).toBe(200);
        expect(await periodsOfRoomC()).toEqual([{ from: lone, to: lone, price: 70, label: null }]);
        expect((await setDay(lone, 75)).status).toBe(200);
        expect(await periodsOfRoomC()).toEqual([{ from: lone, to: lone, price: 75, label: null }]);
        expect((await setDay(lone, null)).status).toBe(200);
        expect(await periodsOfRoomC()).toEqual([]);
        // Resetting a day no period covers is a no-op.
        expect((await setDay(lone, null)).status).toBe(200);

        // A day inside a longer period: the period is split around it, both parts keep price and label.
        const from = daysAhead(310);
        const to = daysAhead(316);
        const middle = daysAhead(313);
        expect((await adminCall('POST', '/api/admin/pricing/periods', cookie, { room_type: ROOM_C.name, date_from: from, date_to: to, price_per_night: 100, label: 'Festa' })).status).toBe(201);
        expect((await setDay(middle, 130)).status).toBe(200);
        expect(await periodsOfRoomC()).toEqual([{ from, to: daysAhead(312), price: 100, label: 'Festa' }, { from: middle, to: middle, price: 130, label: null }, { from: daysAhead(314), to, price: 100, label: 'Festa' }]);
        // Resetting the day leaves a hole in the period.
        expect((await setDay(middle, null)).status).toBe(200);
        expect(await periodsOfRoomC()).toEqual([{ from, to: daysAhead(312), price: 100, label: 'Festa' }, { from: daysAhead(314), to, price: 100, label: 'Festa' }]);
        // The first day of a period: only the part after it remains.
        expect((await setDay(from, 90)).status).toBe(200);
        expect(await periodsOfRoomC()).toEqual([{ from, to: from, price: 90, label: null }, { from: daysAhead(311), to: daysAhead(312), price: 100, label: 'Festa' }, { from: daysAhead(314), to, price: 100, label: 'Festa' }]);
        // The quote follows: no base price, every night covered.
        expect((await quoteStay(dbOf(HOTEL), ROOM_C.name, from, daysAhead(313)))!.subtotal).toBe(90 + 100 + 100);
    });

    it('refuses day prices in the past, on unknown rooms or with bad values', async () => {
        const cookie = await adminCookie();
        const setDay = (day: string, body: unknown) => adminCall('PUT', `/api/admin/pricing/days/${day}`, cookie, body);
        const yesterday = addDays(today(), -1);
        expect((await setDay(yesterday, { room_type: ROOM_C.name, price_per_night: 50 })).status).toBe(409);
        expect((await json<{ error: string }>(await setDay(yesterday, { room_type: ROOM_C.name, price_per_night: 50 }))).error).toBe('day_past');
        // Today is still a bookable night.
        expect((await setDay(today(), { room_type: ROOM_C.name, price_per_night: 50 })).status).toBe(200);
        expect((await setDay('2027-02-30', { room_type: ROOM_C.name, price_per_night: 50 })).status).toBe(400);
        expect((await setDay(daysAhead(320), { room_type: UNKNOWN_ROOM, price_per_night: 50 })).status).toBe(400);
        expect((await setDay(daysAhead(320), { room_type: ROOM_C.name, price_per_night: -1 })).status).toBe(400);
        expect((await setDay(daysAhead(320), { room_type: ROOM_C.name, price_per_night: 'molto' })).status).toBe(400);
        expect((await setDay(daysAhead(320), { room_type: ROOM_C.name })).status).toBe(400);
    });

    it('writes the total, the discount and the tax wording in the email details', () => {
        const rows = requestDetails({ type: 'hotel', check_in: '2027-07-30', check_out: '2027-08-03', adults: 2, children: 0, room_type: 'Camera tripla', date: null, start_time: null, end_time: null, party_size: null, notes: null, quoted_subtotal: 500, quoted_discount_percent: 10, quoted_total: 450 }, 'it', false);
        expect(rows.some((row) => row.startsWith('Prezzo totale: 450,00') && row.includes('Tasse incluse, tassa di soggiorno esclusa'))).toBe(true);
        expect(rows.some((row) => row.includes('Sconto 10%') && row.includes('50,00'))).toBe(true);
        const english = requestDetails({ type: 'hotel', check_in: '2027-07-30', check_out: '2027-08-03', adults: 2, children: 0, room_type: 'Camera tripla', date: null, start_time: null, end_time: null, party_size: null, notes: null, quoted_subtotal: 500, quoted_discount_percent: 0, quoted_total: 500 }, 'en', false);
        expect(english.some((row) => row.startsWith('Total price: €500.00') && row.includes('tourist tax excluded'))).toBe(true);
        expect(english.some((row) => row.includes('discount'))).toBe(false);
    });

    it('writes what was paid and what is still due in the email about a change, never a refund', () => {
        const base = { type: 'hotel' as const, check_in: '2027-07-30', check_out: '2027-08-03', adults: 2, children: 0, room_type: 'Camera tripla', date: null, start_time: null, end_time: null, party_size: null, notes: null, quoted_subtotal: 300, quoted_discount_percent: 0, quoted_total: 300 };
        const deposit = requestDetails({ ...base, payment_status: 'deposit', paid_amount: 200 }, 'it', false, true);
        // Intl writes a non-breaking space before the euro sign: match the start of the row.
        expect(deposit.some((row) => row.startsWith('Importo già pagato: 200,00'))).toBe(true);
        expect(deposit.some((row) => row.startsWith('Saldo da pagare: 100,00'))).toBe(true);
        // Paid beyond the total: the amount paid only.
        const overpaid = requestDetails({ ...base, quoted_total: 150, payment_status: 'paid', paid_amount: 200 }, 'en', false, true);
        expect(overpaid.some((row) => row.startsWith('Amount already paid: €200.00'))).toBe(true);
        expect(overpaid.some((row) => row.includes('Balance') || row.includes('refund'))).toBe(false);
        // Without the flag (every other email) and without a payment: nothing.
        expect(requestDetails({ ...base, payment_status: 'deposit', paid_amount: 200 }, 'it', false).some((row) => row.startsWith('Importo'))).toBe(false);
        expect(requestDetails({ ...base, payment_status: 'none', paid_amount: null }, 'it', false, true).some((row) => row.startsWith('Importo'))).toBe(false);
    });
});
