import { slotKeys } from './dates';

/**
 * Facility slots: the UNIQUE primary key of `slots.slot_key` is the
 * double-booking guard. Approvals insert every slot of the booking inside one
 * atomic batch: if a single slot is taken the whole batch fails and nothing
 * changes. The helpers here diagnose conflicts before and after that attempt.
 */

/** Slot keys of a booking, from its row fields. */
export function keysOf(booking: { date: string; start_time: string; end_time: string }, slotMinutes: number): string[] {
    return slotKeys(booking.date, booking.start_time, booking.end_time, slotMinutes);
}

/** Which of the given keys are already taken, in order (empty when all free). */
export async function occupiedSlots(db: D1Database, keys: string[]): Promise<string[]> {
    if (keys.length === 0) return [];
    const placeholders = keys.map((_, index) => `?${index + 1}`).join(', ');
    const { results } = await db.prepare(`SELECT slot_key FROM slots WHERE slot_key IN (${placeholders}) ORDER BY slot_key`).bind(...keys).all<{ slot_key: string }>();
    return results.map((row) => row.slot_key);
}

/** Insert statements of the slots of a booking, for a db.batch(). */
export function slotInserts(db: D1Database, requestId: number, keys: string[]): D1PreparedStatement[] {
    return keys.map((key) => db.prepare('INSERT INTO slots (slot_key, request_id) VALUES (?1, ?2)').bind(key, requestId));
}

/** True when the error comes from the UNIQUE guard (slot taken meanwhile). */
export function isSlotConflict(error: unknown): boolean {
    return error instanceof Error && /UNIQUE constraint failed: slots\.slot_key/.test(error.message);
}
