/*
 * calendar-render.js — draws the calendar items of an interval in the views
 * made of whole-day cells. The same entry renderer serves the venues that
 * book by time; a hotel stay is drawn differently, as one continuous bar
 * that runs from the middle of the check-in cell to the middle of the
 * check-out cell, so the nights it covers are read at a glance.
 *
 *   week  → seven columns (one per day) with the day's entries (hotel only:
 *           restaurant and facility draw their week on the time grid of
 *           slot-calendar.js)
 *   month → grid of whole weeks, every cell lists its entries compactly
 *
 * Both views are built of week rows. A row is a grid of 14 half-day
 * columns: every day cell spans two of them, and a layer of stay bars sits
 * over the cells in the same grid, so a bar can start or end halfway through
 * a day. The layer and the cells share the grid area, so a row grows with
 * the number of lanes its stays need. The stay bars are kept off the cells
 * (and off their entry lists) on purpose: a cell must not know what the
 * stays around it do.
 *
 * Every entry and every bar is a button: the page decides what a click opens
 * (onSelect). A cell of a day that is not over can carry the "+" shortcut of
 * add-shortcut.js, which opens the booking dialog on that date.
 */
import { addButton } from './add-shortcut.js';
import { currentLanguage, translate } from './i18n.js';
import { addDays, displayStatus, formatDayHeader, formatShortDate, monthGridDays, mondayOf, todayInRome, weekDays } from './utils.js';

/** @type {number} grid lines of a week row: 7 days × 2 half-day columns, lines numbered from 1 */
const HALF_COLUMNS = 14;

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
 * @typedef {object} StayBar - where a stay sits inside one week row
 * @property {CalendarItem} item
 * @property {number} startLine - grid line the bar starts at (1 = left edge of the row)
 * @property {number} endLine - grid line the bar ends at (15 = right edge of the row)
 * @property {boolean} continuesLeft - the stay began before this row
 * @property {boolean} continuesRight - the stay goes on after this row
 * @property {number} lane - 1-based row of the bar in the layer
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
 * Shared look of an entry and of a stay bar: clickable or not, status color
 * and the color of the organisation that booked.
 * @param {CalendarItem} item
 * @param {RenderOptions} options
 * @param {string} className
 * @returns {{element: HTMLElement, selectable: boolean, shownStatus: string}}
 */
function bookingElement(item, options, className) {
    const selectable = options.canSelect === undefined || options.canSelect(item);
    const element = document.createElement(selectable ? 'button' : 'div');
    if (selectable) element.type = 'button';
    const shownStatus = displayStatus(item);
    element.className = `${className} is-${shownStatus}`;
    if (!selectable) element.classList.add('is-readonly');
    if (item.requester_color) element.style.setProperty('--entry-color', item.requester_color);
    if (selectable) element.addEventListener('click', () => options.onSelect(item));
    return { element, selectable, shownStatus };
}

/**
 * Text of an entry of a venue that books by time.
 * @param {CalendarItem} item
 * @returns {{time: string, label: string}}
 */
function entryText(item) {
    if (item.type === 'restaurant') return { time: item.start_time ?? '', label: `${itemName(item)} · ${item.party_size}` };
    return { time: `${item.start_time}–${item.end_time}`, label: itemName(item) };
}

/**
 * @param {CalendarItem} item
 * @param {RenderOptions} options
 * @returns {HTMLElement} a button, or a plain div when the entry is not selectable
 */
export function entryElement(item, options) {
    const { time, label } = entryText(item);
    const { element: entry, shownStatus } = bookingElement(item, options, 'cal-entry');
    const timeElement = document.createElement('span');
    timeElement.className = 'cal-entry-time';
    timeElement.textContent = time;
    const labelElement = document.createElement('span');
    labelElement.className = 'cal-entry-label';
    labelElement.textContent = label;
    entry.append(timeElement, labelElement);
    entry.title = `${time} ${label} · ${translate(`status.${shownStatus}`)}`;
    return entry;
}

/**
 * Items of one day, by time. Stays are not among them: they are drawn as bars.
 * @param {CalendarItem[]} items
 * @param {string} day
 * @returns {CalendarItem[]}
 */
function itemsOf(items, day) {
    const ofDay = items.filter((item) => item.type !== 'hotel' && item.date === day);
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
    for (const item of itemsOf(items, day)) entries.append(entryElement(item, options));
    cell.append(header, entries);
    // Only a day that is not over can host a new booking: elsewhere the dialog would be born rejected.
    if (options.withAddShortcut === true && day >= today) cell.append(addButton(day, null, translate('calendar.addOn', { date: formatShortDate(day, currentLanguage()) })));
    return cell;
}

