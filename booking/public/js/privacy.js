/*
 * privacy.js — entry point of the privacy notice (/<slug>/privacy): writes
 * the venue's data controller and the deployment's processor into the page
 * (every span once per language) and points the links at the venue. Without
 * a venue in the URL (the template opened at the root) the placeholders stay
 * as they are.
 */
import { fetchConfig } from './api.js';
import { currentLanguage, initI18n } from './i18n.js';
import { startTapFeedback } from './tap-feedback.js';
import { tenantSlug } from './tenant.js';
import { applyConditionsLinks, applyTenantLinks, applyVenue, fillAll } from './ui.js';
import { formatLongDate } from './utils.js';

startTapFeedback();
applyTenantLinks();

async function init() {
    if (tenantSlug() === null) {
        initI18n();
        return;
    }
    const config = await fetchConfig();
    applyVenue(config);
    applyConditionsLinks(config);
    initI18n(config.defaultLang);
    fillAll('privacy-controller', config.privacy.controller);
    fillAll('privacy-address', config.privacy.address);
    fillAll('privacy-email', config.privacy.email);
    fillAll('privacy-retention', String(config.privacy.retentionDays));
    fillAll('privacy-since', formatLongDate(config.privacy.since, currentLanguage()));
    fillAll('privacy-processor-name', config.processor.name);
    fillAll('privacy-processor-email', config.processor.email);
}

init();
