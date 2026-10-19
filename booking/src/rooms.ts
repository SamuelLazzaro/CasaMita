import roomsCsv from '../rooms.csv';

/**
 * Hotel room types, read from rooms.csv (bundled at build time, see the
 * "rules" key of wrangler.jsonc). The file is the single source of truth: no
 * rooms table in D1, the admin "Rooms" section shows it read-only.
 *
 * Format: semicolon-separated, header line `name;max_guests;quantity`, one
 * line per room type. A malformed file throws at the first use, so a broken
 * deployment fails loudly instead of accepting bookings for rooms that do not
 * exist.
 *
 * Availability rule (owner's decision): a room type is taken ONLY by approved
 * bookings. Two stays overlap when one starts before the other ends:
 * check_in < other.check_out AND check_out > other.check_in, with check_out
 * excluded (a guest leaving on the 10th and one arriving on the 10th share
 * no night). Available = quantity − overlapping approved bookings.
 */

export type RoomType = { name: string; max_guests: number; quantity: number };
export type RoomAvailability = RoomType & { available: number };

const SEPARATOR = ';';
const HEADER = ['name', 'max_guests', 'quantity'];
const MAX_NAME_LENGTH = 60;

/** Parses the CSV text; throws an Error describing the first malformed line. */
export function parseRooms(csv: string): RoomType[] {
    const lines = csv.replace(/\r\n?/g, '\n').split('\n').map((line) => line.trim()).filter((line) => line !== '');
    if (lines.length < 2) throw new Error('rooms.csv: header plus at least one room type expected');
    const header = lines[0].split(SEPARATOR).map((cell) => cell.trim().toLowerCase());
    if (header.join(',') !== HEADER.join(',')) throw new Error(`rooms.csv: header must be "${HEADER.join(SEPARATOR)}"`);

    const rooms: RoomType[] = [];
    const seen = new Set<string>();
    for (const [index, line] of lines.slice(1).entries()) {
        const lineNumber = index + 2;
        const cells = line.split(SEPARATOR).map((cell) => cell.trim());
        if (cells.length !== HEADER.length) throw new Error(`rooms.csv line ${lineNumber}: ${HEADER.length} columns expected`);
        const [name, maxGuestsText, quantityText] = cells;
        if (name === '' || name.length > MAX_NAME_LENGTH) throw new Error(`rooms.csv line ${lineNumber}: invalid name`);
        if (seen.has(name)) throw new Error(`rooms.csv line ${lineNumber}: duplicate room type "${name}"`);
        const maxGuests = Number(maxGuestsText);
        const quantity = Number(quantityText);
        if (!Number.isInteger(maxGuests) || maxGuests < 1 || maxGuests > 20) throw new Error(`rooms.csv line ${lineNumber}: max_guests must be an integer between 1 and 20`);
        if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) throw new Error(`rooms.csv line ${lineNumber}: quantity must be an integer between 1 and 999`);
        seen.add(name);
        rooms.push({ name, max_guests: maxGuests, quantity });
    }
    return rooms;
}

let g_rooms: RoomType[] | null = null;

/** Room types of this deployment, parsed once per isolate. */
export function roomTypes(): RoomType[] {
    if (g_rooms === null) g_rooms = parseRooms(roomsCsv);
    return g_rooms;
}

export function roomTypeByName(name: string): RoomType | undefined {
    return roomTypes().find((room) => room.name === name);
}

/**
 * Rooms left per type for the stay [checkIn, checkOut): one aggregate query
 * over the approved hotel bookings that overlap the range. `excludeRequestId`
 * leaves one booking out of the count (used when approving that very one).
 */
export async function roomAvailability(db: D1Database, checkIn: string, checkOut: string, excludeRequestId = 0): Promise<RoomAvailability[]> {
    const { results } = await db
        .prepare(
            `SELECT room_type, COUNT(*) AS booked FROM requests
             WHERE type = 'hotel' AND status = 'approved' AND id != ?3
               AND check_in < ?2 AND check_out > ?1
             GROUP BY room_type`,
        )
        .bind(checkIn, checkOut, excludeRequestId)
        .all<{ room_type: string; booked: number }>();
    const bookedByType = new Map(results.map((row) => [row.room_type, row.booked]));
    return roomTypes().map((room) => ({ ...room, available: Math.max(0, room.quantity - (bookedByType.get(room.name) ?? 0)) }));
}
