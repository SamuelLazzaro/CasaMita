/* constants.js — shared constants, no logic. */

/** @type {string} localStorage key holding the chosen language */
export const LANG_STORAGE_KEY = 'booking-lang';

/** @type {string} language the HTML source ships in */
export const DEFAULT_LANG = 'it';

/** @type {string[]} languages the dictionary covers */
export const LANGUAGES = ['it', 'en'];

/** @type {number} max length of the free notes (mirrors the server rule) */
export const MAX_NOTES = 500;

/** @type {number} max nights of a hotel stay (mirrors the server rule) */
export const MAX_NIGHTS = 30;

/** @type {number} how far ahead a booking may be, in days (mirrors the server rule) */
export const MAX_DAYS_AHEAD = 365;

/** @type {string} CSS class of the status message when the news is good */
export const STATUS_OK_CLASS = 'is-ok';

/** @type {string} CSS class of the status message when something went wrong */
export const STATUS_ERROR_CLASS = 'is-error';

/* --- tap feedback (see js/tap-feedback.js and .is-tapped in css/base.css) --- */

/** @type {number} how long (ms) the tap feedback stays on screen before the action runs */
export const TAP_FEEDBACK_MS = 150;

/** @type {string} class carrying the tap feedback style */
export const TAP_FEEDBACK_CLASS = 'is-tapped';

/** @type {string} elements whose taps deserve the feedback */
export const TAP_FEEDBACK_SELECTOR = 'a[href], button, [role="button"]';

/** @type {string} class on <html> while the user drives the page with the keyboard (see the focus rules in the CSS) */
export const KEYBOARD_INPUT_CLASS = 'is-keyboard-input';

/** @type {number} mouse movement (px) after which a press on a scrollable calendar becomes a drag (see drag-scroll.js) */
export const DRAG_SCROLL_THRESHOLD_PX = 5;

/* --- "+" shortcut of the calendar cells (see js/add-shortcut.js) --- */

/** @type {string} class of the round "+" button placed on a bookable cell */
export const ADD_BUTTON_CLASS = 'cal-add';

/** @type {string} class marking the cell whose "+" a tap has revealed */
export const ADD_REVEALED_CLASS = 'is-add-revealed';

/** @type {string} cells that can own a "+": a day of the week/month grids or a slot of the time grid */
export const ADD_CELL_SELECTOR = '.cal-cell, .cal-slot';
