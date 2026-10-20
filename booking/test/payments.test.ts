import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { app } from '../src/index';
import { daysAhead, envOfType, hotelBody, postJson, restaurantBody, setStatus } from './helpers';

/*
 * Hotel payments (migration 0003): a confirmed stay goes none → deposit →
 * paid or none → paid; the status column never changes.
 */

async function adminCookie(): Promise<string> {
    const response = await app.request('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '10.0.7.1' }, body: JSON.stringify({ password: 'test-password' }) }, env);
    return response.headers.get('set-cookie')!.split(';')[0];
}

async function adminPost(path: string, cookie: string, body: unknown = {}): Promise<Response> {
    return await app.request(path, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, env);
}

async function adminPatch(path: string, cookie: string, body: unknown): Promise<Response> {
    return await app.request(path, { method: 'PATCH', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, env);
}

async function json<T>(response: Response): Promise<T> {
    return (await response.json()) as T;
}

type PaymentRow = { status: string; payment_status: string; paid_amount: number | null; paid_at: string | null };

async function paymentOf(id: number): Promise<PaymentRow> {
    const row = await env.DB.prepare('SELECT status, payment_status, paid_amount, paid_at FROM requests WHERE id = ?1').bind(id).first<PaymentRow>();
    return row!;
}

/** A confirmed one-night direct hotel booking `days` ahead, with the agreed total the venue typed (null: none). */
async function confirmedStay(cookie: string, days: number, total: number | null): Promise<number> {
    const stay = hotelBody({ check_in: daysAhead(days), check_out: daysAhead(days + 1) });
    const created = await adminPost('/api/admin/bookings', cookie, total === null ? stay : { ...stay, total });
    expect(created.status).toBe(201);
    return (await json<{ id: number }>(created)).id;
}

describe('hotel payments', () => {
    it('records a deposit below the total, then the full payment, and refuses to go back', async () => {
        const cookie = await adminCookie();
        const id = await confirmedStay(cookie, 300, 200);
        expect((await paymentOf(id)).payment_status).toBe('none');

        const deposit = await adminPost(`/api/admin/requests/${id}/deposit`, cookie, { amount: 50 });
        expect(deposit.status).toBe(200);
        const answer = await json<{ payment_status: string; item: { payment_status: string; paid_amount: number; guest_token?: string } }>(deposit);
        expect(answer.payment_status).toBe('deposit');
        expect(answer.item.paid_amount).toBe(50);
        expect(answer.item.guest_token).toBeUndefined();
        const afterDeposit = await paymentOf(id);
        expect(afterDeposit).toMatchObject({ status: 'approved', payment_status: 'deposit', paid_amount: 50 });
        expect(afterDeposit.paid_at).not.toBeNull();

        // A second deposit is refused: the balance closes the payment.
        const again = await adminPost(`/api/admin/requests/${id}/deposit`, cookie, { amount: 20 });
        expect(again.status).toBe(409);
        expect((await json<{ error: string }>(again)).error).toBe('deposit_recorded');

        const paid = await adminPost(`/api/admin/requests/${id}/paid`, cookie);
        expect(paid.status).toBe(200);
        expect(await paymentOf(id)).toMatchObject({ status: 'approved', payment_status: 'paid', paid_amount: 200 });

        // Paid is final.
        const paidAgain = await adminPost(`/api/admin/requests/${id}/paid`, cookie);
        expect(paidAgain.status).toBe(409);
        expect((await json<{ error: string }>(paidAgain)).error).toBe('already_paid');
        const lateDeposit = await adminPost(`/api/admin/requests/${id}/deposit`, cookie, { amount: 10 });
        expect(lateDeposit.status).toBe(409);
        expect((await json<{ error: string }>(lateDeposit)).error).toBe('already_paid');
    });

    it('validates the deposit amount: positive, below the total, and only with a total', async () => {
        const cookie = await adminCookie();
        const id = await confirmedStay(cookie, 310, 200);
        for (const amount of [0, -5, 'cinquanta', null, undefined]) {
            const response = await adminPost(`/api/admin/requests/${id}/deposit`, cookie, { amount });
            expect(response.status).toBe(400);
            expect((await json<{ error: string }>(response)).error).toBe('invalid_amount');
        }
        for (const amount of [200, 250]) {
            const response = await adminPost(`/api/admin/requests/${id}/deposit`, cookie, { amount });
            expect(response.status).toBe(400);
            expect((await json<{ error: string }>(response)).error).toBe('deposit_not_partial');
        }
        expect((await paymentOf(id)).payment_status).toBe('none');

        // No price configured for the room and no total typed: no deposit, but "paid" still works.
        const unpriced = await confirmedStay(cookie, 312, null);
        const noTotal = await adminPost(`/api/admin/requests/${unpriced}/deposit`, cookie, { amount: 50 });
        expect(noTotal.status).toBe(409);
        expect((await json<{ error: string }>(noTotal)).error).toBe('no_total');
        expect((await adminPost(`/api/admin/requests/${unpriced}/paid`, cookie)).status).toBe(200);
        expect(await paymentOf(unpriced)).toMatchObject({ payment_status: 'paid', paid_amount: null });
    });

    it('accepts payments on confirmed hotel stays only', async () => {
        const cookie = await adminCookie();
        const pending = (await json<{ id: number }>(await postJson('/api/requests', hotelBody({ check_in: daysAhead(320), check_out: daysAhead(321) }), undefined, '10.0.7.20'))).id;
        const notApproved = await adminPost(`/api/admin/requests/${pending}/paid`, cookie);
        expect(notApproved.status).toBe(409);
        expect((await json<{ error: string }>(notApproved)).error).toBe('not_approved');
        await setStatus(pending, 'cancelled');
        expect((await json<{ error: string }>(await adminPost(`/api/admin/requests/${pending}/deposit`, cookie, { amount: 10 }))).error).toBe('not_approved');

        const seating = (await json<{ id: number }>(await postJson('/api/requests', restaurantBody({ date: daysAhead(5) }), envOfType('restaurant'), '10.0.7.21'))).id;
        await setStatus(seating, 'approved');
        const notHotel = await adminPost(`/api/admin/requests/${seating}/paid`, cookie);
        expect(notHotel.status).toBe(409);
        expect((await json<{ error: string }>(notHotel)).error).toBe('not_hotel');

        expect((await adminPost('/api/admin/requests/999999/paid', cookie)).status).toBe(404);
    });

    it('lets the payment state follow the total when a paid or deposit stay is edited', async () => {
        const cookie = await adminCookie();
        const stay = hotelBody({ check_in: daysAhead(340), check_out: daysAhead(341) });
        const id = (await json<{ id: number }>(await adminPost('/api/admin/bookings', cookie, { ...stay, total: 200 }))).id;
        expect((await adminPost(`/api/admin/requests/${id}/paid`, cookie)).status).toBe(200);
        const edit = (body: Record<string, unknown>) => adminPatch(`/api/admin/requests/${id}`, cookie, { ...stay, notify: false, ...body });

        // A change that keeps the total leaves the payment alone.
        expect((await json<{ changed: string[] }>(await edit({ total: 200, notes: 'Culla in camera' }))).changed).toEqual(['notes']);
        expect(await paymentOf(id)).toMatchObject({ payment_status: 'paid', paid_amount: 200 });

        // A longer stay costs more: what was paid becomes a deposit, the difference is due.
        const longer = await json<{ changed: string[]; item: { payment_status: string; paid_amount: number; quoted_total: number } }>(await edit({ check_out: daysAhead(342), total: 300 }));
        expect(longer.changed).toContain('payment_status');
        expect(longer.item).toMatchObject({ payment_status: 'deposit', paid_amount: 200, quoted_total: 300 });
        // Settling the difference closes the payment at the new total.
        expect((await adminPost(`/api/admin/requests/${id}/paid`, cookie)).status).toBe(200);
        expect(await paymentOf(id)).toMatchObject({ payment_status: 'paid', paid_amount: 300 });

        // A shorter stay costs less than what was paid: still paid, the amount kept as it is (the refund is shown by the dashboard).
        const shorter = await json<{ changed: string[]; item: { payment_status: string; paid_amount: number; quoted_total: number } }>(await edit({ check_out: daysAhead(341), total: 150 }));
        expect(shorter.changed).not.toContain('payment_status');
        expect(shorter.item).toMatchObject({ payment_status: 'paid', paid_amount: 300, quoted_total: 150 });

        // A deposit that now covers the whole total counts as paid in full.
        const other = hotelBody({ check_in: daysAhead(345), check_out: daysAhead(346) });
        const withDeposit = (await json<{ id: number }>(await adminPost('/api/admin/bookings', cookie, { ...other, total: 200 }))).id;
        expect((await adminPost(`/api/admin/requests/${withDeposit}/deposit`, cookie, { amount: 50 })).status).toBe(200);
        const cheaper = await json<{ item: { payment_status: string; paid_amount: number } }>(await adminPatch(`/api/admin/requests/${withDeposit}`, cookie, { ...other, notify: false, total: 50 }));
        expect(cheaper.item).toMatchObject({ payment_status: 'paid', paid_amount: 50 });
        // And a deposit stays a deposit while more is due.
        const dearer = await json<{ item: { payment_status: string; paid_amount: number } }>(await adminPatch(`/api/admin/requests/${withDeposit}`, cookie, { ...other, notify: false, total: 250 }));
        expect(dearer.item).toMatchObject({ payment_status: 'deposit', paid_amount: 50 });
    });

    it('keeps a paid stay in the calendar and still lets the venue cancel it', async () => {
        const cookie = await adminCookie();
        const checkIn = daysAhead(330);
        const id = await confirmedStay(cookie, 330, 150);
        expect((await adminPost(`/api/admin/requests/${id}/paid`, cookie)).status).toBe(200);
        const calendar = await json<{ items: { id: number; payment_status: string }[] }>(await app.request(`/api/admin/calendar?view=day&date=${checkIn}`, { headers: { Cookie: cookie } }, env));
        expect(calendar.items.find((item) => item.id === id)?.payment_status).toBe('paid');
        expect((await adminPost(`/api/admin/requests/${id}/cancel`, cookie)).status).toBe(200);
        expect(await paymentOf(id)).toMatchObject({ status: 'cancelled', payment_status: 'paid' });
    });
});
