import { integerBetween, priceValue, text } from './util';

/**
 * Hotel room types (table room_types, migration 0004), managed by the venue
 * from the "Rooms" section of the dashboard: name, maximum guests, number of
 * rooms of the type and base price per night.
 *
 * Bookings (requests.room_type) and rate periods (rate_periods.room_type)
 * reference a type BY NAME. Renaming a type therefore rewrites both in the
 * same batch, so the history stays readable; deleting a type is refused while
 * a future booking (pending or approved, not yet checked out) still names it,
 * and drops its rate periods together with it (owner's decisions).
 *
 * Availability rule (owner's decision): a room type is taken ONLY by approved
 * bookings. Two stays overlap when one starts before the other ends:
 * check_in < other.check_out AND check_out > other.check_in, with check_out
 * excluded (a guest leaving on the 10th and one arriving on the 10th share
 * no night). Available = quantity − overlapping approved bookings.
 */

export type RoomType = { id: number; name: string; max_guests: number; quantity: number; price_per_night: number | null };
export type RoomAvailability = RoomType & { available: number };
export type RoomFields = { name: string; maxGuests: number; quantity: number; price: number };

export const MAX_ROOM_NAME = 60;
export const MAX_GUESTS = 20;
export const MAX_QUANTITY = 999;

const SELECT_ROOM = 'SELECT id, name, max_guests, quantity, price_per_night FROM room_types';

/** Every room type of the venue, oldest first (the order the dashboard and the public form show). */
export async function roomTypes(db: D1Database): Promise<RoomType[]> {
    const { results } = await db.prepare(`${SELECT_ROOM} ORDER BY id`).all<RoomType>();
    return results;
}

export async function roomTypeByName(db: D1Database, name: string): Promise<RoomType | null> {
    return await db.prepare(`${SELECT_ROOM} WHERE name = ?1`).bind(name).first<RoomType>();
}

export async function roomTypeById(db: D1Database, id: number): Promise<RoomType | null> {
    return await db.prepare(`${SELECT_ROOM} WHERE id = ?1`).bind(id).first<RoomType>();
}

/** Validates the fields of a room type; returns an error code or the cleaned fields. The price is mandatory. */
export function roomFields(body: Record<string, unknown>): RoomFields | { error: string } {
    const name = text(body.name, MAX_ROOM_NAME);
    if (name === null) return { error: 'invalid_room_name' };
    const maxGuests = integerBetween(body.max_guests, 1, MAX_GUESTS);
    const quantity = integerBetween(body.quantity, 1, MAX_QUANTITY);
    if (maxGuests === null || quantity === null) return { error: 'invalid_room' };
    const price = priceValue(body.price_per_night);
    if (price === null) return { error: 'invalid_price' };
    return { name, maxGuests, quantity, price };
}

/** True when a type with this name exists (other than `excludeId`): names are the key the bookings use. */
export async function roomNameTaken(db: D1Database, name: string, excludeId = 0): Promise<boolean> {
    const row = await db.prepare('SELECT COUNT(*) AS n FROM room_types WHERE name = ?1 AND id != ?2').bind(name, excludeId).first<{ n: number }>();
    return (row?.n ?? 0) > 0;
}

export async function createRoomType(db: D1Database, fields: RoomFields): Promise<number> {
    const result = await db.prepare('INSERT INTO room_types (name, max_guests, quantity, price_per_night) VALUES (?1, ?2, ?3, ?4)').bind(fields.name, fields.maxGuests, fields.quantity, fields.price).run();
    return result.meta.last_row_id;
}

/**
 * Rewrites a room type. A new name is propagated to the bookings and rate
 * periods that reference the old one, in the same batch, so no reference is
 * ever left dangling.
 */
export async function updateRoomType(db: D1Database, existing: RoomType, fields: RoomFields): Promise<void> {
    const statements = [db.prepare("UPDATE room_types SET name = ?2, max_guests = ?3, quantity = ?4, price_per_night = ?5, updated_at = datetime('now') WHERE id = ?1").bind(existing.id, fields.name, fields.maxGuests, fields.quantity, fields.price)];
    if (fields.name !== existing.name) {
        statements.push(db.prepare("UPDATE requests SET room_type = ?2 WHERE type = 'hotel' AND room_type = ?1").bind(existing.name, fields.name));
        statements.push(db.prepare('UPDATE rate_periods SET room_type = ?2 WHERE room_type = ?1').bind(existing.name, fields.name));
    }
    await db.batch(statements);
}

/** Bookings of the type still to come: pending or approved, not yet checked out as of `today`. */
export async function futureBookingsOf(db: D1Database, name: string, today: string): Promise<number> {
    const row = await db.prepare("SELECT COUNT(*) AS n FROM requests WHERE type = 'hotel' AND status IN ('pending', 'approved') AND room_type = ?1 AND check_out > ?2").bind(name, today).first<{ n: number }>();
    return row?.n ?? 0;
}

/**
 * How many rooms the venue is short of, at the busiest future night, if the
 * type had `quantity` rooms: the approved stays of the type still to come are
 * swept by date (+1 at check-in, −1 at check-out, departures before arrivals
 * on the same day because check-out is excluded) and the peak occupancy is
 * compared with the quantity. Zero when the quantity covers every night.
 * Reducing the quantity below the bookings is allowed; this figure is the
 * warning shown to the venue (owner's decision).
 */
export async function overbookedRooms(db: D1Database, name: string, quantity: number, today: string): Promise<number> {
    const { results } = await db.prepare("SELECT check_in, check_out FROM requests WHERE type = 'hotel' AND status = 'approved' AND room_type = ?1 AND check_out > ?2").bind(name, today).all<{ check_in: string; check_out: string }>();
    const events: { date: string; delta: number }[] = [];
    for (const stay of results) {
        events.push({ date: stay.check_in, delta: 1 });
        events.push({ date: stay.check_out, delta: -1 });
    }
    events.sort((a, b) => a.date.localeCompare(b.date) || a.delta - b.delta);
    let occupied = 0;
    let peak = 0;
    for (const event of events) {
        occupied += event.delta;
        peak = Math.max(peak, occupied);
    }
    return Math.max(0, peak - quantity);
}

/** Deletes the type together with its rate periods; the caller has already checked for future bookings. */
export async function deleteRoomType(db: D1Database, existing: RoomType): Promise<void> {
    await db.batch([db.prepare('DELETE FROM rate_periods WHERE room_type = ?1').bind(existing.name), db.prepare('DELETE FROM room_types WHERE id = ?1').bind(existing.id)]);
}

/**
 * Rooms left per type for the stay [checkIn, checkOut): one aggregate query
 * over the approved hotel bookings that overlap the range. `excludeRequestId`
 * leaves one booking out of the count (used when approving that very one).
 */
export async function roomAvailability(db: D1Database, checkIn: string, checkOut: string, excludeRequestId = 0): Promise<RoomAvailability[]> {
    const [rooms, booked] = await db.batch([
        db.prepare(`${SELECT_ROOM} ORDER BY id`),
        db.prepare("SELECT room_type, COUNT(*) AS booked FROM requests WHERE type = 'hotel' AND status = 'approved' AND id != ?3 AND check_in < ?2 AND check_out > ?1 GROUP BY room_type").bind(checkIn, checkOut, excludeRequestId),
    ]);
    const bookedByType = new Map((booked.results as { room_type: string; booked: number }[]).map((row) => [row.room_type, row.booked]));
    return (rooms.results as RoomType[]).map((room) => ({ ...room, available: Math.max(0, room.quantity - (bookedByType.get(room.name) ?? 0)) }));
}
