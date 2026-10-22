import { Hono } from 'hono';
import type { Bindings, TenantEnv } from './types';
import { embedOriginOf, venueConfigOf } from './config';
import { anonymiseExpiredRequests } from './retention';
import { admin } from './routes/admin';
import { page, publicRoutes } from './routes/public';
import { requester } from './routes/requester';
import { session } from './routes/session';
import { activeTenants, resolveTenant, tenantDatabase } from './tenant';

/*
 * Routing. Two levels:
 *   /api/admin/login, /api/admin/logout   the directory: no venue in the URL
 *   /<slug>/...                           one venue: pages, public API,
 *                                         dashboard API, requesters' area
 * The static files (css/, js/) are served from the root by the assets
 * binding, before the Worker runs: they are the same for every venue.
 */

const app = new Hono<TenantEnv>();

// Security headers on every Worker response. Static files in public/ are
// served before the Worker runs, so their headers live in public/_headers.
//
// Framing: every response refuses to be embedded, except GET /<slug>/embed,
// the public form served for the venue's own website (embed_origin of the
// tenant), which may be framed by that origin only. CSP frame-ancestors is
// the modern directive; X-Frame-Options stays for old browsers and is
// simply omitted on the embed page.
app.use('*', async (c, next) => {
    await next();
    const isEmbedPage = /^\/[a-z0-9-]+\/embed$/.test(c.req.path);
    const embedOrigin = isEmbedPage ? embedOriginOf(c.var.tenant?.embed_origin) : null;
    const framing = embedOrigin ?? "'none'";
    c.header('X-Content-Type-Options', 'nosniff');
    if (framing === "'none'") c.header('X-Frame-Options', 'DENY');
    c.header('Referrer-Policy', 'no-referrer');
    c.header('Content-Security-Policy', `default-src 'self'; base-uri 'none'; frame-ancestors ${framing}; form-action 'self'`);
    c.header('Cache-Control', 'no-store');
});

app.get('/api/health', (c) => c.json({ ok: true }));
app.route('/api/admin', session);

// Everything else belongs to one venue (resolveTenant runs once per request: the
// second registration only covers the paths the first pattern does not).
app.use('/:slug', resolveTenant());
app.use('/:slug/*', resolveTenant());
app.get('/:slug/', (c) => page(c, '/index.html'));
app.route('/:slug/api/admin', admin);
app.route('/:slug/api/requester', requester);
app.route('/:slug', publicRoutes);

// Generic handlers: never leak internal details to the client.
app.notFound((c) => c.json({ error: 'not_found' }, 404));
app.onError((error, c) => {
    console.error(error);
    return c.json({ error: 'internal' }, 500);
});

/** Daily data retention job, one venue after the other; a failing venue does not stop the next. */
export async function runRetention(env: Bindings, now: Date): Promise<void> {
    for (const tenant of await activeTenants(env.DIRECTORY)) {
        try {
            await anonymiseExpiredRequests(tenantDatabase(env, tenant), venueConfigOf(tenant), now);
        } catch (error) {
            console.error(`retention: tenant "${tenant.slug}" failed`, error);
        }
    }
}

export default {
    fetch: app.fetch,
    /** Cron trigger (wrangler.jsonc): daily data retention job. */
    async scheduled(_event: ScheduledEvent, env: Bindings, ctx: ExecutionContext): Promise<void> {
        ctx.waitUntil(runRetention(env, new Date()));
    },
};

/** The bare Hono app, for tests (app.request). */
export { app };
