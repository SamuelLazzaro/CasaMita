/*
 * admin.js — entry point of the manager dashboard: login, section
 * navigation, calendar (day / week / month), pending requests, direct
 * bookings, rooms (hotel) and organisations (facility).
 */
import { adminLogin, adminLogout, adminMe, approveRequest, cancelRequestAdmin, createBooking, createDiscount, createPeriod, createRequester, deleteDiscount, deletePeriod, fetchAvailability, fetchCalendar, fetchConfig, fetchPricing, fetchRequesters, fetchRequests, fetchRooms, rejectRequest, requesterAction, saveBasePrice, updateRequester } from './api.js';
import { renderDay, renderMonth, renderWeek, itemName } from './calendar-render.js';
import { createCalendarView } from './calendar-view.js';
import { enableDragScroll } from './drag-scroll.js';
import { renderPriceMonth, renderPriceWeek } from './price-calendar.js';
import { initFacilityForm } from './form-facility.js';
import { initHotelForm } from './form-hotel.js';
import { initRestaurantForm } from './form-restaurant.js';
import { currentLanguage, initI18n, onLanguageChange, translate } from './i18n.js';
import { startTapFeedback } from './tap-feedback.js';
import { appendDetail, applyVenue, button, errorMessage, hideStatus, openDialog, showSection, showStatus, statusBadge } from './ui.js';
import { addDays, formatEuro, formatLongDate, formatShortDate, formatTimestamp, todayInRome } from './utils.js';

startTapFeedback();

const byId = (id) => document.getElementById(id);

/** @type {object|null} venue configuration from GET /api/config */
let g_config = null;

/** @type {object[]} last calendar answer, re-rendered on language change */
let g_calendarItems = [];

/** @type {object[]} registered organisations (facility) */
let g_requesters = [];

/** @type {{reset: () => void|Promise<void>, setRequesters?: (requesters: object[]) => void}|null} the direct booking form of this venue */
let g_directForm = null;

/* ------------------------------------------------------------- calendar */

const calendarContainer = byId('calendar');
const calendarStatus = byId('calendar-status');

// Wide calendars (narrow screens) scroll sideways by dragging with the mouse.
for (const scrollBox of document.querySelectorAll('.calendar-scroll')) enableDragScroll(scrollBox);

const calendarView = createCalendarView({ title: byId('cal-title'), previous: byId('cal-prev'), next: byId('cal-next'), today: byId('cal-today'), switches: { day: byId('cal-view-day'), week: byId('cal-view-week'), month: byId('cal-view-month') } }, async (interval) => {
    hideStatus(calendarStatus);
    try {
        const answer = await fetchCalendar(interval.view, interval.date);
        g_calendarItems = answer.items;
        drawCalendar();
    } catch (error) {
        showStatus(calendarStatus, errorMessage(error), 'error');
    }
});

function drawCalendar() {
    const { view, date } = calendarView.interval();
    const options = { onSelect: openDetails, onOpenDay: (day) => calendarView.open('day', day) };
    if (view === 'day') renderDay(calendarContainer, date, g_calendarItems, options);
    else if (view === 'week') renderWeek(calendarContainer, date, g_calendarItems, options);
    else renderMonth(calendarContainer, date, g_calendarItems, options);
}

/* ------------------------------------------------- price calendar (hotel) */

/*
 * Second calendar of the same section: the nightly price of every room type
 * per day, drawn from the pricing data (g_pricing) the Prices section loads.
 * Week and month only. The mode switch above the calendars decides which
 * one is on screen; both keep their own interval.
 */
const priceCalendarContainer = byId('price-calendar');
const priceCalendarStatus = byId('price-calendar-status');

const priceCalendarView = createCalendarView({ title: byId('price-cal-title'), previous: byId('price-cal-prev'), next: byId('price-cal-next'), today: byId('price-cal-today'), switches: { week: byId('price-cal-view-week'), month: byId('price-cal-view-month') } }, async () => {
    if (g_pricing === null) await loadPricing();
    drawPriceCalendar();
});

