/*
 * booking.js — room booking request without a backend.
 *
 * The form never talks to a server: on submit it composes a `mailto:`
 * URL whose subject and body contain the request (dates, room type,
 * contact details) and opens it, so the visitor's own email client
 * takes over. No personal data is stored or transmitted by the site
 * itself. The mailto target and the localised strings live in
 * constants.js / i18n.js, so a future switch to a form service only
 * touches this module.
 */

import { BOOKING_EMAIL } from "./constants.js";
import { translate } from "./i18n.js";

/**
 * Check that check-out happens after check-in.
 * Date inputs use the ISO yyyy-mm-dd format, so plain string
 * comparison follows chronological order and no Date parsing is needed.
 * @param {string} checkin - check-in date, "yyyy-mm-dd"
 * @param {string} checkout - check-out date, "yyyy-mm-dd"
 * @returns {boolean} true when the stay is at least one night long
 */
function areDatesValid(checkin, checkout) {
    return checkin < checkout;
}

/**
 * Build the localised plain-text body of the request email.
 * @param {FormData} data - the submitted form fields
 * @returns {string} email body, one "Label: value" line per field
 */
function buildEmailBody(data) {
    const lines = [
        `${translate("booking.name")}: ${data.get("name")}`,
        `${translate("booking.email")}: ${data.get("email")}`,
        `${translate("booking.phone")}: ${data.get("phone")}`,
        `${translate("booking.checkin")}: ${data.get("checkin")}`,
        `${translate("booking.checkout")}: ${data.get("checkout")}`,
        `${translate("booking.room")}: ${data.get("room")}`
    ];

    const message = String(data.get("message") ?? "").trim();
    if (message !== "") {
        lines.push("", message);
    }

    return lines.join("\n");
}

/**
 * Wire the booking form: validate the dates, then hand the request
 * over to the visitor's email client via mailto.
 * @returns {void}
 */
export function initBookingForm() {
    const form = document.getElementById("booking-form");
    const dateError = document.getElementById("booking-date-error");
    const checkinField = form.elements.namedItem("checkin");
    const checkoutField = form.elements.namedItem("checkout");

    // hide the error as soon as the visitor touches the dates again
    const clearError = () => dateError.classList.remove("is-visible");
    checkinField.addEventListener("input", clearError);
    checkoutField.addEventListener("input", clearError);

    form.addEventListener("submit", (event) => {
        // always stay on the page: the "submission" is the mailto below
        event.preventDefault();

        const data = new FormData(form);
        if (!areDatesValid(String(data.get("checkin")), String(data.get("checkout")))) {
            dateError.classList.add("is-visible");
            dateError.scrollIntoView({ block: "nearest", behavior: "smooth" });
            return;
        }

        const subject = encodeURIComponent(translate("booking.subject"));
        const body = encodeURIComponent(buildEmailBody(data));
        window.location.href = `mailto:${BOOKING_EMAIL}?subject=${subject}&body=${body}`;
    });
}
