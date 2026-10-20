/*
 * admin.js — entry point of the manager dashboard: login, section
 * navigation, calendar (week / month, plus the day view on the time grid
 * for restaurant and facility), pending requests, direct bookings, room
 * types with their base price (hotel) and organisations (facility).
 */
import { attachAddShortcut } from './add-shortcut.js';
import { adminLogin, adminLogout, adminMe, approveRequest, cancelRequestAdmin, createBooking, createDiscount, createPeriod, createRequester, createRoomType, deleteDiscount, deletePeriod, deleteRoomType, fetchAvailability, fetchCalendar, fetchConfig, fetchPricing, fetchRequesters, fetchRequests, fetchRooms, markPaid, recordDeposit, rejectRequest, requesterAction, updateBooking, updateRequester, updateRoomType } from './api.js';
import { renderMonth, renderWeek, itemName } from './calendar-render.js';
import { createCalendarView } from './calendar-view.js';
import { enableDragScroll } from './drag-scroll.js';
import { renderPriceMonth, renderPriceWeek } from './price-calendar.js';
import { initFacilityForm } from './form-facility.js';
import { initHotelForm } from './form-hotel.js';
import { initRestaurantForm } from './form-restaurant.js';
import { currentLanguage, initI18n, onLanguageChange, translate } from './i18n.js';
import { renderSlotGrid, slotGridSetup } from './slot-calendar.js';
import { startTapFeedback } from './tap-feedback.js';
import { appendDetail, applyVenue, bindPriceInput, button, errorMessage, hideStatus, openDialog, showSection, showStatus, statusBadge } from './ui.js';
import { addDays, displayStatus, formatEuro, formatLongDate, formatShortDate, formatTimestamp, mondayOf, priceInputValue, todayInRome, weekDays } from './utils.js';

startTapFeedback();

const byId = (id) => document.getElementById(id);

/** @type {object|null} venue configuration from GET /api/config */
let g_config = null;

/** @type {object[]} last calendar answer, re-rendered on language change */
let g_calendarItems = [];

/** @type {object[]} registered organisations (facility) */
let g_requesters = [];

/** @type {{reset: () => void|Promise<void>, prefill: (values: object) => void|Promise<void>, startEdit: (item: object) => void|Promise<void>, setRequesters?: (requesters: object[]) => void}|null} the direct booking form of this venue */
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

/*
 * The hotel has week and month views of whole-day cells (a stay has no time
 * of day); restaurant and facility draw week and day on the time grid. The
 * drill-down from a month cell lands on the finest view of the venue. Every
 * view carries the "+" shortcut, served by the delegated listener below.
 */
function drawCalendar() {
    if (g_config === null) return;
    const { view, date } = calendarView.interval();
    const isHotel = g_config.type === 'hotel';
    const options = { onSelect: openDetails, onOpenDay: (day) => calendarView.open(isHotel ? 'week' : 'day', day), withAddShortcut: true };
    if (view === 'month') renderMonth(calendarContainer, date, g_calendarItems, options);
    else if (isHotel) renderWeek(calendarContainer, date, g_calendarItems, options);
    else renderSlotGrid(calendarContainer, view === 'day' ? [date] : weekDays(mondayOf(date)), g_calendarItems, slotGridSetup(g_config), options);
}

/**
 * What the "+" of a cell writes into the direct booking form, by venue type.
 * @param {string} day - 'YYYY-MM-DD'
 * @param {string|null} time - 'HH:MM' from a slot, null from a whole-day cell
 * @returns {object} the prefill values of that form
 */
function prefillFor(day, time) {
    if (g_config.type === 'hotel') return { checkIn: day };
    if (g_config.type === 'restaurant') return { date: day, time };
    return { date: day, startTime: time };
}

attachAddShortcut(calendarContainer, (day, time) => openDirectBooking(prefillFor(day, time)));

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
const depositBlock = byId('deposit-block');
const depositAmount = byId('deposit-amount');
const depositHint = byId('deposit-hint');

// Every price field takes and shows two decimals.
bindPriceInput(depositAmount);
bindPriceInput(byId('period-price'));

