/* ui.js — DOM helpers shared by the pages: status messages, selects, venue theme. */
import { STATUS_ERROR_CLASS, STATUS_OK_CLASS } from './constants.js';
import { Dialog } from './dialog.js';
import { translate } from './i18n.js';
import { tenantPath, tenantSlug } from './tenant.js';
import { limitToCents, priceInputValue } from './utils.js';

/**
 * Points the links marked data-tenant-href at the venue of the page: the
 * attribute holds the path without the prefix ('/privacy'), the href written
 * in the HTML is the fallback for the pages opened at the root.
 * @returns {void}
 */
export function applyTenantLinks() {
    if (tenantSlug() === null) return;
    for (const link of document.querySelectorAll('a[data-tenant-href]')) link.href = tenantPath(link.dataset.tenantHref);
}

/**
 * Shows a status message; kind 'ok' and 'error' color it, anything else is neutral.
 * @param {HTMLElement} element - the role="status" paragraph
 * @param {string} message - already translated text
 * @param {'ok'|'error'|'info'} [kind]
 * @returns {void}
 */
export function showStatus(element, message, kind = 'info') {
    element.textContent = message;
    element.classList.toggle(STATUS_OK_CLASS, kind === 'ok');
    element.classList.toggle(STATUS_ERROR_CLASS, kind === 'error');
    element.hidden = false;
}

/**
 * @param {HTMLElement} element
 * @returns {void}
 */
export function hideStatus(element) {
    element.hidden = true;
    element.textContent = '';
}

/**
 * Translates a server/network error into a message for the user.
 * @param {Error} error - thrown by api.js, message = error code
 * @returns {string}
 */
export function errorMessage(error) {
    const key = `error.${error.message}`;
    const translated = translate(key);
    return translated === key ? translate('error.generic') : translated;
}

/**
 * Replaces the options of a select.
 * @param {HTMLSelectElement} select
 * @param {{value: string, label: string, disabled?: boolean}[]} options
 * @param {string} [selectedValue] - value to keep selected when still present
 * @returns {void}
 */
export function fillSelect(select, options, selectedValue = '') {
    select.replaceChildren(...options.map((option) => {
        const element = document.createElement('option');
        element.value = option.value;
        element.textContent = option.label;
        element.disabled = option.disabled === true;
        return element;
    }));
    const stillThere = options.some((option) => option.value === selectedValue && option.disabled !== true);
    if (stillThere) select.value = selectedValue;
}

/**
 * Applies the venue to the page: accent theme and name in the header.
 * @param {{type: string, name: string}} config
 * @returns {void}
 */
export function applyVenue(config) {
    document.documentElement.dataset.bookingType = config.type;
    const venueName = document.getElementById('venue-name');
    if (venueName !== null) venueName.textContent = config.name;
}

/**
 * Appends a label/value pair to a definition list.
 * @param {HTMLDListElement} list
 * @param {string} label
 * @param {string} value
 * @returns {void}
 */
export function appendDetail(list, label, value) {
    const term = document.createElement('dt');
    term.textContent = label;
    const definition = document.createElement('dd');
    definition.textContent = value;
    list.append(term, definition);
}

/** @type {WeakMap<HTMLDialogElement, Dialog>} one component instance per <dialog>, created at its first opening */
const g_dialogs = new WeakMap();

/**
 * Opens a <dialog> as modal through the dialog component (js/dialog.js):
 * fixed header, scrolling body brought back to the top, close buttons
 * wired once. Closing stays native: callers keep using dialog.close().
 * @param {HTMLDialogElement} dialog
 * @returns {void}
 */
export function openDialog(dialog) {
    let instance = g_dialogs.get(dialog);
    if (instance === undefined) {
        instance = new Dialog(dialog);
        g_dialogs.set(dialog, instance);
    }
    instance.open();
}

/**
 * @param {string} status - request status
 * @returns {HTMLSpanElement} a colored badge with the translated status
 */
export function statusBadge(status) {
    const badge = document.createElement('span');
    badge.className = `badge is-${status}`;
    badge.textContent = translate(`status.${status}`);
    return badge;
}

/**
 * Makes a number input behave as a price in euro: while typing, no more
 * than two decimals get in; on leaving the field the value is rewritten with
 * exactly two decimals ("160" → "160.00"). Empty stays empty.
 * @param {HTMLInputElement} input
 * @returns {void}
 */
export function bindPriceInput(input) {
    input.step = '0.01';
    input.inputMode = 'decimal';
    input.addEventListener('input', () => {
        const limited = limitToCents(input.value);
        if (limited !== input.value) input.value = limited;
    });
    input.addEventListener('change', () => {
        if (input.value === '') return;
        input.value = priceInputValue(Number(input.value));
    });
}

/**
 * Hands a text file to the browser as a download, through a temporary
 * object URL released right after the click.
 * @param {string} fileName
 * @param {string} content
 * @param {string} mimeType - e.g. 'text/csv'
 * @returns {void}
 */
export function downloadTextFile(fileName, content, mimeType) {
    const url = URL.createObjectURL(new Blob([content], { type: `${mimeType};charset=utf-8` }));
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

/**
 * Creates a button.
 * @param {string} label - already translated text
 * @param {string} className - CSS classes
 * @param {() => void} onClick
 * @returns {HTMLButtonElement}
 */
export function button(label, className, onClick) {
    const element = document.createElement('button');
    element.type = 'button';
    element.className = className;
    element.textContent = label;
    element.addEventListener('click', onClick);
    return element;
}

/**
 * Shows the matching section and marks its nav button as current.
 * @param {string} sectionId
 * @returns {void}
 */
export function showSection(sectionId) {
    for (const section of document.querySelectorAll('[data-section]')) section.hidden = section.id !== sectionId;
    for (const navButton of document.querySelectorAll('.nav-item')) {
        const active = navButton.dataset.target === sectionId;
        navButton.classList.toggle('is-active', active);
        if (active) navButton.setAttribute('aria-current', 'true');
        else navButton.removeAttribute('aria-current');
    }
}
