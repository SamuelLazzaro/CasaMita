/*
 * form-facility.js — the facility booking form of the admin dialog: a
 * registered requester, one date and a time range on the 30-minute grid of
 * the opening hours. The requester area (iteration 3) will reuse it without
 * the requester select.
 */
import { MAX_DAYS_AHEAD } from './constants.js';
import { translate } from './i18n.js';
import { errorMessage, fillSelect, showStatus, hideStatus } from './ui.js';
import { addDays, minutesFromTime, timeFromMinutes, todayInRome } from './utils.js';

/**
 * @param {{open: string, close: string, slotMinutes: number}} facility - opening hours
 * @param {boolean} forEnd - end times run from open + slot to close included
 * @returns {{value: string, label: string}[]}
 */
function timeOptions(facility, forEnd) {
    const open = minutesFromTime(facility.open);
    const close = minutesFromTime(facility.close);
    const options = [];
    for (let minutes = forEnd ? open + facility.slotMinutes : open; forEnd ? minutes <= close : minutes < close; minutes += facility.slotMinutes) {
        const time = timeFromMinutes(minutes);
        options.push({ value: time, label: time });
    }
    return options;
}

/**
 * Wires a facility form.
 * @param {{facility: {open: string, close: string, slotMinutes: number}}} config
 * @param {(payload: Record<string, unknown>) => Promise<void|boolean>} onSubmit - sends the payload; throws on failure; resolves false to keep the form as it is (nothing was sent)
 * @param {string} [prefix] - id prefix of the form and its fields
 * @returns {{reset: () => void, setRequesters: (requesters: {id: number, name: string, status: string}[]) => void, prefill: (values: {date: string, startTime: string|null}) => void, startEdit: (item: object) => void}} prefill sets date and time range from a calendar cell; startEdit fills the form with a booking (admin)
 */
export function initFacilityForm(config, onSubmit, prefix = 'direct-facility') {
    const byId = (suffix) => document.getElementById(`${prefix}-${suffix}`);
    const form = byId('form');
    const requesterSelect = byId('requester');
    const date = byId('date');
    const startSelect = byId('start-time');
    const endSelect = byId('end-time');
    const status = byId('status');
    const submitButton = byId('submit');

    /** @type {boolean} true while the form edits an existing booking (admin): the submit button reads "Save" */
    let editing = false;

    const today = todayInRome();
    date.min = today;
    date.max = addDays(today, MAX_DAYS_AHEAD);
    date.value = today;
    fillSelect(startSelect, timeOptions(config.facility, false));
    fillSelect(endSelect, timeOptions(config.facility, true));

    /** Keeps the end after the start: on a start change the end follows one slot later when needed. */
    function alignEnd() {
        if (minutesFromTime(endSelect.value) <= minutesFromTime(startSelect.value)) endSelect.value = timeFromMinutes(minutesFromTime(startSelect.value) + config.facility.slotMinutes);
    }
    startSelect.addEventListener('change', alignEnd);

    function reset() {
        editing = false;
        submitButton.textContent = translate('common.submit');
        form.reset();
        date.value = today;
        startSelect.selectedIndex = 0;
        alignEnd();
    }

    /**
     * Fills the form with an existing booking (admin dialog in edit mode).
     * @param {object} item - a facility request as the admin API returns it
     * @returns {void}
     */
    function startEdit(item) {
        form.reset();
        editing = true;
        if (requesterSelect !== null) requesterSelect.value = String(item.requester_id);
        date.value = item.date;
        startSelect.value = item.start_time;
        endSelect.value = item.end_time;
        byId('notes').value = item.notes ?? '';
        submitButton.textContent = translate('common.save');
    }

    /**
     * Fills the form from a calendar cell: the date, and, from a slot of the
     * time grid, a one-slot range starting there (the user then stretches
     * it). The other fields keep what they hold.
     * @param {{date: string, startTime: string|null}} values - 'YYYY-MM-DD' and 'HH:MM' (null from a whole-day cell)
     * @returns {void}
     */
    function prefill(values) {
        date.value = values.date;
        if (values.startTime === null) return;
        startSelect.value = values.startTime;
        endSelect.value = timeFromMinutes(minutesFromTime(values.startTime) + config.facility.slotMinutes);
    }

    /**
     * @param {{id: number, name: string, status: string}[]} requesters - only the active ones become options
     * @returns {void}
     */
    function setRequesters(requesters) {
        if (requesterSelect === null) return;
        const options = requesters.filter((requester) => requester.status === 'active').map((requester) => ({ value: String(requester.id), label: requester.name }));
        fillSelect(requesterSelect, options, requesterSelect.value);
        requesterSelect.disabled = options.length === 0;
    }

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        hideStatus(status);
        const requesterMissing = requesterSelect !== null && requesterSelect.value === '';
        if (!form.checkValidity() || requesterMissing) {
            showStatus(status, translate('validation.required'), 'error');
            return;
        }
        const fields = new FormData(form);
        const payload = { date: fields.get('date'), start_time: fields.get('start_time'), end_time: fields.get('end_time'), notes: fields.get('notes') };
        // The requester select exists only in the admin dialog: the area knows who you are from the session.
        if (requesterSelect !== null) payload.requester_id = Number(fields.get('requester_id'));
        submitButton.disabled = true;
        submitButton.textContent = translate('common.sending');
        try {
            const done = await onSubmit(payload);
            if (done !== false) reset();
        } catch (error) {
            const slots = error.slots ? ` (${error.slots.map((key) => key.slice(11, 13) + ':' + key.slice(13)).join(', ')})` : '';
            showStatus(status, errorMessage(error) + slots, 'error');
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = translate(editing ? 'common.save' : 'common.submit');
        }
    });

    alignEnd();
    return { reset, setRequesters, prefill, startEdit };
}
