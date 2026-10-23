/*
 * lib.mjs — what the tenant scripts share: reading and editing
 * wrangler.jsonc, running wrangler, validation, passwords.
 *
 * Node only (never bundled into the Worker). The password hash comes from
 * src/password.ts itself, so the scripts and the Worker can never disagree
 * on the format: Node strips the types at import time.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Root of the module (the folder holding wrangler.jsonc), whatever the current directory. */
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const WRANGLER_CONFIG = path.join(ROOT, 'wrangler.jsonc');
const WRANGLER_BIN = path.join(ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js');

export const DIRECTORY_DATABASE = 'booking-directory';

/** Databases per account on the Workers Free plan (docs/piano-paid.md). */
export const FREE_PLAN_MAX_DATABASES = 10;

/** Same rules as src/tenant.ts. */
export const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$/;
const RESERVED_SLUGS = new Set(['api', 'css', 'js', 'assets', 'admin', 'demo']);
export const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,39}$/;
export const BOOKING_TYPES = ['hotel', 'facility', 'restaurant'];

export function isValidSlug(slug) {
    return SLUG_RE.test(slug) && !RESERVED_SLUGS.has(slug);
}

/** D1 binding of a venue, as written in wrangler.jsonc and in tenants.binding: DB_ plus the slug in upper snake case. */
export function bindingOf(slug) {
    return `DB_${slug.toUpperCase().replace(/-/g, '_')}`;
}

/** Name of the venue's D1 database on Cloudflare. */
export function databaseNameOf(slug) {
    return `booking-${slug}`;
}

/* ------------------------------------------------------------ arguments */

/**
 * Minimal parser: positional values, `--key value` options and bare `--flag` switches.
 * @param {string[]} argv
 * @param {Set<string>} flags - names that take no value
 * @returns {{ positional: string[], options: Record<string, string>, flags: Set<string> }}
 */
export function parseArgs(argv, flags) {
    const parsed = { positional: [], options: {}, flags: new Set() };
    for (let i = 0; i < argv.length; i++) {
        const item = argv[i];
        if (!item.startsWith('--')) {
            parsed.positional.push(item);
            continue;
        }
        const name = item.slice(2);
        if (flags.has(name)) {
            parsed.flags.add(name);
            continue;
        }
        const value = argv[i + 1];
        if (value === undefined || value.startsWith('--')) throw new Error(`--${name} needs a value`);
        parsed.options[name] = value;
        i++;
    }
    return parsed;
}

/** `--local` or `--remote`, one of the two is mandatory so a script never touches production by accident. */
export function targetFlag(flags) {
    if (flags.has('local') === flags.has('remote')) throw new Error('say where to work: --local (wrangler dev databases) or --remote (Cloudflare)');
    return flags.has('local') ? '--local' : '--remote';
}

/* ---------------------------------------------------------- wrangler.jsonc */

/**
 * Removes the comments of a JSONC text, leaving strings untouched, so the
 * rest can go through JSON.parse.
 * @param {string} text
 * @returns {string}
 */
export function stripJsonComments(text) {
    let output = '';
    let inString = false;
    let i = 0;
    while (i < text.length) {
        const char = text[i];
        const next = text[i + 1];
        if (inString) {
            output += char;
            if (char === '\\') {
                output += next ?? '';
                i += 2;
                continue;
            }
            if (char === '"') inString = false;
            i++;
            continue;
        }
        if (char === '"') {
            inString = true;
            output += char;
            i++;
            continue;
        }
        if (char === '/' && next === '/') {
            while (i < text.length && text[i] !== '\n') i++;
            continue;
        }
        if (char === '/' && next === '*') {
            i += 2;
            while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++;
            i += 2;
            continue;
        }
        output += char;
        i++;
    }
    return output;
}

/**
 * Refuses a d1_databases list with a name or a binding used twice:
 * `wrangler d1 create` appends its own entry to the file, so a database
 * created by hand can end up listed next to the entry written for it.
 * @param {{ database_name?: string, binding?: string }[]} databases
 * @returns {void}
 */
