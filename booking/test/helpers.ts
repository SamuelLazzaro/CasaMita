import { env } from 'cloudflare:test';
import type { Bindings } from '../src/types';
import { app } from '../src/index';
import { addDays, romeNow } from '../src/dates';

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

/** A complete, valid hotel request body; override single fields as needed. */
export function hotelBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return { first_name: 'Anna', last_name: 'Rossi', email: 'anna@example.com', phone: '+39 333 1234567', check_in: daysAhead(10), check_out: daysAhead(12), adults: 2, children: 0, room_type: 'Camera doppia', notes: 'Arrivo tardi', privacy_accepted: true, lang: 'it', ...overrides };
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
