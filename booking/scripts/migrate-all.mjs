/*
 * migrate-all.mjs — applies the pending migrations to every database of
 * wrangler.jsonc, the directory and each venue, one after the other:
 *
 *   npm run migrate:all -- --local
 *   npm run migrate:all -- --remote
 *
 * `wrangler d1 migrations apply` works on one database at a time and reads
 * the migrations folder of each entry (migrations_dir), so the directory
 * gets migrations-directory/ and the venues migrations/.
 */
import { fail, parseArgs, readWranglerConfig, runWrangler, targetFlag } from './lib.mjs';

let args;
try {
    args = parseArgs(process.argv.slice(2), new Set(['local', 'remote']));
} catch (error) {
    fail(error.message);
}

let target;
try {
    target = targetFlag(args.flags);
} catch (error) {
    fail(error.message);
}

const databases = readWranglerConfig().d1_databases ?? [];
if (databases.length === 0) fail('wrangler.jsonc lists no database');

const failures = [];
for (const entry of databases) {
    console.log(`\n== ${entry.database_name} (${entry.binding}) ==`);
    try {
        runWrangler(['d1', 'migrations', 'apply', entry.database_name, target]);
    } catch (error) {
        console.error(`failed: ${error.message}`);
        failures.push(entry.database_name);
    }
}

if (failures.length > 0) fail(`migrations failed on: ${failures.join(', ')}`);
console.log(`\nMigrations applied to ${databases.length} databases.`);
