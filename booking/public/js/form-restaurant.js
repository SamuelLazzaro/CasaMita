/*
 * form-restaurant.js — the restaurant request form: date constraints, lunch
 * and dinner seating times from the venue configuration, payload
 * construction. Used with prefix "restaurant" on the public page and
 * "direct-restaurant" in the admin dialog.
 */
import { MAX_DAYS_AHEAD } from './constants.js';
import { currentLanguage, translate } from './i18n.js';
import { errorMessage, fillSelect, showStatus, hideStatus } from './ui.js';
import { addDays, minutesFromTime, seatingTimes, todayInRome } from './utils.js';

/**
 * Wires a restaurant form.
 * @param {{restaurant: {lunch: {open: string, close: string}, dinner: {open: string, close: string}, stepMinutes: number}}} config
 * @param {(payload: Record<string, unknown>) => Promise<void|boolean>} onSubmit - sends the payload; throws on failure; resolves false to keep the form as it is (nothing was sent)
 * @param {string} [prefix] - id prefix of the form and its fields
 * @returns {{reset: () => void, prefill: (values: {date: string, time: string|null}) => void, startEdit: (item: object) => void}} prefill sets date, service and time from a calendar cell; startEdit fills the form with a booking (admin)
 */
export function initRestaurantForm(config, onSubmit, prefix = 'restaurant') {
    const byId = (suffix) => document.getElementById(`${prefix}-${suffix}`);
    const form = byId('form');
    const date = byId('date');
    const timeSelect = byId('time');
    const status = byId('status');
    const submitButton = byId('submit');
    const privacy = byId('privacy');
    const langSelect = byId('lang');

    /** @type {boolean} true while the form edits an existing booking (admin): the submit button reads "Save" */
    let editing = false;

    const today = todayInRome();
    date.min = today;
    date.max = addDays(today, MAX_DAYS_AHEAD);
    date.value = today;

    /** @returns {'lunch'|'dinner'} the checked service */
    function selectedService() {
        return form.querySelector('input[name="service"]:checked').value;
    }

    function renderTimes() {
        const window = config.restaurant[selectedService()];
        const options = seatingTimes(window, config.restaurant.stepMinutes).map((time) => ({ value: time, label: time }));
        fillSelect(timeSelect, options, timeSelect.value);
    }

    function reset() {
        editing = false;
        submitButton.textContent = translate('common.submit');
        form.reset();
        date.value = today;
        renderTimes();
    }

    /**
     * @param {string} time - 'HH:MM'
     * @returns {'lunch'|'dinner'} the service whose window holds that time (dinner when neither does)
     */
    function serviceOf(time) {
        const minutes = minutesFromTime(time);
        const lunch = config.restaurant.lunch;
        const isLunch = minutesFromTime(lunch.open) <= minutes && minutes < minutesFromTime(lunch.close);
        return isLunch ? 'lunch' : 'dinner';
    }

    /**
     * Fills the form from a calendar cell: the date, and, from a slot of the
     * time grid, the service and the seating time too. The other fields keep
     * what they hold.
     * @param {{date: string, time: string|null}} values - 'YYYY-MM-DD' and 'HH:MM' (null from a whole-day cell)
     * @returns {void}
     */
    function prefill(values) {
        date.value = values.date;
        if (values.time === null) return;
        form.querySelector(`input[name="service"][value="${serviceOf(values.time)}"]`).checked = true;
        renderTimes();
        timeSelect.value = values.time;
    }

    /**
     * Fills the form with an existing booking (admin dialog in edit mode).
     * @param {object} item - a restaurant request as the admin API returns it
     * @returns {void}
     */
    function startEdit(item) {
        form.reset();
        editing = true;
        byId('first-name').value = item.first_name ?? '';
        byId('last-name').value = item.last_name ?? '';
        byId('email').value = item.email ?? '';
        byId('phone').value = item.phone ?? '';
        byId('party-size').value = String(item.party_size);
        byId('notes').value = item.notes ?? '';
        if (langSelect !== null) langSelect.value = item.lang;
        prefill({ date: item.date, time: item.start_time });
        submitButton.textContent = translate('common.save');
    }

    for (const radio of form.querySelectorAll('input[name="service"]')) radio.addEventListener('change', renderTimes);
    renderTimes();

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        hideStatus(status);
        if (!form.checkValidity()) {
            const privacyMissing = privacy !== null && !privacy.checked;
            showStatus(status, translate(privacyMissing ? 'validation.privacy' : 'validation.required'), 'error');
            return;
        }
        const fields = new FormData(form);
        const payload = {
            first_name: fields.get('first_name'),
            last_name: fields.get('last_name'),
            email: fields.get('email'),
            phone: fields.get('phone'),
            date: fields.get('date'),
            time: fields.get('time'),
            party_size: Number(fields.get('party_size')),
            notes: fields.get('notes'),
            website: fields.get('website') ?? '',
            privacy_accepted: fields.get('privacy_accepted') === 'on',
            lang: langSelect !== null ? langSelect.value : currentLanguage(),
        };
        submitButton.disabled = true;
        submitButton.textContent = translate('common.sending');
        try {
            const done = await onSubmit(payload);
            if (done !== false) reset();
        } catch (error) {
            showStatus(status, errorMessage(error), 'error');
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = translate(editing ? 'common.save' : 'common.submit');
        }
    });

    return { reset, prefill, startEdit };
}
