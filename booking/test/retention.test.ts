import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { venueConfigOf, type VenueSettings } from '../src/config';
import { runRetention } from '../src/index';
import { anonymiseExpiredRequests, purgeSecurityTables } from '../src/retention';
import { adminBody, guestBody, venueLegalOf, type Notification } from '../src/notifications';
import { requestDetails } from '../src/texts';
import { daysAhead, dbOf, HOTEL, RESTAURANT } from './helpers';

async function insertHotel(checkOut: string, token: string, db: D1Database = dbOf(HOTEL)): Promise<number> {
    const result = await db.prepare("INSERT INTO requests (type, first_name, last_name, email, phone, notes, check_in, check_out, adults, children, room_type, guest_token, status) VALUES ('hotel', 'Mario', 'Verdi', 'mario@example.com', '3331234567', 'note', '2020-01-01', ?1, 1, 0, 'Camera singola', ?2, 'approved')").bind(checkOut, token).run();
    return result.meta.last_row_id;
}

/** Settings of a hotel venue with the given retention. */
function hotelSettings(retentionDays: number): VenueSettings {
    return { type: 'hotel', name: 'Hotel Test', default_lang: 'it', facility_open: null, facility_close: null, lunch_open: null, lunch_close: null, dinner_open: null, dinner_close: null, retention_days: retentionDays, accent: null };
}

describe('anonymiseExpiredRequests', () => {
    it('empties the guest fields of bookings ended beyond the retention and keeps the rest', async () => {
        const config = venueConfigOf(hotelSettings(90));
        const oldId = await insertHotel(daysAhead(-91), 'b'.repeat(32));
        const recentId = await insertHotel(daysAhead(-10), 'c'.repeat(32));

        const count = await anonymiseExpiredRequests(dbOf(HOTEL), config, new Date());
        expect(count).toBeGreaterThanOrEqual(1);

        const old = await dbOf(HOTEL).prepare('SELECT first_name, email, notes, guest_token, room_type, anonymised_at FROM requests WHERE id = ?1').bind(oldId).first<Record<string, unknown>>();
        expect(old!.first_name).toBeNull();
        expect(old!.email).toBeNull();
        expect(old!.notes).toBeNull();
        expect(old!.guest_token).toBeNull();
        expect(old!.room_type).toBe('Camera singola');
        expect(old!.anonymised_at).not.toBeNull();

        const recent = await dbOf(HOTEL).prepare('SELECT first_name, anonymised_at FROM requests WHERE id = ?1').bind(recentId).first<Record<string, unknown>>();
        expect(recent!.first_name).toBe('Mario');
        expect(recent!.anonymised_at).toBeNull();
    });

    it('does nothing when retention is disabled', async () => {
        const config = venueConfigOf(hotelSettings(0));
        await insertHotel(daysAhead(-400), 'd'.repeat(32));
        expect(await anonymiseExpiredRequests(dbOf(HOTEL), config, new Date())).toBe(0);
    });
});

describe('runRetention', () => {
    it('runs the job on every active venue, each in its own database', async () => {
        const hotelId = await insertHotel(daysAhead(-200), 'e'.repeat(32), dbOf(HOTEL));
        const restaurantId = await insertHotel(daysAhead(-200), 'e'.repeat(32), dbOf(RESTAURANT));
        await runRetention(env, new Date());
        const hotelRow = await dbOf(HOTEL).prepare('SELECT anonymised_at FROM requests WHERE id = ?1').bind(hotelId).first<{ anonymised_at: string | null }>();
        const restaurantRow = await dbOf(RESTAURANT).prepare('SELECT anonymised_at FROM requests WHERE id = ?1').bind(restaurantId).first<{ anonymised_at: string | null }>();
        expect(hotelRow!.anonymised_at).not.toBeNull();
        expect(restaurantRow!.anonymised_at).not.toBeNull();
    });
});

