/*
 * price-calendar.js — the hotel price calendar of the dashboard: for every
 * day of a week or a month, the nightly price of every room type, computed
 * in the browser from the pricing data the admin API already provides (base
 * prices and rate periods, GET /api/admin/pricing). Same rule as the server
 * quote (src/pricing.ts): a night costs the price of the period covering it,
 * otherwise the base price of the room type; without either it has no price.
 *
 *   week  → table: one row per room type, one column per day
 *   month → grid of whole weeks, every cell lists the room types with price
 *
 * The figure of a day not yet passed is a button (class PRICE_EDIT_CLASS,
 * data-day and data-room attributes) opening the day-price dialog of the
 * dashboard; one delegated listener per calendar (attachPriceEdit) handles
 * every figure, whatever view is drawn. Past days keep a plain figure.
 */
import { currentLanguage, translate } from './i18n.js';
import { addDays, formatDayHeader, formatEuro, monthGridDays, mondayOf, todayInRome, weekDays } from './utils.js';

/**
 * @typedef {object} Pricing - GET /api/admin/pricing
 * @property {{room_type: string, price_per_night: number|null}[]} base
 * @property {{room_type: string, date_from: string, date_to: string, price_per_night: number, label: string|null}[]} periods
 */

/**
 * @typedef {object} DayPrice
 * @property {string} roomType
 * @property {number|null} price - euro per night, null when the day has no price
 * @property {'base'|'period'|null} source - where the price comes from
 * @property {string|null} label - label of the period, when one applies
 */

/**
 * Nightly price of every room type on one day.
 * @param {Pricing} pricing
 * @param {string} day - 'YYYY-MM-DD'
 * @returns {DayPrice[]} in the order of the room types
 */
export function pricesOfDay(pricing, day) {
    return pricing.base.map((room) => {
        const period = pricing.periods.find((candidate) => candidate.room_type === room.room_type && candidate.date_from <= day && day <= candidate.date_to);
        if (period !== undefined) return { roomType: room.room_type, price: period.price_per_night, source: 'period', label: period.label };
        if (room.price_per_night !== null) return { roomType: room.room_type, price: room.price_per_night, source: 'base', label: null };
        return { roomType: room.room_type, price: null, source: null, label: null };
    });
}

/** Class of the figures that open the day-price dialog. */
const PRICE_EDIT_CLASS = 'price-edit';

/**
 * Runs `onEdit` when a figure of a future day is clicked, with one listener
 * for the whole calendar (the figures are redrawn at every navigation).
 * @param {HTMLElement} container - the calendar element renderPriceWeek / renderPriceMonth draw into
 * @param {(day: string, roomType: string) => void} onEdit
 * @returns {void}
 */
export function attachPriceEdit(container, onEdit) {
    container.addEventListener('click', (event) => {
        const target = event.target instanceof Element ? event.target.closest(`.${PRICE_EDIT_CLASS}`) : null;
        if (target === null || !container.contains(target)) return;
        onEdit(target.dataset.day, target.dataset.room);
    });
}

/**
 * The price figure of one room on one day, styled by its source: a button
 * when the day can still be priced, a plain span for a past day.
 * @param {DayPrice} dayPrice
 * @param {string} lang
 * @param {string} day - 'YYYY-MM-DD'
 * @param {boolean} editable
 * @returns {HTMLElement}
 */
function priceElement(dayPrice, lang, day, editable) {
    const element = document.createElement(editable ? 'button' : 'span');
    element.className = 'price-value';
    if (editable) {
        element.type = 'button';
        element.classList.add(PRICE_EDIT_CLASS);
        element.dataset.day = day;
        element.dataset.room = dayPrice.roomType;
    }
    if (dayPrice.price === null) {
        element.classList.add('is-unpriced');
        element.textContent = '—';
        element.title = translate('calendar.priceNone');
        return element;
    }
    element.classList.add(dayPrice.source === 'period' ? 'is-period' : 'is-base');
    element.textContent = formatEuro(dayPrice.price, lang);
    element.title = dayPrice.source === 'period' ? (dayPrice.label ?? translate('calendar.priceLegendPeriod')) : translate('calendar.priceLegendBase');
    return element;
}

/**
 * Week view: a table with the room types as rows and the days as columns.
 * @param {HTMLElement} container
 * @param {string} date - any day of the week
 * @param {Pricing} pricing
 * @returns {void}
 */
export function renderPriceWeek(container, date, pricing) {
    container.className = 'calendar price-calendar price-week';
    const lang = currentLanguage();
    const today = todayInRome();
    const days = weekDays(mondayOf(date));
    const table = document.createElement('table');
    table.className = 'price-table';

    const headRow = document.createElement('tr');
    const corner = document.createElement('th');
    corner.scope = 'col';
    corner.textContent = translate('field.roomType');
    headRow.append(corner);
    for (const day of days) {
        const header = document.createElement('th');
        header.scope = 'col';
        header.textContent = formatDayHeader(day, lang);
        if (day === today) header.classList.add('is-today');
        if (day < today) header.classList.add('is-past');
        headRow.append(header);
    }
    const head = document.createElement('thead');
    head.append(headRow);

    // One row per room type; the day prices are computed column by column.
    const pricesByDay = days.map((day) => pricesOfDay(pricing, day));
    const body = document.createElement('tbody');
    pricing.base.forEach((room, roomIndex) => {
        const row = document.createElement('tr');
        const name = document.createElement('th');
        name.scope = 'row';
        name.textContent = room.room_type;
        row.append(name);
        days.forEach((day, dayIndex) => {
            const cell = document.createElement('td');
            if (day === today) cell.classList.add('is-today');
            if (day < today) cell.classList.add('is-past');
            cell.append(priceElement(pricesByDay[dayIndex][roomIndex], lang, day, day >= today));
            row.append(cell);
        });
        body.append(row);
    });

    table.append(head, body);
    container.replaceChildren(table);
}

/**
 * Month view: the same grid as the bookings calendar, every cell listing the
 * room types with their price for that day.
 * @param {HTMLElement} container
 * @param {string} date - any day of the month
 * @param {Pricing} pricing
 * @returns {void}
 */
export function renderPriceMonth(container, date, pricing) {
    container.className = 'calendar calendar-month price-calendar price-month';
    const lang = currentLanguage();
    const today = todayInRome();
    const month = date.slice(0, 7);

    const headers = weekDays(mondayOf(addDays(`${month}-01`, 0))).map((day) => {
        const header = document.createElement('div');
        header.className = 'cal-weekday';
        header.textContent = formatDayHeader(day, lang).replace(/[\d\s]+$/, '');
        return header;
    });

    const cells = monthGridDays(date).map((day) => {
        const cell = document.createElement('div');
        cell.className = 'cal-cell';
        if (day === today) cell.classList.add('is-today');
        if (day < today) cell.classList.add('is-past');
        if (day.slice(0, 7) !== month) cell.classList.add('is-outside');
        const header = document.createElement('div');
        header.className = 'cal-cell-header';
        header.textContent = String(Number(day.slice(8, 10)));
        const lines = document.createElement('div');
        lines.className = 'cal-cell-entries price-lines';
        for (const dayPrice of pricesOfDay(pricing, day)) {
            const line = document.createElement('div');
            line.className = 'price-line';
            const name = document.createElement('span');
            name.className = 'price-line-room';
            name.textContent = dayPrice.roomType;
            name.title = dayPrice.roomType;
            line.append(name, priceElement(dayPrice, lang, day, day >= today));
            lines.append(line);
        }
        cell.append(header, lines);
        return cell;
    });

    container.replaceChildren(...headers, ...cells);
}
