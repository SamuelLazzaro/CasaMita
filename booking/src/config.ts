import type { BookingType, Lang, TenantRow } from './types';
import { isValidTime, minutesFromMidnight } from './dates';

/**
 * Venue configuration, read from the tenant's directory row and normalised
 * with safe defaults, so that a malformed value never breaks a venue. The
 * public endpoint GET /:slug/api/config hands the frontend the subset it
 * needs to render the right form.
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

function timeWindow(open: string | null | undefined, close: string | null | undefined, fallback: TimeWindow): TimeWindow {
    const openValue = open?.trim() ?? '';
    const closeValue = close?.trim() ?? '';
    const bothValid = isValidTime(openValue) && isValidTime(closeValue);
    if (!bothValid || minutesFromMidnight(openValue) >= minutesFromMidnight(closeValue)) return fallback;
    return { open: openValue, close: closeValue };
}

/** The raw configuration columns of a tenant row (the rest of the row is not needed here). */
export type VenueSettings = Pick<TenantRow, 'type' | 'name' | 'default_lang' | 'facility_open' | 'facility_close' | 'lunch_open' | 'lunch_close' | 'dinner_open' | 'dinner_close' | 'retention_days'>;

export function venueConfigOf(settings: VenueSettings): VenueConfig {
    const typeValue = (settings.type ?? '').trim().toLowerCase() as BookingType;
    const type = BOOKING_TYPES.includes(typeValue) ? typeValue : DEFAULT_TYPE;
    const nameValue = (settings.name ?? '').trim();
    const name = nameValue !== '' && nameValue.length <= MAX_NAME_LENGTH ? nameValue : DEFAULT_NAME;
    const defaultLang: Lang = (settings.default_lang ?? '').trim().toLowerCase() === 'en' ? 'en' : 'it';
    const retentionValue = Number(settings.retention_days ?? DEFAULT_RETENTION_DAYS);
    const retentionDays = Number.isInteger(retentionValue) && retentionValue >= 0 ? retentionValue : DEFAULT_RETENTION_DAYS;
    return {
        type,
        name,
        defaultLang,
        facility: { ...timeWindow(settings.facility_open, settings.facility_close, { open: '08:00', close: '24:00' }), slotMinutes: FACILITY_SLOT_MINUTES },
        restaurant: {
            lunch: timeWindow(settings.lunch_open, settings.lunch_close, { open: '12:00', close: '14:30' }),
            dinner: timeWindow(settings.dinner_open, settings.dinner_close, { open: '19:00', close: '22:30' }),
            stepMinutes: RESTAURANT_STEP_MINUTES,
        },
        retentionDays,
    };
}

/** True when `time` falls inside the window, on the step grid, and leaves room for the seating (strictly before close). */
export function isSeatingTime(time: string, window: TimeWindow, stepMinutes: number): boolean {
    if (!isValidTime(time)) return false;
    const minutes = minutesFromMidnight(time);
    const open = minutesFromMidnight(window.open);
    const close = minutesFromMidnight(window.close);
    return minutes >= open && minutes < close && (minutes - open) % stepMinutes === 0;
}

/**
 * Origin of the venue's website allowed to embed the public form in an
 * iframe (GET /:slug/embed): scheme and host only, e.g. "https://www.hotel.it".
 * Null when unset or malformed, which keeps embedding disabled.
 */
export function embedOriginOf(value: string | null | undefined): string | null {
    const trimmed = (value ?? '').trim();
    if (trimmed === '') return null;
    try {
        const url = new URL(trimmed);
        if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
        return url.origin;
    } catch {
        return null;
    }
}