describe('purgeSecurityTables', () => {
    it('drops the expired rate-limit counters and the old audit entries, keeps the recent ones', async () => {
        const directory = env.DIRECTORY;
        await directory.prepare("INSERT OR REPLACE INTO rate_limit (key, counter, window_start) VALUES ('login:198.51.100.1', 3, datetime('now', '-2 days')), ('login:198.51.100.2', 1, datetime('now'))").run();
        await directory.prepare("INSERT INTO audit_log (action, details, actor, created_at) VALUES ('login_failed', 'wrong password from 198.51.100.1', 'user:1', datetime('now', '-400 days')), ('login', 'from 198.51.100.2', 'user:1', datetime('now'))").run();

        const removed = await purgeSecurityTables(directory);
        expect(removed.counters).toBeGreaterThanOrEqual(1);
        expect(removed.audit).toBeGreaterThanOrEqual(1);

        const keys = (await directory.prepare("SELECT key FROM rate_limit WHERE key LIKE 'login:198.51.100.%' ORDER BY key").all<{ key: string }>()).results.map((row) => row.key);
        expect(keys).toEqual(['login:198.51.100.2']);
        const details = (await directory.prepare("SELECT details FROM audit_log WHERE details LIKE '%198.51.100.%' ORDER BY id").all<{ details: string }>()).results.map((row) => row.details);
        expect(details).toEqual(['from 198.51.100.2']);
    });

    it('is part of the daily job, on the venues too', async () => {
        await dbOf(HOTEL).prepare("INSERT OR REPLACE INTO rate_limit (key, counter, window_start) VALUES ('submit:198.51.100.9', 5, datetime('now', '-2 days'))").run();
        await runRetention(env, new Date());
        const row = await dbOf(HOTEL).prepare("SELECT key FROM rate_limit WHERE key = 'submit:198.51.100.9'").first();
        expect(row).toBeNull();
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

    it('builds the guest and owner texts in the requested language, with the links of the venue', () => {
        const notification: Notification = { lang: 'en', recipient: { name: 'Anna Rossi', email: 'anna@example.com' }, subject: 'Booking request received', message: 'we have received your booking request.', adminMessage: 'Anna Rossi sent a booking request.', details: ['Check-in: 2026-12-24'] };
        const guest = guestBody(notification, 'https://book.example.com/hotel-test', 'Hotel Demo');
        expect(guest).toContain('Dear Anna Rossi,');
        expect(guest).toContain('  Check-in: 2026-12-24');
        expect(guest).toContain('https://book.example.com/hotel-test/privacy');
        const owner = adminBody(notification, 'https://book.example.com/hotel-test', 'Hotel Demo');
        expect(owner.startsWith('Anna Rossi sent a booking request.')).toBe(true);
        expect(owner).toContain('Replying to this email writes directly to the guest.');
    });

    it('names the venue and links its booking conditions in the guest emails (Codice del consumo, art. 51.7)', () => {
        const notification: Notification = { lang: 'it', recipient: { name: 'Anna Rossi', email: 'anna@example.com' }, subject: 'Prenotazione confermata', message: 'confermata.', details: [] };
        const base = 'https://book.example.com/hotel-test';
        const full = venueLegalOf({ privacy_controller: 'Hotel Test S.r.l.', privacy_address: 'Via Roma 1, Milano', phone: '+39 02 1234567', vat_number: 'IT01234567890', conditions_url: null }, base);
        expect(full.identity).toBe('Hotel Test S.r.l., Via Roma 1, Milano, tel. +39 02 1234567, P.IVA IT01234567890');
        expect(full.conditionsUrl).toBe('https://book.example.com/hotel-test/conditions');
        const body = guestBody(notification, base, 'Hotel Test', full);
        expect(body).toContain('Hotel Test S.r.l., Via Roma 1, Milano, tel. +39 02 1234567, P.IVA IT01234567890');
        expect(body).toContain('Condizioni di prenotazione: https://book.example.com/hotel-test/conditions');
        // The venue's own page wins when configured; an empty identity adds no line.
        const external = venueLegalOf({ privacy_controller: null, privacy_address: null, phone: null, vat_number: null, conditions_url: 'https://www.hotel-test.example/condizioni' }, base);
        expect(external.identity).toBe('');
        expect(guestBody(notification, base, 'Hotel Test', external)).toContain('Condizioni di prenotazione: https://www.hotel-test.example/condizioni');
    });
});
