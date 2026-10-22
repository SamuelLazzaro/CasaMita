import { Hono } from 'hono';
import type { Bindings, UserRow } from '../types';
import { clearSessionCookie, COOKIE_ADMIN, startAdminSession } from '../auth';
import { configuredIterations, hashPassword, iterationsOf, verifyPassword } from '../password';
import { attemptAllowed } from '../ratelimit';
import { clientIp, readJson, writeAudit } from '../util';

/*
 * Sign-in of the dashboard users, at the root of the deployment (no venue
 * in the URL): the username leads to the venue, and the answer carries the
 * slug the browser has to go to. Everything here reads and writes the
 * directory only.
 *
 * Two independent brakes on guessing: a fixed window per IP, and a lock of
 * the account after LOCK_AFTER_FAILURES wrong passwords in a row, so a
 * distributed attack on one username is slowed down as well. A wrong
 * username costs the same as a wrong password (a hash is computed anyway),
 * so the timing tells the two cases apart no better than the answer does.
 */

const LOGIN_MAX_ATTEMPTS = 10;
const LOGIN_WINDOW_SECONDS = 15 * 60;
const LOCK_AFTER_FAILURES = 10;
const LOCK_MINUTES = 15;

/** Hash of a random password, verified against when the username is unknown, to keep the timing even. */
let g_decoyHash: Promise<string> | null = null;

function decoyHash(iterations: number): Promise<string> {
    if (g_decoyHash === null) g_decoyHash = hashPassword(crypto.randomUUID(), iterations);
    return g_decoyHash;
}

export const session = new Hono<{ Bindings: Bindings }>();

session.post('/login', async (c) => {
    const ip = clientIp(c);
    if (!(await attemptAllowed(c.env.DIRECTORY, `login:${ip}`, LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_SECONDS))) return c.json({ error: 'too_many_requests' }, 429);
    const body = await readJson(c);
    const username = typeof body?.username === 'string' ? body.username.trim().toLowerCase() : '';
    const password = typeof body?.password === 'string' ? body.password : '';
    if (username === '' || password === '') return c.json({ error: 'invalid_credentials' }, 401);

    const iterations = configuredIterations(c.env);
    const user = await c.env.DIRECTORY.prepare('SELECT * FROM users WHERE username = ?1').bind(username).first<UserRow>();
    if (user === null) {
        await verifyPassword(password, await decoyHash(iterations));
        await writeAudit(c.env.DIRECTORY, 'login_failed', `unknown username from ${ip}`, 'system');
        return c.json({ error: 'invalid_credentials' }, 401);
    }

    const now = new Date();
    if (user.locked_until !== null && new Date(`${user.locked_until}Z`).getTime() > now.getTime()) {
        await writeAudit(c.env.DIRECTORY, 'login_locked', `attempt from ${ip} while locked`, `user:${user.id}`);
        return c.json({ error: 'account_locked' }, 429);
    }

    if (!(await verifyPassword(password, user.password_hash))) {
        const failures = user.failed_attempts + 1;
        const lock = failures >= LOCK_AFTER_FAILURES;
        // On lock the counter restarts, so the next window of failures is counted afresh.
        await c.env.DIRECTORY.prepare(`UPDATE users SET failed_attempts = ?2, locked_until = CASE WHEN ?3 THEN datetime('now', '+${LOCK_MINUTES} minutes') ELSE locked_until END WHERE id = ?1`).bind(user.id, lock ? 0 : failures, lock ? 1 : 0).run();
        await writeAudit(c.env.DIRECTORY, lock ? 'account_locked' : 'login_failed', `wrong password from ${ip}`, `user:${user.id}`);
        return c.json({ error: 'invalid_credentials' }, 401);
    }

    // A hash made with another iteration count than the configured one is
    // refreshed now, the only moment the clear password is available.
    let passwordHash = user.password_hash;
    if (iterationsOf(passwordHash) !== iterations) passwordHash = await hashPassword(password, iterations);
    await c.env.DIRECTORY.prepare("UPDATE users SET password_hash = ?2, failed_attempts = 0, locked_until = NULL, last_login_at = datetime('now') WHERE id = ?1").bind(user.id, passwordHash).run();
    await startAdminSession(c, { ...user, password_hash: passwordHash });
    await writeAudit(c.env.DIRECTORY, 'login', `from ${ip}`, `user:${user.id}`);
    return c.json({ ok: true, slug: user.tenant_slug, username: user.username });
});

session.post('/logout', (c) => {
    clearSessionCookie(c, COOKIE_ADMIN);
    return c.json({ ok: true });
});