/**
 * Payment rows of a confirmed hotel stay: the deposit and the balance still
 * due, or the amount paid in full; nothing while no payment is recorded.
 * @param {object} item
 * @param {string} lang
 * @returns {[string, string][]}
 */
function paymentRows(item, lang) {
    const rows = [];
    const hasTotal = item.quoted_total !== null && item.quoted_total !== undefined;
    if (item.payment_status === 'deposit') {
        rows.push([translate('price.deposit'), formatEuro(item.paid_amount, lang)]);
        if (hasTotal) rows.push([translate('price.remaining'), formatEuro(item.quoted_total - item.paid_amount, lang)]);
    } else if (item.payment_status === 'paid') {
        if (item.paid_amount !== null && item.paid_amount !== undefined) rows.push([translate('price.paidAmount'), formatEuro(item.paid_amount, lang)]);
    } else {
        return rows;
    }
    if (item.paid_at) rows.push([translate('price.paidOn'), formatTimestamp(item.paid_at, lang)]);
    return rows;
}

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
        rows.push(...paymentRows(item, lang));
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
 * @param {() => Promise<any>} action
 * @param {string} doneKey - translation key of the success message
 * @param {HTMLElement} statusElement
 * @returns {Promise<any|null>} the answer of the action, null on failure
 */
async function runDecision(action, doneKey, statusElement) {
    hideStatus(statusElement);
    try {
        const answer = await action();
        showStatus(statusElement, translate(doneKey), 'ok');
        await Promise.all([calendarView.refresh(), loadPending()]);
        return answer ?? {};
    } catch (error) {
        showStatus(statusElement, errorMessage(error), 'error');
        return null;
    }
}

/**
 * Payment buttons of a confirmed hotel stay. "Record deposit" is two-step
 * like the rejection: it reveals the amount field and its confirm button.
 * "Mark as paid" closes the payment for good. Both refresh the dialog with
 * the new state on success, so the rows and the badge follow.
 * @param {object} item - a confirmed hotel request
 * @returns {HTMLButtonElement[]}
 */
function paymentButtons(item) {
    const buttons = [];
    const hasTotal = item.quoted_total !== null && item.quoted_total !== undefined;
    if (item.payment_status === 'none' && hasTotal) {
        const depositButton = button(translate('actions.deposit'), 'btn', () => {
            depositButton.hidden = true;
            depositHint.textContent = translate('deposit.hint', { total: formatEuro(item.quoted_total, currentLanguage()) });
            depositBlock.hidden = false;
            depositAmount.focus();
        });
        buttons.push(depositButton);
    }
    buttons.push(button(translate('actions.paid'), 'btn btn-primary', async () => {
        if (!window.confirm(translate('confirm.paid'))) return;
        const answer = await runDecision(() => markPaid(item.id), 'done.paid', detailsStatus);
        if (answer !== null) openDetails(answer.item ?? item, translate('done.paid'));
    }));
    return buttons;
}

/**
 * Opens the details dialog. Rejecting from here is a two-step action: the
 * "Reject" button reveals the optional message field and the confirm button,
 * so the venue can explain the refusal to the guest.
 * @param {object} item - a request (calendar item or pending list row)
 * @param {string} [doneMessage] - success message to keep on screen when the dialog is redrawn after an action
 * @returns {void}
 */
