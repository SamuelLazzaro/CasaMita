import { addDays, isValidDate } from './dates';
import { roomTypeByName } from './rooms';

/**
 * Hotel pricing (migration 0002).
 *
 * A stay [checkIn, checkOut) is priced night by night: every night costs the
 * price of the rate period covering it, or the base price of the room type
 * when no period does. The subtotal is the sum of the nights; the discount is
 * the rule with the highest `min_nights` not above the number of nights; the
 * total is rounded to the cent only at the end, so the public form, the
 * dashboard and the email all show the same figure.
 *
 * Without a base price for the room type there is no quote (null): the
 * public form then works as before, without prices (owner's decision).
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

export const MAX_PRICE = 100_000;
export const MAX_LABEL = 60;

function roundCents(value: number): number {
    return Math.round(value * 100) / 100;
}

/** Pure computation, exported for the tests. */
export function computeQuote(checkIn: string, checkOut: string, basePrice: number, periods: Pick<RatePeriod, 'date_from' | 'date_to' | 'price_per_night'>[], rules: Pick<DiscountRule, 'min_nights' | 'percent'>[]): Quote {
    const nights: NightPrice[] = [];
    for (let night = checkIn; night < checkOut; night = addDays(night, 1)) {
        const period = periods.find((candidate) => candidate.date_from <= night && night <= candidate.date_to);
        nights.push({ date: night, price: period === undefined ? basePrice : period.price_per_night });
    }
    const subtotal = roundCents(nights.reduce((sum, night) => sum + night.price, 0));
    const applicable = rules.filter((rule) => rule.min_nights <= nights.length).sort((a, b) => b.min_nights - a.min_nights)[0];
    const discountPercent = applicable?.percent ?? 0;
    const discountAmount = roundCents(subtotal * discountPercent / 100);
    return { nights, subtotal, discount_percent: discountPercent, discount_amount: discountAmount, total: roundCents(subtotal - discountAmount) };
}

/** Quote of a stay from the database, or null when the room type has no base price. */
export async function quoteStay(db: D1Database, roomType: string, checkIn: string, checkOut: string): Promise<Quote | null> {
    const base = await db.prepare('SELECT price_per_night FROM room_prices WHERE room_type = ?1').bind(roomType).first<{ price_per_night: number }>();
    if (base === null) return null;
    const [periods, rules] = await db.batch([
        db.prepare('SELECT date_from, date_to, price_per_night FROM rate_periods WHERE room_type = ?1 AND date_from < ?3 AND date_to >= ?2').bind(roomType, checkIn, checkOut),
        db.prepare('SELECT min_nights, percent FROM discount_rules'),
    ]);
    return computeQuote(checkIn, checkOut, base.price_per_night, periods.results as Pick<RatePeriod, 'date_from' | 'date_to' | 'price_per_night'>[], rules.results as Pick<DiscountRule, 'min_nights' | 'percent'>[]);
}

/** A price in euro: finite, non-negative, at most MAX_PRICE, rounded to the cent; null when invalid. */
export function priceValue(value: unknown): number | null {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > MAX_PRICE) return null;
    return roundCents(value);
}

export type PeriodFields = { roomType: string; dateFrom: string; dateTo: string; price: number; label: string | null };

/** Validates the fields of a rate period; returns an error code or the cleaned fields. */
export function periodFields(body: Record<string, unknown>): PeriodFields | { error: string } {
    const roomType = typeof body.room_type === 'string' ? body.room_type.trim() : '';
    if (roomTypeByName(roomType) === undefined) return { error: 'unknown_room' };
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
