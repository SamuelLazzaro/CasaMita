/*
 * tenant-password.mjs — new generated password for a dashboard user who
 * lost theirs, printed once:
 *
 *   npm run tenant:password -- <username> --remote
 *
 * Also lifts the lock of the account (failed attempts, locked_until). The
 * change of hash ends every session of the user.
 */
import { configuredIterations, DIRECTORY_DATABASE, fail, generatePassword, hashPassword, parseArgs, querySql, readWranglerConfig, sqlString, targetFlag } from './lib.mjs';

let args;
try {
    args = parseArgs(process.argv.slice(2), new Set(['local', 'remote']));
} catch (error) {
    fail(error.message);
}

const [username] = args.positional;
if (!username) fail('first argument: the username');

let target;
try {
    target = targetFlag(args.flags);
} catch (error) {
    fail(error.message);
}

const found = querySql(DIRECTORY_DATABASE, target, `SELECT id, tenant_slug FROM users WHERE username = ${sqlString(username)}`);
if (found.length === 0) fail(`no user "${username}" in the directory`);

const password = generatePassword();
const passwordHash = await hashPassword(password, await configuredIterations(readWranglerConfig()));
querySql(DIRECTORY_DATABASE, target, `UPDATE users SET password_hash = ${sqlString(passwordHash)}, failed_attempts = 0, locked_until = NULL, password_changed_at = datetime('now') WHERE id = ${Number(found[0].id)}`);

console.log(`New password of ${username} (venue /${found[0].tenant_slug}/), shown once: ${password}`);
console.log('Every session of the user is over; the account is unlocked.');
