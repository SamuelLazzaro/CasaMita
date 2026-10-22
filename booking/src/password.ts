import type { Bindings } from './types';

/*
 * Password storage and policy of the dashboard users.
 *
 * Hash: PBKDF2-HMAC-SHA256 through WebCrypto, stored as
 *   pbkdf2-sha256$<iterations>$<salt base64url>$<key base64url>
 * The iteration count travels with the hash, so it can be raised at any
 * time without a migration: a user whose hash has fewer iterations than the
 * configured value is re-hashed at the next successful login.
 *
 * Why the count is configurable (PASSWORD_HASH_ITERATIONS): OWASP asks for
 * 600,000 iterations, which costs about 150 ms of CPU per login. The Workers
 * Free plan allows 10 ms per request, so a Free deployment has to run far
 * below that (20,000 by default here, about 5 ms) and compensates with the
 * password policy below; on the Paid plan the variable goes to 600,000.
 *
 * Policy (OWASP Authentication Cheat Sheet): length is what matters, no
 * composition rules; at least MIN_PASSWORD_LENGTH characters, and the
 * password must not appear in known breaches (Have I Been Pwned, queried
 * with k-anonymity: only the first 5 hex characters of the SHA-1 leave the
 * Worker).
 */

const ALGORITHM = 'pbkdf2-sha256';
const SALT_BYTES = 16;
const KEY_BITS = 256;

export const DEFAULT_ITERATIONS = 20_000;
const MIN_ITERATIONS = 1_000;
const MAX_ITERATIONS = 5_000_000;

export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 128;

const HIBP_RANGE_URL = 'https://api.pwnedpasswords.com/range/';
const HIBP_TIMEOUT_MS = 5_000;

const encoder = new TextEncoder();

function base64url(bytes: Uint8Array): string {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64url(text: string): Uint8Array | null {
    const padded = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4);
    try {
        return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
    } catch {
        return null;
    }
}

/** Iteration count for new hashes, from the deployment variable; the default when unset or out of range. */
export function configuredIterations(env: Pick<Bindings, 'PASSWORD_HASH_ITERATIONS'>): number {
    const value = Number(env.PASSWORD_HASH_ITERATIONS ?? DEFAULT_ITERATIONS);
    if (!Number.isInteger(value) || value < MIN_ITERATIONS || value > MAX_ITERATIONS) return DEFAULT_ITERATIONS;
    return value;
}

async function deriveKey(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
    const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, material, KEY_BITS);
    return new Uint8Array(bits);
}

export async function hashPassword(password: string, iterations: number): Promise<string> {
    const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
    const key = await deriveKey(password, salt, iterations);
    return [ALGORITHM, String(iterations), base64url(salt), base64url(key)].join('$');
}

type StoredHash = { iterations: number; salt: Uint8Array; key: Uint8Array };

function parseStoredHash(stored: string): StoredHash | null {
    const [algorithm, iterationsText, saltText, keyText, ...rest] = stored.split('$');
    if (algorithm !== ALGORITHM || rest.length > 0 || saltText === undefined || keyText === undefined) return null;
    const iterations = Number(iterationsText);
    if (!Number.isInteger(iterations) || iterations < 1) return null;
    const salt = fromBase64url(saltText);
    const key = fromBase64url(keyText);
    if (salt === null || key === null || key.length === 0) return null;
    return { iterations, salt, key };
}

/** Iteration count a stored hash was made with; null when the hash is malformed. */
export function iterationsOf(stored: string): number | null {
    return parseStoredHash(stored)?.iterations ?? null;
}

/** Byte-by-byte comparison whose duration does not depend on where the arrays differ. */
function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;
    let differences = 0;
    for (let i = 0; i < a.length; i++) differences |= a[i] ^ b[i];
    return differences === 0;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
    const parsed = parseStoredHash(stored);
    if (parsed === null) return false;
    const key = await deriveKey(password, parsed.salt, parsed.iterations);
    return bytesEqual(key, parsed.key);
}

/** Policy error code of a candidate password, or null when acceptable (the breach check is separate). */
export function passwordPolicyError(password: unknown): string | null {
    if (typeof password !== 'string') return 'invalid_password';
    if (password.length < MIN_PASSWORD_LENGTH) return 'password_too_short';
    if (password.length > MAX_PASSWORD_LENGTH) return 'password_too_long';
    return null;
}

async function sha1Hex(text: string): Promise<string> {
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-1', encoder.encode(text)));
    return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
}

/**
 * True when the password appears in the Have I Been Pwned corpus. Only the
 * first 5 characters of its SHA-1 are sent (k-anonymity); the answer lists
 * the suffixes of that range and is matched locally. Padding is requested
 * so the size of the answer reveals nothing either. A network failure
 * counts as "not breached": the check protects quality, it must not lock
 * the users out when the service is down (the event is logged).
 */
export async function isBreachedPassword(password: string, env: Pick<Bindings, 'PASSWORD_BREACH_CHECK'>): Promise<boolean> {
    if ((env.PASSWORD_BREACH_CHECK ?? '').trim().toLowerCase() === 'off') return false;
    const digest = await sha1Hex(password);
    const prefix = digest.slice(0, 5);
    const suffix = digest.slice(5);
    try {
        const response = await fetch(`${HIBP_RANGE_URL}${prefix}`, { headers: { 'Add-Padding': 'true' }, signal: AbortSignal.timeout(HIBP_TIMEOUT_MS) });
        if (!response.ok) throw new Error(`HIBP answered ${response.status}`);
        const body = await response.text();
        // One "SUFFIX:COUNT" per line; padded entries carry a count of 0.
        return body.split('\n').some((line) => { const [candidate, count] = line.trim().split(':'); return candidate === suffix && Number(count) > 0; });
    } catch (error) {
        console.error('password: breach check unavailable, skipped', error);
        return false;
    }
}
