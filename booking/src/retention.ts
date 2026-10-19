import type { VenueConfig } from './config';
import { addDays, romeNow } from './dates';
import { writeAudit } from './util';

/**
 * Data retention job (GDPR art. 5.1.e, storage limitation).
 *
 * Once the stay or the meal is over, the guest's identity has no purpose
 * left: after `retentionDays` the personal fields of hotel and restaurant
 * requests are emptied, the personal link is revoked and the row is kept
 * (dates, room type, party size) for statistics. The end of a booking is
 * check_out for hotels and the date for restaurants; rejected and cancelled
 * requests follow the same clock. Facility requesters are organisations
 * managed by the admin, not guests, so their requests are left alone.
 *
 * Runs from the cron trigger in wrangler.jsonc; retentionDays = 0 disables it.
 */
export async function anonymiseExpiredRequests(db: D1Database, config: VenueConfig, now: Date): Promise<number> {
    if (config.retentionDays === 0) return 0;
    const cutoff = addDays(romeNow(now).date, -config.retentionDays);
    const result = await db
        .prepare(
            `UPDATE requests
             SET first_name = NULL, last_name = NULL, email = NULL, phone = NULL, notes = NULL, guest_token = NULL, anonymised_at = datetime('now')
             WHERE anonymised_at IS NULL AND type IN ('hotel', 'restaurant') AND COALESCE(check_out, date) < ?1`,
        )
        .bind(cutoff)
        .run();
    const count = result.meta.changes;
    if (count > 0) await writeAudit(db, 'requests_anonymised', `${count} requests ended before ${cutoff}`, 'system');
    return count;
}
