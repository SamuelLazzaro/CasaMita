/*
 * privacy.js — entry point of the Privacy & Cookie Policy page. The page
 * is static (no hero, no off-canvas nav, no booking form), so only the
 * behaviours shared with the one-page are wired here.
 */

import { initCookieBanner } from "./cookie-banner.js";
import { initI18n, toggleLanguage } from "./i18n.js";
import { initTapFeedback } from "./tap-feedback.js";
import { initFooterYear } from "./ui.js";

// first, so its capture-phase click listener runs before every other one
initTapFeedback();

initI18n();
initFooterYear();
initCookieBanner();

document.getElementById("fab-lang").addEventListener("click", toggleLanguage);
