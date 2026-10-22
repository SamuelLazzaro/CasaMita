/* ═══════════════════════════════════════════════════════════
   Phone input — country calling code select + national number

   A phone field in two parts: a native <select> with one option
   per country ("IT +39", "FR +33", ...) and an <input type="tel">
   for the national number, typed without the calling code. The
   value handed to the form is the two joined in E.164 style with
   a space after the code: "+39 3331234567". One column in the
   database, no separate country field.

   Why a native <select>: it is accessible, works with the
   keyboard (type "FR" to jump) and renders the same on every
   platform. Emoji flags are not drawn on Windows (Chrome and
   Edge show the two letters instead), so the options carry the
   ISO code and the calling code as plain text. The label of
   each option is configurable (`formatLabel`), for instance to
   show the country name through Intl.DisplayNames.

   The component generates no static markup: wrapper, select,
   field and their attributes are written in the HTML (see the
   README for the snippet). The only thing the JS writes into
   the DOM is the list of <option>s, which is data, not markup:
   240 entries repeated in every form would be unmaintainable.
   The default option is flagged `defaultSelected`, so a native
   form.reset() brings the select back by itself.

   How the full number reaches the form: on the `formdata` event
   of the form (fired by `new FormData(form)` and by a classic
   submit) the component replaces the entry of the field with
   the joined value. Consumers that read FormData keep working
   unchanged; others can read the `value` getter.

   A number typed or pasted with its own international prefix
   ("+39 333..." or "0039 333...") is split on the fly: the
   calling code moves to the select, the field keeps the rest.
   Reading a stored value back works the same way (`setValue`).
   Calling codes are prefix-free (no code is the start of
   another one), so the split is never ambiguous; when several
   territories share a code (+1, +44, +7, ...) the entry flagged
   `main` in the country list is selected.

   The national number is stored as typed: trunk prefixes (the
   leading "0" of Italian landlines, which Italy keeps after the
   code; the "0" of UK numbers, which the UK drops) are the
   caller's business, the component knows no per-country rule.

   Two ways to listen, both emitted on every user change:
     - on the instance:  phone.addEventListener('change', fn)
     - on the DOM node:  wrapper.addEventListener('phone-input:change', fn)
   ═══════════════════════════════════════════════════════════ */

import { PHONE_COUNTRIES } from './phone-countries.js';

/** @typedef {import('./phone-countries.js').PhoneCountry} PhoneCountry */

/**
 * @typedef {Object} PhoneInputOptions
 * @property {string}         [wrapperClass='phone-input']          Class of the element wrapping select and field. Must match the CSS.
 * @property {string}         [countryClass='phone-input-country']  Class of the select. Must match the CSS.
 * @property {string}         [defaultCountry]                      ISO code selected at start and after a form reset. Falls back to `data-default-country` on the wrapper, then to "IT".
 * @property {PhoneCountry[]} [countries=PHONE_COUNTRIES]           The list of countries, in the order of the options.
 * @property {(country: PhoneCountry) => string} [formatLabel]      Text of each option. Default: "IT +39".
 * @property {string}         [fieldName]                           Name under which the full number is written in the FormData. Default: the `name` of the field; with no name the FormData is left alone.
 * @property {(value: string) => void} [onChange]                   Convenience callback, called after every user change with the full number.
 */

/** @type {Required<Omit<PhoneInputOptions, 'defaultCountry'|'fieldName'|'onChange'>> & Pick<PhoneInputOptions, 'defaultCountry'|'fieldName'|'onChange'>} */
const DEFAULT_OPTIONS = {
    wrapperClass: 'phone-input',
    countryClass: 'phone-input-country',
    defaultCountry: undefined,
    countries: PHONE_COUNTRIES,
    formatLabel: (country) => `${country.iso} +${country.code}`,
    fieldName: undefined,
    onChange: undefined,
};

/** ISO code used when neither the options nor the markup name one. */
const FALLBACK_COUNTRY = 'IT';

/** Longest calling code in digits (ITU-T E.164 codes have 1 to 3 digits). */
const MAX_CODE_LENGTH = 3;

/** International prefixes accepted at the start of a number: "+" or the "00" dial-out code. */
const INTERNATIONAL_PREFIX = /^(?:\+|00)/;

/** Separators tolerated between the calling code and the national number. */
const LEADING_SEPARATORS = /^[\s().-]+/;

/**
 * The country to select for a calling code: the one flagged `main` when
 * several share it, otherwise the only one.
 *
 * @param {string} code Digits only, no "+".
 * @param {PhoneCountry[]} [countries]
 * @returns {PhoneCountry|null} null when no country has that code.
 */
