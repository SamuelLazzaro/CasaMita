import { applyD1Migrations, env } from 'cloudflare:test';
import { hashPassword } from '../src/password';

/*
 * Schema and fixtures of the isolated test databases, before every test
 * file. TEST_MIGRATIONS and TEST_DIRECTORY_MIGRATIONS come from
 * vitest.config.ts. Three test venues, one per booking type, each with its
 * own database and one dashboard user (password 'test-password-123').
 */

await applyD1Migrations(env.DIRECTORY, env.TEST_DIRECTORY_MIGRATIONS);
await applyD1Migrations(env.DB_HOTEL, env.TEST_MIGRATIONS);
await applyD1Migrations(env.DB_RESTAURANT, env.TEST_MIGRATIONS);
await applyD1Migrations(env.DB_FACILITY, env.TEST_MIGRATIONS);

const passwordHash = await hashPassword('test-password-123', 1000);

const tenants = [
    { slug: 'hotel-test', binding: 'DB_HOTEL', type: 'hotel', name: 'Hotel Test', username: 'hotel-admin' },
    { slug: 'restaurant-test', binding: 'DB_RESTAURANT', type: 'restaurant', name: 'Ristorante Test', username: 'restaurant-admin' },
    { slug: 'facility-test', binding: 'DB_FACILITY', type: 'facility', name: 'Impianto Test', username: 'facility-admin' },
];

for (const tenant of tenants) {
    await env.DIRECTORY.prepare("INSERT OR IGNORE INTO tenants (slug, binding, type, name, email_sender, email_admin, retention_days) VALUES (?1, ?2, ?3, ?4, 'booking@example.com', 'owner@example.com', 90)").bind(tenant.slug, tenant.binding, tenant.type, tenant.name).run();
    await env.DIRECTORY.prepare('INSERT OR IGNORE INTO users (tenant_slug, username, password_hash) VALUES (?1, ?2, ?3)').bind(tenant.slug, tenant.username, passwordHash).run();
}

// Room types of the hotel venue (migration 0004 seeds none), one room each and no base price.
const roomTypes = [
    { name: 'Singola', maxGuests: 1 },
    { name: 'Matrimoniale', maxGuests: 2 },
    { name: 'Doppia', maxGuests: 2 },
    { name: 'Tripla', maxGuests: 3 },
    { name: 'Quadrupla', maxGuests: 4 },
];

for (const roomType of roomTypes) {
    await env.DB_HOTEL.prepare('INSERT OR IGNORE INTO room_types (name, max_guests, quantity) VALUES (?1, ?2, 1)').bind(roomType.name, roomType.maxGuests).run();
}
