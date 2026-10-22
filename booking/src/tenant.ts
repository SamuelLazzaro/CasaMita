import type { MiddlewareHandler } from 'hono';
import type { Bindings, TenantEnv, TenantRow } from './types';
import { venueConfigOf } from './config';

/*
 * Tenant resolution.
 *
 * Every venue lives under its own path prefix, /<slug>/..., and in its own
 * D1 database. The directory (DIRECTORY binding) maps the slug to the venue
 * row, which names the D1 binding of the venue; the Worker reaches it by
 * looking the name up in `env`. Bindings are static (wrangler.jsonc), so a
 * new venue means a new binding and a deploy; the code never touches a
 * database it was not bound to.
 */

/** Lowercase letters, digits and dashes, 2 to 40 characters, no dash at either end. */
export const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$/;

/** Path prefixes that are not venues: the directory API, the static assets and the root pages (sign-in, demo). */
const RESERVED_SLUGS = new Set(['api', 'css', 'js', 'assets', 'admin', 'demo']);

export function isValidSlug(value: string): boolean {
    return SLUG_RE.test(value) && !RESERVED_SLUGS.has(value);
}

export async function loadTenant(directory: D1Database, slug: string): Promise<TenantRow | null> {
    return await directory.prepare('SELECT * FROM tenants WHERE slug = ?1').bind(slug).first<TenantRow>();
}

export async function activeTenants(directory: D1Database): Promise<TenantRow[]> {
    const { results } = await directory.prepare("SELECT * FROM tenants WHERE status = 'active' ORDER BY slug").all<TenantRow>();
    return results;
}

/** The D1 database of a tenant, found by the binding name of its directory row. */
export function tenantDatabase(env: Bindings, tenant: TenantRow): D1Database {
    const candidate = (env as unknown as Record<string, unknown>)[tenant.binding];
    const isDatabase = typeof candidate === 'object' && candidate !== null && typeof (candidate as D1Database).prepare === 'function';
    if (!isDatabase) throw new Error(`tenant "${tenant.slug}": D1 binding "${tenant.binding}" is not configured in wrangler.jsonc`);
    return candidate as D1Database;
}

/**
 * Middleware of every /:slug/... route: loads the tenant, its database and
 * its normalised configuration into the context. Unknown, malformed and
 * suspended slugs all answer 404, so the URL reveals nothing.
 */
export function resolveTenant(): MiddlewareHandler<TenantEnv> {
    return async (c, next) => {
        // Already resolved by another registration of this middleware on the same request.
        if ((c.get('tenant') as TenantRow | undefined) !== undefined) return await next();
        const slug = c.req.param('slug') ?? '';
        if (!isValidSlug(slug)) return c.json({ error: 'not_found' }, 404);
        const tenant = await loadTenant(c.env.DIRECTORY, slug);
        if (tenant === null || tenant.status !== 'active') return c.json({ error: 'not_found' }, 404);
        c.set('tenant', tenant);
        c.set('db', tenantDatabase(c.env, tenant));
        c.set('venue', venueConfigOf(tenant));
        await next();
    };
}

/** Absolute base URL of the tenant's pages: origin plus slug, e.g. https://book.example.com/hotel-rossi */
export function tenantBase(c: { req: { url: string }; var: { tenant: TenantRow } }): string {
    return `${new URL(c.req.url).origin}/${c.var.tenant.slug}`;
}
