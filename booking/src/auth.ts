/**
 * Sessions and authentication.
 *
 * Sessions are stateless signed cookies: "<payload>.<signature>" where the
 * payload is dot-separated ("admin.<exp>" or "requester.<id>.<tokenHash>.<exp>")
 * and the signature is HMAC-SHA256 (base64url) with the ADMIN_SECRET secret.
 *
 * The requester payload embeds a short hash of the CURRENT access_token: when
 * the admin regenerates a requester's link, every session issued before stops
 * matching and is invalidated without any server-side state.
 */
import type { Context, MiddlewareHandler } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { Bindings, RequesterRow, RequesterVariables } from './types';

export const COOKIE_REQUESTER = 'sess_requester';
export const COOKIE_ADMIN = 'sess_admin';
export const REQUESTER_SESSION_S = 60 * 60 * 24 * 30; // 30 days
export const ADMIN_SESSION_S = 60 * 60 * 8; // 8 hours

const encoder = new TextEncoder();

function base64url(buffer: ArrayBuffer): string {
    let binary = '';
    for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sign(secret: string, payload: string): Promise<string> {
    const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return base64url(await crypto.subtle.sign('HMAC', key, encoder.encode(payload)));
}

/**
 * Constant-time string comparison: both values are reduced to SHA-256
 * digests (fixed length) and compared byte by byte accumulating the
 * differences with OR, so the time does not depend on where they differ.
 */
export async function constantTimeEqual(a: string, b: string): Promise<boolean> {
    const digestA = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(a)));
    const digestB = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(b)));
    let differences = 0;
    for (let i = 0; i < digestA.length; i++) differences |= digestA[i] ^ digestB[i];
    return differences === 0;
}

/** Short hash (8 hex bytes) of a token, embedded in the session payload. */
export async function hashToken(token: string): Promise<string> {
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(token)));
    return [...digest.slice(0, 8)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Signed cookie value; parts = ['admin'] or ['requester', id, tokenHash]. */
export async function createSession(secret: string, parts: string[], durationSeconds: number, now: Date): Promise<string> {
    const expiry = Math.floor(now.getTime() / 1000) + durationSeconds;
    const payload = [...parts, String(expiry)].join('.');
    return `${payload}.${await sign(secret, payload)}`;
}

/** Verifies signature, kind and expiry; returns the middle parts of the payload, or null. */
export async function verifySession(secret: string, value: string | undefined, expectedKind: 'requester' | 'admin', now: Date): Promise<string[] | null> {
    if (!value) return null;
    const separator = value.lastIndexOf('.');
    if (separator <= 0) return null;
    const payload = value.slice(0, separator);
    const receivedSignature = value.slice(separator + 1);
    if (!(await constantTimeEqual(receivedSignature, await sign(secret, payload)))) return null;
    const parts = payload.split('.');
    if (parts[0] !== expectedKind) return null;
    const expiry = Number(parts[parts.length - 1]);
    if (!Number.isFinite(expiry) || expiry * 1000 < now.getTime()) return null;
    return parts.slice(1, -1);
}

export function writeSessionCookie(c: Context, name: string, value: string, durationSeconds: number): void {
    setCookie(c, name, value, { httpOnly: true, secure: true, sameSite: 'Lax', path: '/', maxAge: durationSeconds });
}

export function clearSessionCookie(c: Context, name: string): void {
    deleteCookie(c, name, { path: '/' });
}

/**
 * Requester area middleware: verifies the signed cookie and reloads the
 * requester on every call, so suspension or link regeneration take effect
 * at once on every session already issued.
 */
export function requireRequester(): MiddlewareHandler<{ Bindings: Bindings; Variables: RequesterVariables }> {
    return async (c, next) => {
        const parts = await verifySession(c.env.ADMIN_SECRET, getCookie(c, COOKIE_REQUESTER), 'requester', new Date());
        if (!parts || parts.length !== 2) return c.json({ error: 'unauthorized' }, 401);
        const [idText, sessionTokenHash] = parts;
        const requester = await c.env.DB.prepare('SELECT * FROM requesters WHERE id = ?1').bind(Number(idText)).first<RequesterRow>();
        if (!requester || requester.status !== 'active') return c.json({ error: 'unauthorized' }, 401);
        if ((await hashToken(requester.access_token)) !== sessionTokenHash) return c.json({ error: 'unauthorized' }, 401);
        c.set('requester', requester);
        await next();
    };
}

/** Admin dashboard middleware. */
export function requireAdmin(): MiddlewareHandler<{ Bindings: Bindings }> {
    return async (c, next) => {
        const parts = await verifySession(c.env.ADMIN_SECRET, getCookie(c, COOKIE_ADMIN), 'admin', new Date());
        if (!parts) return c.json({ error: 'unauthorized' }, 401);
        await next();
    };
}
