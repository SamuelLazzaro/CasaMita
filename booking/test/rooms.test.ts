import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { parseRooms, roomAvailability, roomTypes } from '../src/rooms';
import { daysAhead, hotelBody, postJson, setStatus } from './helpers';

describe('parseRooms', () => {
    it('parses the semicolon-separated file with its header', () => {
        const rooms = parseRooms('name;max_guests;quantity\nSingola;1;4\nDoppia;2;10\n');
        expect(rooms).toEqual([{ name: 'Singola', max_guests: 1, quantity: 4 }, { name: 'Doppia', max_guests: 2, quantity: 10 }]);
    });

    it('accepts Windows line endings and surrounding spaces', () => {
        const rooms = parseRooms('name; max_guests ;quantity\r\n Suite ; 4 ; 2 \r\n');
        expect(rooms).toEqual([{ name: 'Suite', max_guests: 4, quantity: 2 }]);
    });

    it('rejects a wrong header', () => {
        expect(() => parseRooms('nome;posti;quantita\nSingola;1;4')).toThrow(/header/);
    });

    it('rejects malformed numbers, duplicates and missing columns', () => {
        expect(() => parseRooms('name;max_guests;quantity\nSingola;uno;4')).toThrow(/line 2/);
        expect(() => parseRooms('name;max_guests;quantity\nSingola;1;0')).toThrow(/quantity/);
        expect(() => parseRooms('name;max_guests;quantity\nSingola;1;4\nSingola;2;1')).toThrow(/duplicate/);
        expect(() => parseRooms('name;max_guests;quantity\nSingola;1')).toThrow(/columns/);
    });

    it('loads the bundled rooms.csv', () => {
        expect(roomTypes().map((room) => room.name)).toContain('Camera doppia');
    });
});

describe('roomAvailability', () => {
    it('counts only approved overlapping stays, check-out day excluded', async () => {
        // Days 200..204 ahead: first stay 200→202, second 201→203 (they share night 201).
        const day = (offset: number): string => daysAhead(200 + offset);
        const first = await postJson('/api/requests', hotelBody({ room_type: 'Suite familiare', check_in: day(0), check_out: day(2), email: 'a@example.com' }), undefined, '198.51.100.1');
        const second = await postJson('/api/requests', hotelBody({ room_type: 'Suite familiare', check_in: day(1), check_out: day(3), email: 'b@example.com' }), undefined, '198.51.100.2');
        expect(first.status).toBe(201);
        expect(second.status).toBe(201);
        const firstId = ((await first.json()) as { id: number }).id;
        const secondId = ((await second.json()) as { id: number }).id;
        const suiteFor = async (checkIn: string, checkOut: string, exclude = 0) => (await roomAvailability(env.DB, checkIn, checkOut, exclude)).find((room) => room.name === 'Suite familiare')!;

        // Pending requests do not take rooms.
        let suite = await suiteFor(day(0), day(3));
        expect(suite.available).toBe(suite.quantity);

        await setStatus(firstId, 'approved');
        await setStatus(secondId, 'approved');
        suite = await suiteFor(day(1), day(2));
        expect(suite.available).toBe(suite.quantity - 2);

        // A stay starting on the check-out day of the first booking does not overlap it.
        suite = await suiteFor(day(2), day(4));
        expect(suite.available).toBe(suite.quantity - 1);

        // Excluding one request leaves it out of the count.
        suite = await suiteFor(day(1), day(2), firstId);
        expect(suite.available).toBe(suite.quantity - 1);
    });
});
