/*
 * conditions.js — entry point of the booking conditions page
 * (/<slug>/conditions): writes the venue's identity and its own conditions
 * text into the page. Without a venue in the URL (the template opened at the
 * root) the placeholders stay as they are.
 */
import { fetchConfig } from './api.js';
import { initI18n } from './i18n.js';
import { startTapFeedback } from './tap-feedback.js';
import { tenantSlug } from './tenant.js';
import { applyTenantLinks, applyVenue, fillAll } from './ui.js';

startTapFeedback();
applyTenantLinks();

async function init() {
    if (tenantSlug() === null) {
        initI18n();
        return;
    }
    const config = await fetchConfig();
    applyVenue(config);
    initI18n(config.defaultLang);
    fillAll('legal-name', config.legal.name);
    fillAll('legal-address', config.legal.address);
    fillAll('legal-phone', config.legal.phone);
    fillAll('legal-email', config.legal.email);
    fillAll('legal-vat', config.legal.vat);
    // The venue's own text, as typed (paragraphs separated by blank lines: white-space pre-line keeps them).
    const hasConditions = config.legal.conditionsText.trim() !== '';
    for (const element of document.querySelectorAll('.conditions-text')) {
        element.textContent = config.legal.conditionsText;
        element.hidden = !hasConditions;
    }
    for (const element of document.querySelectorAll('.conditions-missing')) element.hidden = hasConditions;
}

init();
