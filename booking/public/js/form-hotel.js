/*
 * form-hotel.js — the hotel request form: date constraints, live room
 * availability and payload construction. Used twice with different id
 * prefixes: "hotel" on the public page and "direct-hotel" in the admin
 * dialog (same fields, same rules; the admin form adds a language select and
 * has no privacy checkbox nor honeypot). The caller hands over the submit
 * handler, so this module never talks to the submit endpoints itself.
 */
import { MAX_DAYS_AHEAD, MAX_NIGHTS } from './constants.js';
import { fetchAvailability, fetchQuote } from './api.js';
import { currentLanguage, onLanguageChange, translate } from './i18n.js';
import { errorMessage, fillSelect, showStatus, hideStatus } from './ui.js';
import { addDays, formatEuro, formatShortDate, nightsBetween, todayInRome } from './utils.js';

/**
 * @typedef {object} RoomOption
 * @property {string} name
 * @property {number} max_guests
 * @property {number} available
 */

/**
 * @param {RoomOption} room
 * @returns {string} option label: name, capacity and how many are left
 */
function roomLabel(room) {
    const availability = room.available === 0 ? translate('hotel.soldOut') : room.available === 1 ? translate('hotel.availableOne') : translate('hotel.available', { count: room.available });
    return `${room.name} (${translate('hotel.maxGuests', { count: room.max_guests })}, ${availability})`;
}

/**
 * Wires a hotel form.
 * @param {(payload: Record<string, unknown>) => Promise<void>} onSubmit - sends the payload; throws on failure
 * @param {string} [prefix] - id prefix of the form and its fields
 * @returns {{reset: () => Promise<void>}} resets the fields and the availability list
 */
