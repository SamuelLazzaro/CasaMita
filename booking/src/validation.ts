import type { VenueConfig } from './config';
import { isSeatingTime } from './config';
import { addDays, isValidDate, isValidTime, minutesFromMidnight, nightsBetween } from './dates';
import { roomTypeByName } from './rooms';
import { integerBetween, isValidEmail, isValidPhone, optionalText, text } from './util';

/*
 * Field validation of a booking request, shared by the public form (guest)
 * and the direct booking of the admin (owner's decision: same rules for both,
 * same mandatory fields). Every function returns the cleaned fields or an
 * error CODE the frontend translates ("error.<code>").
 */

export const MAX_NAME = 100;
export const MAX_NOTES = 500;
export const MAX_NIGHTS = 30;
export const MAX_DAYS_AHEAD = 365;
export const MAX_PARTY_SIZE = 30;
export const MAX_CHILDREN = 10;
/** Longest facility booking, in minutes (a whole opening day at most). */
export const MAX_FACILITY_MINUTES = 16 * 60;

export type Clock = { date: string; time: string };

/** Validates a hotel stay [checkIn, checkOut); returns an error code or null. */
export function validateStay(checkIn: string, checkOut: string, today: string): string | null {
    if (!isValidDate(checkIn) || !isValidDate(checkOut)) return 'invalid_date';
    if (checkIn < today) return 'date_in_past';
    if (checkIn > addDays(today, MAX_DAYS_AHEAD)) return 'date_too_far';
    const nights = nightsBetween(checkIn, checkOut);
    if (nights < 1) return 'checkout_before_checkin';
    if (nights > MAX_NIGHTS) return 'too_many_nights';
    return null;
}

/** Contact fields of a guest (hotel, restaurant). */
export type GuestFields = { firstName: string; lastName: string; email: string; phone: string; notes: string | null };

export function guestFields(body: Record<string, unknown>): GuestFields | { error: string } {
    const firstName = text(body.first_name, MAX_NAME);
    const lastName = text(body.last_name, MAX_NAME);
    if (firstName === null || lastName === null) return { error: 'invalid_name' };
    const email = text(body.email, 200);
    if (email === null || !isValidEmail(email)) return { error: 'invalid_email' };
    const phone = text(body.phone, 30);
    if (phone === null || !isValidPhone(phone)) return { error: 'invalid_phone' };
    const notes = notesField(body.notes);
    if (notes === undefined) return { error: 'notes_too_long' };
    return { firstName, lastName, email, phone, notes };
}

/** Optional notes: null when blank, undefined when too long. */
export function notesField(value: unknown): string | null | undefined {
    return optionalText(value, MAX_NOTES);
}

export type HotelFields = { checkIn: string; checkOut: string; adults: number; children: number; roomType: string };

export function hotelFields(body: Record<string, unknown>, today: string): HotelFields | { error: string } {
    const checkIn = typeof body.check_in === 'string' ? body.check_in.trim() : '';
    const checkOut = typeof body.check_out === 'string' ? body.check_out.trim() : '';
    const stayError = validateStay(checkIn, checkOut, today);
    if (stayError) return { error: stayError };
    const roomType = typeof body.room_type === 'string' ? roomTypeByName(body.room_type.trim()) : undefined;
    if (roomType === undefined) return { error: 'unknown_room' };
    const adults = integerBetween(body.adults, 1, roomType.max_guests);
    const children = integerBetween(body.children ?? 0, 0, MAX_CHILDREN);
    if (adults === null || children === null) return { error: 'invalid_guests' };
    if (adults + children > roomType.max_guests) return { error: 'too_many_guests' };
    return { checkIn, checkOut, adults, children, roomType: roomType.name };
}

/** One date, not in the past and within the booking horizon; error code or null. */
function validateDate(date: string, today: string): string | null {
    if (!isValidDate(date)) return 'invalid_date';
    if (date < today) return 'date_in_past';
    if (date > addDays(today, MAX_DAYS_AHEAD)) return 'date_too_far';
    return null;
}

export type RestaurantFields = { date: string; time: string; partySize: number };

export function restaurantFields(body: Record<string, unknown>, venue: VenueConfig, now: Clock): RestaurantFields | { error: string } {
    const date = typeof body.date === 'string' ? body.date.trim() : '';
    const dateError = validateDate(date, now.date);
    if (dateError) return { error: dateError };
    const time = typeof body.time === 'string' ? body.time.trim() : '';
    const inLunch = isSeatingTime(time, venue.restaurant.lunch, venue.restaurant.stepMinutes);
    const inDinner = isSeatingTime(time, venue.restaurant.dinner, venue.restaurant.stepMinutes);
    if (!inLunch && !inDinner) return { error: 'invalid_time' };
    if (date === now.date && time <= now.time) return { error: 'time_in_past' };
    const partySize = integerBetween(body.party_size, 1, MAX_PARTY_SIZE);
    if (partySize === null) return { error: 'invalid_party_size' };
    return { date, time, partySize };
}

export type FacilityFields = { date: string; startTime: string; endTime: string; notes: string | null };

/** Facility: a time range on one date, inside the opening hours, on the slot grid, in the future. */
export function facilityFields(body: Record<string, unknown>, venue: VenueConfig, now: Clock): FacilityFields | { error: string } {
    const date = typeof body.date === 'string' ? body.date.trim() : '';
    const dateError = validateDate(date, now.date);
    if (dateError) return { error: dateError };
    const startTime = typeof body.start_time === 'string' ? body.start_time.trim() : '';
    const endTime = typeof body.end_time === 'string' ? body.end_time.trim() : '';
    if (!isValidTime(startTime) || !isValidTime(endTime)) return { error: 'invalid_time' };
    const start = minutesFromMidnight(startTime);
    const end = minutesFromMidnight(endTime);
    const slot = venue.facility.slotMinutes;
    if (start % slot !== 0 || end % slot !== 0) return { error: 'invalid_time' };
    if (start >= end) return { error: 'end_before_start' };
    if (start < minutesFromMidnight(venue.facility.open) || end > minutesFromMidnight(venue.facility.close)) return { error: 'outside_opening_hours' };
    if (end - start > MAX_FACILITY_MINUTES) return { error: 'too_long' };
    if (date === now.date && startTime <= now.time) return { error: 'time_in_past' };
    const notes = notesField(body.notes);
    if (notes === undefined) return { error: 'notes_too_long' };
    return { date, startTime, endTime, notes };
}
