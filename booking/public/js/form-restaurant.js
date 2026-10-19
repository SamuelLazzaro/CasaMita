/*
 * form-restaurant.js — the restaurant request form: date constraints, lunch
 * and dinner seating times from the venue configuration, payload
 * construction. Used with prefix "restaurant" on the public page and
 * "direct-restaurant" in the admin dialog.
 */
import { MAX_DAYS_AHEAD } from './constants.js';
import { currentLanguage, translate } from './i18n.js';
import { errorMessage, fillSelect, showStatus, hideStatus } from './ui.js';
import { addDays, seatingTimes, todayInRome } from './utils.js';

/**
 * Wires a restaurant form.
 * @param {{restaurant: {lunch: {open: string, close: string}, dinner: {open: string, close: string}, stepMinutes: number}}} config
 * @param {(payload: Record<string, unknown>) => Promise<void>} onSubmit - sends the payload; throws on failure
 * @param {string} [prefix] - id prefix of the form and its fields
 * @returns {{reset: () => void}}
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
        form.reset();
        date.value = today;
        renderTimes();
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
            await onSubmit(payload);
            reset();
        } catch (error) {
            showStatus(status, errorMessage(error), 'error');
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = translate('common.submit');
        }
    });

    return { reset };
}
