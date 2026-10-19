import path from 'node:path';
import { defineWorkersConfig, readD1Migrations } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig(async () => {
    // Migrations are read here and applied to the isolated test D1 by
    // test/apply-migrations.ts before every test file.
    const migrations = await readD1Migrations(path.join(__dirname, 'migrations'));

    return {
        test: {
            setupFiles: ['./test/apply-migrations.ts'],
            poolOptions: {
                workers: {
                    wrangler: { configPath: './wrangler.jsonc' },
                    miniflare: {
                        bindings: {
                            TEST_MIGRATIONS: migrations,
                            // Fake secrets, used ONLY by the test suite.
                            ADMIN_SECRET: 'hmac-key-for-tests-only',
                            ADMIN_PASSWORD: 'test-password',
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
