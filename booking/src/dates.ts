/**
 * Pure date and time helpers.
 *
 * Domain dates and times are the venue's civil time (Europe/Rome), encoded as
 * sortable strings: 'YYYY-MM-DD', 'HH:MM' and 'YYYY-MM-DD_HHMM' for slot keys.
 * Working on civil strings keeps every comparison lexicographic and avoids
 * time zone math; the real clock enters only in romeNow(), which converts an
 * absolute instant through Intl. Everything here is pure, so it is unit
 * testable in isolation.
 */

export const TIME_ZONE = 'Europe/Rome';

export function isValidDate(value: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    // Round-trip through Date.UTC to reject impossible dates like 2026-02-30,
    // which Date would otherwise roll over into the next month.
    const [year, month, day] = value.split('-').map(Number);
    const utc = new Date(Date.UTC(year, month - 1, day));
    return utc.getUTCFullYear() === year && utc.getUTCMonth() === month - 1 && utc.getUTCDate() === day;
}

/** 'HH:MM' between 00:00 and 24:00 included (24:00 is a valid closing time). */
export function isValidTime(value: string): boolean {
    if (!/^\d{2}:\d{2}$/.test(value)) return false;
    const minutes = minutesFromMidnight(value);
    return minutes >= 0 && minutes <= 24 * 60 && minutes % 60 < 60;
}

export function minutesFromMidnight(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
}

/** Minutes from midnight → 'HH:MM' (1440 → '24:00'). */
export function timeFromMinutes(minutes: number): string {
    const hours = String(Math.floor(minutes / 60)).padStart(2, '0');
    const remainder = String(minutes % 60).padStart(2, '0');
    return `${hours}:${remainder}`;
}

/** Civil date arithmetic through Date.UTC, hence free of time zone effects. */
export function addDays(date: string, days: number): string {
    const [year, month, day] = date.split('-').map(Number);
    const utc = new Date(Date.UTC(year, month - 1, day + days));
    return utc.toISOString().slice(0, 10);
}

/** Number of nights between two dates ('YYYY-MM-DD'), negative if reversed. */
export function nightsBetween(from: string, to: string): number {
    const [fromYear, fromMonth, fromDay] = from.split('-').map(Number);
    const [toYear, toMonth, toDay] = to.split('-').map(Number);
    const millisPerDay = 24 * 60 * 60 * 1000;
    return Math.round((Date.UTC(toYear, toMonth - 1, toDay) - Date.UTC(fromYear, fromMonth - 1, fromDay)) / millisPerDay);
}

/** Project-wide weekday convention: 0 = Monday .. 6 = Sunday. */
export function weekday(date: string): number {
    const [year, month, day] = date.split('-').map(Number);
    const utc = new Date(Date.UTC(year, month - 1, day));
    return (utc.getUTCDay() + 6) % 7;
}

/**
 * Expands a time range of one date into the 30-minute slot keys it occupies.
 * A slot is identified by its START time: 18:30-20:00 gives _1830, _1900,
 * _1930 (the last slot covers 19:30-20:00).
 */
export function slotKeys(date: string, startTime: string, endTime: string, slotMinutes: number): string[] {
    const keys: string[] = [];
    for (let minutes = minutesFromMidnight(startTime); minutes < minutesFromMidnight(endTime); minutes += slotMinutes) {
        keys.push(`${date}_${timeFromMinutes(minutes).replace(':', '')}`);
    }
    return keys;
}

/** Monday of the week the date belongs to. */
export function mondayOf(date: string): string {
    return addDays(date, -weekday(date));
}

/** 'YYYY-MM' of a date. */
export function monthOf(date: string): string {
    return date.slice(0, 7);
}

/** Last day of the month of a date. */
export function lastDayOfMonth(date: string): string {
    const [year, month] = date.split('-').map(Number);
    const firstOfNext = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;
    return addDays(firstOfNext, -1);
}

export type CalendarView = 'day' | 'week' | 'month';

/**
 * Inclusive date range shown by a calendar view: the day itself, its
 * Monday-to-Sunday week, or the whole weeks that contain the month (the same
 * cells the frontend draws, so one query also covers the padding days).
 */
export function calendarRange(view: CalendarView, date: string): { from: string; to: string } {
    if (view === 'day') return { from: date, to: date };
    if (view === 'week') {
        const monday = mondayOf(date);
        return { from: monday, to: addDays(monday, 6) };
    }
    const firstOfMonth = `${monthOf(date)}-01`;
    const lastOfMonth = lastDayOfMonth(date);
    return { from: mondayOf(firstOfMonth), to: addDays(mondayOf(lastOfMonth), 6) };
}

/** Converts an absolute instant into the venue's civil date and time. */
export function romeNow(instant: Date): { date: string; time: string } {
    const parts = new Intl.DateTimeFormat('it-IT', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(instant);
    const part = (type: string): string => parts.find((candidate) => candidate.type === type)?.value ?? '';
    return { date: `${part('year')}-${part('month')}-${part('day')}`, time: `${part('hour')}:${part('minute')}` };
}

/** 'YYYY-MM-DD' → 'DD/MM/YYYY', the date format used in Italian emails. */
export function italianDate(date: string): string {
    const [year, month, day] = date.split('-');
    return `${day}/${month}/${year}`;
}
