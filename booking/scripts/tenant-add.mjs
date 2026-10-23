/*
 * tenant-add.mjs — registers a new venue, end to end:
 *
 *   npm run tenant:add -- <slug> --type hotel --name "Hotel Rossi" --username rossi --remote
 *
 * 1. creates the venue's D1 database on Cloudflare (`wrangler d1 create`
 *    with the Western Europe location hint, see D1_LOCATION_HINT; with
 *    --local no database is created, wrangler dev makes it on first use),
 * 2. adds its binding to wrangler.jsonc (comments preserved),
 * 3. applies the booking migrations to it,
 * 4. writes the tenant row and its first user in the directory, with a
 *    generated password printed once at the end.
 * With --remote the new binding reaches production at the next `npm run deploy`.
 *
 * Options: --type hotel|facility|restaurant, --name, --username (required);
 * --lang it|en, --email-sender, --email-admin, --retention-days, --embed-origin,
 * --privacy-controller, --privacy-address, --privacy-email, --accent #rrggbb,
 * --phone, --vat, --conditions-url (optional; the conditions text is set
 * afterwards with `wrangler d1 execute`, see the README);
 * --local | --remote (one is required); --allow-many-databases (Paid plan:
 * skips the Free plan check of 10 databases per account).
 */
import { readFileSync } from 'node:fs';
import { BOOKING_TYPES, bindingOf, configuredIterations, databaseNameOf, DIRECTORY_DATABASE, fail, FREE_PLAN_MAX_DATABASES, generatePassword, hashPassword, insertDatabaseEntry, isValidSlug, parseArgs, querySql, readWranglerConfig, runWrangler, sqlString, targetFlag, USERNAME_RE, WRANGLER_CONFIG, writeWranglerConfig } from './lib.mjs';

const FLAGS = new Set(['local', 'remote', 'allow-many-databases']);

/*
 * Location hint of the new databases: Western Europe, so the guests' data
 * stay in the EU as the privacy notice and the contract with the venue
 * declare. D1 treats it as a preference, not a guarantee, and the location
 * cannot be changed once the database exists.
 * https://developers.cloudflare.com/d1/configuration/data-location/
 */
const D1_LOCATION_HINT = 'weur';

let args;
try {
    args = parseArgs(process.argv.slice(2), FLAGS);
} catch (error) {
    fail(error.message);
}