/*
 * Where the stays of one week row go.
 *
 * Grid lines of a row are numbered 1..15 over 14 half-day columns: day k
 * (0-based) covers lines 2k+1 .. 2k+3, so its middle is line 2k+2. A bar
 * starts at the middle of its check-in day and ends at the middle of its
 * check-out day; a stay that began before the row starts at line 1, one that
 * goes on after it ends at line 15, and the CSS squares off those ends.
 *
 * Lanes are assigned greedily, stays sorted by check-in: a stay takes the
 * first lane whose last stay has already checked out (a check-out on the
 * same day as the next check-in fits: the two bars meet at the middle of
 * that cell). Lanes are per row, so a stay that spans two rows of the month
 * may change lane from one row to the next.
 */
/**
 * @param {CalendarItem[]} items
 * @param {string[]} rowDays - the seven days of the row
 * @returns {StayBar[]}
 */
function stayBarsOf(items, rowDays) {
    const firstDay = rowDays[0];
    const lastDay = rowDays[rowDays.length - 1];
    const inRow = items.filter((item) => item.type === 'hotel' && item.check_in !== null && item.check_out !== null && item.check_in < item.check_out && item.check_in <= lastDay && item.check_out >= firstDay);
    inRow.sort((a, b) => a.check_in.localeCompare(b.check_in) || itemName(a).localeCompare(itemName(b)));
    /** @type {string[]} check-out date of the last stay of every lane */
    const laneEnds = [];
    return inRow.map((item) => {
        const continuesLeft = item.check_in < firstDay;
        const continuesRight = item.check_out > lastDay;
        const startLine = continuesLeft ? 1 : 2 * rowDays.indexOf(item.check_in) + 2;
        const endLine = continuesRight ? HALF_COLUMNS + 1 : 2 * rowDays.indexOf(item.check_out) + 2;
        let lane = laneEnds.findIndex((laneEnd) => laneEnd <= item.check_in);
        if (lane === -1) lane = laneEnds.length;
        laneEnds[lane] = item.check_out;
        return { item, startLine, endLine, continuesLeft, continuesRight, lane: lane + 1 };
    });
}

/**
 * @param {StayBar} bar
 * @param {RenderOptions} options
 * @returns {HTMLElement}
 */
function stayBarElement(bar, options) {
    const { item } = bar;
    const { element, shownStatus } = bookingElement(item, options, 'cal-stay');
    if (bar.continuesLeft) element.classList.add('is-continued-left');
    if (bar.continuesRight) element.classList.add('is-continued-right');
    element.style.gridColumn = `${bar.startLine} / ${bar.endLine}`;
    element.style.gridRow = String(bar.lane);
    const label = `${itemName(item)} · ${item.room_type}`;
    element.textContent = label;
    const lang = currentLanguage();
    element.title = `${label} · ${formatShortDate(item.check_in, lang)} – ${formatShortDate(item.check_out, lang)} · ${translate(`status.${shownStatus}`)}`;
    return element;
}

/**
 * One week of cells, with the layer of stay bars over them when there are any.
 * @param {string[]} rowDays
 * @param {CalendarItem[]} items
 * @param {RenderOptions} options
 * @param {boolean} compact
 * @param {string|null} month - 'YYYY-MM' of the month on screen, null in the week view
 * @returns {HTMLElement}
 */
function weekRow(rowDays, items, options, compact, month) {
    const row = document.createElement('div');
    row.className = 'cal-row';
    rowDays.forEach((day, index) => {
        const cell = dayCell(day, items, options, compact);
        if (month !== null && day.slice(0, 7) !== month) cell.classList.add('is-outside');
        // Explicit placement: the stay layer is placed first and covers the whole row, auto-placed cells would end up beside it.
        cell.style.gridColumn = `${2 * index + 1} / span 2`;
        row.append(cell);
    });
    const bars = stayBarsOf(items, rowDays);
    if (bars.length > 0) {
        const layer = document.createElement('div');
        layer.className = 'cal-stays';
        layer.append(...bars.map((bar) => stayBarElement(bar, options)));
        row.append(layer);
    }
    return row;
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
    container.replaceChildren(weekRow(weekDays(mondayOf(date)), items, options, false, null));
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
    const weekdays = document.createElement('div');
    weekdays.className = 'cal-weekdays';
    for (const day of weekDays(mondayOf(addDays(`${month}-01`, 0)))) {
        const header = document.createElement('div');
        header.className = 'cal-weekday';
        header.textContent = formatDayHeader(day, lang).replace(/[\d\s]+$/, '');
        weekdays.append(header);
    }
    const days = monthGridDays(date);
    const rows = [];
    for (let first = 0; first < days.length; first += 7) rows.push(weekRow(days.slice(first, first + 7), items, options, true, month));
    container.replaceChildren(weekdays, ...rows);
}
