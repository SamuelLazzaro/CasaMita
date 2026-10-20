/*
 * slot-calendar.js — the time grid of the restaurant and facility calendars:
 * one column per day (seven in the week view, one in the day view), one row
 * per slot of the venue's service windows, a time label on the left. What a
 * cell holds depends on the booking type:
 *
 *   facility   → a booking occupies every slot from its start to its end:
 *                the cells are painted with the organisation's color and the
 *                first one carries the name. A slot is either free or taken.
 *   restaurant → a seating has a start time only, and several tables can be
 *                seated at the same time: the cell of that slot lists its
 *                seatings as compact entries, and never fills up.
 *
 * Clicking a booking opens its details (onSelect). A slot that can still be
 * booked carries the "+" shortcut of add-shortcut.js: every future slot for a
 * restaurant, only the free future ones for a facility.
 */
import { addButton } from './add-shortcut.js';
import { entryElement, itemName } from './calendar-render.js';
import { currentLanguage, translate } from './i18n.js';
import { formatDayHeader, formatShortDate, minutesFromTime, nowInRome, timeFromMinutes } from './utils.js';

/**
 * @typedef {object} ServiceWindow
 * @property {string} open - 'HH:MM'
 * @property {string} close - 'HH:MM', slots end strictly before it
 * @property {string} [labelKey] - translation key of a heading row above the window (restaurant: lunch / dinner)
 */

/**
 * @typedef {object} SlotGridSetup
 * @property {'restaurant'|'facility'} type
 * @property {ServiceWindow[]} windows - chronological, non-overlapping
 * @property {number} stepMinutes - length of a slot
 */

/**
 * @typedef {object} SlotGridOptions
 * @property {(item: object) => void} onSelect - what a click on a booking does
 * @property {(item: object) => boolean} [canSelect] - which bookings are clickable (all by default)
 * @property {boolean} [withAddShortcut] - true to put the "+" shortcut on the bookable slots
 */

/**
 * The grid setup of a venue, from GET /api/config.
 * @param {object} config
 * @returns {SlotGridSetup}
 */
export function slotGridSetup(config) {
    if (config.type === 'restaurant') return { type: 'restaurant', windows: [{ ...config.restaurant.lunch, labelKey: 'restaurant.lunch' }, { ...config.restaurant.dinner, labelKey: 'restaurant.dinner' }], stepMinutes: config.restaurant.stepMinutes };
    return { type: 'facility', windows: [{ open: config.facility.open, close: config.facility.close }], stepMinutes: config.facility.slotMinutes };
}

/**
 * @typedef {object} SlotRow
 * @property {number} minutes - slot start, minutes from midnight
 * @property {boolean} hourStart - true on a full hour (solid grid line)
 * @property {ServiceWindow|null} opensWindow - the window this row opens, for its heading
 */

/**
 * @param {ServiceWindow[]} windows
 * @param {number} stepMinutes
 * @returns {SlotRow[]} every slot of every window, in order
 */
function slotRows(windows, stepMinutes) {
    const rows = [];
    for (const window of windows) {
        const close = minutesFromTime(window.close);
        for (let minutes = minutesFromTime(window.open); minutes < close; minutes += stepMinutes) {
            rows.push({ minutes, hourStart: minutes % 60 === 0, opensWindow: minutes === minutesFromTime(window.open) ? window : null });
        }
    }
    return rows;
}

/**
 * The facility booking covering a slot, approved ones first when a pending
 * request overlaps one (the slot really is taken: the cell must say so).
 * @param {object[]} items
 * @param {string} day
 * @param {number} minutes
 * @returns {object|undefined}
 */
function facilityItemAt(items, day, minutes) {
    const covering = items.filter((item) => item.date === day && minutesFromTime(item.start_time) <= minutes && minutes < minutesFromTime(item.end_time));
    if (covering.length === 0) return undefined;
    return covering.find((item) => item.status === 'approved') ?? covering[0];
}

/**
 * Paints a facility slot with the booking that covers it. The first slot of
 * the booking carries the name label, sized to the whole block so overflowing
 * text is clipped at the block boundary, and is the keyboard handle of the
 * booking; the follow-up slots answer to the mouse only, so a two-hour
 * booking is one tab stop and not four.
 * @param {HTMLElement} cell
 * @param {object} item
 * @param {number} minutes - slot start
 * @param {number} stepMinutes
 * @param {SlotGridOptions} options
 * @returns {void}
 */
