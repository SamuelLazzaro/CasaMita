/* ═══════════════════════════════════════════════════════════
   Consent gate — GDPR gate for third-party embeds

   The page ships with a visible placeholder only; the real
   embed (an iframe, usually) is created via JS after the
   visitor gives explicit consent. Nothing is requested from
   the third party before that moment.

   Consent is stored in localStorage under a configurable,
   project-prefixed key. Every gate sharing the same key
   forms a consent group: accepting on any of them — or from
   the site cookie banner via `ConsentGate.grant(key)` —
   renders all of them at once.

   Two ways to listen, both emitted for every state change:
     - on the instance:  gate.addEventListener('render', fn)
     - on the DOM node:  el.addEventListener('consent-gate:render', fn)
   The DOM events bubble, so a single delegated listener on
   `document` can serve several gates.
   ═══════════════════════════════════════════════════════════ */

/** Value stored under the consent key when consent is granted. */
const CONSENT_ACCEPTED = 'accepted';

/* localStorage can throw (private browsing, storage disabled by
   policy): fall back to an in-memory map so the gate still works
   for the current page view, it just forgets on reload. */
const memoryStore = new Map();

/**
 * @param {string} key
 * @returns {string|null}
 */
function readConsent(key) {
    try {
        return localStorage.getItem(key);
    } catch {
        return memoryStore.get(key) ?? null;
    }
}

/** @param {string} key */
function writeConsent(key) {
    try {
        localStorage.setItem(key, CONSENT_ACCEPTED);
    } catch {
        memoryStore.set(key, CONSENT_ACCEPTED);
    }
}

/** @param {string} key */
function clearConsent(key) {
    try {
        localStorage.removeItem(key);
    } catch {
        // Storage unavailable: the in-memory fallback below still runs.
    }
    memoryStore.delete(key);
}

/* Registry of live gates, grouped by storage key. It is what
   lets `grant`/`revoke` reach every instance of a group. */
/** @type {Map<string, Set<ConsentGate>>} */
const registry = new Map();

/**
 * Resolves a selector, a bare id or an element into an element.
 *
 * A bare id such as "3rdMap" is not a valid selector and makes
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
 * @typedef {Object} ConsentGateOptions
 * @property {string} storageKey  localStorage key holding the consent, prefixed with the
 *                                project name (e.g. 'mysite-maps-consent'). Gates sharing
 *                                the key form a consent group. Required.
 * @property {(container: HTMLElement, gate: ConsentGate) => Element} [createEmbed]
 *                                Factory that builds and returns the embed element.
 *                                Required unless `src` is given.
 * @property {string}  [src]      Shortcut: iframe URL used by the built-in factory when
 *                                no `createEmbed` is provided.
 * @property {string}  [title]    `title` of the built-in iframe (a11y).
 * @property {string}  [message]  Placeholder text, used only when the container has no
 *                                `.consent-gate-placeholder` markup of its own.
 * @property {string}  [buttonLabel] Placeholder button label, same condition as `message`.
 * @property {boolean} [autoRenderPlaceholder=true] Build the placeholder when the
 *                                container does not already contain one.
 * @property {(container: HTMLElement, gate: ConsentGate) => void} [onRender]
 *                                Convenience callback, called after every render
 *                                (including the one from the constructor).
 */

/** @type {Partial<ConsentGateOptions>} */
const DEFAULT_OPTIONS = {
    createEmbed: undefined,
    src: undefined,
    title: undefined,
    message: 'To display this content you need to accept third-party cookies.',
    buttonLabel: 'Accept and show content',
    autoRenderPlaceholder: true,
    onRender: undefined,
};

/**
 * Consent gate for a single embed container.
 *
 * @extends EventTarget
 * @fires ConsentGate#render  When the embed is created (not for the silent
 *                            render performed by the constructor).
 * @fires ConsentGate#revoke  When consent is revoked and the placeholder restored.
 */
export class ConsentGate extends EventTarget {
    /** @type {HTMLElement} */
    #container;

