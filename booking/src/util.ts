import type { Context } from 'hono';
import type { Lang } from './types';

/** Reads the JSON body; null (→ 400 in the caller) when missing, invalid or not an object. */
export async function readJson(c: Context): Promise<Record<string, unknown> | null> {
    try {
        const value = await c.req.json();
        if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
        return value as Record<string, unknown>;
    } catch {
        return null;
    }
}

/** Mandatory string: trimmed value when non-empty and within maxLength, otherwise null. */
export function text(value: unknown, maxLength: number): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (trimmed.length === 0 || trimmed.length > maxLength) return null;
    return trimmed;
}

/** Optional string: null when absent or blank, undefined when present but too long. */
export function optionalText(value: unknown, maxLength: number): string | null | undefined {
    if (value === undefined || value === null) return null;
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    if (trimmed === '') return null;
    if (trimmed.length > maxLength) return undefined;
    return trimmed;
}

export function isValidEmail(value: string): boolean {
    return value.length <= 200 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/** Phone numbers: digits with optional leading +, spaces, dots, dashes, parentheses; 6 to 30 characters. */
export function isValidPhone(value: string): boolean {
    return /^\+?[\d\s().-]{6,30}$/.test(value) && value.replace(/\D/g, '').length >= 6;
}

/** Integer within [min, max] from a JSON number, or null. */
export function integerBetween(value: unknown, min: number, max: number): number | null {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) return null;
    return value;
}

export const MAX_PRICE = 100_000;

export function roundCents(value: number): number {
    return Math.round(value * 100) / 100;
}

/** A price in euro: finite, non-negative, at most MAX_PRICE, with at most two decimals; null when invalid. */
export function priceValue(value: unknown): number | null {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > MAX_PRICE) return null;
    // A third decimal is refused rather than rounded: the cents the venue typed are the cents stored.
    if (roundCents(value) !== value) return null;
    return value;
}

/** Language of the requester: 'it' or 'en', defaulting to the given one. */
export function langOf(value: unknown, fallback: Lang): Lang {
    return value === 'en' || value === 'it' ? value : fallback;
}

/** Positive integer from a path parameter, or null. */
export function positiveInt(value: string | undefined): number | null {
    if (value === undefined || !/^\d{1,10}$/.test(value)) return null;
    return Number(value);
}

/** Random token for personal links: 32 lowercase hex characters (128 bits). */
export function randomToken(): string {
    return crypto.randomUUID().replace(/-/g, '');
}

/** Accepted shape of a token in a URL, checked before touching the database. */
export const TOKEN_RE = /^[a-f0-9]{32}$/;

/** Audit statement to include in a db.batch(). */
export function auditStatement(db: D1Database, action: string, details: string, actor: string): D1PreparedStatement {
    return db.prepare('INSERT INTO audit_log (action, details, actor) VALUES (?1, ?2, ?3)').bind(action, details, actor);
}

/** Immediate audit write (outside a batch). */
export async function writeAudit(db: D1Database, action: string, details: string, actor: string): Promise<void> {
    await auditStatement(db, action, details, actor).run();
}

/** Client IP as seen by Cloudflare; 'unknown' in local tests without the header. */
export function clientIp(c: Context): string {
    return c.req.header('cf-connecting-ip') ?? 'unknown';
}
