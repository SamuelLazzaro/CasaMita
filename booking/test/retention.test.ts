import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { venueConfig } from '../src/config';
import { anonymiseExpiredRequests } from '../src/retention';
import { adminBody, guestBody, type Notification } from '../src/notifications';
import { requestDetails } from '../src/texts';
import { daysAhead } from './helpers';

async function insertHotel(checkOut: string, token: string): Promise<number> {
    const result = await env.DB.prepare("INSERT INTO requests (type, first_name, last_name, email, phone, notes, check_in, check_out, adults, children, room_type, guest_token, status) VALUES ('hotel', 'Mario', 'Verdi', 'mario@example.com', '3331234567', 'note', '2020-01-01', ?1, 1, 0, 'Camera singola', ?2, 'approved')").bind(checkOut, token).run();
    return result.meta.last_row_id;
}

describe('anonymiseExpiredRequests', () => {
    it('empties the guest fields of bookings ended beyond the retention and keeps the rest', async () => {
        const config = venueConfig({ ...env, RETENTION_DAYS: '90' });
        const oldId = await insertHotel(daysAhead(-91), 'b'.repeat(32));
        const recentId = await insertHotel(daysAhead(-10), 'c'.repeat(32));

        const count = await anonymiseExpiredRequests(env.DB, config, new Date());
        expect(count).toBeGreaterThanOrEqual(1);

        const old = await env.DB.prepare('SELECT first_name, email, notes, guest_token, room_type, anonymised_at FROM requests WHERE id = ?1').bind(oldId).first<Record<string, unknown>>();
        expect(old!.first_name).toBeNull();
        expect(old!.email).toBeNull();
        expect(old!.notes).toBeNull();
        expect(old!.guest_token).toBeNull();
        expect(old!.room_type).toBe('Camera singola');
        expect(old!.anonymised_at).not.toBeNull();

        const recent = await env.DB.prepare('SELECT first_name, anonymised_at FROM requests WHERE id = ?1').bind(recentId).first<Record<string, unknown>>();
        expect(recent!.first_name).toBe('Mario');
        expect(recent!.anonymised_at).toBeNull();
    });

    it('does nothing when retention is disabled', async () => {
        const config = venueConfig({ ...env, RETENTION_DAYS: '0' });
        await insertHotel(daysAhead(-400), 'd'.repeat(32));
        expect(await anonymiseExpiredRequests(env.DB, config, new Date())).toBe(0);
    });
});

describe('email bodies', () => {
    it('quotes multi-line notes so they cannot forge detail rows', () => {
        const details = requestDetails({ type: 'restaurant', check_in: null, check_out: null, adults: null, children: null, room_type: null, date: '2026-12-24', start_time: '20:00', end_time: null, party_size: 2, notes: 'prima riga\nStato: confermata' }, 'it', true);
        expect(details).toContain('Data: 24/12/2026');
        expect(details).toContain('> prima riga');
        expect(details).toContain('> Stato: confermata');
        expect(details).not.toContain('Stato: confermata');
    });

    it('builds the guest and owner texts in the requested language', () => {
        const notification: Notification = { lang: 'en', recipient: { name: 'Anna Rossi', email: 'anna@example.com' }, subject: 'Booking request received', message: 'we have received your booking request.', adminMessage: 'Anna Rossi sent a booking request.', details: ['Check-in: 2026-12-24'] };
        const guest = guestBody(notification, 'https://book.example.com', 'Hotel Demo');
        expect(guest).toContain('Dear Anna Rossi,');
        expect(guest).toContain('  Check-in: 2026-12-24');
        expect(guest).toContain('https://book.example.com/privacy.html');
        const owner = adminBody(notification, 'https://book.example.com', 'Hotel Demo');
        expect(owner.startsWith('Anna Rossi sent a booking request.')).toBe(true);
        expect(owner).toContain('Replying to this email writes directly to the guest.');
    });
});