function drawPriceCalendar() {
    if (g_pricing === null || g_config?.type !== 'hotel') return;
    hideStatus(priceCalendarStatus);
    const { view, date } = priceCalendarView.interval();
    if (view === 'week') renderPriceWeek(priceCalendarContainer, date, g_pricing);
    else renderPriceMonth(priceCalendarContainer, date, g_pricing);
}

/**
 * @param {'bookings'|'prices'} mode
 * @returns {void}
 */
function setCalendarMode(mode) {
    byId('bookings-calendar').hidden = mode !== 'bookings';
    byId('price-calendar-block').hidden = mode !== 'prices';
    byId('cal-mode-bookings').setAttribute('aria-pressed', String(mode === 'bookings'));
    byId('cal-mode-prices').setAttribute('aria-pressed', String(mode === 'prices'));
    if (mode === 'prices') priceCalendarView.refresh();
}

byId('cal-mode-bookings').addEventListener('click', () => setCalendarMode('bookings'));
byId('cal-mode-prices').addEventListener('click', () => setCalendarMode('prices'));

/* -------------------------------------------------------------- details */

const detailsDialog = byId('dialog-details');
const detailsList = byId('details-list');
const detailsBadge = byId('details-badge');
const detailsActions = byId('details-actions');
const detailsStatus = byId('details-status');
const rejectBlock = byId('reject-block');
const rejectReason = byId('reject-reason');

/**
 * Label/value rows of a request, by type, plus the contact details the
 * manager needs (the admin API carries them, the guest page does not).
 * @param {object} item
 * @returns {[string, string][]}
 */
function detailRows(item) {
    const lang = currentLanguage();
    const rows = [];
    if (item.type === 'hotel') {
        rows.push([translate('field.checkIn'), formatLongDate(item.check_in, lang)], [translate('field.checkOut'), formatLongDate(item.check_out, lang)], [translate('field.guests'), `${item.adults} ${translate('field.adults').toLowerCase()}, ${item.children} ${translate('field.children').toLowerCase()}`], [translate('field.roomType'), item.room_type]);
        if (item.quoted_total !== null && item.quoted_total !== undefined) {
            const discount = item.quoted_discount_percent > 0 ? ` (${translate('price.discount', { percent: item.quoted_discount_percent })})` : '';
            rows.push([translate('price.total'), `${formatEuro(item.quoted_total, lang)}${discount}`]);
        }
    } else if (item.type === 'restaurant') {
        rows.push([translate('field.date'), formatLongDate(item.date, lang)], [translate('field.time'), item.start_time], [translate('field.partySize'), String(item.party_size)]);
    } else {
        rows.push([translate('field.requester'), item.requester_name ?? ''], [translate('field.date'), formatLongDate(item.date, lang)], [translate('field.time'), `${item.start_time} – ${item.end_time}`]);
    }
    if (item.requester_id === null) rows.push([translate('field.email'), item.email ?? ''], [translate('field.phone'), item.phone ?? '']);
    else rows.push([translate('field.email'), item.requester_email ?? '']);
    if (item.notes) rows.push([translate('field.notes'), item.notes]);
    rows.push([translate('field.requestedOn'), formatTimestamp(item.created_at, lang)]);
    return rows;
}

/**
 * Runs a decision, reports the outcome and refreshes every view that shows requests.
 * @param {() => Promise<unknown>} action
 * @param {string} doneKey - translation key of the success message
 * @param {HTMLElement} statusElement
 * @returns {Promise<boolean>} true on success
 */
async function runDecision(action, doneKey, statusElement) {
    hideStatus(statusElement);
    try {
        await action();
        showStatus(statusElement, translate(doneKey), 'ok');
        await Promise.all([calendarView.refresh(), loadPending()]);
        return true;
    } catch (error) {
        showStatus(statusElement, errorMessage(error), 'error');
        return false;
    }
}

