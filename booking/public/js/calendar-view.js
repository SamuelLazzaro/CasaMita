/*
 * calendar-view.js — which interval the calendar shows (a day, a week or a
 * month, anchored on one date) and the toolbar that moves it: the two
 * arrows, "today" and the Day / Week / Month switch. The page only provides
 * `show`, which loads and draws the interval it is handed; title, disabled
 * state of "today" and pressed state of the switch are kept consistent here.
 */
import { currentLanguage, onLanguageChange, translate } from './i18n.js';
import { addDays, addMonths, formatLongDate, formatMonthTitle, formatWeekTitle, mondayOf, todayInRome } from './utils.js';

/**
 * @typedef {object} ViewElements
 * @property {HTMLElement} title
 * @property {HTMLButtonElement} previous
 * @property {HTMLButtonElement} next
 * @property {HTMLButtonElement} today
 * @property {Record<'day'|'week'|'month', HTMLButtonElement>} switches
 */

/**
 * @typedef {object} Interval
 * @property {'day'|'week'|'month'} view
 * @property {string} date - anchor date, 'YYYY-MM-DD'
 */

/**
 * @param {ViewElements} elements
 * @param {(interval: Interval) => Promise<void>} show - loads and renders an interval
 * @param {'day'|'week'|'month'} [initialView]
 * @returns {{interval: () => Interval, refresh: () => Promise<void>, open: (view: 'day'|'week'|'month', date: string) => Promise<void>}}
 */
export function createCalendarView(elements, show, initialView = 'week') {
    /** @type {'day'|'week'|'month'} */
    let view = initialView;
    /** @type {string} anchor date */
    let date = todayInRome();

    const interval = () => ({ view, date });

    /** @returns {string} the title of the interval on screen */
    function title() {
        const lang = currentLanguage();
        if (view === 'day') return formatLongDate(date, lang);
        if (view === 'week') return formatWeekTitle(mondayOf(date), lang);
        return formatMonthTitle(date, lang);
    }

    /** @returns {boolean} true when the interval on screen contains today */
    function showsToday() {
        const today = todayInRome();
        if (view === 'day') return date === today;
        if (view === 'week') return mondayOf(date) === mondayOf(today);
        return date.slice(0, 7) === today.slice(0, 7);
    }

    function refreshToolbar() {
        elements.title.textContent = title();
        elements.today.disabled = showsToday();
        for (const [name, element] of Object.entries(elements.switches)) element.setAttribute('aria-pressed', String(name === view));
    }

    function refresh() {
        refreshToolbar();
        return show(interval());
    }

    /**
     * @param {number} steps - -1 previous, +1 next
     * @returns {Promise<void>}
     */
    function move(steps) {
        if (view === 'day') date = addDays(date, steps);
        else if (view === 'week') date = addDays(date, steps * 7);
        else date = addMonths(date, steps);
        return refresh();
    }

    /**
     * @param {'day'|'week'|'month'} nextView
     * @param {string} nextDate
     * @returns {Promise<void>}
     */
    function open(nextView, nextDate) {
        view = nextView;
        date = nextDate;
        return refresh();
    }

    elements.previous.addEventListener('click', () => move(-1));
    elements.next.addEventListener('click', () => move(1));
    elements.today.addEventListener('click', () => open(view, todayInRome()));
    for (const [name, element] of Object.entries(elements.switches)) element.addEventListener('click', () => open(name, date));
    onLanguageChange(refreshToolbar);
    elements.previous.setAttribute('aria-label', translate('calendar.prev'));
    elements.next.setAttribute('aria-label', translate('calendar.next'));

    return { interval, refresh, open };
}