function paintFacilitySlot(cell, item, minutes, stepMinutes, options) {
    cell.classList.add('is-booked', `is-${item.status}`);
    if (item.requester_color) cell.style.setProperty('--entry-color', item.requester_color);
    const selectable = options.canSelect === undefined || options.canSelect(item);
    if (selectable) {
        cell.classList.add('is-selectable');
        cell.addEventListener('click', () => options.onSelect(item));
    }
    const isBlockStart = minutesFromTime(item.start_time) === minutes;
    if (!isBlockStart) return;
    const blockSlots = (minutesFromTime(item.end_time) - minutes) / stepMinutes;
    const label = document.createElement('span');
    label.className = 'cal-slot-label';
    label.style.setProperty('--block-slots', String(blockSlots));
    label.textContent = itemName(item);
    cell.append(label);
    if (!selectable) return;
    cell.setAttribute('role', 'button');
    cell.tabIndex = 0;
    cell.setAttribute('aria-label', `${itemName(item)} · ${item.start_time}–${item.end_time} · ${translate(`status.${item.status}`)}`);
    cell.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        options.onSelect(item);
    });
}

/**
 * @param {string} day - 'YYYY-MM-DD'
 * @param {number} minutes - slot start
 * @param {number} stepMinutes
 * @param {{date: string, minutes: number}} now
 * @returns {boolean} true when the slot started before the current one
 */
function isPastSlot(day, minutes, stepMinutes, now) {
    if (day !== now.date) return day < now.date;
    const currentSlotStart = Math.floor(now.minutes / stepMinutes) * stepMinutes;
    return minutes < currentSlotStart;
}

/**
 * Draws the time grid of `days` into `container` (emptied first).
 * @param {HTMLElement} container
 * @param {string[]} days - 'YYYY-MM-DD', one column each (a single day or a whole week)
 * @param {object[]} items - calendar items of those days
 * @param {SlotGridSetup} setup
 * @param {SlotGridOptions} options
 * @returns {void}
 */
export function renderSlotGrid(container, days, items, setup, options) {
    const lang = currentLanguage();
    const now = nowInRome();
    container.className = 'calendar slot-grid';
    container.classList.toggle('is-single-day', days.length === 1);
    container.style.setProperty('--day-columns', String(days.length));
    const fragment = document.createDocumentFragment();

    const corner = document.createElement('div');
    corner.className = 'cal-corner';
    fragment.append(corner);
    for (const day of days) {
        const header = document.createElement('div');
        header.className = 'cal-day-header';
        if (day === now.date) header.classList.add('is-today');
        header.textContent = formatDayHeader(day, lang);
        fragment.append(header);
    }

    for (const row of slotRows(setup.windows, setup.stepMinutes)) {
        // Restaurant: a heading row (Lunch / Dinner) opens every service window.
        if (row.opensWindow !== null && row.opensWindow.labelKey !== undefined) {
            const heading = document.createElement('div');
            heading.className = 'cal-service';
            heading.textContent = translate(row.opensWindow.labelKey);
            fragment.append(heading);
        }
        const time = timeFromMinutes(row.minutes);
        const timeLabel = document.createElement('div');
        timeLabel.className = row.hourStart ? 'cal-time is-hour' : 'cal-time';
        timeLabel.textContent = time;
        fragment.append(timeLabel);

        for (const day of days) {
            const cell = document.createElement('div');
            cell.className = row.hourStart ? 'cal-slot is-hour' : 'cal-slot';
            if (day === now.date) cell.classList.add('is-today');
            const past = isPastSlot(day, row.minutes, setup.stepMinutes, now);
            if (past) cell.classList.add('is-past');

            let bookable = !past;
            let description = '';
            if (setup.type === 'facility') {
                const item = facilityItemAt(items, day, row.minutes);
                if (item !== undefined) {
                    paintFacilitySlot(cell, item, row.minutes, setup.stepMinutes, options);
                    bookable = false;
                    description = ` · ${itemName(item)} · ${translate(`status.${item.status}`)}`;
                }
            } else {
                for (const item of items) {
                    if (item.date === day && item.start_time === time) cell.append(entryElement(item, options));
                }
            }
            cell.title = `${formatDayHeader(day, lang)} · ${time}–${timeFromMinutes(row.minutes + setup.stepMinutes)}${description}`;
            if (options.withAddShortcut === true && bookable) cell.append(addButton(day, time, translate('calendar.addAt', { date: formatShortDate(day, lang), time })));
            fragment.append(cell);
        }
    }

    container.replaceChildren(fragment);
}