/**
 * Opens the details dialog. Rejecting from here is a two-step action: the
 * "Reject" button reveals the optional message field and the confirm button,
 * so the venue can explain the refusal to the guest.
 * @param {object} item - a request (calendar item or pending list row)
 * @returns {void}
 */
function openDetails(item) {
    byId('details-title').textContent = itemName(item);
    detailsBadge.replaceChildren(statusBadge(item.status));
    detailsList.replaceChildren();
    for (const [label, value] of detailRows(item)) appendDetail(detailsList, label, value);
    hideStatus(detailsStatus);
    rejectReason.value = '';
    rejectBlock.hidden = true;

    detailsActions.replaceChildren();
    if (item.status === 'pending') {
        detailsActions.append(button(translate('actions.approve'), 'btn btn-primary', async () => {
            if (!window.confirm(translate('confirm.approve'))) return;
            if (await runDecision(() => approveRequest(item.id), 'done.approved', detailsStatus)) detailsActions.replaceChildren();
        }));
        const rejectButton = button(translate('actions.reject'), 'btn btn-danger', () => {
            // The confirm button below takes over: hide this one so only one "reject" is visible.
            rejectButton.hidden = true;
            rejectBlock.hidden = false;
            rejectReason.focus();
        });
        detailsActions.append(rejectButton);
    }
    if (item.status === 'pending' || item.status === 'approved') {
        detailsActions.append(button(translate('actions.cancel'), 'btn', async () => {
            if (!window.confirm(translate('confirm.cancel'))) return;
            if (await runDecision(() => cancelRequestAdmin(item.id), 'done.cancelled', detailsStatus)) detailsActions.replaceChildren();
        }));
    }
    byId('reject-confirm').onclick = async () => {
        if (await runDecision(() => rejectRequest(item.id, rejectReason.value), 'done.rejected', detailsStatus)) {
            rejectBlock.hidden = true;
            detailsActions.replaceChildren();
        }
    };
    openDialog(detailsDialog);
}

/* ------------------------------------------------------- pending inbox */

const pendingList = byId('pending-list');
const pendingEmpty = byId('pending-empty');
const pendingBadge = byId('pending-badge');

/** @type {object[]} */
let g_pending = [];

async function loadPending() {
    try {
        g_pending = (await fetchRequests('pending')).items;
    } catch (error) {
        showStatus(byId('pending-status'), errorMessage(error), 'error');
        return;
    }
    drawPending();
}

/**
 * @param {object} item
 * @returns {string} one-line summary of a request for the inbox
 */
function summaryOf(item) {
    const lang = currentLanguage();
    if (item.type === 'hotel') {
        const price = item.quoted_total !== null && item.quoted_total !== undefined ? ` · ${formatEuro(item.quoted_total, lang)}` : '';
        return `${formatShortDate(item.check_in, lang)} → ${formatShortDate(item.check_out, lang)} · ${item.room_type} · ${item.adults}+${item.children}${price}`;
    }
    if (item.type === 'restaurant') return `${formatShortDate(item.date, lang)} ${item.start_time} · ${item.party_size} ${translate('field.partySize').toLowerCase()}`;
    return `${formatShortDate(item.date, lang)} ${item.start_time}–${item.end_time}`;
}

