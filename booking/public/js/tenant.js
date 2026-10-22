/*
 * tenant.js — which venue this page belongs to, read from the URL.
 *
 * Every venue lives under its own prefix, /<slug>/... (see src/tenant.ts).
 * The first path segment is the slug, unless it is one of the pages or
 * folders served from the root: the sign-in page (/admin), the demo, the
 * static files and the directory API. On those pages there is no venue.
 */

/** @type {Set<string>} first path segments that are not a venue (mirrors the pages of public/ and the reserved slugs of src/tenant.ts) */
const ROOT_SEGMENTS = new Set(['', 'api', 'css', 'js', 'assets', 'admin', 'admin.html', 'demo', 'demo.html', 'index.html', 'privacy.html', 'booking.html', 'area.html', 'embed.js']);

/**
 * @returns {string|null} slug of the venue of the current page, null on the root pages
 */
export function tenantSlug() {
    const first = window.location.pathname.split('/')[1] ?? '';
    return ROOT_SEGMENTS.has(first) ? null : first;
}

/**
 * Path of a venue resource from the current page: the slug prefix is added
 * when the page belongs to a venue, otherwise the path is returned as it is
 * (the demo page answers the bare API paths itself).
 * @param {string} path - absolute path without the prefix, e.g. '/api/config'
 * @returns {string}
 */
export function tenantPath(path) {
    const slug = tenantSlug();
    return slug === null ? path : `/${slug}${path}`;
}

/**
 * Absolute path of a venue page, for redirects after sign-in.
 * @param {string} slug
 * @param {string} path - e.g. '/admin'
 * @returns {string}
 */
export function venuePath(slug, path) {
    return `/${slug}${path}`;
}
