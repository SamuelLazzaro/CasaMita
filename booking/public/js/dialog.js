/* ═══════════════════════════════════════════════════════════
   Dialog — modal popup with a fixed header and a scrolling body

   A thin layer over the native <dialog>: the browser already
   gives the modal behaviour (backdrop, focus trap, Esc, inert
   page), so the component only adds what the element lacks:
     - the close buttons inside it (`[data-dialog-close]`) wired
       once;
     - the body scrolled back to the top at every opening, so a
       popup never reopens halfway down its previous content;
     - the `.is-scrolled` class on the <dialog> while the body is
       scrolled down, which the CSS turns into a shadow under the
       header;
     - optionally, a click on the backdrop closes the popup.

   The component generates no markup: <dialog>, header, title,
   close button and body are written in the HTML (see the README
   for the full snippet). The JS only touches what changes with
   the state: the `open` attribute (through the native API) and
   the scrolled class.

   Two ways to listen, both emitted for every opening and closing:
     - on the instance:  dlg.addEventListener('open', fn)
     - on the DOM node:  el.addEventListener('dialog:open', fn)
   The DOM events bubble, so a single delegated listener on
   `document` can serve every popup of the page. Closing is
   reported whatever the cause (close button, Esc, `close()`, a
   form with method="dialog"), because it is driven by the native
   `close` event.
   ═══════════════════════════════════════════════════════════ */

/**
 * @typedef {Object} DialogOptions
 * @property {string}  [bodyClass='dialog-body']                Class of the scrolling body. Must match the CSS.
 * @property {string}  [closeSelector='[data-dialog-close]']    Selector of the elements inside the dialog that close it on click.
 * @property {string}  [scrolledClass='is-scrolled']            Class put on the <dialog> while the body is scrolled down. Must match the CSS.
 * @property {boolean} [closeOnBackdrop=false]                  Close when the backdrop is clicked.
 * @property {boolean} [resetScroll=true]                       Scroll the body back to the top at every opening.
 * @property {() => void} [onOpen]                              Convenience callback, called after every opening.
 * @property {(returnValue: string) => void} [onClose]          Convenience callback, called after every closing.
 */

/** @type {Required<Omit<DialogOptions, 'onOpen'|'onClose'>> & Pick<DialogOptions, 'onOpen'|'onClose'>} */
const DEFAULT_OPTIONS = {
    bodyClass: 'dialog-body',
    closeSelector: '[data-dialog-close]',
    scrolledClass: 'is-scrolled',
    closeOnBackdrop: false,
    resetScroll: true,
    onOpen: undefined,
    onClose: undefined,
};

/**
 * Resolves a selector, a bare id or an element into an element.
 *
 * A bare id such as "3rdDialog" is not a valid selector and makes
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
 * Modal popup with a fixed header and a scrolling body.
 *
 * @extends EventTarget
 * @fires Dialog#open
 * @fires Dialog#close
 */
export class Dialog extends EventTarget {
    /** @type {HTMLDialogElement} */
    #dialog;

    /** @type {HTMLElement} */
    #body;

    /** @type {HTMLElement[]} */
    #closeButtons;

    /** @type {DialogOptions} */
    #options;

    /** @type {boolean} whether the last pointer press started on the backdrop */
    #pressStartedOnBackdrop = false;

    /** @type {() => void} */
    #handleCloseClick;

    /** @type {() => void} */
    #handleScroll;

    /** @type {() => void} */
    #handleNativeClose;

    /** @type {(event: PointerEvent) => void} */
    #handlePointerDown;

    /** @type {(event: MouseEvent) => void} */
    #handleBackdropClick;

    /**
     * @param {string|Element} target The <dialog>, or a selector / id resolving to it.
     * @param {DialogOptions} [options]
     * @throws {Error} If the target is not a <dialog> or the body is missing from the markup.
     */
    constructor(target, options = {}) {
        super();

        const element = resolveElement(target);
        if (!(element instanceof HTMLDialogElement)) {
            throw new Error(`Dialog: no <dialog> found for target "${String(target)}"`);
        }

        this.#dialog = element;
        this.#options = { ...DEFAULT_OPTIONS, ...options };

        this.#findMarkup();

        this.#handleCloseClick = () => this.close();
        this.#handleScroll = () => this.#updateScrolled();
        this.#handleNativeClose = () => this.#emit('close');
        this.#handlePointerDown = (event) => {
            this.#pressStartedOnBackdrop = event.target === this.#dialog;
        };
        this.#handleBackdropClick = (event) => {
            // A click lands on the <dialog> itself only outside its content, i.e. on the backdrop (the dialog has no padding). Press and release must both be there: dragging a text selection out of the popup is not a request to close it.
            const releasedOnBackdrop = event.target === this.#dialog;
            if (releasedOnBackdrop && this.#pressStartedOnBackdrop) this.close();
        };

