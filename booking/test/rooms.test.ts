import { describe, expect, it } from 'vitest';
import { roomAvailability } from '../src/rooms';
import { adminCall, adminCookie, daysAhead, dbOf, HOTEL, hotelBody, postJson, ROOM_A, ROOM_B, ROOM_C, ROOM_LARGEST, setStatus } from './helpers';

type RoomRow = { id: number; name: string; max_guests: number; quantity: number; price_per_night: number | null };

async function json<T>(response: Response): Promise<T> {
    return (await response.json()) as T;
}

async function listRooms(cookie: string): Promise<RoomRow[]> {
    return (await json<{ rooms: RoomRow[] }>(await adminCall('GET', '/api/admin/rooms', cookie))).rooms;
}

describe('room types administration', () => {
    it('seeds the former rooms.csv types of the instance, distinct and without a base price', async () => {
        const cookie = await adminCookie();
        const rooms = await listRooms(cookie);
        // Every instance seeds its own types (migration 0004): the suite only relies on their shape.
        expect(rooms.length).toBeGreaterThanOrEqual(3);
        expect(new Set(rooms.map((room) => room.name)).size).toBe(rooms.length);
        for (const room of rooms) expect(room.price_per_night).toBeNull();
    });

    it('creates a type with every field validated, the price included', async () => {
        const cookie = await adminCookie();
        const valid = { name: 'Attico', max_guests: 2, quantity: 1, price_per_night: 250 };
        for (const broken of [{ name: '' }, { name: 'x'.repeat(61) }, { max_guests: 0 }, { max_guests: 21 }, { quantity: 0 }, { quantity: 1000 }, { price_per_night: undefined }, { price_per_night: -1 }, { price_per_night: 10.005 }, { max_guests: '2' }]) {
            const response = await adminCall('POST', '/api/admin/rooms', cookie, { ...valid, ...broken });
            expect(response.status, JSON.stringify(broken)).toBe(400);
        }
        const created = await adminCall('POST', '/api/admin/rooms', cookie, valid);
        expect(created.status).toBe(201);
        // Names are the key the bookings use: no duplicates, spaces trimmed.
        const duplicate = await adminCall('POST', '/api/admin/rooms', cookie, { ...valid, name: ' Attico ' });
        expect(duplicate.status).toBe(409);
        expect((await json<{ error: string }>(duplicate)).error).toBe('room_exists');
        const rooms = await listRooms(cookie);
        expect(rooms.find((room) => room.name === 'Attico')).toMatchObject({ max_guests: 2, quantity: 1, price_per_night: 250 });
        // The new type is priced on the public side straight away.
        const quote = await json<{ priced: boolean; total: number }>(await adminCall('GET', `/api/quote?room_type=Attico&check_in=${daysAhead(300)}&check_out=${daysAhead(302)}`, cookie));
        expect(quote).toMatchObject({ priced: true, total: 500 });
    });

    it('renames a type together with its bookings and rate periods', async () => {
        const cookie = await adminCookie();
        const booking = await postJson('/api/requests', hotelBody({ room_type: ROOM_C.name, check_in: daysAhead(310), check_out: daysAhead(312) }), undefined, '198.51.100.21');
        expect(booking.status).toBe(201);
        const bookingId = (await json<{ id: number }>(booking)).id;
        expect((await adminCall('POST', '/api/admin/pricing/periods', cookie, { room_type: ROOM_C.name, date_from: daysAhead(310), date_to: daysAhead(320), price_per_night: 99 })).status).toBe(201);

        expect((await adminCall('PATCH', `/api/admin/rooms/${ROOM_C.id}`, cookie, { name: ROOM_A.name, price_per_night: 50 })).status).toBe(409);
        const renamed = await adminCall('PATCH', `/api/admin/rooms/${ROOM_C.id}`, cookie, { name: 'Tripla vista mare', price_per_night: 50 });
        expect(renamed.status).toBe(200);
        expect((await json<{ overbooked: number }>(renamed)).overbooked).toBe(0);

        const row = await dbOf(HOTEL).prepare('SELECT room_type FROM requests WHERE id = ?1').bind(bookingId).first<{ room_type: string }>();
        expect(row!.room_type).toBe('Tripla vista mare');
        const period = await dbOf(HOTEL).prepare('SELECT room_type FROM rate_periods WHERE room_type = ?1').bind('Tripla vista mare').first();
        expect(period).not.toBeNull();
        // Fields left out of the PATCH keep their value.
        const room = (await listRooms(cookie)).find((candidate) => candidate.id === ROOM_C.id)!;
        expect(room).toMatchObject({ name: 'Tripla vista mare', max_guests: ROOM_C.max_guests, quantity: ROOM_C.quantity, price_per_night: 50 });
        // The old name is no longer bookable, the new one is.
        expect((await postJson('/api/requests', hotelBody({ room_type: ROOM_C.name, check_in: daysAhead(330), check_out: daysAhead(331) }), undefined, '198.51.100.22')).status).toBe(400);
        expect((await postJson('/api/requests', hotelBody({ room_type: 'Tripla vista mare', check_in: daysAhead(330), check_out: daysAhead(331) }), undefined, '198.51.100.23')).status).toBe(201);
    });

    it('warns when the quantity drops below the approved future bookings', async () => {
        const cookie = await adminCookie();
        // Two approved stays sharing a night, then the type is cut to one room.
        const first = await postJson('/api/requests', hotelBody({ room_type: ROOM_B.name, check_in: daysAhead(340), check_out: daysAhead(342) }), undefined, '198.51.100.31');
        const second = await postJson('/api/requests', hotelBody({ room_type: ROOM_B.name, check_in: daysAhead(341), check_out: daysAhead(343) }), undefined, '198.51.100.32');
        await setStatus((await json<{ id: number }>(first)).id, 'approved');
        await setStatus((await json<{ id: number }>(second)).id, 'approved');
        const shrunk = await adminCall('PATCH', `/api/admin/rooms/${ROOM_B.id}`, cookie, { quantity: 1, price_per_night: 80 });
        expect(shrunk.status).toBe(200);
        expect((await json<{ overbooked: number }>(shrunk)).overbooked).toBe(1);
        const grown = await adminCall('PATCH', `/api/admin/rooms/${ROOM_B.id}`, cookie, { quantity: 2 });
        expect((await json<{ overbooked: number }>(grown)).overbooked).toBe(0);
    });

    it('refuses to delete a type with a future booking, deletes it with its periods otherwise', async () => {
        const cookie = await adminCookie();
        const booking = await postJson('/api/requests', hotelBody({ room_type: ROOM_A.name, check_in: daysAhead(350), check_out: daysAhead(352) }), undefined, '198.51.100.41');
        const bookingId = (await json<{ id: number }>(booking)).id;
        // A pending booking is enough to block the deletion.
        const blocked = await adminCall('DELETE', `/api/admin/rooms/${ROOM_A.id}`, cookie);
        expect(blocked.status).toBe(409);
        expect(await json<{ error: string; bookings: number }>(blocked)).toEqual({ error: 'room_in_use', bookings: 1 });
        // Once cancelled, the booking no longer counts; the past ones never did.
        await setStatus(bookingId, 'cancelled');
        await dbOf(HOTEL).prepare("INSERT INTO requests (type, first_name, last_name, email, phone, check_in, check_out, adults, children, room_type, guest_token, status) VALUES ('hotel', 'Old', 'Guest', 'old@example.com', '3331234567', '2020-01-01', '2020-01-03', 1, 0, ?1, ?2, 'approved')").bind(ROOM_A.name, 'b'.repeat(32)).run();
        expect((await adminCall('POST', '/api/admin/pricing/periods', cookie, { room_type: ROOM_A.name, date_from: daysAhead(350), date_to: daysAhead(351), price_per_night: 99 })).status).toBe(201);

        const deleted = await adminCall('DELETE', `/api/admin/rooms/${ROOM_A.id}`, cookie);
        expect(deleted.status).toBe(200);
        expect((await listRooms(cookie)).find((room) => room.id === ROOM_A.id)).toBeUndefined();
        const periods = await dbOf(HOTEL).prepare('SELECT COUNT(*) AS n FROM rate_periods WHERE room_type = ?1').bind(ROOM_A.name).first<{ n: number }>();
        expect(periods!.n).toBe(0);
        // The old booking keeps the name of the type it was in.
        const old = await dbOf(HOTEL).prepare("SELECT room_type FROM requests WHERE guest_token = ?1").bind('b'.repeat(32)).first<{ room_type: string }>();
        expect(old!.room_type).toBe(ROOM_A.name);
        expect((await adminCall('DELETE', `/api/admin/rooms/${ROOM_A.id}`, cookie)).status).toBe(404);
    });
});

