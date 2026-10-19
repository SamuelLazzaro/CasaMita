/**
 * Courtesy rate limiting backed by D1 (fixed window).
 *
 * A single UPSERT keeps everything in one query: if the stored window is
 * older than the window length the counter restarts from 1, otherwise it is
 * incremented. In SQLite all SET expressions of an UPDATE evaluate against
 * the row's ORIGINAL values, so the two CASEs below see the same window_start
 * and stay consistent with each other.
 */
export async function attemptAllowed(db: D1Database, key: string, maxAttempts: number, windowSeconds: number): Promise<boolean> {
    const row = await db
        .prepare(
            `INSERT INTO rate_limit (key, counter, window_start)
             VALUES (?1, 1, datetime('now'))
             ON CONFLICT(key) DO UPDATE SET
               counter = CASE WHEN window_start <= datetime('now', ?2) THEN 1 ELSE counter + 1 END,
               window_start = CASE WHEN window_start <= datetime('now', ?2) THEN datetime('now') ELSE window_start END
             RETURNING counter`,
        )
        .bind(key, `-${windowSeconds} seconds`)
        .first<{ counter: number }>();
    // On an unexpected answer deny, out of caution (fail-closed).
    return (row?.counter ?? maxAttempts + 1) <= maxAttempts;
}
