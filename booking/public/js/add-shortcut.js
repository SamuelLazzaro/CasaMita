/*
 * add-shortcut.js — the "+" shortcut of the calendar cells: a small round
 * button in the top-right corner of a bookable cell, which opens the booking
 * dialog already filled with the date (and, on a time grid, the time) of that
 * cell. The renderers only create the markup (addButton); the click is served
 * by one delegated listener per calendar (attachAddShortcut), which survives
 * every re-render and costs one listener for a whole week of slots.
 *
 * Mouse and stylus reveal the "+" on :hover, in pure CSS. Touch screens have
 * no hover, so there the reveal takes two taps and every click is classified:
 *   - tap on a "+": open the dialog on its cell (the only case that acts)
 *   - tap on a cell that owns a hidden "+": reveal it, so the next tap can
 *     hit it; a second tap on the same cell hides it again
 *   - anything else, anywhere on the page: just hide the revealed "+"
 * At most one "+" is revealed at a time, so the grid never fills with them.
 * A tap on any other button of a cell (a booking entry, a day number) is left
 * out: that one has its own job and must not turn into a reveal.
 */
import { ADD_BUTTON_CLASS, ADD_CELL_SELECTOR, ADD_REVEALED_CLASS } from './constants.js';
import { lastInputWasTouch } from './tap-feedback.js';

/** @type {string} SVG namespace, required by createElementNS */
const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * @returns {SVGElement} a "+" drawn with two strokes in currentColor
 */
function plusIcon() {
    const icon = document.createElementNS(SVG_NS, 'svg');
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.setAttribute('fill', 'none');
    icon.setAttribute('stroke', 'currentColor');
    icon.setAttribute('stroke-width', '3');
    icon.setAttribute('stroke-linecap', 'round');
    icon.setAttribute('aria-hidden', 'true');
    const strokes = [[12, 5, 12, 19], [5, 12, 19, 12]]; // vertical, then horizontal
    for (const [x1, y1, x2, y2] of strokes) {
        const line = document.createElementNS(SVG_NS, 'line');
        line.setAttribute('x1', String(x1));
        line.setAttribute('y1', String(y1));
        line.setAttribute('x2', String(x2));
        line.setAttribute('y2', String(y2));
        icon.append(line);
    }
    return icon;
}

/**
 * The "+" button of a cell. Date and time travel in its data attributes,
 * read back by the delegated listener of attachAddShortcut.
 * @param {string} day - 'YYYY-MM-DD' the dialog will open on
 * @param {string|null} time - 'HH:MM' to prefill, null on a whole-day cell
 * @param {string} label - accessible name, e.g. "New booking 19/10/2026 at 18:00"
 * @returns {HTMLButtonElement}
 */
export function addButton(day, time, label) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = ADD_BUTTON_CLASS;
    button.dataset.day = day;
    if (time !== null) button.dataset.time = time;
    button.setAttribute('aria-label', label);
    button.title = label;
    button.append(plusIcon());
    return button;
}

/**
 * Wires the "+" shortcut of one calendar container with a single delegated
 * listener on the document (clicks outside the calendar must hide a revealed
 * "+" too).
 * @param {HTMLElement} container - the calendar container (its children are replaced on every render)
 * @param {(day: string, time: string|null) => void} onAdd - opens the booking dialog on a cell
 * @returns {void}
 */
export function attachAddShortcut(container, onAdd) {
    document.addEventListener('click', (event) => {
        const target = event.target instanceof Element ? event.target : null;
        if (target === null) return;
        const plusButton = target.closest(`.${ADD_BUTTON_CLASS}`);
        // Any other button inside a cell (an entry, a day number) does its own
        // job: for the reveal logic it counts as a click outside every cell.
        const otherButton = plusButton === null && target.closest('button') !== null;
        const cell = otherButton ? null : target.closest(ADD_CELL_SELECTOR);
        const ownCell = cell !== null && container.contains(cell);
        const wasRevealed = ownCell && cell.classList.contains(ADD_REVEALED_CLASS);

        const revealed = container.querySelector(`.${ADD_REVEALED_CLASS}`);
        if (revealed !== null) revealed.classList.remove(ADD_REVEALED_CLASS);

        if (plusButton !== null && container.contains(plusButton)) {
            onAdd(plusButton.dataset.day, plusButton.dataset.time ?? null);
            return;
        }

        const shouldReveal = ownCell && !wasRevealed && lastInputWasTouch() && cell.querySelector(`.${ADD_BUTTON_CLASS}`) !== null;
        if (shouldReveal) cell.classList.add(ADD_REVEALED_CLASS);
    });
}