    /** @type {ConsentGateOptions} */
    #options;

    /** @type {Element|null} Kept alive across renders so revoke() can restore it. */
    #placeholder = null;

    /** @type {Element|null} */
    #button = null;

    /** @type {Element|null} */
    #embed = null;

    /** @type {boolean} */
    #rendered = false;

    /** @type {(() => void)|null} */
    #handleClick = null;

    /**
     * @param {string|Element} target Container element, or a selector / id resolving to it.
     * @param {ConsentGateOptions} options
     * @throws {Error} If the target cannot be resolved or the options are incomplete.
     */
    constructor(target, options = {}) {
        super();

        const container = resolveElement(target);
        if (!container) {
            throw new Error(`ConsentGate: no element found for target "${String(target)}"`);
        }
        if (!options.storageKey) {
            throw new Error('ConsentGate: the `storageKey` option is required');
        }
        if (!options.createEmbed && !options.src) {
            throw new Error('ConsentGate: pass either `createEmbed` or `src`');
        }

        this.#container = /** @type {HTMLElement} */ (container);
        this.#options = { ...DEFAULT_OPTIONS, ...options };

        this.#preparePlaceholder();

        const key = this.#options.storageKey;
        if (!registry.has(key)) {
            registry.set(key, new Set());
        }
        registry.get(key).add(this);

        // Silent so that consumers are not called before they had a
        // chance to subscribe; `onRender` runs anyway (it is already
        // available through the options).
        if (this.isGranted) {
            this.#renderEmbed({ silent: true });
        }
    }

    /** @returns {HTMLElement} The container element. */
    get element() {
        return this.#container;
    }

    /** @returns {string} The consent key of this gate's group. */
    get storageKey() {
        return this.#options.storageKey;
    }

