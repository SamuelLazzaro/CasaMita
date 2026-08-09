/*
 * where-map.js — consent-gated Google Maps embed of the "Dove siamo"
 * section. The HTML ships with a visible placeholder only (no iframe):
 * ConsentGate creates the iframe after the explicit consent, stored under
 * MAPS_CONSENT_STORAGE_KEY. The cookie banner grants/revokes the same key
 * (see cookie-banner.js), so both consent entry points stay in sync.
 */

import { ConsentGate } from "./consent-gate.js";
import { MAPS_CONSENT_STORAGE_KEY, MAPS_EMBED_URL } from "./constants.js";
import { translate } from "./i18n.js";

/**
 * Gate the "Dove siamo" map behind the Google Maps consent.
 * Must run after initI18n() so the iframe title is localised.
 * @returns {void}
 */
export function initWhereMap() {
    const mapContainer = document.getElementById("where-map");
    if (mapContainer === null) {
        // pages other than the one-page (e.g. menu.html) have no map;
        // the ConsentGate constructor throws on a missing container
        return;
    }
    new ConsentGate(mapContainer, {
        storageKey: MAPS_CONSENT_STORAGE_KEY,
        src: MAPS_EMBED_URL,
        title: translate("where.mapTitle")
    });
}