export function countryForCode(code, countries = PHONE_COUNTRIES) {
    const candidates = countries.filter((country) => country.code === code);
    if (candidates.length === 0) {
        return null;
    }
    return candidates.find((country) => country.main === true) ?? candidates[0];
}

/**
 * Splits a number that starts with an international prefix into its
 * country and national part. Longest match first; calling codes are
 * prefix-free, so at most one length matches anyway.
 *
 *   "+39 333 1234567"  → { country: IT, national: "333 1234567" }
 *   "0044 20 7946 0958" → { country: GB, national: "20 7946 0958" }
 *   "333 1234567"      → null (no international prefix)
 *   "+999 1"           → null (unknown code)
 *
 * @param {string} value
 * @param {PhoneCountry[]} [countries]
 * @returns {{country: PhoneCountry, national: string}|null}
 */
export function splitInternationalNumber(value, countries = PHONE_COUNTRIES) {
    const trimmed = value.trim();
    const prefixMatch = INTERNATIONAL_PREFIX.exec(trimmed);
    if (prefixMatch === null) {
        return null;
    }
    const afterPrefix = trimmed.slice(prefixMatch[0].length);
    for (let length = MAX_CODE_LENGTH; length >= 1; length--) {
        const candidate = afterPrefix.slice(0, length);
        if (!/^\d+$/.test(candidate)) {
            continue;
        }
        const country = countryForCode(candidate, countries);
        if (country === null) {
            continue;
        }
        const national = afterPrefix.slice(length).replace(LEADING_SEPARATORS, '');
        return { country, national };
    }
    return null;
}

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
 * Country select + national number field.
 *
 * @extends EventTarget
 * @fires PhoneInput#change
 */
export class PhoneInput extends EventTarget {
    /** @type {HTMLInputElement} */
    #input;

    /** @type {HTMLElement} */
    #wrapper;

    /** @type {HTMLSelectElement} */
    #select;

    /** @type {PhoneInputOptions} */
    #options;

    /** @type {PhoneCountry[]} */
    #countries;

    /** @type {string} ISO code */
    #defaultCountry;

    /** @type {() => void} */
    #handleInput;

    /** @type {() => void} */
    #handleSelectChange;

    /** @type {(event: FormDataEvent) => void} */
    #handleFormData;