    /** @returns {boolean} Whether consent for this gate's key is currently stored. */
    get isGranted() {
        return readConsent(this.#options.storageKey) === CONSENT_ACCEPTED;
    }

    /**
     * Stores the consent and renders every gate of the group, exactly
     * as if the visitor had clicked this gate's placeholder button.
     */
    accept() {
        ConsentGate.grant(this.#options.storageKey);
    }

    /**
     * Re-creates the embed in place (e.g. after a breakpoint change
     * that alters the URL built by `createEmbed`). No-op when consent
     * has not been granted or the embed is not rendered yet.
     */
    refresh() {
        if (!this.isGranted || !this.#rendered) {
            return;
        }
        this.#embed?.remove();
        this.#embed = null;
        this.#rendered = false;
        this.#renderEmbed({ silent: true });
    }

    /**
     * Removes the listeners the instance added and takes the gate out
     * of its consent group. The DOM is left as it is. Call it before
     * dropping the container.
     */
    destroy() {
        if (this.#button && this.#handleClick) {
            this.#button.removeEventListener('click', this.#handleClick);
        }
        const group = registry.get(this.#options.storageKey);
        group?.delete(this);
        if (group?.size === 0) {
            registry.delete(this.#options.storageKey);
        }
    }

    /**
     * Grants consent for a key and renders every live gate of that
     * group. Meant to be called from the site cookie banner ("Accept
     * all") as well.
     *
     * @param {string} storageKey
     */
    static grant(storageKey) {
        writeConsent(storageKey);
        registry.get(storageKey)?.forEach((gate) => gate.#renderEmbed());
    }

    /**
     * Clears the stored consent for a key, removes the embeds of the
     * group and restores their placeholders. Meant to be called from
     * a "manage preferences" control.
     *
     * @param {string} storageKey
     */
    static revoke(storageKey) {
        clearConsent(storageKey);
        registry.get(storageKey)?.forEach((gate) => gate.#restorePlaceholder());
    }

    /**
     * @param {string} storageKey
     * @returns {boolean} Whether consent for the key is currently stored.
     */
    static isGranted(storageKey) {
        return readConsent(storageKey) === CONSENT_ACCEPTED;
    }

    /**
     * Finds (or builds) the placeholder and wires its consent button.
     * Markup already present in the container wins over the generated
     * one, so i18n systems can keep owning the texts.
     */
    #preparePlaceholder() {
        let placeholder = this.#container.querySelector('.consent-gate-placeholder');

        if (!placeholder && this.#options.autoRenderPlaceholder) {
            placeholder = this.#buildPlaceholder();
            this.#container.appendChild(placeholder);
        }
        this.#placeholder = placeholder;

        const button = placeholder?.querySelector('.consent-gate-btn') ?? null;
        this.#button = button;
        if (!button) {
            return;
        }

        if (button instanceof HTMLButtonElement && !button.hasAttribute('type')) {
            // Without this a button inside a <form> submits it.
            button.type = 'button';
        }
        this.#handleClick = () => this.accept();
        button.addEventListener('click', this.#handleClick);
    }

    /**
     * Builds the default placeholder from the `message` and
     * `buttonLabel` options.
     *
     * @returns {Element}
     */
    #buildPlaceholder() {
        const placeholder = document.createElement('div');
        placeholder.className = 'consent-gate-placeholder';

        const text = document.createElement('p');
        text.className = 'consent-gate-text';
        text.textContent = this.#options.message;

        const button = document.createElement('button');
        button.className = 'consent-gate-btn';
        button.type = 'button';
        button.textContent = this.#options.buttonLabel;

        placeholder.appendChild(text);
        placeholder.appendChild(button);
        return placeholder;
    }

    /**
     * Builds the embed via the configured factory (or the built-in
     * iframe one) and swaps the placeholder for it. Idempotent: a
     * gate that is already rendered stays untouched, which is what
     * makes group-wide `grant` calls safe.
     *
     * @param {{ silent?: boolean }} [config]
     */
    #renderEmbed({ silent = false } = {}) {
        if (this.#rendered) {
            return;
        }

        if (this.#placeholder?.isConnected) {
            this.#placeholder.remove();
        }

        const embed = this.#options.createEmbed
            ? this.#options.createEmbed(this.#container, this)
            : this.#buildDefaultIframe();
        if (!(embed instanceof Element)) {
            throw new Error('ConsentGate: `createEmbed` must return the embed element');
        }

        this.#container.appendChild(embed);
        this.#embed = embed;
        this.#rendered = true;

        this.#options.onRender?.(this.#container, this);
        if (!silent) {
            this.#emit('render');
        }
    }

    /**
     * Built-in factory used when only `src` is configured: a lazy
     * iframe with the usual privacy-conscious defaults.
     *
     * @returns {HTMLIFrameElement}
     */
    #buildDefaultIframe() {
        const iframe = document.createElement('iframe');
        iframe.src = this.#options.src;
        iframe.className = 'consent-gate-iframe';
        iframe.loading = 'lazy';
        iframe.referrerPolicy = 'no-referrer-when-downgrade';
        iframe.allowFullscreen = true;
        if (this.#options.title) {
            iframe.title = this.#options.title;
        }
        return iframe;
    }

    /**
     * Undoes a render: removes the embed and puts the placeholder
     * back, with its button still wired. No-op when nothing is
     * rendered.
     */
    #restorePlaceholder() {
        if (!this.#rendered) {
            return;
        }
        this.#embed?.remove();
        this.#embed = null;
        this.#rendered = false;
        if (this.#placeholder) {
            this.#container.appendChild(this.#placeholder);
        }
        this.#emit('revoke');
    }

    /**
     * Emits the same change on the instance and, prefixed, on the DOM
     * node — so consumers can subscribe wherever it suits them.
     *
     * @param {'render'|'revoke'} type
     */
    #emit(type) {
        const detail = { storageKey: this.#options.storageKey, gate: this };
        this.dispatchEvent(new CustomEvent(type, { detail }));
        this.#container.dispatchEvent(new CustomEvent(`consent-gate:${type}`, { detail, bubbles: true }));
    }
}

export default ConsentGate;
