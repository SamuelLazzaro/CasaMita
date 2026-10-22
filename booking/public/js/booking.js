/*
 * booking.js — entry point of the guest's personal page (/booking/<token>):
 * shows the request, its status and the cancel action.
 */
import { cancelBooking, fetchBooking, fetchConfig } from './api.js';
import { currentLanguage, initI18n, onLanguageChange, translate } from './i18n.js';
import { startTapFeedback } from './tap-feedback.js';
import { appendDetail, applyTenantLinks, applyVenue, errorMessage, hideStatus, showStatus } from './ui.js';
import { formatEuro, formatLongDate, formatTimestamp } from './utils.js';

startTapFeedback();
applyTenantLinks();

const loading = document.getElementById('loading');
const notFound = document.getElementById('not-found');
const section = document.getElementById('booking-section');
const badge = document.getElementById('booking-status-badge');
const details = document.getElementById('booking-details');
const pendingHint = document.getElementById('booking-pending-hint');
const actions = document.getElementById('booking-actions');
const cancelButton = document.getElementById('cancel-button');
const status = document.getElementById('booking-status');

/** @type {string} personal token, last segment of the URL */
const g_token = window.location.pathname.split('/').pop();

/** @type {object|null} the request as the API returned it */
let g_booking = null;

/**
 * Renders the request in the current language.
 * @returns {void}
 */
function render() {
    const booking = g_booking;
    const lang = currentLanguage();
    badge.textContent = translate(`status.${booking.status}`);
    badge.className = `badge is-${booking.status}`;
    details.replaceChildren();
    if (booking.type === 'hotel') {
        appendDetail(details, translate('field.checkIn'), formatLongDate(booking.check_in, lang));
        appendDetail(details, translate('field.checkOut'), formatLongDate(booking.check_out, lang));
        appendDetail(details, translate('field.guests'), `${booking.adults} ${translate('field.adults').toLowerCase()}, ${booking.children} ${translate('field.children').toLowerCase()}`);
        appendDetail(details, translate('field.roomType'), booking.room_type);
        if (booking.quoted_total !== null && booking.quoted_total !== undefined) {
            const discount = booking.quoted_discount_percent > 0 ? `\n${translate('price.discount', { percent: booking.quoted_discount_percent })}` : '';
            appendDetail(details, translate('price.total'), `${formatEuro(booking.quoted_total, lang)}${discount}\n${translate('price.taxes')}`);
        }
    } else {
        appendDetail(details, translate('field.date'), formatLongDate(booking.date, lang));
        appendDetail(details, translate('field.time'), booking.time);
        appendDetail(details, translate('field.partySize'), String(booking.party_size));
    }
    if (booking.notes) appendDetail(details, translate('field.notes'), booking.notes);
    appendDetail(details, translate('field.requestedOn'), formatTimestamp(booking.created_at, lang));
    pendingHint.hidden = booking.status !== 'pending';
    actions.hidden = !booking.can_cancel;
}

cancelButton.addEventListener('click', async () => {
    if (!window.confirm(translate('guest.confirmCancel'))) return;
    hideStatus(status);
    cancelButton.disabled = true;
    try {
        await cancelBooking(g_token);
        g_booking = { ...g_booking, status: 'cancelled', can_cancel: false };
        render();
        showStatus(status, translate('guest.cancelled'), 'ok');
    } catch (error) {
        showStatus(status, errorMessage(error), 'error');
    } finally {
        cancelButton.disabled = false;
    }
});

async function init() {
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
    try {
        g_booking = await fetchBooking(g_token);
    } catch {
        loading.hidden = true;
        notFound.hidden = false;
        return;
    }
    loading.hidden = true;
    section.hidden = false;
    render();
    onLanguageChange(render);
}

init();
