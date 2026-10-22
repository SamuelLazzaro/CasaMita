import { env } from 'cloudflare:test';
import { app } from '../src/index';
import { addDays, romeNow } from '../src/dates';
import { roomTypes } from '../src/rooms';

/*
 * Three test venues, one per booking type, seeded by apply-migrations.ts in
 * the directory with their own database and one dashboard user each. Every
 * helper takes the venue's slug and prefixes the path with it, so the tests
 * write the routes as the dashboard calls them ('/api/admin/...').
 */
export const HOTEL = 'hotel-test';
export const RESTAURANT = 'restaurant-test';
export const FACILITY = 'facility-test';

/** Dashboard user of every test venue (apply-migrations.ts). */
export const USERNAMES: Record<string, string> = { [HOTEL]: 'hotel-admin', [RESTAURANT]: 'restaurant-admin', [FACILITY]: 'facility-admin' };
export const PASSWORD = 'test-password-123';

/** The database of a test venue. */
export function dbOf(slug: string): D1Database {
    const databases: Record<string, D1Database> = { [HOTEL]: env.DB_HOTEL, [RESTAURANT]: env.DB_RESTAURANT, [FACILITY]: env.DB_FACILITY };
    return databases[slug];
}

/** The route of a venue: its slug in front of the path. */
export function url(slug: string, path: string): string {
    return `/${slug}${path}`;
}

/*
 * The hotel tests never name a room type: they pick by position from the
 * types seeded by migration 0004 (the test database is migrated afresh for
 * every test file). ROOM_A is the default of hotelBody; ROOM_B and ROOM_C
 * are two other types for the tests that need distinct ones; ROOM_LARGEST
 * has the most rooms, for the availability arithmetic. None of the seeded
 * types has a base price: every pricing test sets the prices it needs.
 */
const rooms = await roomTypes(env.DB_HOTEL);
if (rooms.length < 3) throw new Error('the tests need at least three seeded room types');
export const ROOM_A = rooms[0];
export const ROOM_B = rooms[1];
export const ROOM_C = rooms[2];
export const ROOM_LARGEST = [...rooms].sort((a, b) => b.quantity - a.quantity)[0];
/** A name no room type has. */
export const UNKNOWN_ROOM = 'Tipologia inesistente';

/** POST /api/admin/login (the directory, no venue in the URL). */
export async function login(username: string, password: string, ip = '10.0.5.1'): Promise<Response> {
    return await app.request('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': ip }, body: JSON.stringify({ username, password }) }, env);
}

/** Session cookie of the dashboard user of a venue. */
export async function adminCookie(slug: string = HOTEL): Promise<string> {
    const response = await login(USERNAMES[slug], PASSWORD);
    if (response.status !== 200) throw new Error(`admin login failed in tests (status ${response.status})`);
    return response.headers.get('set-cookie')!.split(';')[0];
}

/** Authenticated JSON call to the admin API of a venue. */
export async function adminCall(method: string, path: string, cookie: string, body?: unknown, slug: string = HOTEL): Promise<Response> {
    return await app.request(url(slug, path), { method, headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }, env);
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

/** Unauthenticated JSON POST to a venue with a stable client IP (rate limit key). */
export async function postJson(path: string, body: unknown, slug: string = HOTEL, ip = '203.0.113.10'): Promise<Response> {
    return await app.request(url(slug, path), { method: 'POST', headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': ip }, body: JSON.stringify(body) }, env);
}

export async function get(path: string, slug: string = HOTEL): Promise<Response> {
    return await app.request(url(slug, path), {}, env);
}

/** Rewrites configuration columns of a test venue in the directory (restore them when the test is done). */
export async function setTenant(slug: string, columns: Record<string, string | number | null>): Promise<void> {
    const names = Object.keys(columns);
    const assignments = names.map((name, index) => `${name} = ?${index + 2}`).join(', ');
    await env.DIRECTORY.prepare(`UPDATE tenants SET ${assignments} WHERE slug = ?1`).bind(slug, ...names.map((name) => columns[name])).run();
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
export async function setStatus(id: number, status: string, slug: string = HOTEL): Promise<void> {
    await dbOf(slug).prepare('UPDATE requests SET status = ?2 WHERE id = ?1').bind(id, status).run();
}

export async function tokenOf(id: number, slug: string = HOTEL): Promise<string> {
    const row = await dbOf(slug).prepare('SELECT guest_token FROM requests WHERE id = ?1').bind(id).first<{ guest_token: string }>();
    return row!.guest_token;
}