export function checkDatabaseEntries(databases) {
    const seen = new Set();
    for (const entry of databases) {
        for (const key of [`name ${entry.database_name}`, `binding ${entry.binding}`]) {
            if (seen.has(key)) throw new Error(`wrangler.jsonc lists the database ${key} twice: keep one entry (with migrations_dir) and remove the other`);
            seen.add(key);
        }
    }
}

/** The parsed configuration (comments dropped), its database list checked. */
export function readWranglerConfig() {
    const config = JSON.parse(stripJsonComments(readFileSync(WRANGLER_CONFIG, 'utf8')));
    checkDatabaseEntries(config.d1_databases ?? []);
    return config;
}

/**
 * Adds a database entry at the end of the `d1_databases` array of a
 * wrangler.jsonc text, comments and formatting of the rest preserved. The
 * array is located by its key and closed by the first line holding only
 * `]` at the array's own indentation, which is how the file is written.
 * @param {string} text - the JSONC source
 * @param {{ binding: string, database_name: string, database_id: string, migrations_dir: string }} entry
 * @param {string} comment - one line written above the entry
 * @returns {string} the new source
 */
export function insertDatabaseEntry(text, entry, comment) {
    const keyMatch = /^([ \t]*)"d1_databases"\s*:\s*\[/m.exec(text);
    if (keyMatch === null) throw new Error('wrangler.jsonc: no "d1_databases" array');
    const indent = keyMatch[1];
    const arrayStart = keyMatch.index + keyMatch[0].length;
    const closing = new RegExp(`^${indent}\\]`, 'm');
    closing.lastIndex = 0;
    const rest = text.slice(arrayStart);
    const closeMatch = closing.exec(rest);
    if (closeMatch === null) throw new Error('wrangler.jsonc: the "d1_databases" array has no closing line');
    const closeIndex = arrayStart + closeMatch.index;
    const inner = text.slice(arrayStart, closeIndex);
    const itemIndent = `${indent}    `;
    const fieldIndent = `${itemIndent}    `;
    const lines = [`${itemIndent}{`, `${fieldIndent}// ${comment}`, `${fieldIndent}"binding": ${JSON.stringify(entry.binding)},`, `${fieldIndent}"database_name": ${JSON.stringify(entry.database_name)},`, `${fieldIndent}"database_id": ${JSON.stringify(entry.database_id)},`, `${fieldIndent}"migrations_dir": ${JSON.stringify(entry.migrations_dir)}`, `${itemIndent}}`];
    // The previous entry needs a trailing comma; an empty array does not.
    const trimmedInner = inner.replace(/\s+$/, '');
    const separator = trimmedInner.trim() === '' ? '' : ',';
    const newInner = `${trimmedInner}${separator}\n${lines.join('\n')}\n`;
    const result = text.slice(0, arrayStart) + newInner + text.slice(closeIndex);
    JSON.parse(stripJsonComments(result));
    return result;
}

/**
 * Removes the entry of a binding from the `d1_databases` array of a
 * wrangler.jsonc text, the other entries and their comments untouched. The
 * entries are the `{ ... }` blocks written at the array's item indentation
 * (the shape insertDatabaseEntry writes); the one naming the binding goes,
 * and the remaining ones are joined again with commas.
 * @param {string} text - the JSONC source
 * @param {string} binding - e.g. 'DB_HOTEL_ROSSI'
 * @returns {string} the new source
 */
export function removeDatabaseEntry(text, binding) {
    const keyMatch = /^([ \t]*)"d1_databases"\s*:\s*\[/m.exec(text);
    if (keyMatch === null) throw new Error('wrangler.jsonc: no "d1_databases" array');
    const indent = keyMatch[1];
    const arrayStart = keyMatch.index + keyMatch[0].length;
    const closeMatch = new RegExp(`^${indent}\\]`, 'm').exec(text.slice(arrayStart));
    if (closeMatch === null) throw new Error('wrangler.jsonc: the "d1_databases" array has no closing line');
    const closeIndex = arrayStart + closeMatch.index;
    const inner = text.slice(arrayStart, closeIndex);
    const itemIndent = `${indent}    `;
    const blockPattern = new RegExp(`^${itemIndent}\\{[\\s\\S]*?^${itemIndent}\\}`, 'gm');
    const blocks = inner.match(blockPattern) ?? [];
    const bindingLine = new RegExp(`^\\s*"binding"\\s*:\\s*${JSON.stringify(binding)}\\s*,?\\s*$`, 'm');
    const remaining = blocks.filter((block) => !bindingLine.test(block));
    if (remaining.length === blocks.length) throw new Error(`wrangler.jsonc: no database entry with binding "${binding}"`);
    const newInner = remaining.length === 0 ? '\n' : `\n${remaining.join(',\n')}\n`;
    const result = text.slice(0, arrayStart) + newInner + text.slice(closeIndex);
    JSON.parse(stripJsonComments(result));
    return result;
}

export function writeWranglerConfig(text) {
    writeFileSync(WRANGLER_CONFIG, text);
}

/* ---------------------------------------------------------------- wrangler */

/**
 * Runs wrangler through its JavaScript entry point (no shell, so SQL and
 * names with spaces travel untouched). Throws on a non-zero exit.
 * @param {string[]} args
 * @param {{ capture?: boolean }} [options] - capture: return stdout instead of showing it
 * @returns {string} stdout when captured, '' otherwise
 */
export function runWrangler(args, { capture = false } = {}) {
    if (!existsSync(WRANGLER_BIN)) throw new Error('wrangler is not installed: run npm install first');
    const result = spawnSync(process.execPath, [WRANGLER_BIN, ...args], { cwd: ROOT, encoding: 'utf8', stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit' });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`wrangler ${args.slice(0, 2).join(' ')} failed (exit ${result.status})`);
    return capture ? result.stdout : '';
}

/**
 * Runs SQL on a database and returns the rows of the (last) statement.
 * @param {string} database - database_name
 * @param {string} target - '--local' | '--remote'
 * @param {string} sql
 * @returns {Record<string, unknown>[]}
 */
export function querySql(database, target, sql) {
    const output = runWrangler(['d1', 'execute', database, target, '--json', '--command', sql], { capture: true });
    const start = output.indexOf('[');
    if (start < 0) throw new Error(`d1 execute: no JSON in the answer:\n${output}`);
    const answers = JSON.parse(output.slice(start));
    const last = answers[answers.length - 1];
    if (!last?.success) throw new Error(`d1 execute failed:\n${output}`);
    return last.results ?? [];
}

/** SQL literal of a string (single quotes doubled) or NULL. */
export function sqlString(value) {
    if (value === null || value === undefined || value === '') return 'NULL';
    return `'${String(value).replace(/'/g, "''")}'`;
}

/* --------------------------------------------------------------- passwords */

const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
export const GENERATED_PASSWORD_LENGTH = 20;

/**
 * Random password: letters and digits without the look-alikes (0/O, 1/l/I),
 * 20 characters, about 115 bits. Rejection sampling keeps it uniform.
 * @returns {string}
 */
export function generatePassword() {
    const limit = 256 - (256 % PASSWORD_ALPHABET.length);
    let password = '';
    while (password.length < GENERATED_PASSWORD_LENGTH) {
        const byte = crypto.getRandomValues(new Uint8Array(1))[0];
        if (byte < limit) password += PASSWORD_ALPHABET[byte % PASSWORD_ALPHABET.length];
    }
    return password;
}

/** The iteration count the deployment is configured with (wrangler.jsonc vars), same rule as the Worker. */
export async function configuredIterations(config) {
    const { configuredIterations: fromWorker } = await import('../src/password.ts');
    return fromWorker({ PASSWORD_HASH_ITERATIONS: config.vars?.PASSWORD_HASH_ITERATIONS });
}

export async function hashPassword(password, iterations) {
    const { hashPassword: fromWorker } = await import('../src/password.ts');
    return await fromWorker(password, iterations);
}

/** Prints and exits with 1: every script reports errors the same way. */
export function fail(message) {
    console.error(`error: ${message}`);
    process.exit(1);
}
