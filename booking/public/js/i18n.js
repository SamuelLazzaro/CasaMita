/*
 * i18n.js — Italian / English switching.
 *
 * The pages ship in Italian. Every translatable element carries a data
 * attribute pointing to a key of the TRANSLATIONS dictionary; switching
 * language re-renders those elements in place. The choice is persisted in
 * localStorage; without a saved choice the venue's default language (from
 * GET /api/config) applies.
 */
import { DEFAULT_LANG, LANG_STORAGE_KEY, LANGUAGES } from './constants.js';
import { TRANSLATIONS } from './translations.js';

/** @type {string} currently applied language */
let g_currentLang = DEFAULT_LANG;

/** @type {Array<() => void>} callbacks run after every language change (dynamic DOM) */
const g_listeners = [];

/**
 * @param {string|null} value - candidate language code
 * @returns {boolean} true when the dictionary covers it
 */
function isSupported(value) {
    return LANGUAGES.includes(value);
}

/**
 * @returns {string|null} the persisted language, or null when none was chosen yet
 */
function savedLanguage() {
    const saved = localStorage.getItem(LANG_STORAGE_KEY);
    return isSupported(saved) ? saved : null;
}

/**
 * Re-renders every translatable element and the document metadata in `lang`.
 * @param {string} lang - target language
 * @returns {void}
 */
function applyLanguage(lang) {
    const dictionary = TRANSLATIONS[lang];
    const attributeTargets = [['data-i18n', (element, value) => { element.textContent = value; }], ['data-i18n-label', (element, value) => element.setAttribute('aria-label', value)], ['data-i18n-title', (element, value) => element.setAttribute('title', value)], ['data-i18n-placeholder', (element, value) => element.setAttribute('placeholder', value)]];
    for (const [attribute, assign] of attributeTargets) {
        document.querySelectorAll(`[${attribute}]`).forEach((element) => {
            const value = dictionary[element.getAttribute(attribute)];
            if (value !== undefined) assign(element, value);
        });
    }

    document.documentElement.lang = lang;
    const titleKey = document.documentElement.dataset.i18nDocTitle;
    if (titleKey !== undefined && dictionary[titleKey] !== undefined) document.title = dictionary[titleKey];

    // The toggle always shows the language you would switch TO.
    const toggle = document.getElementById('lang-toggle');
    if (toggle !== null) {
        toggle.textContent = lang === 'it' ? 'EN' : 'IT';
        toggle.setAttribute('aria-label', dictionary['a11y.switchLang']);
    }

    g_currentLang = lang;
    for (const listener of g_listeners) listener();
}

/**
 * Looks a string up in the current language; `{name}` placeholders are
 * replaced with the given values. Unknown keys come back as themselves, so
 * a missing translation is visible instead of blank.
 * @param {string} key - flat "section.key"
 * @param {Record<string, string|number>} [values] - placeholder values
 * @returns {string}
 */
export function translate(key, values = {}) {
    const template = TRANSLATIONS[g_currentLang][key] ?? key;
    return template.replace(/\{(\w+)\}/g, (match, name) => (values[name] !== undefined ? String(values[name]) : match));
}

/** @returns {string} the language currently applied */
export function currentLanguage() {
    return g_currentLang;
}

/**
 * Registers a callback for language changes (modules that build DOM at runtime).
 * @param {() => void} listener
 * @returns {void}
 */
export function onLanguageChange(listener) {
    g_listeners.push(listener);
}

/**
 * Switches to the other language and persists the choice.
 * @returns {void}
 */
export function toggleLanguage() {
    const nextLang = g_currentLang === 'it' ? 'en' : 'it';
    localStorage.setItem(LANG_STORAGE_KEY, nextLang);
    applyLanguage(nextLang);
}

/**
 * Applies a language chosen outside this page (the embedding website) without
 * persisting it: the host decides, and its choice must win over the saved one
 * on every load. Unsupported codes are ignored.
 * @param {string} lang - candidate language code
 * @returns {void}
 */
export function setLanguage(lang) {
    if (!isSupported(lang) || lang === g_currentLang) return;
    applyLanguage(lang);
}

/**
 * Applies the saved language, or the venue default when nothing was saved.
 * @param {string} venueDefaultLang - DEFAULT_LANG of the deployment
 * @returns {void}
 */
export function initI18n(venueDefaultLang) {
    const lang = savedLanguage() ?? (isSupported(venueDefaultLang) ? venueDefaultLang : DEFAULT_LANG);
    applyLanguage(lang);
    const toggle = document.getElementById('lang-toggle');
    if (toggle !== null) toggle.addEventListener('click', toggleLanguage);
}
