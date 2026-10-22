/*
 * privacy.js — entry point of the privacy notice (/<slug>/privacy): writes
 * the venue's data controller into the page and points the links at the
 * venue. Without a venue in the URL (the template opened at the root) the
 * placeholders stay as they are.
 */
import { fetchConfig } from './api.js';
import { startTapFeedback } from './tap-feedback.js';
import { tenantSlug } from './tenant.js';
import { applyTenantLinks, applyVenue } from './ui.js';
import { formatLongDate } from './utils.js';

startTapFeedback();
applyTenantLinks();

/**
 * @param {string} id
 * @param {string} value - written only when the venue provided one, so an empty column keeps the placeholder visible
 * @returns {void}
 */
function fill(id, value) {
    if (value !== '') document.getElementById(id).textContent = value;
}

async function init() {
    if (tenantSlug() === null) return;
    const config = await fetchConfig();
    applyVenue(config);
    fill('privacy-controller', config.privacy.controller);
    fill('privacy-address', config.privacy.address);
    fill('privacy-email', config.privacy.email);
    fill('privacy-email-rights', config.privacy.email);
    fill('privacy-retention', String(config.privacy.retentionDays));
    fill('privacy-since', formatLongDate(config.privacy.since, 'it'));
}

init();
