/*
 * main.js — entry point: initialises every module and wires the
 * language FAB. All the behaviour lives in the other modules.
 */

import { initBookingForm } from "./booking.js";
import { initDishesCarousel } from "./carousel.js";
import { initCookieBanner } from "./cookie-banner.js";
import { initI18n, toggleLanguage } from "./i18n.js";
import { initTapFeedback } from "./tap-feedback.js";
import {
    initFooterYear,
    initNav,
    initScrollReveal,
    initTopbar
} from "./ui.js";
import { initWhereMap } from "./where-map.js";

// first, so its capture-phase click listener runs before every other one
initTapFeedback();

initI18n();
initTopbar();
initNav();
initScrollReveal();
initBookingForm();
initDishesCarousel();
initFooterYear();
initCookieBanner();
initWhereMap();

document.getElementById("fab-lang").addEventListener("click", toggleLanguage);
