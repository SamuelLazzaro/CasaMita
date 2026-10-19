/*
 * calendar-render.js — draws the calendar items of an interval in the views
 * made of whole-day cells. The same entry renderer serves every booking
 * type; what changes is the text of an entry (a stay, a seating, a time
 * range) and, for hotels, the fact that one stay spans several day cells.
 *
 *   week  → seven columns (one per day) with the day's entries (hotel only:
 *           restaurant and facility draw their week on the time grid of
 *           slot-calendar.js)
 *   month → grid of whole weeks, every cell lists its entries compactly
 *
 * Every entry is a button: the page decides what a click opens (onSelect).
 * A cell of a day that is not over can carry the "+" shortcut of
 * add-shortcut.js, which opens the booking dialog on that date.
 */
import { addButton } from './add-shortcut.js';
import { currentLanguage, translate } from './i18n.js';
import { addDays, displayStatus, formatDayHeader, formatShortDate, monthGridDays, mondayOf, todayInRome, weekDays } from './utils.js';

/**
 * @typedef {object} CalendarItem - a request as GET /api/admin/calendar returns it
 * @property {number} id
 * @property {string} type
 * @property {string} status
 * @property {string} [payment_status] - hotel: 'none' | 'deposit' | 'paid'
 * @property {string|null} first_name
 * @property {string|null} last_name
 * @property {string|null} requester_name
 * @property {string|null} requester_color
 * @property {string|null} check_in
 * @property {string|null} check_out
 * @property {string|null} room_type
 * @property {string|null} date
 * @property {string|null} start_time
 * @property {string|null} end_time
 * @property {number|null} party_size
 */

/**
 * @typedef {object} RenderOptions
 * @property {(item: CalendarItem) => void} onSelect - what a click on an entry does
 * @property {(item: CalendarItem) => boolean} [canSelect] - which entries are clickable (all by default)
 * @property {(date: string) => void} [onOpenDay] - drill-down from a month cell day number
 * @property {boolean} [withAddShortcut] - true to put the "+" shortcut on the cells of the days not yet over
 */

/**
 * @param {CalendarItem} item
 * @returns {string} who booked: the guest or the organisation
 */
export function itemName(item) {
    if (item.requester_name) return item.requester_name;
    return `${item.first_name ?? ''} ${item.last_name ?? ''}`.trim();
}

/**
 * Text of an entry inside the cell of `day`.
 * @param {CalendarItem} item
 * @param {string} day - 'YYYY-MM-DD' of the cell
 * @returns {{time: string, label: string}}
 */
function entryText(item, day) {
    if (item.type === 'hotel') {
        const marker = item.check_in === day ? translate('calendar.arrival') : translate('calendar.inHouse');
        return { time: marker, label: `${itemName(item)} · ${item.room_type}` };
    }
    if (item.type === 'restaurant') return { time: item.start_time ?? '', label: `${itemName(item)} · ${item.party_size}` };
    return { time: `${item.start_time}–${item.end_time}`, label: itemName(item) };
}

/**
 * @param {CalendarItem} item
 * @param {string} day
 * @param {RenderOptions} options
 * @returns {HTMLElement} a button, or a plain div when the entry is not selectable
 */
export function entryElement(item, day, options) {
    const { time, label } = entryText(item, day);
    const selectable = options.canSelect === undefined || options.canSelect(item);
    const entry = document.createElement(selectable ? 'button' : 'div');
    if (selectable) entry.type = 'button';
    const shownStatus = displayStatus(item);
    entry.className = `cal-entry is-${shownStatus}`;
    if (!selectable) entry.classList.add('is-readonly');
    if (item.requester_color) entry.style.setProperty('--entry-color', item.requester_color);
    const timeElement = document.createElement('span');
    timeElement.className = 'cal-entry-time';
    timeElement.textContent = time;
    const labelElement = document.createElement('span');
    labelElement.className = 'cal-entry-label';
    labelElement.textContent = label;
    entry.append(timeElement, labelElement);
    entry.title = `${time} ${label} · ${translate(`status.${shownStatus}`)}`;
    if (selectable) entry.addEventListener('click', () => options.onSelect(item));
    return entry;
}

/**
 * @param {CalendarItem} item
 * @param {string} day
 * @returns {boolean} true when the item touches that day (a stay covers its nights, check-out day excluded)
 */
function touches(item, day) {
    if (item.type === 'hotel') return (item.check_in ?? '') <= day && day < (item.check_out ?? '');
    return item.date === day;
}

/**
 * Items of one day, arrivals first for hotels, by time otherwise.
 * @param {CalendarItem[]} items
 * @param {string} day
 * @returns {CalendarItem[]}
 */
function itemsOf(items, day) {
    const ofDay = items.filter((item) => touches(item, day));
    if (ofDay.length > 0 && ofDay[0].type === 'hotel') return ofDay.sort((a, b) => Number(b.check_in === day) - Number(a.check_in === day) || itemName(a).localeCompare(itemName(b)));
    return ofDay.sort((a, b) => (a.start_time ?? '').localeCompare(b.start_time ?? ''));
}

/**
 * @param {string} day
 * @param {CalendarItem[]} items
 * @param {RenderOptions} options
 * @param {boolean} compact - month cells show the day number instead of the weekday header
 * @returns {HTMLElement}
 */
function dayCell(day, items, options, compact) {
    const today = todayInRome();
    const cell = document.createElement('div');
    cell.className = 'cal-cell';
    if (day === today) cell.classList.add('is-today');
    if (day < today) cell.classList.add('is-past');
    const header = document.createElement(compact && options.onOpenDay ? 'button' : 'div');
    header.className = 'cal-cell-header';
    header.textContent = compact ? String(Number(day.slice(8, 10))) : formatDayHeader(day, currentLanguage());
    if (header instanceof HTMLButtonElement) {
        header.type = 'button';
        header.addEventListener('click', () => options.onOpenDay(day));
    }
    const entries = document.createElement('div');
    entries.className = 'cal-cell-entries';
    for (const item of itemsOf(items, day)) entries.append(entryElement(item, day, options));
    cell.append(header, entries);
    // Only a day that is not over can host a new booking: elsewhere the dialog would be born rejected.
    if (options.withAddShortcut === true && day >= today) cell.append(addButton(day, null, translate('calendar.addOn', { date: formatShortDate(day, currentLanguage()) })));
    return cell;
}

/**
 * @param {HTMLElement} container
 * @param {string} date - any day of the week
 * @param {CalendarItem[]} items
 * @param {RenderOptions} options
 * @returns {void}
 */
export function renderWeek(container, date, items, options) {
    container.className = 'calendar calendar-week';
    container.replaceChildren(...weekDays(mondayOf(date)).map((day) => dayCell(day, items, options, false)));
}

/**
 * @param {HTMLElement} container
 * @param {string} date - any day of the month
 * @param {CalendarItem[]} items
 * @param {RenderOptions} options
 * @returns {void}
 */
export function renderMonth(container, date, items, options) {
    container.className = 'calendar calendar-month';
    const month = date.slice(0, 7);
    const lang = currentLanguage();
    const headers = weekDays(mondayOf(addDays(`${month}-01`, 0))).map((day) => {
        const header = document.createElement('div');
        header.className = 'cal-weekday';
        header.textContent = formatDayHeader(day, lang).replace(/[\d\s]+$/, '');
        return header;
    });
    const cells = monthGridDays(date).map((day) => {
        const cell = dayCell(day, items, options, true);
        if (day.slice(0, 7) !== month) cell.classList.add('is-outside');
        return cell;
    });
    container.replaceChildren(...headers, ...cells);
}
