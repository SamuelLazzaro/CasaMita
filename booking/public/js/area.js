/*
 * area.js — entry point of the reserved area of a facility requester:
 * shared calendar, own requests, new request and cancellation.
 */
import { cancelMyRequest, fetchConfig, fetchMyRequests, fetchRequesterCalendar, requesterLogout, requesterMe, submitFacilityRequest } from './api.js';
import { renderDay, renderMonth, renderWeek } from './calendar-render.js';
import { createCalendarView } from './calendar-view.js';
import { initFacilityForm } from './form-facility.js';
import { currentLanguage, initI18n, onLanguageChange, translate } from './i18n.js';
import { startTapFeedback } from './tap-feedback.js';
import { appendDetail, applyVenue, button, errorMessage, hideStatus, openDialog, showStatus, statusBadge } from './ui.js';
import { formatLongDate, formatShortDate, formatTimestamp, todayInRome } from './utils.js';

startTapFeedback();

const byId = (id) => document.getElementById(id);

/** @type {object|null} venue configuration */
let g_config = null;

/** @type {object|null} the signed-in requester */
let g_me = null;

/** @type {object[]} last calendar answer */
let g_calendarItems = [];

/** @type {object[]} own requests */
let g_requests = [];

/* ------------------------------------------------------------- calendar */

const calendarContainer = byId('calendar');
const calendarStatus = byId('calendar-status');

const calendarView = createCalendarView({ title: byId('cal-title'), previous: byId('cal-prev'), next: byId('cal-next'), today: byId('cal-today'), switches: { day: byId('cal-view-day'), week: byId('cal-view-week'), month: byId('cal-view-month') } }, async (interval) => {
    hideStatus(calendarStatus);
    try {
        g_calendarItems = (await fetchRequesterCalendar(interval.view, interval.date)).items;
        drawCalendar();
    } catch (error) {
        showStatus(calendarStatus, errorMessage(error), 'error');
    }
});

function drawCalendar() {
    const { view, date } = calendarView.interval();
    // Only own bookings open the popup: the calendar item carries no notes,
    // so the details come from the own requests list.
    const options = { onSelect: (item) => openDetails(g_requests.find((request) => request.id === item.id) ?? item), canSelect: (item) => item.own === true, onOpenDay: (day) => calendarView.open('day', day) };
    if (view === 'day') renderDay(calendarContainer, date, g_calendarItems, options);
    else if (view === 'week') renderWeek(calendarContainer, date, g_calendarItems, options);
    else renderMonth(calendarContainer, date, g_calendarItems, options);
}

/* -------------------------------------------------------------- details */

const detailsDialog = byId('dialog-details');

/**
 * @param {object} request
 * @returns {boolean} true when the requester may still cancel it
 */
function canCancel(request) {
    const stillActive = request.status === 'pending' || request.status === 'approved';
    return stillActive && request.date >= todayInRome();
}

/**
 * @param {object} request - one of the own requests
 * @returns {void}
 */
function openDetails(request) {
    const lang = currentLanguage();
    byId('details-badge').replaceChildren(statusBadge(request.status));
    const list = byId('details-list');
    list.replaceChildren();
    appendDetail(list, translate('field.date'), formatLongDate(request.date, lang));
    appendDetail(list, translate('field.time'), `${request.start_time} – ${request.end_time}`);
    if (request.notes) appendDetail(list, translate('field.notes'), request.notes);
    if (request.created_at) appendDetail(list, translate('field.requestedOn'), formatTimestamp(request.created_at, lang));
    const status = byId('details-status');
    hideStatus(status);
    const actions = byId('details-actions');
    actions.replaceChildren();
    if (canCancel(request)) {
        actions.append(button(translate(request.status === 'pending' ? 'area.withdraw' : 'actions.cancel'), 'btn btn-danger', async () => {
            if (!window.confirm(translate('area.confirmCancel'))) return;
            try {
                await cancelMyRequest(request.id);
                showStatus(status, translate('done.cancelled'), 'ok');
                actions.replaceChildren();
                await refreshAll();
            } catch (error) {
                showStatus(status, errorMessage(error), 'error');
            }
        }));
    }
    openDialog(detailsDialog);
}

/* ---------------------------------------------------------- own requests */

async function loadRequests() {
    try {
        g_requests = (await fetchMyRequests()).items;
    } catch (error) {
        showStatus(byId('requests-status'), errorMessage(error), 'error');
        return;
    }
    drawRequests();
}

function drawRequests() {
    const list = byId('requests-list');
    byId('requests-empty').hidden = g_requests.length > 0;
    const lang = currentLanguage();
    list.replaceChildren(...g_requests.map((request) => {
        const row = document.createElement('li');
        row.className = 'list-item';
        const text = document.createElement('div');
        text.className = 'list-item-text';
        const when = document.createElement('strong');
        when.textContent = `${formatShortDate(request.date, lang)} · ${request.start_time}–${request.end_time}`;
        text.append(when, statusBadge(request.status));
        const actions = document.createElement('div');
        actions.className = 'list-item-actions';
        actions.append(button(translate('actions.details'), 'btn btn-small', () => openDetails(request)));
        row.append(text, actions);
        return row;
    }));
}

async function refreshAll() {
    await Promise.all([calendarView.refresh(), loadRequests()]);
}

/* ---------------------------------------------------------- new request */

const requestDialog = byId('dialog-request');

byId('new-request').addEventListener('click', () => {
    hideStatus(byId('area-facility-status'));
    openDialog(requestDialog);
});

/* ------------------------------------------------------------------ init */

byId('logout').addEventListener('click', async () => {
    await requesterLogout();
    window.location.reload();
});

onLanguageChange(() => {
    drawCalendar();
    drawRequests();
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
    try {
        g_me = await requesterMe();
    } catch {
        loading.hidden = true;
        byId('denied-view').hidden = false;
        return;
    }
    loading.hidden = true;
    byId('venue-name').textContent = `${g_config.name} · ${g_me.name}`;
    byId('logout').hidden = false;
    byId('area-view').hidden = false;
    initFacilityForm(g_config, async (payload) => {
        await submitFacilityRequest(payload);
        requestDialog.close();
        showStatus(calendarStatus, translate('area.requestSent'), 'ok');
        await refreshAll();
    }, 'area-facility');
    await refreshAll();
}

init();
