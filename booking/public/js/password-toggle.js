/* ═══════════════════════════════════════════════════════════
   Password toggle — show / hide the characters of a password
   field

   Browsers draw no "show password" control of their own (Edge
   is the only exception, and only on desktop), so a site that
   wants one has to build it. This component owns exactly that:
   a button next to the field that flips `type` between
   "password" and "text", keeps `aria-pressed` in sync and
   announces the change. It never reads, stores or sends the
   value of the field.

   The component generates no markup: wrapper, button, icons
   and every static attribute are written in the HTML (see the
   README for the full snippet). The JS only touches what
   changes with the state: the `type` of the field, the state
   class on the wrapper and `aria-pressed` on the button.

   The field goes back to hidden on every submit or reset of
   its form (configurable), so a password never stays on the
   screen after the user is done with it.

   Two ways to listen, both emitted for every state change:
     - on the instance:  pt.addEventListener('show', fn)
     - on the DOM node:  btn.addEventListener('password-toggle:show', fn)
   The DOM events bubble, so a single delegated listener on
   `document` can serve several fields.
   ═══════════════════════════════════════════════════════════ */

/**
 * @typedef {Object} PasswordToggleOptions
 * @property {string}  [wrapperClass='password-toggle']        Class of the element wrapping field and button. Must match the CSS.
 * @property {string}  [buttonClass='password-toggle-button']  Class of the button. Must match the CSS.
 * @property {string}  [visibleClass='is-visible']             Class put on the wrapper while the password is visible. Must match the CSS.
 * @property {boolean} [resetOnSubmit=true]                    Go back to hidden when the form of the field is submitted or reset.
 * @property {boolean} [initialVisible=false]                  Start with the password visible.
 * @property {(isVisible: boolean) => void} [onToggle]         Convenience callback, called after every change.
 */

/** @type {Required<Omit<PasswordToggleOptions, 'onToggle'>> & Pick<PasswordToggleOptions, 'onToggle'>} */
const DEFAULT_OPTIONS = {
    wrapperClass: 'password-toggle',
    buttonClass: 'password-toggle-button',
    visibleClass: 'is-visible',
    resetOnSubmit: true,
    initialVisible: false,
    onToggle: undefined,
};

/**
 * Resolves a selector, a bare id or an element into an element.
 *
 * A bare id such as "3rdField" is not a valid selector and makes
 * querySelector throw, so the lookup is guarded and falls back to
 * getElementById.
 *
 * @param {string|Element|null|undefined} target
 * @returns {Element|null}
 */
function resolveElement(target) {
    if (target === null || target === undefined) {
        return null;
    }
    if (target instanceof Element) {
        return target;
    }

    let bySelector = null;
    try {
        bySelector = document.querySelector(target);
    } catch {
        // Not a valid CSS selector — treat the string as a plain id.
    }

    return bySelector ?? document.getElementById(target);
}

/**
 * Show / hide toggle for a password field.
 *
 * @extends EventTarget
 * @fires PasswordToggle#show
 * @fires PasswordToggle#hide
 * @fires PasswordToggle#toggle
 */
export class PasswordToggle extends EventTarget {
    /** @type {HTMLInputElement} */
    #input;

    /** @type {HTMLElement} */
    #wrapper;

    /** @type {HTMLButtonElement} */
    #button;

    /** @type {PasswordToggleOptions} */
    #options;

    /** @type {boolean} */
    #visible = false;

    /** @type {() => void} */
    #handleClick;

    /** @type {() => void} */
    #handleFormDone;

