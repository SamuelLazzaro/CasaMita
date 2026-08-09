/*
 * carousel.js — the "dishes" photo carousel of the restaurant section.
 *
 * One slide is visible at a time: the track is a flex row of full-width
 * slides moved with translateX(-index * 100%), wrapping around at both
 * ends. Visitors navigate with the arrows, the dots (one per slide,
 * generated here) and horizontal swipes; on top of that the carousel
 * auto-rotates every CAROUSEL_AUTOPLAY_MS.
 *
 * Autoplay etiquette (WCAG 2.2.2 pause, stop, hide):
 *   - paused while the pointer hovers the carousel or the keyboard
 *     focus is inside it (arrows, dots);
 *   - a manual action (arrow, dot, swipe) stops the rotation, which
 *     resumes only after CAROUSEL_RESUME_MS with no further input;
 *   - never started when the visitor prefers reduced motion;
 *   - stopped while the page sits in a background tab.
 * The viewport is a polite live region only while the rotation is
 * stopped, so screen readers are not flooded by the autoplay.
 */

import {
    CAROUSEL_AUTOPLAY_MS,
    CAROUSEL_RESUME_MS,
    CAROUSEL_SWIPE_MIN_PX
} from "./constants.js";
import { translate } from "./i18n.js";

/**
 * Wire the dishes carousel: dots, arrows, swipe and autoplay.
 * @returns {void}
 */
export function initDishesCarousel() {
    const carousel = document.getElementById("dishes-carousel");
    if (carousel === null) {
        // pages without the restaurant section (e.g. menu.html) have no carousel
        return;
    }

    const viewport = carousel.querySelector(".carousel-viewport");
    const track = carousel.querySelector(".carousel-track");
    const slides = Array.from(track.children);
    const prevButton = carousel.querySelector(".carousel-arrow--prev");
    const nextButton = carousel.querySelector(".carousel-arrow--next");
    const dotsContainer = carousel.querySelector(".carousel-dots");

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    /** @type {number} index of the slide currently in the viewport */
    let currentIndex = 0;

    /** @type {number|null} setInterval id while the autoplay is rotating */
    let autoplayId = null;

    /** @type {number|null} setTimeout id waiting to resume after a manual action */
    let resumeTimerId = null;

    /** @type {boolean} true while the pointer hovers the carousel */
    let isHovered = false;

    /** @type {boolean} true while the keyboard focus is inside the carousel */
    let hasFocusInside = false;

    /* ----- dots, one per slide ----- */

    /** @type {HTMLButtonElement[]} */
    const dots = slides.map((slide, slideIndex) => {
        const dot = document.createElement("button");
        dot.type = "button";
        dot.className = "carousel-dot";
        /*
         * Each dot is labelled with the description of the photo it leads
         * to, reusing the translation key of the slide image's alt text:
         * this way the language switch re-translates the dots through the
         * usual data attribute scan, numbers-in-strings are avoided and
         * no extra keys are needed.
         */
        const altKey = slide.querySelector("img").dataset.i18nAlt;
        dot.dataset.i18nLabel = altKey;
        dot.setAttribute("aria-label", translate(altKey));
        dot.addEventListener("click", () => moveManually(slideIndex));
        dotsContainer.appendChild(dot);
        return dot;
    });

    /* ----- rendering ----- */

    /**
     * Slide the track to `index` (wrapping around both ends) and update
     * the accessibility state of slides and dots.
     * @param {number} index - target slide index, may be out of range
     * @returns {void}
     */
    function showSlide(index) {
        currentIndex = (index + slides.length) % slides.length;
        track.style.transform = `translateX(-${currentIndex * 100}%)`;

        slides.forEach((slide, slideIndex) => {
            slide.setAttribute("aria-hidden", String(slideIndex !== currentIndex));
        });
        dots.forEach((dot, dotIndex) => {
            if (dotIndex === currentIndex) {
                dot.setAttribute("aria-current", "true");
            } else {
                dot.removeAttribute("aria-current");
            }
        });
    }

    /* ----- autoplay ----- */

    /**
     * Start the automatic rotation, unless something vetoes it (reduced
     * motion, pointer/focus on the carousel, already running).
     * @returns {void}
     */
    function startAutoplay() {
        if (prefersReducedMotion || isHovered || hasFocusInside || autoplayId !== null) {
            return;
        }
        autoplayId = setInterval(() => showSlide(currentIndex + 1), CAROUSEL_AUTOPLAY_MS);
        // no polite announcements while auto-rotating: see header comment
        viewport.setAttribute("aria-live", "off");
    }

    /**
     * Stop the automatic rotation and let slide changes be announced.
     * @returns {void}
     */
    function stopAutoplay() {
        clearInterval(autoplayId);
        autoplayId = null;
        viewport.setAttribute("aria-live", "polite");
    }

    /**
     * Restart the autoplay after a hover/focus pause, unless a manual
     * action already scheduled its own delayed resume.
     * @returns {void}
     */
    function resumeUnlessScheduled() {
        if (resumeTimerId === null) {
            startAutoplay();
        }
    }

    /**
     * Handle a manual navigation (arrow, dot or swipe): show the slide,
     * stop the rotation and schedule its resume after an idle interval.
     * @param {number} index - target slide index, may be out of range
     * @returns {void}
     */
    function moveManually(index) {
        showSlide(index);
        stopAutoplay();
        clearTimeout(resumeTimerId);
        resumeTimerId = setTimeout(() => {
            resumeTimerId = null;
            startAutoplay();
        }, CAROUSEL_RESUME_MS);
    }

    /* ----- controls ----- */

    prevButton.addEventListener("click", () => moveManually(currentIndex - 1));
    nextButton.addEventListener("click", () => moveManually(currentIndex + 1));

    carousel.addEventListener("mouseenter", () => {
        isHovered = true;
        stopAutoplay();
    });
    carousel.addEventListener("mouseleave", () => {
        isHovered = false;
        resumeUnlessScheduled();
    });

    carousel.addEventListener("focusin", () => {
        hasFocusInside = true;
        stopAutoplay();
    });
    carousel.addEventListener("focusout", (event) => {
        if (carousel.contains(event.relatedTarget)) {
            return; // focus only moved between the carousel's own controls
        }
        hasFocusInside = false;
        resumeUnlessScheduled();
    });

    /* ----- swipe (touch) ----- */

    let touchStartX = 0;
    let touchStartY = 0;

    viewport.addEventListener("touchstart", (event) => {
        touchStartX = event.changedTouches[0].clientX;
        touchStartY = event.changedTouches[0].clientY;
    }, { passive: true });

    viewport.addEventListener("touchend", (event) => {
        const deltaX = event.changedTouches[0].clientX - touchStartX;
        const deltaY = event.changedTouches[0].clientY - touchStartY;
        // only mostly-horizontal moves long enough to be intentional count
        // as swipes; anything else is a tap or a vertical page scroll
        const isHorizontal = Math.abs(deltaX) > Math.abs(deltaY);
        if (!isHorizontal || Math.abs(deltaX) < CAROUSEL_SWIPE_MIN_PX) {
            return;
        }
        moveManually(deltaX < 0 ? currentIndex + 1 : currentIndex - 1);
    }, { passive: true });

    /* ----- background tab ----- */

    document.addEventListener("visibilitychange", () => {
        if (document.hidden) {
            stopAutoplay();
        } else {
            resumeUnlessScheduled();
        }
    });

    /* ----- initial state ----- */

    showSlide(0);
    startAutoplay();
}
