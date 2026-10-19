import { Hono } from 'hono';
import type { Bindings } from './types';
import { embedOriginOf, venueConfig } from './config';
import { anonymiseExpiredRequests } from './retention';
import { admin } from './routes/admin';
import { publicRoutes } from './routes/public';
import { requester } from './routes/requester';

const app = new Hono<{ Bindings: Bindings }>();

// Security headers on every Worker response. Static files in public/ are
// served before the Worker runs, so their headers live in public/_headers.
//
// Framing: every response refuses to be embedded, except GET /embed, the
// public form served for the venue's own website (EMBED_ORIGIN), which may
// be framed by that origin only. CSP frame-ancestors is the modern directive;
// X-Frame-Options stays for old browsers and is simply omitted on /embed.
app.use('*', async (c, next) => {
    await next();
    const embedOrigin = embedOriginOf(c.env);
    const framing = c.req.path === '/embed' && embedOrigin !== null ? embedOrigin : "'none'";
    c.header('X-Content-Type-Options', 'nosniff');
    if (framing === "'none'") c.header('X-Frame-Options', 'DENY');
    c.header('Referrer-Policy', 'no-referrer');
    c.header('Content-Security-Policy', `default-src 'self'; base-uri 'none'; frame-ancestors ${framing}; form-action 'self'`);
    c.header('Cache-Control', 'no-store');
});

app.get('/api/health', (c) => c.json({ ok: true }));

app.route('/api/admin', admin);
app.route('/api/requester', requester);
app.route('/', publicRoutes);

// Generic handlers: never leak internal details to the client.
app.notFound((c) => c.json({ error: 'not_found' }, 404));
app.onError((error, c) => {
    console.error(error);
    return c.json({ error: 'internal' }, 500);
});

export default {
    fetch: app.fetch,
    /** Cron trigger (wrangler.jsonc): daily data retention job. */
    async scheduled(_event: ScheduledEvent, env: Bindings, ctx: ExecutionContext): Promise<void> {
        ctx.waitUntil(anonymiseExpiredRequests(env.DB, venueConfig(env), new Date()));
    },
};

/** The bare Hono app, for tests (app.request). */
export { app };
