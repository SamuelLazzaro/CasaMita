/* utils.js — pure helpers: no DOM, no state, no side effects. */

/**
 * @returns {string} today's date in the venue's time zone, 'YYYY-MM-DD'
 */
export function todayInRome() {
    return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

/**
 * @returns {{date: string, minutes: number}} the current civil date and time in the venue's time zone (minutes from midnight)
 */
export function nowInRome() {
    const formatted = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());
    const [date, time] = formatted.split(' ');
    return { date, minutes: minutesFromTime(time) };
}

/**
 * @param {string} date - 'YYYY-MM-DD'
 * @param {number} days - may be negative
 * @returns {string} 'YYYY-MM-DD'
 */
export function addDays(date, days) {
    const [year, month, day] = date.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/**
 * @param {string} from - 'YYYY-MM-DD'
 * @param {string} to - 'YYYY-MM-DD'
 * @returns {number} nights between the two dates, negative when reversed
 */
export function nightsBetween(from, to) {
    const [fromYear, fromMonth, fromDay] = from.split('-').map(Number);
    const [toYear, toMonth, toDay] = to.split('-').map(Number);
    const millisPerDay = 24 * 60 * 60 * 1000;
    return Math.round((Date.UTC(toYear, toMonth - 1, toDay) - Date.UTC(fromYear, fromMonth - 1, fromDay)) / millisPerDay);
}

/**
 * @param {string} time - 'HH:MM'
 * @returns {number} minutes from midnight
 */
export function minutesFromTime(time) {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
}

/**
 * @param {number} minutes - minutes from midnight
 * @returns {string} 'HH:MM'
 */
export function timeFromMinutes(minutes) {
    return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/**
 * Seating times of a service window: from the opening time, every `stepMinutes`,
 * strictly before the closing time (the server applies the same rule).
 * @param {{open: string, close: string}} window - 'HH:MM' bounds
 * @param {number} stepMinutes
 * @returns {string[]} 'HH:MM' options
 */
export function seatingTimes(window, stepMinutes) {
    const times = [];
    for (let minutes = minutesFromTime(window.open); minutes < minutesFromTime(window.close); minutes += stepMinutes) {
        times.push(timeFromMinutes(minutes));
    }
    return times;
}

/**
 * @param {string} date - 'YYYY-MM-DD'
 * @param {string} lang - 'it' | 'en'
 * @returns {string} long human date in that language, e.g. "lunedì 19 ottobre 2026"
 */
export function formatLongDate(date, lang) {
    const [year, month, day] = date.split('-').map(Number);
    return new Intl.DateTimeFormat(lang === 'it' ? 'it-IT' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, day)));
}

/**
 * @param {string} utcTimestamp - SQLite 'YYYY-MM-DD HH:MM:SS' in UTC
 * @param {string} lang - 'it' | 'en'
 * @returns {string} date and time in the venue's time zone
 */
export function formatTimestamp(utcTimestamp, lang) {
    const instant = new Date(`${utcTimestamp.replace(' ', 'T')}Z`);
    return new Intl.DateTimeFormat(lang === 'it' ? 'it-IT' : 'en-GB', { timeZone: 'Europe/Rome', dateStyle: 'short', timeStyle: 'short' }).format(instant);
}

/**
 * @param {string} date - 'YYYY-MM-DD'
 * @returns {number} weekday, 0 = Monday .. 6 = Sunday (project-wide convention)
 */
export function weekday(date) {
    const [year, month, day] = date.split('-').map(Number);
    return (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7;
}

/**
 * @param {string} date - 'YYYY-MM-DD'
 * @returns {string} Monday of that week
 */
export function mondayOf(date) {
    return addDays(date, -weekday(date));
}

/**
 * @param {string} date - 'YYYY-MM-DD'
 * @param {number} months - may be negative
 * @returns {string} the first day of the month `months` away
 */
export function addMonths(date, months) {
    const [year, month] = date.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1 + months, 1)).toISOString().slice(0, 10);
}

/**
 * Days of the grid that shows the month of `date`: whole weeks, Monday first,
 * from the week of the 1st to the week of the last day (4 to 6 rows).
 * @param {string} date - any day of the month
 * @returns {string[]} 'YYYY-MM-DD' of every cell
 */
export function monthGridDays(date) {
    const first = `${date.slice(0, 7)}-01`;
    const lastOfMonth = addDays(addMonths(first, 1), -1);
    const days = [];
    for (let day = mondayOf(first); day <= addDays(mondayOf(lastOfMonth), 6); day = addDays(day, 1)) days.push(day);
    return days;
}

/**
 * @param {string} monday - 'YYYY-MM-DD'
 * @returns {string[]} the seven days of the week
 */
export function weekDays(monday) {
    return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
}

/**
 * @param {string} date - 'YYYY-MM-DD'
 * @param {string} lang - 'it' | 'en'
 * @param {Intl.DateTimeFormatOptions} options
 * @returns {string}
 */
function formatCivilDate(date, lang, options) {
    const [year, month, day] = date.split('-').map(Number);
    return new Intl.DateTimeFormat(lang === 'it' ? 'it-IT' : 'en-GB', { ...options, timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, day)));
}

/**
 * @param {string} date
 * @param {string} lang
 * @returns {string} short weekday and day number, e.g. "lun 19"
 */
export function formatDayHeader(date, lang) {
    return formatCivilDate(date, lang, { weekday: 'short', day: 'numeric' });
}

/**
 * @param {string} date
 * @param {string} lang
 * @returns {string} e.g. "19/10/2026" or "19/10/2026" (en-GB)
 */
export function formatShortDate(date, lang) {
    return formatCivilDate(date, lang, { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/**
 * @param {string} date - any day of the month
 * @param {string} lang
 * @returns {string} e.g. "ottobre 2026"
 */
export function formatMonthTitle(date, lang) {
    return formatCivilDate(date, lang, { month: 'long', year: 'numeric' });
}

/**
 * @param {string} monday
 * @param {string} lang
 * @returns {string} e.g. "19 – 25 ott 2026"
 */
export function formatWeekTitle(monday, lang) {
    const sunday = addDays(monday, 6);
    const start = formatCivilDate(monday, lang, { day: 'numeric', month: monday.slice(0, 7) === sunday.slice(0, 7) ? undefined : 'short' });
    const end = formatCivilDate(sunday, lang, { day: 'numeric', month: 'short', year: 'numeric' });
    return `${start} – ${end}`;
}

/**
 * @param {number} amount - euro
 * @param {string} lang - 'it' | 'en'
 * @returns {string} e.g. "1.234,50 €" or "€1,234.50"
 */
export function formatEuro(amount, lang) {
    return new Intl.NumberFormat(lang === 'it' ? 'it-IT' : 'en-GB', { style: 'currency', currency: 'EUR' }).format(amount);
}
