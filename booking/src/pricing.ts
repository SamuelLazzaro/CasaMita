import { addDays, isValidDate } from './dates';
import { roomTypeByName } from './rooms';
import { priceValue, roundCents } from './util';

/**
 * Hotel pricing (migration 0002).
 *
 * A stay [checkIn, checkOut) is priced night by night: every night costs the
 * price of the rate period covering it, or the base price of the room type
 * (room_types.price_per_night, migration 0004) when no period does. The
 * subtotal is the sum of the nights; the discount is the rule with the
 * highest `min_nights` not above the number of nights; the total is rounded
 * to the cent only at the end, so the public form, the dashboard and the
 * email all show the same figure.
 *
 * A night without any price (no period covering it and a room type seeded
 * without base price, see migration 0004) makes the whole quote impossible
 * (null): the public form then works as before, without prices (owner's
 * decision). Periods alone are enough when they cover every night of the
 * stay, so a venue that prices only some dates still gets the quote on those
 * dates.
 */

export type NightPrice = { date: string; price: number };

export type Quote = {
    nights: NightPrice[];
    subtotal: number;
    discount_percent: number;
    discount_amount: number;
    total: number;
};

export type RatePeriod = { id: number; room_type: string; date_from: string; date_to: string; price_per_night: number; label: string | null };
export type DiscountRule = { id: number; min_nights: number; percent: number };

export const MAX_LABEL = 60;

/** Pure computation, exported for the tests; null when a night has no price. */
export function computeQuote(checkIn: string, checkOut: string, basePrice: number | null, periods: Pick<RatePeriod, 'date_from' | 'date_to' | 'price_per_night'>[], rules: Pick<DiscountRule, 'min_nights' | 'percent'>[]): Quote | null {
    const nights: NightPrice[] = [];
    for (let night = checkIn; night < checkOut; night = addDays(night, 1)) {
        const period = periods.find((candidate) => candidate.date_from <= night && night <= candidate.date_to);
        const price = period === undefined ? basePrice : period.price_per_night;
        if (price === null) return null;
        nights.push({ date: night, price });
    }
    const subtotal = roundCents(nights.reduce((sum, night) => sum + night.price, 0));
    const applicable = rules.filter((rule) => rule.min_nights <= nights.length).sort((a, b) => b.min_nights - a.min_nights)[0];
    const discountPercent = applicable?.percent ?? 0;
    const discountAmount = roundCents(subtotal * discountPercent / 100);
    return { nights, subtotal, discount_percent: discountPercent, discount_amount: discountAmount, total: roundCents(subtotal - discountAmount) };
}

/** Quote of a stay from the database, or null when some night of the stay has no price. */
export async function quoteStay(db: D1Database, roomType: string, checkIn: string, checkOut: string): Promise<Quote | null> {
    const [base, periods, rules] = await db.batch([
        db.prepare('SELECT price_per_night FROM room_types WHERE name = ?1').bind(roomType),
        db.prepare('SELECT date_from, date_to, price_per_night FROM rate_periods WHERE room_type = ?1 AND date_from < ?3 AND date_to >= ?2').bind(roomType, checkIn, checkOut),
        db.prepare('SELECT min_nights, percent FROM discount_rules'),
    ]);
    const basePrice = (base.results[0] as { price_per_night: number | null } | undefined)?.price_per_night ?? null;
    return computeQuote(checkIn, checkOut, basePrice, periods.results as Pick<RatePeriod, 'date_from' | 'date_to' | 'price_per_night'>[], rules.results as Pick<DiscountRule, 'min_nights' | 'percent'>[]);
}

export type PeriodFields = { roomType: string; dateFrom: string; dateTo: string; price: number; label: string | null };

/** Validates the fields of a rate period; returns an error code or the cleaned fields. */
export async function periodFields(db: D1Database, body: Record<string, unknown>): Promise<PeriodFields | { error: string }> {
    const roomType = typeof body.room_type === 'string' ? body.room_type.trim() : '';
    if ((await roomTypeByName(db, roomType)) === null) return { error: 'unknown_room' };
    const dateFrom = typeof body.date_from === 'string' ? body.date_from.trim() : '';
    const dateTo = typeof body.date_to === 'string' ? body.date_to.trim() : '';
    if (!isValidDate(dateFrom) || !isValidDate(dateTo)) return { error: 'invalid_date' };
    if (dateTo < dateFrom) return { error: 'period_reversed' };
    const price = priceValue(body.price_per_night);
    if (price === null) return { error: 'invalid_price' };
    const labelValue = typeof body.label === 'string' ? body.label.trim() : '';
    if (labelValue.length > MAX_LABEL) return { error: 'label_too_long' };
    return { roomType, dateFrom, dateTo, price, label: labelValue === '' ? null : labelValue };
}

/**
 * Prices one day of one room type from the price calendar, leaving every
 * other day as it is. The day's own price is a one-day rate period:
 *
 *   - no period covers the day: a one-day period is inserted (a reset has
 *     nothing to do)
 *   - a one-day period covers it: it is replaced, keeping its label (a reset
 *     deletes it, the day falls back to the base price)
 *   - a longer period covers it: it is split around the day, the parts before
 *     and after keep its price and label, and the day gets its own unlabelled
 *     one-day period (none on a reset, which leaves a hole in the period)
 *
 * The covering period is always deleted and re-inserted in parts, so the
 * three cases share one path. Every statement runs in one batch (atomic in
 * D1): a failure leaves the periods as they were. The caller validates room
 * type, date and price.
 * @param price - euro per night, null to bring the day back to the base price
 */
export async function setDayPrice(db: D1Database, roomType: string, day: string, price: number | null): Promise<void> {
    const covering = await db.prepare('SELECT * FROM rate_periods WHERE room_type = ?1 AND date_from <= ?2 AND date_to >= ?2').bind(roomType, day).first<RatePeriod>();
    const insertPeriod = (dateFrom: string, dateTo: string, nightly: number, label: string | null): D1PreparedStatement => db.prepare('INSERT INTO rate_periods (room_type, date_from, date_to, price_per_night, label) VALUES (?1, ?2, ?3, ?4, ?5)').bind(roomType, dateFrom, dateTo, nightly, label);
    const statements: D1PreparedStatement[] = [];
    if (covering !== null) {
        statements.push(db.prepare('DELETE FROM rate_periods WHERE id = ?1').bind(covering.id));
        // The parts of the period on either side of the day, when any.
        if (covering.date_from < day) statements.push(insertPeriod(covering.date_from, addDays(day, -1), covering.price_per_night, covering.label));
        if (covering.date_to > day) statements.push(insertPeriod(addDays(day, 1), covering.date_to, covering.price_per_night, covering.label));
    }
    if (price !== null) {
        const wasOneDayPeriod = covering !== null && covering.date_from === covering.date_to;
        statements.push(insertPeriod(day, day, price, wasOneDayPeriod ? covering.label : null));
    }
    if (statements.length > 0) await db.batch(statements);
}

/** True when another period of the same room type overlaps the range (excluding `excludeId`). */
export async function periodOverlaps(db: D1Database, fields: PeriodFields, excludeId = 0): Promise<boolean> {
    const row = await db.prepare('SELECT COUNT(*) AS n FROM rate_periods WHERE room_type = ?1 AND id != ?4 AND date_from <= ?3 AND date_to >= ?2').bind(fields.roomType, fields.dateFrom, fields.dateTo, excludeId).first<{ n: number }>();
    return (row?.n ?? 0) > 0;
}
