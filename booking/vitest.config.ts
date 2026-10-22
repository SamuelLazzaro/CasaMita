import path from 'node:path';
import { defineWorkersConfig, readD1Migrations } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig(async () => {
    // Migrations are read here and applied to the isolated test databases by
    // test/apply-migrations.ts before every test file: the directory gets
    // its own, every test venue gets the booking schema.
    const migrations = await readD1Migrations(path.join(__dirname, 'migrations'));
    const directoryMigrations = await readD1Migrations(path.join(__dirname, 'migrations-directory'));

    return {
        test: {
            // The Worker suite only: the Node tests of scripts/ run with `npm run test:scripts`.
            include: ['test/**/*.test.ts'],
            setupFiles: ['./test/apply-migrations.ts'],
            poolOptions: {
                workers: {
                    wrangler: { configPath: './wrangler.jsonc' },
                    miniflare: {
                        // One database per test venue (hotel, restaurant, facility),
                        // on top of DIRECTORY and DB_DEMO from wrangler.jsonc.
                        d1Databases: { DB_HOTEL: { id: 'test-hotel' }, DB_RESTAURANT: { id: 'test-restaurant' }, DB_FACILITY: { id: 'test-facility' } },
                        bindings: {
                            TEST_MIGRATIONS: migrations,
                            TEST_DIRECTORY_MIGRATIONS: directoryMigrations,
                            // Fake secrets, used ONLY by the test suite.
                            ADMIN_SECRET: 'hmac-key-for-tests-only',
                            // Fast hashes and no network: the suite must stay quick and offline.
                            PASSWORD_HASH_ITERATIONS: '1000',
                            PASSWORD_BREACH_CHECK: 'off',
                            // Override any real key loaded from .dev.vars: tests
                            // must never send emails (empty = sending disabled).
                            BREVO_API_KEY: '',
                        },
                    },
                },
            },
        },
    };
});
