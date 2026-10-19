/*
 * drag-scroll.js — horizontal scrolling by dragging with the mouse.
 *
 * Touch screens pan a scrollable box natively; with a mouse the only way is
 * the scrollbar. This module lets the user grab a wide calendar and drag it
 * sideways instead:
 *
 *   1. on mouse button down the start position is recorded, nothing else
 *   2. once the pointer has moved more than DRAG_SCROLL_THRESHOLD_PX the
 *      gesture becomes a drag: the box scrolls with the pointer and captures
 *      it, so leaving the box does not end the gesture
 *   3. the click that the browser fires when the button is released after a
 *      drag is swallowed (capture phase), so a drag over a booking entry does
 *      not open it; a plain click, below the threshold, goes through untouched
 *
 * Only mouse pointers take this path: touch and pen keep their native
 * behaviour. The "is-scrollable" class marks a box that actually overflows,
 * so the CSS shows the grab cursor only when dragging would do something.
 */
import { DRAG_SCROLL_THRESHOLD_PX } from './constants.js';

/**
 * @param {HTMLElement} box - the element with overflow-x: auto
 * @returns {void}
 */
export function enableDragScroll(box) {
    /** @type {{pointerId: number, startX: number, startScrollLeft: number, dragging: boolean}|null} the gesture in progress */
    let gesture = null;
    /** @type {boolean} true right after a drag, until its click has been swallowed */
    let swallowNextClick = false;

    const updateScrollable = () => box.classList.toggle('is-scrollable', box.scrollWidth > box.clientWidth);
    new ResizeObserver(updateScrollable).observe(box);
    new MutationObserver(updateScrollable).observe(box, { childList: true, subtree: true });

    box.addEventListener('pointerdown', (event) => {
        if (event.pointerType !== 'mouse' || event.button !== 0 || box.scrollWidth <= box.clientWidth) return;
        gesture = { pointerId: event.pointerId, startX: event.clientX, startScrollLeft: box.scrollLeft, dragging: false };
    });

    box.addEventListener('pointermove', (event) => {
        if (gesture === null || event.pointerId !== gesture.pointerId) return;
        const distance = event.clientX - gesture.startX;
        if (!gesture.dragging) {
            if (Math.abs(distance) < DRAG_SCROLL_THRESHOLD_PX) return;
            gesture.dragging = true;
            box.classList.add('is-dragging');
            box.setPointerCapture(event.pointerId);
        }
        box.scrollLeft = gesture.startScrollLeft - distance;
    });

    const endGesture = (event) => {
        if (gesture === null || event.pointerId !== gesture.pointerId) return;
        if (gesture.dragging) {
            box.classList.remove('is-dragging');
            box.releasePointerCapture(event.pointerId);
            swallowNextClick = true;
        }
        gesture = null;
    };
    box.addEventListener('pointerup', endGesture);
    box.addEventListener('pointercancel', endGesture);

    box.addEventListener('click', (event) => {
        if (!swallowNextClick) return;
        swallowNextClick = false;
        event.preventDefault();
        event.stopPropagation();
    }, true);
}