function drawPending() {
    pendingBadge.textContent = String(g_pending.length);
    pendingBadge.hidden = g_pending.length === 0;
    pendingEmpty.hidden = g_pending.length > 0;
    pendingList.replaceChildren(...g_pending.map((item) => {
        const row = document.createElement('li');
        row.className = 'list-item';
        const text = document.createElement('div');
        text.className = 'list-item-text';
        const name = document.createElement('strong');
        name.textContent = itemName(item);
        const summary = document.createElement('span');
        summary.textContent = summaryOf(item);
        const received = document.createElement('span');
        received.className = 'muted';
        received.textContent = `${translate('notifications.receivedOn')} ${formatTimestamp(item.created_at, currentLanguage())}`;
        text.append(name, summary, received);
        const actions = document.createElement('div');
        actions.className = 'list-item-actions';
        actions.append(button(translate('actions.approve'), 'btn btn-primary btn-small', async () => {
            if (!window.confirm(translate('confirm.approve'))) return;
            await runDecision(() => approveRequest(item.id), 'done.approved', byId('pending-status'));
        }), button(translate('actions.reject'), 'btn btn-danger btn-small', async () => {
            // Quick path without a message for the guest: the two-step reject with a reason lives in the details dialog.
            if (!window.confirm(translate('confirm.reject'))) return;
            await runDecision(() => rejectRequest(item.id, ''), 'done.rejected', byId('pending-status'));
        }), button(translate('actions.details'), 'btn btn-small', () => openDetails(item)));
        row.append(text, actions);
        return row;
    }));
}

/* -------------------------------------------------------- direct booking */

const bookingDialog = byId('dialog-booking');

async function submitDirectBooking(payload) {
    await createBooking(payload);
    bookingDialog.close();
    showStatus(calendarStatus, translate('done.created'), 'ok');
    await calendarView.refresh();
}

function initDirectForm() {
    for (const type of ['hotel', 'restaurant', 'facility']) byId(`direct-${type}-form`).hidden = type !== g_config.type;
    for (const select of document.querySelectorAll('select[id$="-lang"]')) select.value = g_config.defaultLang;
    if (g_config.type === 'hotel') g_directForm = initHotelForm(submitDirectBooking, 'direct-hotel');
    else if (g_config.type === 'restaurant') g_directForm = initRestaurantForm(g_config, submitDirectBooking, 'direct-restaurant');
    else g_directForm = initFacilityForm(g_config, submitDirectBooking, 'direct-facility');
}

byId('new-booking').addEventListener('click', () => {
    hideStatus(byId(`direct-${g_config.type}-status`));
    if (g_directForm.setRequesters) g_directForm.setRequesters(g_requesters);
    openDialog(bookingDialog);
});

/* ---------------------------------------------------------------- rooms */

async function loadRooms() {
    const tableBody = byId('rooms-body');
    const checkIn = byId('rooms-check-in');
    const checkOut = byId('rooms-check-out');
    const today = todayInRome();
    checkIn.min = today;
    checkIn.value = today;
    checkOut.min = addDays(today, 1);
    checkOut.value = addDays(today, 1);
    let rooms;
    try {
        rooms = (await fetchRooms()).rooms;
    } catch (error) {
        showStatus(byId('rooms-status'), errorMessage(error), 'error');
        return;
    }
    async function draw() {
        hideStatus(byId('rooms-status'));
        let available = new Map();
        if (checkIn.value !== '' && checkOut.value > checkIn.value) {
            try {
                const answer = await fetchAvailability(checkIn.value, checkOut.value);
                available = new Map(answer.rooms.map((room) => [room.name, room.available]));
            } catch (error) {
                showStatus(byId('rooms-status'), errorMessage(error), 'error');
            }
        }
        tableBody.replaceChildren(...rooms.map((room) => {
            const row = document.createElement('tr');
            for (const value of [room.name, room.max_guests, room.quantity, available.get(room.name) ?? '—']) {
                const cell = document.createElement('td');
                cell.textContent = String(value);
                row.append(cell);
            }
            return row;
        }));
    }
    checkIn.addEventListener('change', () => {
        checkOut.min = addDays(checkIn.value, 1);
        if (checkOut.value <= checkIn.value) checkOut.value = checkOut.min;
        draw();
    });
    checkOut.addEventListener('change', draw);
    await draw();
}

/* -------------------------------------------------------------- pricing */

const pricingStatus = byId('pricing-status');

/** @type {{base: object[], periods: object[], discounts: object[]}|null} */
let g_pricing = null;