function openDetails(item, doneMessage = '') {
    byId('details-title').textContent = itemName(item);
    detailsBadge.replaceChildren(statusBadge(displayStatus(item)));
    detailsList.replaceChildren();
    for (const [label, value] of detailRows(item)) appendDetail(detailsList, label, value);
    hideStatus(detailsStatus);
    if (doneMessage !== '') showStatus(detailsStatus, doneMessage, 'ok');
    rejectReason.value = '';
    rejectBlock.hidden = true;
    depositAmount.value = '';
    depositBlock.hidden = true;

    detailsActions.replaceChildren();
    if (item.type === 'hotel' && item.status === 'approved' && item.payment_status !== 'paid') detailsActions.append(...paymentButtons(item));
    if (item.status === 'pending') {
        detailsActions.append(button(translate('actions.approve'), 'btn btn-primary', async () => {
            if (!window.confirm(translate('confirm.approve'))) return;
            if (await runDecision(() => approveRequest(item.id), 'done.approved', detailsStatus) !== null) detailsActions.replaceChildren();
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
        detailsActions.append(button(translate('actions.edit'), 'btn', () => openEditBooking(item)));
        detailsActions.append(button(translate('actions.cancel'), 'btn', async () => {
            if (!window.confirm(translate('confirm.cancel'))) return;
            if (await runDecision(() => cancelRequestAdmin(item.id), 'done.cancelled', detailsStatus) !== null) detailsActions.replaceChildren();
        }));
    }
    byId('reject-confirm').onclick = async () => {
        if (await runDecision(() => rejectRequest(item.id, rejectReason.value), 'done.rejected', detailsStatus) !== null) {
            rejectBlock.hidden = true;
            detailsActions.replaceChildren();
        }
    };
    byId('deposit-confirm').onclick = async () => {
        const amount = Number(depositAmount.value);
        const isPartial = depositAmount.value !== '' && Number.isFinite(amount) && amount > 0 && amount < item.quoted_total;
        if (!isPartial) {
            showStatus(detailsStatus, translate('deposit.invalid'), 'error');
            return;
        }
        const answer = await runDecision(() => recordDeposit(item.id, amount), 'done.deposit', detailsStatus);
        if (answer !== null) openDetails(answer.item ?? item, translate('done.deposit'));
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
const bookingTitle = byId('booking-dialog-title');
const bookingHint = byId('booking-hint');
const editBlock = byId('edit-confirm-block');
const editDiff = byId('edit-diff');
const editNotify = byId('edit-notify');

/** @type {object|null} the booking the dialog is editing; null while it registers a new one */
let g_editing = null;

/** Title and hint of the dialog follow its mode (new / edit) and the language. */
function drawBookingHeader() {
    bookingTitle.textContent = translate(g_editing === null ? 'booking.newTitle' : 'booking.editTitle');
    bookingHint.textContent = translate(g_editing === null ? 'booking.newHint' : 'booking.editHint');
}

onLanguageChange(drawBookingHeader);

/** @returns {HTMLFormElement} the direct booking form of this venue */
function directForm() {
    return byId(`direct-${g_config.type}-form`);
}

/**
 * Switches the dialog between the form and the recap of the changes.
 * @param {boolean} visible - true to show the recap in place of the form
 * @returns {void}
 */
function showRecap(visible) {
    directForm().hidden = visible;
    editBlock.hidden = !visible;
}

async function submitDirectBooking(payload) {
    if (g_editing !== null) return await submitEdit(payload);
    await createBooking(payload);
    bookingDialog.close();
    showStatus(calendarStatus, translate('done.created'), 'ok');
    await calendarView.refresh();
}

/*
 * Edit flow (owner's decision): nothing is written until the venue has seen
 * the list of the fields that change (before and after) and confirmed it.
 * The recap takes the place of the form inside the same dialog; "back"
 * returns to the form with its values intact, which is why submitEdit
 * resolves false in that case (the form then skips its reset).
 */

/**
 * The fields of the form whose value differs from the booking, as rows for
 * the recap. Values are normalised before the comparison (empty strings and
 * missing values are the same thing, numbers are compared as numbers) and
 * formatted for the reader after it.
 * @param {object} item - the booking being edited
 * @param {Record<string, unknown>} payload - what the form is about to send
 * @returns {{label: string, before: string, after: string}[]}
 */
function changedRows(item, payload) {
    const lang = currentLanguage();
    const none = translate('edit.none');
    const asText = (value) => (value === null || value === undefined || value === '' ? none : String(value));
    const asDate = (value) => (value ? formatLongDate(value, lang) : none);
    const asPrice = (value) => (value === null || value === undefined || value === '' ? none : formatEuro(Number(value), lang));
    const asLang = (value) => translate(`lang.${value}`);
    const asRequester = (value) => g_requesters.find((requester) => requester.id === Number(value))?.name ?? none;
    const guestSpecs = [['first_name', 'first_name', 'field.firstName', asText], ['last_name', 'last_name', 'field.lastName', asText], ['email', 'email', 'field.email', asText], ['phone', 'phone', 'field.phone', asText]];
    const trailingSpecs = [['notes', 'notes', 'field.notes', asText], ['lang', 'lang', 'field.lang', asLang]];
    /** @type {[string, string, string, (value: unknown) => string][]} payload key, item key, label key, formatter */
    let specs;
    if (item.type === 'hotel') specs = [...guestSpecs, ['check_in', 'check_in', 'field.checkIn', asDate], ['check_out', 'check_out', 'field.checkOut', asDate], ['adults', 'adults', 'field.adults', asText], ['children', 'children', 'field.children', asText], ['room_type', 'room_type', 'field.roomType', asText], ['total', 'quoted_total', 'price.total', asPrice], ...trailingSpecs];
    else if (item.type === 'restaurant') specs = [...guestSpecs, ['date', 'date', 'field.date', asDate], ['time', 'start_time', 'field.time', asText], ['party_size', 'party_size', 'field.partySize', asText], ...trailingSpecs];
    else specs = [['requester_id', 'requester_id', 'field.requester', asRequester], ['date', 'date', 'field.date', asDate], ['start_time', 'start_time', 'field.startTime', asText], ['end_time', 'end_time', 'field.endTime', asText], ['notes', 'notes', 'field.notes', asText]];

    const normalise = (value) => {
        if (value === null || value === undefined || value === '') return null;
        return typeof value === 'number' ? value : String(value);
    };
    const rows = [];
    for (const [payloadKey, itemKey, labelKey, format] of specs) {
        const before = normalise(item[itemKey]);
        const after = normalise(payload[payloadKey]);
        // Numbers may arrive as strings from one side (e.g. a price typed in the field): compare them as numbers.
        const same = before === after || (typeof before === 'number' && after !== null && Number(after) === before) || (typeof after === 'number' && before !== null && Number(before) === after);
        if (!same) rows.push({ label: translate(labelKey), before: format(before), after: format(after) });
    }
    return rows;
}

/**
 * Appends a recap row: the label, the old value struck through, the new one.
 * @param {{label: string, before: string, after: string}} row
 * @returns {void}
 */
function appendDiffRow(row) {
    const term = document.createElement('dt');
    term.textContent = row.label;
    const definition = document.createElement('dd');
    const before = document.createElement('span');
    before.className = 'diff-before';
    before.textContent = row.before;
    const after = document.createElement('span');
    after.className = 'diff-after';
    after.textContent = row.after;
    definition.append(before, after);
    editDiff.append(term, definition);
}

/**
 * Waits for the venue's decision on the recap: the confirm button, the back
 * button, or the dialog being closed (which counts as "back").
 * @returns {Promise<boolean>} true to save
 */
function waitForDecision() {
    return new Promise((resolve) => {
        const onClose = () => decide(false);
        const decide = (confirmed) => {
            bookingDialog.removeEventListener('close', onClose);
            resolve(confirmed);
        };
        byId('edit-confirm').onclick = () => decide(true);
        byId('edit-back').onclick = () => decide(false);
        bookingDialog.addEventListener('close', onClose);
    });
}

/**
 * @param {Record<string, unknown>} payload - what the form built
 * @returns {Promise<boolean|void>} false when nothing was saved and the form must keep its values
 */
async function submitEdit(payload) {
    const rows = changedRows(g_editing, payload);
    if (rows.length === 0) {
        showStatus(byId(`direct-${g_config.type}-status`), translate('edit.noChanges'), 'error');
        return false;
    }
    editDiff.replaceChildren();
    for (const row of rows) appendDiffRow(row);
    editNotify.checked = true;
    showRecap(true);
    const confirmed = await waitForDecision();
    showRecap(false);
    if (!confirmed) return false;
    const item = g_editing;
    await updateBooking(item.id, { ...payload, notify: editNotify.checked });
    // Mode back to "new" before closing, so the close handler leaves the form to its own reset.
    g_editing = null;
    drawBookingHeader();
    bookingDialog.close();
    showStatus(calendarStatus, translate('done.edited'), 'ok');
    await Promise.all([calendarView.refresh(), loadPending()]);
}

/**
 * Opens the booking dialog on an existing booking, from the details dialog.
 * @param {object} item - a pending or approved request
 * @returns {Promise<void>}
 */
async function openEditBooking(item) {
    detailsDialog.close();
    hideStatus(byId(`direct-${g_config.type}-status`));
    if (g_directForm.setRequesters) g_directForm.setRequesters(g_requesters);
    g_editing = item;
    drawBookingHeader();
    showRecap(false);
    await g_directForm.startEdit(item);
    openDialog(bookingDialog);
}

// Closing the dialog halfway through an edit (✕, Esc) drops the edit: the form goes back to "new".
bookingDialog.addEventListener('close', () => {
    if (g_editing === null) return;
    g_editing = null;
    drawBookingHeader();
    showRecap(false);
    g_directForm.reset();
});

function initDirectForm() {
    for (const type of ['hotel', 'restaurant', 'facility']) byId(`direct-${type}-form`).hidden = type !== g_config.type;
    for (const select of document.querySelectorAll('select[id$="-lang"]')) select.value = g_config.defaultLang;
    if (g_config.type === 'hotel') g_directForm = initHotelForm(submitDirectBooking, 'direct-hotel');
    else if (g_config.type === 'restaurant') g_directForm = initRestaurantForm(g_config, submitDirectBooking, 'direct-restaurant');
    else g_directForm = initFacilityForm(g_config, submitDirectBooking, 'direct-facility');
}

/**
 * Opens the direct booking dialog, from the panel button (nothing prefilled)
 * or from the "+" of a calendar cell (date, and time when the cell is a slot).
 * @param {object|null} prefill - values for g_directForm.prefill, null for none
 * @returns {void}
 */
function openDirectBooking(prefill = null) {
    hideStatus(byId(`direct-${g_config.type}-status`));
    if (g_directForm.setRequesters) g_directForm.setRequesters(g_requesters);
    drawBookingHeader();
    if (prefill !== null) g_directForm.prefill(prefill);
    openDialog(bookingDialog);
}

byId('new-booking').addEventListener('click', () => openDirectBooking());

/* ---------------------------------------------------------------- rooms */

const roomsStatus = byId('rooms-status');
const roomsCheckIn = byId('rooms-check-in');
const roomsCheckOut = byId('rooms-check-out');
const roomDialog = byId('dialog-room');
const roomForm = byId('room-form');

/** @type {{id: number, name: string, max_guests: number, quantity: number, price_per_night: number|null}[]} room types of the hotel */
let g_rooms = [];

/** @type {Map<string, number>} rooms left per type name for the dates picked in the section */
let g_roomsAvailable = new Map();

// The availability dates start at tonight's stay.
{
    const today = todayInRome();
    roomsCheckIn.min = today;
    roomsCheckIn.value = today;
    roomsCheckOut.min = addDays(today, 1);
    roomsCheckOut.value = addDays(today, 1);
}
roomsCheckIn.addEventListener('change', () => {
    roomsCheckOut.min = addDays(roomsCheckIn.value, 1);
    if (roomsCheckOut.value <= roomsCheckIn.value) roomsCheckOut.value = roomsCheckOut.min;
    loadRoomsAvailability();
});
roomsCheckOut.addEventListener('change', loadRoomsAvailability);
bindPriceInput(byId('room-price'));

async function loadRooms() {
    try {
        g_rooms = (await fetchRooms()).rooms;
    } catch (error) {
        showStatus(roomsStatus, errorMessage(error), 'error');
        return;
    }
    await loadRoomsAvailability();
}

/** Rooms left for the dates of the section, then the table. */
async function loadRoomsAvailability() {
    g_roomsAvailable = new Map();
    if (roomsCheckIn.value !== '' && roomsCheckOut.value > roomsCheckIn.value) {
        try {
            const answer = await fetchAvailability(roomsCheckIn.value, roomsCheckOut.value);
            g_roomsAvailable = new Map(answer.rooms.map((room) => [room.name, room.available]));
        } catch (error) {
            showStatus(roomsStatus, errorMessage(error), 'error');
        }
    }
    drawRooms();
}

function drawRooms() {
    const lang = currentLanguage();
    byId('rooms-empty').hidden = g_rooms.length > 0;
    byId('rooms-body').replaceChildren(...g_rooms.map((room) => {
        const row = document.createElement('tr');
        const price = room.price_per_night === null ? translate('rooms.notSet') : formatEuro(room.price_per_night, lang);
        for (const value of [room.name, room.max_guests, room.quantity, price, g_roomsAvailable.get(room.name) ?? '—']) {
            const cell = document.createElement('td');
            cell.textContent = String(value);
            row.append(cell);
        }
        const actionsCell = document.createElement('td');
        const actions = document.createElement('div');
        actions.className = 'table-actions';
        actions.append(button(translate('actions.edit'), 'btn btn-small', () => openRoomDialog(room)));
        actions.append(button(translate('actions.delete'), 'btn btn-danger btn-small', () => {
            if (window.confirm(translate('rooms.confirmDelete'))) runRoomAction(() => deleteRoomType(room.id), 'done.roomDeleted');
        }));
        actionsCell.append(actions);
        row.append(actionsCell);
        return row;
    }));
}

/**
 * Everything that lists the room types: the Rooms table, the Prices section
 * (period form and price calendar) and the calendar.
 * @returns {Promise<void>}
 */
async function refreshAfterRoomChange() {
    await Promise.all([loadRooms(), loadPricing(), calendarView.refresh()]);
}

/**
 * Runs a change to the room types from the table, reports the outcome and refreshes.
 * @param {() => Promise<unknown>} action
 * @param {string} doneKey
 * @returns {Promise<void>}
 */
async function runRoomAction(action, doneKey) {
    hideStatus(roomsStatus);
    try {
        await action();
        showStatus(roomsStatus, translate(doneKey), 'ok');
        await refreshAfterRoomChange();
    } catch (error) {
        showStatus(roomsStatus, errorMessage(error), 'error');
    }
}

/**
 * @param {object|null} room - null for a new type
 * @returns {void}
 */
function openRoomDialog(room) {
    byId('room-dialog-title').textContent = translate(room === null ? 'rooms.new' : 'rooms.edit');
    roomForm.reset();
    byId('room-id').value = room === null ? '' : String(room.id);
    if (room !== null) {
        byId('room-name').value = room.name;
        byId('room-max-guests').value = String(room.max_guests);
        byId('room-quantity').value = String(room.quantity);
        byId('room-price').value = priceInputValue(room.price_per_night);
    }
    hideStatus(byId('room-status'));
    openDialog(roomDialog);
}

byId('new-room').addEventListener('click', () => openRoomDialog(null));

roomForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const status = byId('room-status');
    hideStatus(status);
    if (!roomForm.checkValidity()) {
        showStatus(status, translate('validation.required'), 'error');
        return;
    }
    const fields = new FormData(roomForm);
    const payload = { name: fields.get('name'), max_guests: Number(fields.get('max_guests')), quantity: Number(fields.get('quantity')), price_per_night: Number(fields.get('price_per_night')) };
    const id = fields.get('id');
    try {
        const result = id === '' ? await createRoomType(payload) : await updateRoomType(Number(id), payload);
        roomDialog.close();
        // Fewer rooms than the confirmed stays need is allowed, but said out loud.
        const overbooked = result.overbooked ?? 0;
        if (overbooked > 0) showStatus(roomsStatus, translate('done.roomOverbooked', { count: overbooked }), 'error');
        else showStatus(roomsStatus, translate(id === '' ? 'done.roomCreated' : 'done.roomSaved'), 'ok');
        await refreshAfterRoomChange();
    } catch (error) {
        showStatus(status, errorMessage(error), 'error');
    }
});

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

    // Period form: one option per room type (the base prices come along, for the price calendar).
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
    // A stay has no time of day: the hotel has no day view.
    byId('cal-view-day').hidden = g_config.type === 'hotel';
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
    drawRooms();
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