export function initHotelForm(onSubmit, prefix = 'hotel') {
    const byId = (suffix) => document.getElementById(`${prefix}-${suffix}`);
    const form = byId('form');
    const checkIn = byId('check-in');
    const checkOut = byId('check-out');
    const roomSelect = byId('room-type');
    const hint = byId('availability-hint');
    const status = byId('status');
    const submitButton = byId('submit');
    const privacy = byId('privacy');
    const langSelect = byId('lang');
    const priceBox = byId('price');
    const totalInput = byId('total');

    /** @type {RoomOption[]} last availability answer, re-labelled on language change */
    let rooms = [];

    const today = todayInRome();
    checkIn.min = today;
    checkIn.max = addDays(today, MAX_DAYS_AHEAD);
    checkOut.min = addDays(today, 1);

    /**
     * Keeps check-out inside [check-in + 1, check-in + MAX_NIGHTS].
     * @returns {boolean} true when both dates form a valid stay
     */
    function normaliseDates() {
        if (checkIn.value === '') return false;
        checkOut.min = addDays(checkIn.value, 1);
        checkOut.max = addDays(checkIn.value, MAX_NIGHTS);
        if (checkOut.value === '' || nightsBetween(checkIn.value, checkOut.value) < 1) checkOut.value = checkOut.min;
        return nightsBetween(checkIn.value, checkOut.value) <= MAX_NIGHTS;
    }

    function renderRooms() {
        const options = rooms.map((room) => ({ value: room.name, label: roomLabel(room), disabled: room.available === 0 }));
        fillSelect(roomSelect, options, roomSelect.value);
        const anyAvailable = rooms.some((room) => room.available > 0);
        roomSelect.disabled = !anyAvailable;
        const nights = nightsBetween(checkIn.value, checkOut.value);
        const nightsText = nights === 1 ? translate('hotel.nightsOne') : translate('hotel.nights', { count: nights });
        hint.textContent = anyAvailable ? nightsText : translate('hotel.noneAvailable');
    }

    /* ------------------------------------------------------------ price */

    /** @type {object|null} last quote answer, re-rendered on language change */
    let quote = null;

    /** @type {HTMLElement|null} the "total" line of the price box, redrawn when the agreed total changes */
    let totalLine = null;

    /**
     * Agreed total typed in the admin dialog when it differs from the
     * computed one; null otherwise (empty, invalid or equal).
     * @returns {number|null}
     */
    function agreedTotalOverride() {
        if (totalInput === null || totalInput.value === '' || quote === null) return null;
        const agreed = Number(totalInput.value);
        if (!Number.isFinite(agreed) || agreed < 0 || agreed === quote.total) return null;
        return agreed;
    }

    /**
     * Fills the "total" line: the computed total, or, when the venue agreed a
     * different amount, the computed one struck through and the agreed one
     * beside it, so the dialog shows at a glance what the guest will pay.
     * @returns {void}
     */
    function renderTotalLine() {
        if (totalLine === null || quote === null) return;
        const lang = currentLanguage();
        const label = document.createElement('span');
        label.textContent = `${translate('price.total')}: `;
        const computed = document.createElement('span');
        computed.textContent = formatEuro(quote.total, lang);
        totalLine.replaceChildren(label, computed);
        const agreed = agreedTotalOverride();
        if (agreed === null) return;
        computed.className = 'price-total-struck';
        const agreedElement = document.createElement('span');
        agreedElement.className = 'price-total-agreed';
        agreedElement.textContent = formatEuro(agreed, lang);
        totalLine.append(' ', agreedElement);
    }

    /**
     * Draws the quote: total, discount line when one applies, the tax wording
     * and the nightly prices.
     * @returns {void}
     */
    function renderQuote() {
        if (priceBox === null) return;
        const lang = currentLanguage();
        priceBox.replaceChildren();
        totalLine = null;
        if (quote === null || quote.priced === false) {
            priceBox.hidden = true;
            return;
        }
        totalLine = document.createElement('div');
        totalLine.className = 'price-total';
        renderTotalLine();
        priceBox.append(totalLine);
        if (quote.discount_percent > 0) {
            const subtotal = document.createElement('div');
            subtotal.className = 'price-line';
            subtotal.append(Object.assign(document.createElement('span'), { textContent: translate('price.subtotal') }), Object.assign(document.createElement('span'), { textContent: formatEuro(quote.subtotal, lang) }));
            const discount = document.createElement('div');
            discount.className = 'price-line';
            discount.append(Object.assign(document.createElement('span'), { textContent: translate('price.discount', { percent: quote.discount_percent }) }), Object.assign(document.createElement('span'), { textContent: `-${formatEuro(quote.discount_amount, lang)}` }));
            priceBox.append(subtotal, discount);
        }
        const taxes = document.createElement('div');
        taxes.className = 'hint';
        taxes.textContent = translate('price.taxes');
        priceBox.append(taxes);
        const nightsList = document.createElement('ul');
        nightsList.className = 'price-nights';
        for (const night of quote.nights) {
            const item = document.createElement('li');
            item.textContent = `${formatShortDate(night.date, lang)}: ${formatEuro(night.price, lang)}`;
            nightsList.append(item);
        }
        priceBox.append(nightsList);
        priceBox.hidden = false;
    }

    /**
     * Loads the quote of the selected room and dates. In the admin dialog the
     * editable "total" field is prefilled with the computed total here, and
     * only here: a language change redraws the box without touching what the
     * venue typed.
     * @returns {Promise<void>}
     */
    async function refreshQuote() {
        if (priceBox === null) return;
        if (roomSelect.disabled || roomSelect.value === '' || rooms.length === 0) {
            quote = null;
        } else {
            try {
                quote = await fetchQuote(roomSelect.value, checkIn.value, checkOut.value);
            } catch {
                quote = null;
            }
        }
        if (totalInput !== null) totalInput.value = quote === null || quote.priced === false ? '' : String(quote.total);
        renderQuote();
    }

    async function refreshAvailability() {
        hideStatus(status);
        if (!normaliseDates()) {
            rooms = [];
            roomSelect.disabled = true;
            fillSelect(roomSelect, []);
            hint.textContent = translate('hotel.pickDates');
            await refreshQuote();
            return;
        }
        hint.textContent = translate('hotel.checking');
        try {
            const answer = await fetchAvailability(checkIn.value, checkOut.value);
            rooms = answer.rooms;
            renderRooms();
        } catch (error) {
            rooms = [];
            roomSelect.disabled = true;
            showStatus(status, errorMessage(error), 'error');
        }
        await refreshQuote();
    }

    async function reset() {
        form.reset();
        await refreshAvailability();
    }

    checkIn.addEventListener('change', refreshAvailability);
    checkOut.addEventListener('change', refreshAvailability);
    roomSelect.addEventListener('change', refreshQuote);
    if (totalInput !== null) totalInput.addEventListener('input', renderTotalLine);
    onLanguageChange(() => {
        if (rooms.length > 0) renderRooms();
        renderQuote();
    });

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
            check_in: fields.get('check_in'),
            check_out: fields.get('check_out'),
            adults: Number(fields.get('adults')),
            children: Number(fields.get('children')),
            room_type: fields.get('room_type'),
            notes: fields.get('notes'),
            website: fields.get('website') ?? '',
            privacy_accepted: fields.get('privacy_accepted') === 'on',
            lang: langSelect !== null ? langSelect.value : currentLanguage(),
        };
        // Admin dialog only: the agreed total, when the venue changed the computed one.
        if (totalInput !== null && totalInput.value !== '') payload.total = Number(totalInput.value);
        submitButton.disabled = true;
        submitButton.textContent = translate('common.sending');
        try {
            await onSubmit(payload);
            await reset();
        } catch (error) {
            showStatus(status, errorMessage(error), 'error');
            // A sold-out answer means somebody else got the room meanwhile: refresh the list.
            if (error.message === 'room_unavailable') await refreshAvailability();
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = translate('common.submit');
        }
    });

    return { reset };
}
