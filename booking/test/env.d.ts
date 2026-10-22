import type { Bindings } from '../src/types';

declare module 'cloudflare:test' {
    interface ProvidedEnv extends Bindings {
        TEST_MIGRATIONS: D1Migration[];
        TEST_DIRECTORY_MIGRATIONS: D1Migration[];
        /** The databases of the three test venues (vitest.config.ts). */
        DB_HOTEL: D1Database;
        DB_RESTAURANT: D1Database;
        DB_FACILITY: D1Database;
    }
}
