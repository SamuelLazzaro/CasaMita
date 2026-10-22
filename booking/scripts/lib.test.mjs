/*
 * Tests of the pure helpers of lib.mjs (no wrangler, no network):
 *   npm run test:scripts
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bindingOf, checkDatabaseEntries, generatePassword, GENERATED_PASSWORD_LENGTH, insertDatabaseEntry, isValidSlug, parseArgs, sqlString, stripJsonComments, targetFlag } from './lib.mjs';

test('stripJsonComments drops line and block comments but keeps strings', () => {
    const source = '{\n  // a comment with "quotes"\n  "url": "http://x/y", /* block */ "slash": "a//b", "esc": "say \\"hi\\" // not a comment"\n}';
    assert.deepEqual(JSON.parse(stripJsonComments(source)), { url: 'http://x/y', slash: 'a//b', esc: 'say "hi" // not a comment' });
});

test('insertDatabaseEntry appends an entry, keeps the comments and stays valid JSONC', () => {
    const source = '{\n    "name": "booking",\n    "d1_databases": [\n        {\n            // The directory.\n            "binding": "DIRECTORY",\n            "database_name": "booking-directory",\n            "database_id": "abc",\n            "migrations_dir": "./migrations-directory"\n        }\n    ]\n}\n';
    const result = insertDatabaseEntry(source, { binding: 'DB_HOTEL_ROSSI', database_name: 'booking-hotel-rossi', database_id: 'id-1', migrations_dir: './migrations' }, 'Hotel Rossi (hotel)');
    const parsed = JSON.parse(stripJsonComments(result));
    assert.equal(parsed.d1_databases.length, 2);
    assert.deepEqual(parsed.d1_databases[1], { binding: 'DB_HOTEL_ROSSI', database_name: 'booking-hotel-rossi', database_id: 'id-1', migrations_dir: './migrations' });
    assert.ok(result.includes('// The directory.'));
    assert.ok(result.includes('// Hotel Rossi (hotel)'));
    // Appending again keeps working (the comma logic sees the previous entry).
    const again = insertDatabaseEntry(result, { binding: 'DB_X', database_name: 'booking-x', database_id: 'id-2', migrations_dir: './migrations' }, 'X');
    assert.equal(JSON.parse(stripJsonComments(again)).d1_databases.length, 3);
});

test('insertDatabaseEntry works on an empty array', () => {
    const source = '{\n    "d1_databases": [\n    ]\n}\n';
    const result = insertDatabaseEntry(source, { binding: 'DB_A', database_name: 'booking-a', database_id: 'id', migrations_dir: './migrations' }, 'A');
    assert.equal(JSON.parse(stripJsonComments(result)).d1_databases.length, 1);
});

test('checkDatabaseEntries refuses a name or a binding listed twice', () => {
    checkDatabaseEntries([{ binding: 'DIRECTORY', database_name: 'booking-directory' }, { binding: 'DB_A', database_name: 'booking-a' }]);
    assert.throws(() => checkDatabaseEntries([{ binding: 'DIRECTORY', database_name: 'booking-directory' }, { binding: 'booking_directory', database_name: 'booking-directory' }]), /twice/);
    assert.throws(() => checkDatabaseEntries([{ binding: 'DB_A', database_name: 'booking-a' }, { binding: 'DB_A', database_name: 'booking-b' }]), /twice/);
});

test('slug and binding rules match the Worker', () => {
    assert.equal(isValidSlug('hotel-rossi'), true);
    assert.equal(isValidSlug('Hotel'), false);
    assert.equal(isValidSlug('-x'), false);
    assert.equal(isValidSlug('admin'), false);
    assert.equal(isValidSlug('api'), false);
    assert.equal(bindingOf('hotel-rossi'), 'DB_HOTEL_ROSSI');
});

test('parseArgs reads positionals, options and flags', () => {
    const parsed = parseArgs(['hotel-rossi', '--type', 'hotel', '--name', 'Hotel Rossi', '--remote'], new Set(['local', 'remote']));
    assert.deepEqual(parsed.positional, ['hotel-rossi']);
    assert.deepEqual(parsed.options, { type: 'hotel', name: 'Hotel Rossi' });
    assert.ok(parsed.flags.has('remote'));
    assert.throws(() => parseArgs(['--type'], new Set()), /needs a value/);
    assert.throws(() => targetFlag(new Set()), /--local/);
    assert.throws(() => targetFlag(new Set(['local', 'remote'])), /--local/);
    assert.equal(targetFlag(new Set(['local'])), '--local');
});

test('sqlString quotes and doubles the single quotes', () => {
    assert.equal(sqlString("L'Hotel"), "'L''Hotel'");
    assert.equal(sqlString(''), 'NULL');
    assert.equal(sqlString(undefined), 'NULL');
});

test('generatePassword gives 20 characters of the alphabet, different every time', () => {
    const first = generatePassword();
    const second = generatePassword();
    assert.equal(first.length, GENERATED_PASSWORD_LENGTH);
    assert.match(first, /^[A-HJ-NP-Za-km-z2-9]+$/);
    assert.notEqual(first, second);
});
