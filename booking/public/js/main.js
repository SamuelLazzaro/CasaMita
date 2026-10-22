/*
 * main.js — entry point of the public page: loads the venue configuration,
 * shows the form of the configured booking type and wires the submission.
 */
import { fetchConfig, submitRequest } from './api.js';
import { initHotelForm } from './form-hotel.js';
import { initRestaurantForm } from './form-restaurant.js';
import { initI18n, setLanguage, translate } from './i18n.js';
import { startTapFeedback } from './tap-feedback.js';
import { tenantSlug } from './tenant.js';
import { applyTenantLinks, applyVenue, errorMessage, showStatus } from './ui.js';

startTapFeedback();
applyTenantLinks();

const loading = document.getElementById('loading');
const sections = { hotel: document.getElementById('hotel-section'), restaurant: document.getElementById('restaurant-section'), facility: document.getElementById('facility-notice') };
const successSection = document.getElementById('success-section');

/** @type {HTMLElement|null} the form section of this venue, hidden while the success panel shows */
let g_activeSection = null;

/**
 * Sends the payload and, on success, swaps the form for the thank-you panel.
 * @param {Record<string, unknown>} payload
 * @returns {Promise<void>}
 */
async function submit(payload) {
    await submitRequest(payload);
    g_activeSection.hidden = true;
    successSection.hidden = false;
    successSection.scrollIntoView({ block: 'start' });
}

document.getElementById('new-request').addEventListener('click', () => {
    successSection.hidden = true;
    g_activeSection.hidden = false;
});

async function init() {
    // The form of a venue lives under its prefix: opened at the root there is nothing to load.
    if (tenantSlug() === null) {
        initI18n();
        showStatus(loading, translate('error.no_venue'), 'error');
        return;
    }
    let config;
    try {
        config = await fetchConfig();
    } catch (error) {
        initI18n();
        showStatus(loading, errorMessage(error), 'error');
        return;
    }
    applyVenue(config);
    initI18n(config.defaultLang);
    loading.hidden = true;

    g_activeSection = sections[config.type] ?? sections.facility;
    g_activeSection.hidden = false;
    if (config.type === 'hotel') initHotelForm(submit);
    if (config.type === 'restaurant') initRestaurantForm(config, submit);
}

/*
 * Embedded mode (/embed inside the venue's website): the page reports its
 * height to the parent so the iframe never shows a scrollbar, and links open
 * in a new tab instead of navigating inside the frame. Only the height goes
 * out, so the target origin can stay "*".
 *
 * The parent may also push its own language ("booking-lang" messages sent by
 * embed.js) so a bilingual website keeps the form in the language the visitor
 * chose on the page. Messages are accepted only from the parent window, which
 * can only be the EMBED_ORIGIN website thanks to the frame-ancestors CSP.
 */
if (window.parent !== window) {
    document.documentElement.classList.add('is-embedded');
    for (const link of document.querySelectorAll('a[href]')) link.target = '_blank';
    const reportHeight = () => window.parent.postMessage({ type: 'booking-height', height: document.documentElement.scrollHeight }, '*');
    new ResizeObserver(reportHeight).observe(document.body);
    window.addEventListener('load', reportHeight);
    window.addEventListener('message', (event) => {
        if (event.source !== window.parent || event.data?.type !== 'booking-lang') return;
        setLanguage(String(event.data.lang));
    });
}

init();