        for (const button of this.#closeButtons) button.addEventListener('click', this.#handleCloseClick);
        this.#body.addEventListener('scroll', this.#handleScroll, { passive: true });
        this.#dialog.addEventListener('close', this.#handleNativeClose);
        if (this.#options.closeOnBackdrop) {
            this.#dialog.addEventListener('pointerdown', this.#handlePointerDown);
            this.#dialog.addEventListener('click', this.#handleBackdropClick);
        }
    }

    /** @returns {HTMLDialogElement} The <dialog>. */
    get element() {
        return this.#dialog;
    }

    /** @returns {HTMLElement} The scrolling body. */
    get body() {
        return this.#body;
    }

    /** @returns {boolean} Whether the popup is currently open. */
    get isOpen() {
        return this.#dialog.open;
    }

    /** Opens the popup as modal. No-op if already open. */
    open() {
        if (this.#dialog.open) {
            return;
        }

        this.#dialog.showModal();
        if (this.#options.resetScroll) {
            this.#body.scrollTop = 0;
        }
        this.#updateScrolled();
        this.#emit('open');
    }

    /**
     * Closes the popup. No-op if already closed. The `close` event
     * follows from the native one, so it fires for this call exactly
     * as for Esc or a close button.
     *
     * @param {string} [returnValue] Stored in `dialog.returnValue`, as with the native close().
     */
    close(returnValue) {
        if (!this.#dialog.open) {
            return;
        }
        if (returnValue === undefined) {
            this.#dialog.close();
        } else {
            this.#dialog.close(returnValue);
        }
    }

    /**
     * Closes the popup and removes every listener the instance added,
     * leaving the close buttons inert. The markup is left as written in
     * the HTML. Call it before dropping the dialog.
     */
    destroy() {
        if (this.#dialog.open) {
            this.#dialog.close();
        }
        for (const button of this.#closeButtons) button.removeEventListener('click', this.#handleCloseClick);
        this.#body.removeEventListener('scroll', this.#handleScroll);
        this.#dialog.removeEventListener('close', this.#handleNativeClose);
        this.#dialog.removeEventListener('pointerdown', this.#handlePointerDown);
        this.#dialog.removeEventListener('click', this.#handleBackdropClick);
        this.#dialog.classList.remove(this.#options.scrolledClass);
    }

    /**
     * Locates the body and the close buttons inside the dialog. The body
     * must already be in the HTML: the component builds nothing, so a
     * missing piece is an authoring error and is reported loudly. The
     * close buttons are optional (Esc always works), so none is fine.
     */
    #findMarkup() {
        const { bodyClass, closeSelector } = this.#options;

        const body = this.#dialog.querySelector(`.${bodyClass}`);
        if (!(body instanceof HTMLElement)) {
            throw new Error(`Dialog: no element with class "${bodyClass}" inside the <dialog>`);
        }
        this.#body = body;

        this.#closeButtons = Array.from(this.#dialog.querySelectorAll(closeSelector));
    }

    /** Mirrors the scroll position of the body into the scrolled class. */
    #updateScrolled() {
        const isScrolled = this.#body.scrollTop > 0;
        this.#dialog.classList.toggle(this.#options.scrolledClass, isScrolled);
    }

    /**
     * Emits the same change on the instance and, prefixed, on the DOM
     * node — so consumers can subscribe wherever it suits them.
     *
     * @param {'open'|'close'} type
     */
    #emit(type) {
        const detail = { dialog: this, returnValue: this.#dialog.returnValue };
        this.dispatchEvent(new CustomEvent(type, { detail }));
        this.#dialog.dispatchEvent(new CustomEvent(`dialog:${type}`, { detail, bubbles: true }));
        if (type === 'open') {
            this.#options.onOpen?.();
        } else {
            this.#options.onClose?.(this.#dialog.returnValue);
        }
    }
}

export default Dialog;
