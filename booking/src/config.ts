import type { Bindings, BookingType, Lang } from './types';
import { isValidTime, minutesFromMidnight } from './dates';

/**
 * Venue configuration, read from the deployment vars (wrangler.jsonc) and
 * normalised with safe defaults, so that development and tests without vars
 * still get a coherent setup. The public endpoint GET /api/config hands the
 * frontend the subset it needs to render the right form.
 */

export type TimeWindow = { open: string; close: string };

export type VenueConfig = {
    type: BookingType;
    name: string;
    defaultLang: Lang;
    /** facility: opening hours and slot length in minutes */
    facility: TimeWindow & { slotMinutes: number };
    /** restaurant: the two service windows and the seating time step in minutes */
    restaurant: { lunch: TimeWindow; dinner: TimeWindow; stepMinutes: number };
    /** days after the end of a booking before guest data are anonymised; 0 disables the job */
    retentionDays: number;
};

const BOOKING_TYPES: BookingType[] = ['hotel', 'facility', 'restaurant'];
const DEFAULT_TYPE: BookingType = 'hotel';
const DEFAULT_NAME = 'Booking';
const MAX_NAME_LENGTH = 80;
const DEFAULT_RETENTION_DAYS = 90;

export const FACILITY_SLOT_MINUTES = 30;
export const RESTAURANT_STEP_MINUTES = 15;

function timeWindow(open: string | undefined, close: string | undefined, fallback: TimeWindow): TimeWindow {
    const openValue = open?.trim() ?? '';
    const closeValue = close?.trim() ?? '';
    const bothValid = isValidTime(openValue) && isValidTime(closeValue);
    if (!bothValid || minutesFromMidnight(openValue) >= minutesFromMidnight(closeValue)) return fallback;
    return { open: openValue, close: closeValue };
}

export function venueConfig(env: Bindings): VenueConfig {
    const typeValue = (env.BOOKING_TYPE ?? '').trim().toLowerCase() as BookingType;
    const type = BOOKING_TYPES.includes(typeValue) ? typeValue : DEFAULT_TYPE;
    const nameValue = (env.VENUE_NAME ?? '').trim();
    const name = nameValue !== '' && nameValue.length <= MAX_NAME_LENGTH ? nameValue : DEFAULT_NAME;
    const defaultLang: Lang = env.DEFAULT_LANG?.trim().toLowerCase() === 'en' ? 'en' : 'it';
    const retentionValue = Number(env.RETENTION_DAYS ?? DEFAULT_RETENTION_DAYS);
    const retentionDays = Number.isInteger(retentionValue) && retentionValue >= 0 ? retentionValue : DEFAULT_RETENTION_DAYS;
    return {
        type,
        name,
        defaultLang,
        facility: { ...timeWindow(env.FACILITY_OPEN, env.FACILITY_CLOSE, { open: '08:00', close: '24:00' }), slotMinutes: FACILITY_SLOT_MINUTES },
        restaurant: {
            lunch: timeWindow(env.LUNCH_OPEN, env.LUNCH_CLOSE, { open: '12:00', close: '14:30' }),
            dinner: timeWindow(env.DINNER_OPEN, env.DINNER_CLOSE, { open: '19:00', close: '22:30' }),
            stepMinutes: RESTAURANT_STEP_MINUTES,
        },
        retentionDays,
    };
}

/**
 * Origin of the venue's website allowed to embed the public form in an
 * iframe (GET /embed): scheme and host only, e.g. "https://www.hotel.it".
 * Null when unset or malformed, which keeps embedding disabled.
 */
export function embedOriginOf(env: Pick<Bindings, 'EMBED_ORIGIN'>): string | null {
    const value = (env.EMBED_ORIGIN ?? '').trim();
    if (value === '') return null;
    try {
        const url = new URL(value);
        if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
        return url.origin;
    } catch {
        return null;
    }
}

/** True when `time` falls inside the window, on the step grid, and leaves room for the seating (strictly before close). */
export function isSeatingTime(time: string, window: TimeWindow, stepMinutes: number): boolean {
    if (!isValidTime(time)) return false;
    const minutes = minutesFromMidnight(time);
    const open = minutesFromMidnight(window.open);
    const close = minutesFromMidnight(window.close);
    return minutes >= open && minutes < close && (minutes - open) % stepMinutes === 0;
}