/**
 * Runs a pricing change, reports the outcome and redraws the section.
 * @param {() => Promise<unknown>} action
 * @param {string} doneKey
 * @returns {Promise<boolean>} true on success
 */
async function runPricingAction(action, doneKey) {
    hideStatus(pricingStatus);
    try {
        await action();
        showStatus(pricingStatus, translate(doneKey), 'ok');
        await loadPricing();
        return true;
    } catch (error) {
        showStatus(pricingStatus, errorMessage(error), 'error');
        return false;
    }
}

async function loadPricing() {
    try {
        g_pricing = await fetchPricing();
    } catch (error) {
        showStatus(pricingStatus, errorMessage(error), 'error');
        showStatus(priceCalendarStatus, errorMessage(error), 'error');
        return;
    }
    drawPricing();
    // Price edits change the calendar figures too.
    drawPriceCalendar();
}

function drawPricing() {
    if (g_pricing === null) return;
    const lang = currentLanguage();

    // Base prices: one row per room type with an input and a save button.
    const baseGrid = byId('pricing-base');
    baseGrid.replaceChildren(...g_pricing.base.flatMap((row) => {
        const name = document.createElement('span');
        name.textContent = row.room_type;
        const input = document.createElement('input');
        input.type = 'number';
        input.min = '0';
        input.step = '0.01';
        input.value = row.price_per_night === null ? '' : String(row.price_per_night);
        input.placeholder = translate('pricing.notSet');
        input.setAttribute('aria-label', `${row.room_type} ${translate('pricing.pricePerNight')}`);
        const save = button(translate('pricing.save'), 'btn btn-small', () => {
            const price = Number(input.value);
            if (input.value === '' || !Number.isFinite(price)) {
                showStatus(pricingStatus, translate('error.invalid_price'), 'error');
                return;
            }
            runPricingAction(() => saveBasePrice(row.room_type, price), 'done.priceSaved');
        });
        return [name, input, save];
    }));

    // Period form: room select from the CSV types.
    const roomSelect = byId('period-room');
    const options = g_pricing.base.map((row) => ({ value: row.room_type, label: row.room_type }));
    roomSelect.replaceChildren(...options.map((option) => Object.assign(document.createElement('option'), { value: option.value, textContent: option.label })));

    byId('periods-empty').hidden = g_pricing.periods.length > 0;
    byId('periods-list').replaceChildren(...g_pricing.periods.map((period) => {
        const row = document.createElement('li');
        row.className = 'list-item';
        const text = document.createElement('div');
        text.className = 'list-item-text';
        const title = document.createElement('strong');
        title.textContent = `${period.room_type} · ${formatEuro(period.price_per_night, lang)}${translate('pricing.perNight')}`;
        const range = document.createElement('span');
        range.textContent = `${formatShortDate(period.date_from, lang)} – ${formatShortDate(period.date_to, lang)}${period.label ? ` · ${period.label}` : ''}`;
        text.append(title, range);
        const actions = document.createElement('div');
        actions.className = 'list-item-actions';
        actions.append(button(translate('pricing.delete'), 'btn btn-danger btn-small', () => {
            if (window.confirm(translate('pricing.confirmDelete'))) runPricingAction(() => deletePeriod(period.id), 'done.deleted');
        }));
        row.append(text, actions);
        return row;
    }));

    byId('discounts-empty').hidden = g_pricing.discounts.length > 0;
    byId('discounts-list').replaceChildren(...g_pricing.discounts.map((rule) => {
        const row = document.createElement('li');
        row.className = 'list-item';
        const text = document.createElement('div');
        text.className = 'list-item-text';
        const title = document.createElement('strong');
        title.textContent = `${translate('pricing.fromNights', { count: rule.min_nights })}: -${rule.percent}%`;
        text.append(title);
        const actions = document.createElement('div');
        actions.className = 'list-item-actions';
        actions.append(button(translate('pricing.delete'), 'btn btn-danger btn-small', () => {
            if (window.confirm(translate('pricing.confirmDelete'))) runPricingAction(() => deleteDiscount(rule.id), 'done.deleted');
        }));
        row.append(text, actions);
        return row;
    }));
}