    /**
     * @param {string|Element} target The national number <input>, or a selector / id resolving to it.
     * @param {PhoneInputOptions} [options]
     * @throws {Error} If the target is not an input, wrapper or select are missing from the markup, or the default country is unknown.
     */
    constructor(target, options = {}) {
        super();

        const element = resolveElement(target);
        if (!(element instanceof HTMLInputElement)) {
            throw new Error(`PhoneInput: no <input> found for target "${String(target)}"`);
        }

        this.#input = element;
        this.#options = { ...DEFAULT_OPTIONS, ...options };
        this.#countries = this.#options.countries;

        this.#findMarkup();
        this.#defaultCountry = this.#resolveDefaultCountry();
        this.#fillOptions();

        this.#handleInput = () => {
            this.#absorbInternationalPrefix();
            this.#emit();
        };
        this.#handleSelectChange = () => this.#emit();
        this.#handleFormData = (event) => {
            const fieldName = this.#options.fieldName ?? this.#input.name;
            if (fieldName !== '') {
                event.formData.set(fieldName, this.value);
            }
        };

        this.#input.addEventListener('input', this.#handleInput);
        this.#select.addEventListener('change', this.#handleSelectChange);
        if (this.#input.form) {
            this.#input.form.addEventListener('formdata', this.#handleFormData);
        }
    }

    /** @returns {HTMLInputElement} The national number field. */
    get input() {
        return this.#input;
    }

    /** @returns {HTMLSelectElement} The country select. */
    get select() {
        return this.#select;
    }

    /** @returns {HTMLElement} The wrapper. */
    get element() {
        return this.#wrapper;
    }

    /** @returns {string} ISO code of the selected country. */
    get country() {
        return this.#select.value;
    }

    /**
     * Selects a country.
     * @param {string} iso ISO 3166-1 alpha-2 code, any case.
     * @throws {Error} If the code is not in the country list.
     */
    set country(iso) {
        const normalised = String(iso).toUpperCase();
        if (!this.#countries.some((country) => country.iso === normalised)) {
            throw new Error(`PhoneInput: unknown country "${String(iso)}"`);
        }
        this.#select.value = normalised;
    }

    /** @returns {PhoneCountry} The selected country entry. */
    get selectedCountry() {
        return this.#countries.find((country) => country.iso === this.#select.value);
    }

    /** @returns {string} The national number as typed, trimmed. */
    get nationalNumber() {
        return this.#input.value.trim();
    }

    /**
     * @returns {string} The full number, "+<code> <national>"; empty when the national number is empty.
     */
    get value() {
        const national = this.nationalNumber;
        if (national === '') {
            return '';
        }
        return `+${this.selectedCountry.code} ${national}`;
    }

    /**
     * Fills the two parts from a stored number. A value with an
     * international prefix is split; anything else goes whole into the
     * field, with the default country selected. Programmatic, like
     * writing `input.value`: emits nothing.
     *
     * @param {string|null|undefined} stored
     */
    setValue(stored) {
        const text = stored === null || stored === undefined ? '' : String(stored);
        const split = splitInternationalNumber(text, this.#countries);
        if (split === null) {
            this.country = this.#defaultCountry;
            this.#input.value = text.trim();
            return;
        }
        this.country = split.country.iso;
        this.#input.value = split.national;
    }

    /** Back to the default country and an empty field. Emits nothing. */
    reset() {
        this.setValue('');
    }

    /**
     * Removes every listener the instance added. The markup and the
     * options are left in place. Call it before dropping the field.
     */
    destroy() {
        this.#input.removeEventListener('input', this.#handleInput);
        this.#select.removeEventListener('change', this.#handleSelectChange);
        if (this.#input.form) {
            this.#input.form.removeEventListener('formdata', this.#handleFormData);
        }
    }

    /**
     * Locates the wrapper (the parent of the field) and the select inside
     * it. Both must already be in the HTML: the component builds nothing,
     * so a missing piece is an authoring error and is reported loudly.
     */
    #findMarkup() {
        const { wrapperClass, countryClass } = this.#options;

        const wrapper = this.#input.parentElement;
        if (wrapper === null || !wrapper.classList.contains(wrapperClass)) {
            throw new Error(`PhoneInput: the <input> must be wrapped in an element with class "${wrapperClass}"`);
        }
        this.#wrapper = wrapper;

        const select = wrapper.querySelector(`.${countryClass}`);
        if (!(select instanceof HTMLSelectElement)) {
            throw new Error(`PhoneInput: no <select class="${countryClass}"> inside the wrapper`);
        }
        this.#select = select;
    }

    /**
     * Option, then markup (`data-default-country`), then the fallback.
     * @returns {string} ISO code, upper case.
     * @throws {Error} If the resolved code is not in the country list.
     */
    #resolveDefaultCountry() {
        const fromMarkup = this.#wrapper.dataset.defaultCountry;
        const chosen = String(this.#options.defaultCountry ?? fromMarkup ?? FALLBACK_COUNTRY).toUpperCase();
        if (!this.#countries.some((country) => country.iso === chosen)) {
            throw new Error(`PhoneInput: default country "${chosen}" is not in the country list`);
        }
        return chosen;
    }

    /**
     * Writes one <option> per country. The default one is `defaultSelected`,
     * which is what a native form.reset() restores.
     */
    #fillOptions() {
        const options = this.#countries.map((country) => {
            const option = document.createElement('option');
            option.value = country.iso;
            option.textContent = this.#options.formatLabel(country);
            option.defaultSelected = country.iso === this.#defaultCountry;
            return option;
        });
        this.#select.replaceChildren(...options);
    }

    /**
     * A number typed or pasted with "+code" or "00code" in front: the
     * code moves to the select, the field keeps the national part.
     * Nothing happens until the digits form a known code, so typing
     * "+3" then "9" is absorbed only at "+39".
     */
    #absorbInternationalPrefix() {
        const split = splitInternationalNumber(this.#input.value, this.#countries);
        if (split === null) {
            return;
        }
        this.country = split.country.iso;
        this.#input.value = split.national;
    }

    /**
     * Emits the change on the instance and, prefixed, on the wrapper —
     * so consumers can subscribe wherever it suits them.
     */
    #emit() {
        const detail = { value: this.value, country: this.country, phoneInput: this };
        this.dispatchEvent(new CustomEvent('change', { detail }));
        this.#wrapper.dispatchEvent(new CustomEvent('phone-input:change', { detail, bubbles: true }));
        this.#options.onChange?.(detail.value);
    }
}

export default PhoneInput;