describe('roomAvailability', () => {
    it('counts only approved overlapping stays, check-out day excluded', async () => {
        // Days 200..204 ahead: first stay 200→202, second 201→203 (they share night 201).
        const day = (offset: number): string => daysAhead(200 + offset);
        // The type with the most rooms, so the counts below stay above zero.
        const room = ROOM_LARGEST.name;
        const first = await postJson('/api/requests', hotelBody({ room_type: room, check_in: day(0), check_out: day(2), email: 'a@example.com' }), undefined, '198.51.100.1');
        const second = await postJson('/api/requests', hotelBody({ room_type: room, check_in: day(1), check_out: day(3), email: 'b@example.com' }), undefined, '198.51.100.2');
        expect(first.status).toBe(201);
        expect(second.status).toBe(201);
        const firstId = ((await first.json()) as { id: number }).id;
        const secondId = ((await second.json()) as { id: number }).id;
        const roomFor = async (checkIn: string, checkOut: string, exclude = 0) => (await roomAvailability(dbOf(HOTEL), checkIn, checkOut, exclude)).find((candidate) => candidate.name === room)!;
        // Availability never goes below zero.
        const left = (booked: number): number => Math.max(0, ROOM_LARGEST.quantity - booked);

        // Pending requests do not take rooms.
        let availability = await roomFor(day(0), day(3));
        expect(availability.available).toBe(left(0));

        await setStatus(firstId, 'approved');
        await setStatus(secondId, 'approved');
        availability = await roomFor(day(1), day(2));
        expect(availability.available).toBe(left(2));

        // A stay starting on the check-out day of the first booking does not overlap it.
        availability = await roomFor(day(2), day(4));
        expect(availability.available).toBe(left(1));

        // Excluding one request leaves it out of the count.
        availability = await roomFor(day(1), day(2), firstId);
        expect(availability.available).toBe(left(1));
    });
});