byId('period-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.checkValidity()) {
        showStatus(pricingStatus, translate('validation.required'), 'error');
        return;
    }
    const fields = new FormData(form);
    const payload = { room_type: fields.get('room_type'), date_from: fields.get('date_from'), date_to: fields.get('date_to'), price_per_night: Number(fields.get('price_per_night')), label: fields.get('label') };
    if (await runPricingAction(() => createPeriod(payload), 'done.periodAdded')) form.reset();
});

byId('discount-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.checkValidity()) {
        showStatus(pricingStatus, translate('validation.required'), 'error');
        return;
    }
    const fields = new FormData(form);
    if (await runPricingAction(() => createDiscount(Number(fields.get('min_nights')), Number(fields.get('percent'))), 'done.discountAdded')) form.reset();
});

/* ----------------------------------------------------------- requesters */

const requesterDialog = byId('dialog-requester');
const requesterForm = byId('requester-form');
const requestersStatus = byId('requesters-status');

async function loadRequesters() {
    try {
        g_requesters = (await fetchRequesters()).items;
    } catch (error) {
        showStatus(requestersStatus, errorMessage(error), 'error');
        return;
    }
    drawRequesters();
}

/**
 * @param {() => Promise<unknown>} action
 * @param {string} doneKey
 * @param {Record<string, string|number>} [values]
 * @returns {Promise<void>}
 */
async function runRequesterAction(action, doneKey, values = {}) {
    hideStatus(requestersStatus);
    try {
        const result = await action();
        showStatus(requestersStatus, translate(doneKey, { ...values, requests: result.requests_cancelled ?? 0 }), 'ok');
        await Promise.all([loadRequesters(), calendarView.refresh()]);
    } catch (error) {
        showStatus(requestersStatus, errorMessage(error), 'error');
    }
}

function drawRequesters() {
    const list = byId('requesters-list');
    byId('requesters-empty').hidden = g_requesters.length > 0;
    list.replaceChildren(...g_requesters.map((requester) => {
        const row = document.createElement('li');
        row.className = 'list-item';
        const text = document.createElement('div');
        text.className = 'list-item-text';
        const name = document.createElement('strong');
        const dot = document.createElement('span');
        dot.className = 'color-dot';
        dot.style.setProperty('--dot-color', requester.color);
        name.append(dot, document.createTextNode(` ${requester.name} `), statusBadge(requester.status));
        const contact = document.createElement('span');
        contact.textContent = `${requester.contact_name} · ${requester.email} · ${requester.phone ?? ''}`;
        text.append(name, contact);
        const actions = document.createElement('div');
        actions.className = 'list-item-actions';
        actions.append(button(translate('actions.edit'), 'btn btn-small', () => openRequesterDialog(requester)));
        actions.append(button(translate('actions.copyLink'), 'btn btn-small', async () => {
            await navigator.clipboard.writeText(requester.access_link);
            showStatus(requestersStatus, translate('done.copied'), 'ok');
        }));
        if (requester.status === 'active') {
            actions.append(button(translate('actions.sendLink'), 'btn btn-small', () => runRequesterAction(() => requesterAction(requester.id, 'send-link'), 'done.linkSent')));
            actions.append(button(translate('actions.regenerateLink'), 'btn btn-small', () => {
                if (window.confirm(translate('confirm.regenerate'))) runRequesterAction(() => requesterAction(requester.id, 'regenerate-link'), 'done.regenerated');
            }));
            actions.append(button(translate('actions.suspend'), 'btn btn-danger btn-small', () => {
                if (window.confirm(translate('confirm.suspend'))) runRequesterAction(() => requesterAction(requester.id, 'suspend'), 'done.suspended', { requests: 0 });
            }));
        } else {
            actions.append(button(translate('actions.reactivate'), 'btn btn-primary btn-small', () => runRequesterAction(() => requesterAction(requester.id, 'reactivate'), 'done.reactivated')));
        }
        row.append(text, actions);
        return row;
    }));
}