const [slug] = args.positional;
const { type, name, username } = args.options;
if (!slug || !isValidSlug(slug)) fail('first argument: the slug of the venue, lowercase letters, digits and dashes (2 to 40 characters), not a reserved word');
if (!BOOKING_TYPES.includes(type)) fail(`--type must be one of ${BOOKING_TYPES.join(', ')}`);
if (!name || name.trim() === '' || name.length > 80) fail('--name is required (at most 80 characters)');
if (!username || !USERNAME_RE.test(username)) fail('--username: lowercase letters, digits, dots, dashes and underscores, 3 to 40 characters');
const lang = args.options.lang ?? 'it';
if (!['it', 'en'].includes(lang)) fail('--lang must be it or en');
const retentionDays = Number(args.options['retention-days'] ?? 90);
if (!Number.isInteger(retentionDays) || retentionDays < 0) fail('--retention-days must be a non-negative integer');
// The accent colour: six hex digits with a leading hash, stored lowercase (src/config.ts applies the same rule when reading).
const accent = args.options.accent === undefined ? null : args.options.accent.trim().toLowerCase();
if (accent !== null && !/^#[0-9a-f]{6}$/.test(accent)) fail('--accent must be a hex colour like #237a87');
// The venue's own booking conditions page, if it has one: a complete http(s) address.
const conditionsUrl = args.options['conditions-url'] ?? null;
if (conditionsUrl !== null && !/^https?:\/\/\S+$/.test(conditionsUrl)) fail('--conditions-url must be a complete address starting with https:// or http://');

let target;
try {
    target = targetFlag(args.flags);
} catch (error) {
    fail(error.message);
}

const config = readWranglerConfig();
const databases = config.d1_databases ?? [];
const binding = bindingOf(slug);
const databaseName = databaseNameOf(slug);
if (databases.some((entry) => entry.binding === binding || entry.database_name === databaseName)) fail(`wrangler.jsonc already has a database for "${slug}" (${binding})`);
if (target === '--remote' && databases.length >= FREE_PLAN_MAX_DATABASES && !args.flags.has('allow-many-databases')) fail(`the Workers Free plan allows ${FREE_PLAN_MAX_DATABASES} databases per account and wrangler.jsonc already lists ${databases.length}; on the Paid plan pass --allow-many-databases (see docs/piano-paid.md)`);

// The directory must not know the slug or the username yet.
const slugTaken = querySql(DIRECTORY_DATABASE, target, `SELECT slug FROM tenants WHERE slug = ${sqlString(slug)}`);
if (slugTaken.length > 0) fail(`the directory already has a venue "${slug}"`);
const usernameTaken = querySql(DIRECTORY_DATABASE, target, `SELECT username FROM users WHERE username = ${sqlString(username)}`);
if (usernameTaken.length > 0) fail(`the directory already has a user "${username}"`);

// 1. The database.
let databaseId;
if (target === '--remote') {
    console.log(`Creating the D1 database ${databaseName}...`);
    const output = runWrangler(['d1', 'create', databaseName, '--location', D1_LOCATION_HINT], { capture: true });
    const idMatch = /"database_id":\s*"([0-9a-f-]{36})"/.exec(output);
    if (idMatch === null) fail(`could not read the database id from the answer of wrangler d1 create:\n${output}`);
    databaseId = idMatch[1];
    console.log(`Created: ${databaseId}`);
} else {
    // Locally the id only names the SQLite file under .wrangler/.
    databaseId = `LOCAL-${databaseName}`;
}

// 2. The binding.
const source = readFileSync(WRANGLER_CONFIG, 'utf8');
writeWranglerConfig(insertDatabaseEntry(source, { binding, database_name: databaseName, database_id: databaseId, migrations_dir: './migrations' }, `${name} (${type})`));
console.log(`Added the binding ${binding} to wrangler.jsonc`);

// 3. The schema.
console.log(`Applying the migrations to ${databaseName}...`);
runWrangler(['d1', 'migrations', 'apply', databaseName, target]);

// 4. The directory rows.
const password = generatePassword();
const passwordHash = await hashPassword(password, await configuredIterations(config));
const options = args.options;
const tenantSql = `INSERT INTO tenants (slug, binding, type, name, default_lang, email_sender, email_admin, retention_days, embed_origin, privacy_controller, privacy_address, privacy_email, accent, phone, vat_number, conditions_url) VALUES (${sqlString(slug)}, ${sqlString(binding)}, ${sqlString(type)}, ${sqlString(name.trim())}, ${sqlString(lang)}, ${sqlString(options['email-sender'])}, ${sqlString(options['email-admin'])}, ${retentionDays}, ${sqlString(options['embed-origin'])}, ${sqlString(options['privacy-controller'])}, ${sqlString(options['privacy-address'])}, ${sqlString(options['privacy-email'])}, ${sqlString(accent)}, ${sqlString(options.phone)}, ${sqlString(options.vat)}, ${sqlString(conditionsUrl)})`;
const userSql = `INSERT INTO users (tenant_slug, username, password_hash) VALUES (${sqlString(slug)}, ${sqlString(username)}, ${sqlString(passwordHash)})`;
querySql(DIRECTORY_DATABASE, target, `${tenantSql}; ${userSql}`);

console.log('');
console.log(`Venue "${name}" registered as /${slug}/ (${type}).`);
console.log(`Dashboard user: ${username}`);
console.log(`Password (shown once, hand it over and ask to change it at the first sign-in): ${password}`);
console.log('');
if (target === '--remote') console.log('Next: npm run deploy (the new binding is not live until then).');
else console.log('Next: npm run dev, then sign in at http://localhost:8787/admin');
