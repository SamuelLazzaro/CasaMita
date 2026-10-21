/*
 * tap-feedback.js — visual feedback for taps on touch devices.
 *
 * Touch screens have no :hover, and the native highlight is switched off
 * (-webkit-tap-highlight-color: transparent), so a tap would give no
 * confirmation that the intended element was hit. This module inserts a
 * short feedback window in front of every touch activation:
 *
 *   1. a capture-phase click listener on document intercepts the event
 *      before anything else sees it and cancels it: preventDefault() holds
 *      back the default action, stopImmediatePropagation() the page handlers
 *   2. TAP_FEEDBACK_CLASS is added to the tapped element, which the CSS
 *      styles like the desktop :hover state of that component
 *   3. after TAP_FEEDBACK_MS the class is removed and the click is replayed
 *      with element.click(), which runs everything as if step 1 never happened
 *
 * Only real finger taps take this path: mouse and keyboard activations keep
 * their native, immediate timing. Hooking click (not touchstart) is
 * deliberate: a touch that turns into a scroll never produces a click.
 *
 * The module also tells the CSS which input is in use: KEYBOARD_INPUT_CLASS
 * sits on <html> from the first key press until the next pointer press. The
 * focus styles of the actionable elements are scoped to that class, so
 * they show up only when the focus was reached with the keyboard. The
 * browsers' own :focus-visible heuristic is not enough: WebKit matches it
 * on any programmatic focus, including the focus a <dialog> takes when it
 * opens and gives back when it closes, so a tap could leave a button
 * looking hovered for good.
 */
import { KEYBOARD_INPUT_CLASS, TAP_FEEDBACK_CLASS, TAP_FEEDBACK_MS, TAP_FEEDBACK_SELECTOR } from './constants.js';

/** @type {boolean} true when the last pointer pressed down was a finger */
let g_lastInputWasTouch = false;

/**
 * The click event's own pointerType is not reliable (some engines label a
 * tap-born click "mouse"), so the pointerdown that opened the click is
 * recorded instead. Keyboard activations synthesise a click with detail 0
 * and must not be delayed.
 * @param {MouseEvent} clickEvent
 * @returns {boolean} true when the click comes from a tap
 */
function isClickFromTap(clickEvent) {
    const keyboardActivation = clickEvent.detail === 0;
    return g_lastInputWasTouch && !keyboardActivation;
}

/**
 * @param {Element} tappedElement
 * @returns {void}
 */
function showFeedbackThenReplay(tappedElement) {
    tappedElement.classList.add(TAP_FEEDBACK_CLASS);
    setTimeout(() => {
        tappedElement.classList.remove(TAP_FEEDBACK_CLASS);
        // The replayed click has isTrusted === false: that is what stops
        // interceptClick from intercepting it again and looping forever.
        tappedElement.click();
    }, TAP_FEEDBACK_MS);
}

/**
 * @param {MouseEvent} clickEvent - click captured on document
 * @returns {void}
 */
function interceptClick(clickEvent) {
    if (!clickEvent.isTrusted || !isClickFromTap(clickEvent)) return;
    const tappedElement = clickEvent.target.closest(TAP_FEEDBACK_SELECTOR);
    if (tappedElement === null) return;
    clickEvent.preventDefault();
    clickEvent.stopImmediatePropagation();
    // A second tap during the feedback would queue a second replay: swallow it.
    if (!tappedElement.classList.contains(TAP_FEEDBACK_CLASS)) showFeedbackThenReplay(tappedElement);
}

/**
 * Lets other modules adapt to the input in use (e.g. a hover affordance
 * that a touch screen has to reveal with a tap instead).
 * @returns {boolean} true when the last pointer pressed down was a finger
 */
export function lastInputWasTouch() {
    return g_lastInputWasTouch;
}

/**
 * Starts giving taps a visual feedback before their action runs. Call it
 * before any other click handler is registered.
 * @returns {void}
 */
export function startTapFeedback() {
    document.addEventListener('pointerdown', (pointerEvent) => {
        g_lastInputWasTouch = pointerEvent.pointerType === 'touch';
        document.documentElement.classList.remove(KEYBOARD_INPUT_CLASS);
    }, { capture: true, passive: true });
    // engines without PointerEvent support only fire the touch events
    document.addEventListener('touchstart', () => {
        g_lastInputWasTouch = true;
        document.documentElement.classList.remove(KEYBOARD_INPUT_CLASS);
    }, { capture: true, passive: true });
    // keydown fires before Tab moves the focus, so the newly focused element already gets the keyboard styles
    document.addEventListener('keydown', () => {
        document.documentElement.classList.add(KEYBOARD_INPUT_CLASS);
    }, { capture: true, passive: true });
    document.addEventListener('click', interceptClick, true);
}