    /**
     * @param {string|Element} target The password input, or a selector / id resolving to it.
     * @param {PasswordToggleOptions} [options]
     * @throws {Error} If the target is not an input, or wrapper and button are missing from the markup.
     */
    constructor(target, options = {}) {
        super();

        const element = resolveElement(target);
        if (!(element instanceof HTMLInputElement)) {
            throw new Error(`PasswordToggle: no <input> found for target "${String(target)}"`);
        }

        this.#input = element;
        this.#options = { ...DEFAULT_OPTIONS, ...options };

        this.#findMarkup();

        this.#handleClick = () => this.toggle();
        this.#handleFormDone = () => this.hide();

        this.#button.addEventListener('click', this.#handleClick);
        if (this.#options.resetOnSubmit && this.#input.form) {
            // `submit` fires even when the handler of the host calls
            // preventDefault() and logs in via fetch, so the field is
            // hidden again in both the classic and the single-page flow.
            this.#input.form.addEventListener('submit', this.#handleFormDone);
            this.#input.form.addEventListener('reset', this.#handleFormDone);
        }

        // Silent so that consumers are not called before they had a
        // chance to subscribe.
        this.#setState(Boolean(this.#options.initialVisible), { silent: true });
    }

    /** @returns {HTMLInputElement} The password field. */
    get input() {
        return this.#input;
    }

    /** @returns {HTMLButtonElement} The toggle button. */
    get element() {
        return this.#button;
    }

    /** @returns {boolean} Whether the password is currently shown as plain text. */
    get isVisible() {
        return this.#visible;
    }

    /** Shows the characters. No-op if already visible. */
    show() {
        this.#setState(true);
    }

    /** Masks the characters. No-op if already hidden. */
    hide() {
        this.#setState(false);
    }

    /** Flips the current state. */
    toggle() {
        this.#setState(!this.#visible);
    }

    /**
     * Masks the field and removes every listener the instance added,
     * leaving the button inert. The markup is left as written in the
     * HTML. Call it before dropping the field.
     */
    destroy() {
        this.#setState(false, { silent: true });
        this.#button.removeEventListener('click', this.#handleClick);
        if (this.#input.form) {
            this.#input.form.removeEventListener('submit', this.#handleFormDone);
            this.#input.form.removeEventListener('reset', this.#handleFormDone);
        }
    }

    /**
     * Locates the wrapper (the parent of the field) and the button inside
     * it. Both must already be in the HTML: the component builds nothing,
     * so a missing piece is an authoring error and is reported loudly.
     */
    #findMarkup() {
        const { wrapperClass, buttonClass } = this.#options;

        const wrapper = this.#input.parentElement;
        if (wrapper === null || !wrapper.classList.contains(wrapperClass)) {
            throw new Error(`PasswordToggle: the <input> must be wrapped in an element with class "${wrapperClass}"`);
        }
        this.#wrapper = wrapper;

        const button = wrapper.querySelector(`.${buttonClass}`);
        if (!(button instanceof HTMLButtonElement)) {
            throw new Error(`PasswordToggle: no <button class="${buttonClass}"> inside the wrapper`);
        }
        this.#button = button;
    }

    /**
     * Single write path for the state: keeps input type, class, ARIA and
     * subscribers consistent. Repeating the current value is a no-op,
     * except for the silent calls (constructor, destroy), which have to
     * write the class and ARIA attributes regardless.
     *
     * @param {boolean} next
     * @param {{ silent?: boolean }} [config]
     */
    #setState(next, { silent = false } = {}) {
        const isSameState = next === this.#visible;
        if (isSameState && !silent) {
            return;
        }

        this.#visible = next;
        this.#input.type = next ? 'text' : 'password';
        this.#wrapper.classList.toggle(this.#options.visibleClass, next);
        this.#button.setAttribute('aria-pressed', String(next));

        if (silent) {
            return;
        }

        this.#emit(next ? 'show' : 'hide');
        this.#emit('toggle');
        this.#options.onToggle?.(next);
    }

    /**
     * Emits the same change on the instance and, prefixed, on the DOM
     * node — so consumers can subscribe wherever it suits them.
     *
     * @param {'show'|'hide'|'toggle'} type
     */
    #emit(type) {
        const detail = { isVisible: this.#visible, passwordToggle: this };
        this.dispatchEvent(new CustomEvent(type, { detail }));
        this.#button.dispatchEvent(new CustomEvent(`password-toggle:${type}`, { detail, bubbles: true }));
    }
}

export default PasswordToggle;