/**
 * @param {object|null} requester - null for a new one
 * @returns {void}
 */
function openRequesterDialog(requester) {
    byId('requester-dialog-title').textContent = translate(requester === null ? 'requesters.new' : 'requesters.edit');
    requesterForm.reset();
    byId('requester-id').value = requester === null ? '' : String(requester.id);
    if (requester !== null) {
        byId('requester-name').value = requester.name;
        byId('requester-contact').value = requester.contact_name;
        byId('requester-email').value = requester.email;
        byId('requester-phone').value = requester.phone ?? '';
        byId('requester-color').value = requester.color;
    }
    hideStatus(byId('requester-status'));
    openDialog(requesterDialog);
}

byId('new-requester').addEventListener('click', () => openRequesterDialog(null));

requesterForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const status = byId('requester-status');
    hideStatus(status);
    if (!requesterForm.checkValidity()) {
        showStatus(status, translate('validation.required'), 'error');
        return;
    }
    const fields = new FormData(requesterForm);
    const payload = { name: fields.get('name'), contact_name: fields.get('contact_name'), email: fields.get('email'), phone: fields.get('phone'), color: fields.get('color') };
    const id = fields.get('id');
    try {
        if (id === '') await createRequester(payload);
        else await updateRequester(Number(id), payload);
        requesterDialog.close();
        showStatus(requestersStatus, translate(id === '' ? 'done.requesterCreated' : 'done.requesterSaved'), 'ok');
        await loadRequesters();
    } catch (error) {
        showStatus(status, errorMessage(error), 'error');
    }
});

/* ------------------------------------------------------------ navigation */

for (const navButton of document.querySelectorAll('.nav-item')) navButton.addEventListener('click', () => showSection(navButton.dataset.target));

/* ------------------------------------------------------------------ auth */

const loginView = byId('login-view');
const adminView = byId('admin-view');
const loginForm = byId('login-form');

async function enterDashboard() {
    loginView.hidden = true;
    adminView.hidden = false;
    byId('nav-sections').hidden = false;
    byId('logout').hidden = false;
    byId('nav-rooms').hidden = g_config.type !== 'hotel';
    byId('nav-pricing').hidden = g_config.type !== 'hotel';
    byId('nav-requesters').hidden = g_config.type !== 'facility';
    byId('cal-mode').hidden = g_config.type !== 'hotel';
    initDirectForm();
    showSection('section-calendar');
    const loads = [calendarView.refresh(), loadPending()];
    if (g_config.type === 'hotel') loads.push(loadRooms(), loadPricing());
    if (g_config.type === 'facility') loads.push(loadRequesters());
    await Promise.all(loads);
}

loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const status = byId('login-status');
    hideStatus(status);
    try {
        await adminLogin(byId('password').value);
        byId('password').value = '';
        await enterDashboard();
    } catch (error) {
        showStatus(status, errorMessage(error), 'error');
    }
});

byId('logout').addEventListener('click', async () => {
    await adminLogout();
    window.location.reload();
});

onLanguageChange(() => {
    drawCalendar();
    drawPending();
    drawPricing();
    drawPriceCalendar();
    if (g_config?.type === 'facility') drawRequesters();
});

async function init() {
    const loading = byId('loading');
    try {
        g_config = await fetchConfig();
    } catch (error) {
        initI18n();
        showStatus(loading, errorMessage(error), 'error');
        return;
    }
    applyVenue(g_config);
    initI18n(g_config.defaultLang);
    loading.hidden = true;
    try {
        await adminMe();
        await enterDashboard();
    } catch {
        loginView.hidden = false;
    }
}

init();
