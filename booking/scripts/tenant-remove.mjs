/*
 * tenant-remove.mjs — closes a venue at the end of its contract, in the
 * order the data processing agreement promises (return, then delete):
 *
 *   npm run tenant:remove -- <slug> --remote --yes
 *
 * 1. exports the venue's database to backup-<slug>-<timestamp>.sql: the copy
 *    to hand back to the venue (it holds personal data: never commit it,
 *    delete it once delivered),
 * 2. deletes the venue's users and row from the directory,
 * 3. deletes the venue's D1 database on Cloudflare (with --local the file
 *    under .wrangler/ is left alone),
 * 4. removes its binding from wrangler.jsonc (comments preserved),
 * 5. writes removal-<slug>-<timestamp>.txt, the record of what was done, for
 *    the written certification owed to the venue.
 * Then `npm run deploy`, so the Worker stops binding the deleted database.
 *
 * Without --yes the script only shows what it would do. --keep-database
 * skips step 3 and step 4 (the venue is gone from the directory, the data
 * stay until a later run), for a notice period.
 */
import { writeFileSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { DIRECTORY_DATABASE, fail, isValidSlug, parseArgs, querySql, readWranglerConfig, removeDatabaseEntry, runWrangler, sqlString, targetFlag, WRANGLER_CONFIG, writeWranglerConfig } from './lib.mjs';

const FLAGS = new Set(['local', 'remote', 'yes', 'keep-database']);

let args;
try {
    args = parseArgs(process.argv.slice(2), FLAGS);
} catch (error) {
    fail(error.message);
}

const [slug] = args.positional;
if (!slug || !isValidSlug(slug)) fail('first argument: the slug of the venue');

let target;
try {
    target = targetFlag(args.flags);
} catch (error) {
    fail(error.message);
}

const rows = querySql(DIRECTORY_DATABASE, target, `SELECT slug, binding, name, type FROM tenants WHERE slug = ${sqlString(slug)}`);
if (rows.length === 0) fail(`the directory has no venue "${slug}"`);
const tenant = rows[0];
const users = querySql(DIRECTORY_DATABASE, target, `SELECT username FROM users WHERE tenant_slug = ${sqlString(slug)}`);

const config = readWranglerConfig();
const entry = (config.d1_databases ?? []).find((database) => database.binding === tenant.binding);
if (entry === undefined) fail(`wrangler.jsonc has no database with binding "${tenant.binding}" (the directory row names it)`);
const databaseName = entry.database_name;

// Timestamp for the file names: UTC, no separators that a shell dislikes.
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
const backupFile = `backup-${slug}-${stamp}.sql`;
const recordFile = `removal-${slug}-${stamp}.txt`;
const keepDatabase = args.flags.has('keep-database');

console.log(`Venue "${tenant.name}" (/${slug}/, ${tenant.type}), binding ${tenant.binding}, database ${databaseName}, ${users.length} dashboard user(s).`);
console.log('Plan:');
console.log(`  1. export the database to ${backupFile}`);
console.log(`  2. delete the ${users.length} user(s) and the venue row from the directory`);
console.log(keepDatabase ? '  3. keep the database and its binding (--keep-database)' : `  3. delete the database ${databaseName}${target === '--local' ? ' (local: nothing to delete)' : ''} and its binding in wrangler.jsonc`);
console.log(`  4. write ${recordFile}`);
if (!args.flags.has('yes')) {
    console.log('');
    console.log('Nothing done: add --yes to run the plan.');
    process.exit(0);
}

// 1. The copy to return to the venue.
runWrangler(['d1', 'export', databaseName, target, '--output', backupFile]);
console.log(`Exported to ${backupFile} (personal data: hand it over, then delete it).`);

// 2. The directory: users first (they reference the venue), then the venue.
querySql(DIRECTORY_DATABASE, target, `DELETE FROM users WHERE tenant_slug = ${sqlString(slug)}; DELETE FROM tenants WHERE slug = ${sqlString(slug)}`);
console.log('Removed the venue and its users from the directory.');

// 3. The database and 4. the binding.
let databaseAction;
if (keepDatabase) {
    databaseAction = `database ${databaseName} kept (--keep-database), binding ${tenant.binding} still in wrangler.jsonc`;
} else {
    if (target === '--remote') runWrangler(['d1', 'delete', databaseName, '--skip-confirmation']);
    writeWranglerConfig(removeDatabaseEntry(readFileSync(WRANGLER_CONFIG, 'utf8'), tenant.binding));
    databaseAction = target === '--remote' ? `database ${databaseName} deleted on Cloudflare, binding ${tenant.binding} removed from wrangler.jsonc` : `binding ${tenant.binding} removed from wrangler.jsonc (local database left under .wrangler/)`;
    console.log(databaseAction);
}

// 5. The record for the certification to the venue (clause on deletion and return of the data).
const record = [`Removal of the venue "${tenant.name}" (/${slug}/, ${tenant.type})`, `Date (UTC): ${new Date().toISOString()}`, `Environment: ${target === '--remote' ? 'Cloudflare (production)' : 'local'}`, `Database exported to: ${backupFile}`, `Directory: venue row and ${users.length} dashboard user(s) deleted (${users.map((user) => user.username).join(', ') || 'none'})`, `Database: ${databaseAction}`, 'Platform copies: Cloudflare D1 Time Travel keeps a restore window of 7 days (Free) or 30 days (Paid) after the deletion; emails already sent stay with Brevo for the time stated in its agreement.', 'Next step: npm run deploy, then delete the backup file once delivered.'].join('\n');
writeFileSync(recordFile, `${record}\n`);
console.log('');
console.log(record);
console.log('');
console.log(`Record written to ${recordFile}. Next: npm run deploy.`);
