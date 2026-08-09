/*
 * cookie-banner.js — first-visit cookie banner and consent revocation.
 *
 * The banner ships hidden in the HTML and is shown only when localStorage
 * holds no recorded choice, so it appears once and never again until the
 * consent is revoked. Both buttons carry the same visual weight (EDPB
 * 3/2022: no dark patterns):
 *   - "Accetta tutto"  -> records the choice and grants the Google Maps
 *     consent group, rendering every gated embed at once
 *   - "Solo tecnici"   -> records the choice; technical storage needs no
 *     consent, but recording the refusal keeps the banner from reappearing
 * The persistent cookie FAB is the revocation entry point required by the
 * GDPR: it clears the stored choices, restores the map placeholders and
 * reopens the banner.
 */

import { ConsentGate } from "./consent-gate.js";
import {
    COOKIE_CONSENT_ALL,
    COOKIE_CONSENT_STORAGE_KEY,
    COOKIE_CONSENT_TECHNICAL,
    MAPS_CONSENT_STORAGE_KEY
} from "./constants.js";

/**
 * Tell whether the visitor has already made a banner choice.
 * @returns {boolean} true when a valid choice is stored
 */
function hasStoredChoice() {
    const storedChoice = localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY);
    return storedChoice === COOKIE_CONSENT_ALL || storedChoice === COOKIE_CONSENT_TECHNICAL;
}

/**
 * Wire the cookie banner buttons and the preferences FAB, and show the
 * banner when no choice has been recorded yet.
 * @returns {void}
 */
export function initCookieBanner() {
    const banner = document.getElementById("cookie-banner");
    const acceptAllButton = document.getElementById("cookie-accept-all");
    const technicalOnlyButton = document.getElementById("cookie-technical-only");
    const preferencesFab = document.getElementById("fab-cookie");

    if (!hasStoredChoice()) {
        banner.hidden = false;
    }

    acceptAllButton.addEventListener("click", () => {
        localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, COOKIE_CONSENT_ALL);
        ConsentGate.grant(MAPS_CONSENT_STORAGE_KEY);
        banner.hidden = true;
    });

    technicalOnlyButton.addEventListener("click", () => {
        localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, COOKIE_CONSENT_TECHNICAL);
        banner.hidden = true;
    });

    preferencesFab.addEventListener("click", () => {
        localStorage.removeItem(COOKIE_CONSENT_STORAGE_KEY);
        ConsentGate.revoke(MAPS_CONSENT_STORAGE_KEY);
        banner.hidden = false;
    });
}
