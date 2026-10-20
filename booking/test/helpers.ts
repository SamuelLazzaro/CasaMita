import { env } from 'cloudflare:test';
import type { Bindings } from '../src/types';
import { app } from '../src/index';
import { addDays, romeNow } from '../src/dates';
import { roomTypes } from '../src/rooms';

/*
 * The hotel tests never name a room type: they pick by position from the
 * types seeded by migration 0004 (the test database is migrated afresh for
 * every test file). ROOM_A is the default of hotelBody; ROOM_B and ROOM_C
 * are two other types for the tests that need distinct ones; ROOM_LARGEST
 * has the most rooms, for the availability arithmetic. None of the seeded
 * types has a base price: every pricing test sets the prices it needs.
 */
const rooms = await roomTypes(env.DB);
if (rooms.length < 3) throw new Error('the tests need at least three seeded room types');
export const ROOM_A = rooms[0];
export const ROOM_B = rooms[1];
export const ROOM_C = rooms[2];
export const ROOM_LARGEST = [...rooms].sort((a, b) => b.quantity - a.quantity)[0];
/** A name no room type has. */
export const UNKNOWN_ROOM = 'Tipologia inesistente';

/** Session cookie of the admin dashboard. */
export async function adminCookie(): Promise<string> {
    const response = await app.request('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '10.0.5.1' }, body: JSON.stringify({ password: 'test-password' }) }, env);
    return response.headers.get('set-cookie')!.split(';')[0];
}

/** Authenticated JSON call to the admin API. */
export async function adminCall(method: string, path: string, cookie: string, body?: unknown): Promise<Response> {
    return await app.request(path, { method, headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }, env);
}

/** Sets the base price of a room type through the admin API (the Rooms section does it from the type's dialog). */
export async function setBasePrice(cookie: string, room: { id: number }, price: unknown): Promise<Response> {
    return await adminCall('PATCH', `/api/admin/rooms/${room.id}`, cookie, { price_per_night: price });
}

/** Today in the venue's time zone, 'YYYY-MM-DD'. */
export function today(): string {
    return romeNow(new Date()).date;
}

/** A date `days` ahead of today. */
export function daysAhead(days: number): string {
    return addDays(today(), days);
}

/** Environment of a deployment of the given type (vars override the wrangler.jsonc ones). */
export function envOfType(type: string, overrides: Partial<Bindings> = {}): Bindings {
    return { ...env, BOOKING_TYPE: type, ...overrides };
}

/** Unauthenticated JSON POST with a stable client IP (rate limit key). */
export async function postJson(path: string, body: unknown, bindings: Bindings = env, ip = '203.0.113.10'): Promise<Response> {
    return await app.request(path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': ip }, body: JSON.stringify(body) }, bindings);
}

export async function get(path: string, bindings: Bindings = env): Promise<Response> {
    return await app.request(path, {}, bindings);
}

/** A complete, valid hotel request body (one adult in ROOM_A, so it fits any room type); override single fields as needed. */
export function hotelBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return { first_name: 'Anna', last_name: 'Rossi', email: 'anna@example.com', phone: '+39 333 1234567', check_in: daysAhead(10), check_out: daysAhead(12), adults: 1, children: 0, room_type: ROOM_A.name, notes: 'Arrivo tardi', privacy_accepted: true, lang: 'it', ...overrides };
}

/** A complete, valid restaurant request body. */
export function restaurantBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return { first_name: 'Luca', last_name: 'Bianchi', email: 'luca@example.com', phone: '3331234567', date: daysAhead(3), time: '20:00', party_size: 4, privacy_accepted: true, lang: 'en', ...overrides };
}

/** Sets the status of a request straight in the database (test setup). */
export async function setStatus(id: number, status: string): Promise<void> {
    await env.DB.prepare('UPDATE requests SET status = ?2 WHERE id = ?1').bind(id, status).run();
}

export async function tokenOf(id: number): Promise<string> {
    const row = await env.DB.prepare('SELECT guest_token FROM requests WHERE id = ?1').bind(id).first<{ guest_token: string }>();
    return row!.guest_token;
}
