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

/** True when another period of the same room type overlaps the range (excluding `excludeId`). */
export async function periodOverlaps(db: D1Database, fields: PeriodFields, excludeId = 0): Promise<boolean> {
    const row = await db.prepare('SELECT COUNT(*) AS n FROM rate_periods WHERE room_type = ?1 AND id != ?4 AND date_from <= ?3 AND date_to >= ?2').bind(fields.roomType, fields.dateFrom, fields.dateTo, excludeId).first<{ n: number }>();
    return (row?.n ?? 0) > 0;
}
