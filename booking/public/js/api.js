/*
 * api.js — all HTTP calls, one function per endpoint. No other logic.
 *
 * Every endpoint of a venue is called under the venue's prefix
 * (tenantPath, see tenant.js); sign-in and sign-out live at the root of the
 * deployment, the username leads to the venue.
 */
import { tenantPath } from './tenant.js';

/**
 * fetch + JSON parsing with uniform error handling.
 * @param {string} url
 * @param {RequestInit} [options]
 * @returns {Promise<any>} parsed JSON body on 2xx
 * @throws {Error} message = server error CODE (translate it with "error.<code>"); carries `status`
 */
async function requestJson(url, options = {}) {
    const settings = { ...options };
    if (settings.body !== undefined) settings.headers = { 'Content-Type': 'application/json', ...(settings.headers ?? {}) };
    let response;
    try {
        response = await fetch(url, settings);
    } catch {
        throw new Error('network');
    }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
        const error = new Error(body.error ?? 'generic');
        error.status = response.status;
        if (body.slots) error.slots = body.slots;
        throw error;
    }
    return body;
}

/**
 * @param {string} url
 * @param {unknown} [body] - JSON body, omitted for bare POSTs
 * @returns {Promise<any>}
 */
function postJson(url, body) {
    return requestJson(url, { method: 'POST', body: JSON.stringify(body ?? {}) });
}

/**
 * @returns {Promise<{type: string, name: string, defaultLang: string, accent: string|null, facility: object, restaurant: {lunch: {open: string, close: string}, dinner: {open: string, close: string}, stepMinutes: number}, privacy: {controller: string, address: string, email: string, retentionDays: number, since: string}, legal: {name: string, address: string, phone: string, email: string, vat: string, conditionsUrl: string|null, conditionsText: string}, processor: {name: string, email: string}}>}
 */
export function fetchConfig() {
    return requestJson(tenantPath('/api/config'));
}

/**
 * Who runs the deployment (root legal page, no venue).
 * @returns {Promise<{name: string, address: string, email: string, vat: string}>}
 */
export function fetchLegal() {
    return requestJson('/api/legal');
}

/**
 * @param {string} checkIn - 'YYYY-MM-DD'
 * @param {string} checkOut - 'YYYY-MM-DD'
 * @param {number} [excludeRequestId] - booking left out of the count (the one being edited), 0 for none
 * @returns {Promise<{rooms: {name: string, max_guests: number, quantity: number, available: number}[]}>}
 */
export function fetchAvailability(checkIn, checkOut, excludeRequestId = 0) {
    const stay = `check_in=${encodeURIComponent(checkIn)}&check_out=${encodeURIComponent(checkOut)}`;
    // Editing a booking (admin): its own room must count as free, which only the admin endpoint can do.
    if (excludeRequestId > 0) return requestJson(tenantPath(`/api/admin/availability?${stay}&exclude=${excludeRequestId}`));
    return requestJson(tenantPath(`/api/availability?${stay}`));
}

/**
 * @param {Record<string, unknown>} payload - fields of the hotel or restaurant form
 * @returns {Promise<{id: number, status: string}>}
 */
export function submitRequest(payload) {
    return requestJson(tenantPath('/api/requests'), { method: 'POST', body: JSON.stringify(payload) });
}

/**
 * @param {string} token - personal token from the URL
 * @returns {Promise<object>} the guest view of the request
 */
export function fetchBooking(token) {
    return requestJson(tenantPath(`/api/booking/${encodeURIComponent(token)}`));
}

/**
 * @param {string} token
 * @returns {Promise<{ok: boolean, status: string}>}
 */
export function cancelBooking(token) {
    return requestJson(tenantPath(`/api/booking/${encodeURIComponent(token)}/cancel`), { method: 'POST' });
}

/* -------------------------------------------------------------- admin API */

/**
 * Sign-in at the root of the deployment: the answer names the venue of the user.
 * @param {string} username
 * @param {string} password
 * @returns {Promise<{ok: boolean, slug: string, username: string}>}
 */
export function adminLogin(username, password) {
    return postJson('/api/admin/login', { username, password });
}

/** @returns {Promise<{ok: boolean}>} */
export function adminLogout() {
    return postJson('/api/admin/logout');
}

/** @returns {Promise<{ok: boolean, slug: string, venue: string, username: string}>} 401 when there is no valid session for this venue */
export function adminMe() {
    return requestJson(tenantPath('/api/admin/me'));
}

/**
 * @param {string} currentPassword
 * @param {string} newPassword
 * @returns {Promise<{ok: boolean}>} 401 invalid_credentials, 400 password_too_short | password_too_long | password_breached
 */
export function changePassword(currentPassword, newPassword) {
    return postJson(tenantPath('/api/admin/password'), { current_password: currentPassword, new_password: newPassword });
}

/**
 * @param {'day'|'week'|'month'} view
 * @param {string} date - 'YYYY-MM-DD' inside the interval
 * @returns {Promise<{view: string, date: string, from: string, to: string, items: object[]}>}
 */
export function fetchCalendar(view, date) {
    return requestJson(tenantPath(`/api/admin/calendar?view=${view}&date=${date}`));
}

/**
 * @param {string} [status]
 * @returns {Promise<{status: string, items: object[]}>}
 */
export function fetchRequests(status = 'pending') {
    return requestJson(tenantPath(`/api/admin/requests?status=${status}`));
}

/**
 * @param {number} id
 * @returns {Promise<{ok: boolean, status: string}>}
 */
export function approveRequest(id) {
    return postJson(tenantPath(`/api/admin/requests/${id}/approve`));
}

/**
 * @param {number} id
 * @param {string} reason - optional message to the guest
 * @returns {Promise<{ok: boolean, status: string}>}
 */
export function rejectRequest(id, reason) {
    return postJson(tenantPath(`/api/admin/requests/${id}/reject`), { reason });
}

/**
 * @param {number} id
 * @returns {Promise<{ok: boolean, status: string}>}
 */
export function cancelRequestAdmin(id) {
    return postJson(tenantPath(`/api/admin/requests/${id}/cancel`));
}

/**
 * Hotel: records the deposit received on a confirmed stay.
 * @param {number} id
 * @param {number} amount - euro, below the total of the stay
 * @returns {Promise<{ok: boolean, payment_status: string, item: object}>} item = the updated request
 */
export function recordDeposit(id, amount) {
    return postJson(tenantPath(`/api/admin/requests/${id}/deposit`), { amount });
}

/**
 * Hotel: marks a confirmed stay as paid in full.
 * @param {number} id
 * @returns {Promise<{ok: boolean, payment_status: string, item: object}>} item = the updated request
 */
export function markPaid(id) {
    return postJson(tenantPath(`/api/admin/requests/${id}/paid`));
}

/**
 * Hotel: the rows of the CSV export, stays touching the range (pending ones excluded).
 * @param {string} from - 'YYYY-MM-DD'
 * @param {string} to - 'YYYY-MM-DD', not before `from`
 * @returns {Promise<{from: string, to: string, items: object[]}>}
 */
export function fetchExport(from, to) {
    return requestJson(tenantPath(`/api/admin/export?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`));
}

/**
 * Direct booking by the venue, born approved.
 * @param {Record<string, unknown>} payload - fields of the hotel, restaurant or facility form
 * @returns {Promise<{id: number, status: string}>}
 */
export function createBooking(payload) {
    return postJson(tenantPath('/api/admin/bookings'), payload);
}

/**
 * Edits a pending or approved booking: same fields as createBooking, plus
 * `notify` (false to skip the email to the guest).
 * @param {number} id
 * @param {Record<string, unknown>} payload
 * @returns {Promise<{ok: boolean, changed: string[], item: object}>} the columns that changed and the booking as it is now
 */
export function updateBooking(id, payload) {
    return requestJson(tenantPath(`/api/admin/requests/${id}`), { method: 'PATCH', body: JSON.stringify(payload) });
}

/* ------------------------------------------------------------- rooms API */

/**
 * @typedef {object} RoomPayload
 * @property {string} name
 * @property {number} max_guests
 * @property {number} quantity
 * @property {number} price_per_night - base price, mandatory
 */

/** @returns {Promise<{rooms: {id: number, name: string, max_guests: number, quantity: number, price_per_night: number|null}[]}>} */
export function fetchRooms() {
    return requestJson(tenantPath('/api/admin/rooms'));
}

/**
 * @param {RoomPayload} payload
 * @returns {Promise<{id: number}>}
 */
export function createRoomType(payload) {
    return postJson(tenantPath('/api/admin/rooms'), payload);
}

/**
 * @param {number} id
 * @param {Partial<RoomPayload>} payload - the fields to change
 * @returns {Promise<{ok: boolean, overbooked: number}>} overbooked = rooms short at the busiest future night
 */
export function updateRoomType(id, payload) {
    return requestJson(tenantPath(`/api/admin/rooms/${id}`), { method: 'PATCH', body: JSON.stringify(payload) });
}

/**
 * @param {number} id
 * @returns {Promise<{ok: boolean}>} 409 room_in_use while a future booking names the type
 */
export function deleteRoomType(id) {
    return requestJson(tenantPath(`/api/admin/rooms/${id}`), { method: 'DELETE' });
}

/** @returns {Promise<{items: object[]}>} */
export function fetchRequesters() {
    return requestJson(tenantPath('/api/admin/requesters'));
}

/**
 * @param {{name: string, contact_name: string, email: string, phone: string, color?: string}} payload
 * @returns {Promise<{id: number, access_link: string}>}
 */
export function createRequester(payload) {
    return postJson(tenantPath('/api/admin/requesters'), payload);
}

/**
 * @param {number} id
 * @param {Record<string, unknown>} payload - the fields to change
 * @returns {Promise<{ok: boolean}>}
 */
export function updateRequester(id, payload) {
    return requestJson(tenantPath(`/api/admin/requesters/${id}`), { method: 'PATCH', body: JSON.stringify(payload) });
}

/**
 * @param {number} id
 * @param {'suspend'|'reactivate'|'regenerate-link'|'send-link'} action
 * @returns {Promise<{ok: boolean, access_link?: string, slots_freed?: number, requests_cancelled?: number}>}
 */
export function requesterAction(id, action) {
    return postJson(tenantPath(`/api/admin/requesters/${id}/${action}`));
}

/* ---------------------------------------------------------- requester API */

/** @returns {Promise<{id: number, name: string, contact_name: string, email: string, phone: string|null, color: string}>} 401 without a session */
export function requesterMe() {
    return requestJson(tenantPath('/api/requester/me'));
}

/** @returns {Promise<{ok: boolean}>} */
export function requesterLogout() {
    return postJson(tenantPath('/api/requester/logout'));
}

/**
 * @param {'day'|'week'|'month'} view
 * @param {string} date - 'YYYY-MM-DD'
 * @returns {Promise<{from: string, to: string, items: object[]}>} approved bookings of everybody plus own pending ones
 */
export function fetchRequesterCalendar(view, date) {
    return requestJson(tenantPath(`/api/requester/calendar?view=${view}&date=${date}`));
}

/** @returns {Promise<{items: object[]}>} the caller's own requests */
export function fetchMyRequests() {
    return requestJson(tenantPath('/api/requester/requests'));
}

/**
 * @param {{date: string, start_time: string, end_time: string, notes?: string}} payload
 * @returns {Promise<{id: number, status: string}>}
 */
export function submitFacilityRequest(payload) {
    return postJson(tenantPath('/api/requester/requests'), payload);
}

/**
 * @param {number} id
 * @returns {Promise<{ok: boolean, status: string}>}
 */
export function cancelMyRequest(id) {
    return postJson(tenantPath(`/api/requester/requests/${id}/cancel`));
}

/* ---------------------------------------------------------- pricing API */

/**
 * @param {string} roomType
 * @param {string} checkIn - 'YYYY-MM-DD'
 * @param {string} checkOut - 'YYYY-MM-DD'
 * @returns {Promise<{priced: boolean, nights?: {date: string, price: number}[], subtotal?: number, discount_percent?: number, discount_amount?: number, total?: number}>}
 */
export function fetchQuote(roomType, checkIn, checkOut) {
    return requestJson(tenantPath(`/api/quote?room_type=${encodeURIComponent(roomType)}&check_in=${encodeURIComponent(checkIn)}&check_out=${encodeURIComponent(checkOut)}`));
}

/** @returns {Promise<{base: {room_type: string, price_per_night: number|null}[], periods: object[], discounts: object[]}>} */
export function fetchPricing() {
    return requestJson(tenantPath('/api/admin/pricing'));
}

/**
 * @param {{room_type: string, date_from: string, date_to: string, price_per_night: number, label?: string}} payload
 * @returns {Promise<{id: number}>}
 */
export function createPeriod(payload) {
    return postJson(tenantPath('/api/admin/pricing/periods'), payload);
}

/**
 * @param {number} id
 * @returns {Promise<{ok: boolean}>}
 */
export function deletePeriod(id) {
    return requestJson(tenantPath(`/api/admin/pricing/periods/${id}`), { method: 'DELETE' });
}

/**
 * Price calendar: the nightly price of one room type on one day.
 * @param {string} day - 'YYYY-MM-DD'
 * @param {string} roomType
 * @param {number|null} price - null brings the day back to the base price
 * @returns {Promise<{ok: boolean}>}
 */
export function setDayPrice(day, roomType, price) {
    return requestJson(tenantPath(`/api/admin/pricing/days/${encodeURIComponent(day)}`), { method: 'PUT', body: JSON.stringify({ room_type: roomType, price_per_night: price }) });
}

/**
 * @param {number} minNights
 * @param {number} percent
 * @returns {Promise<{id: number}>}
 */
export function createDiscount(minNights, percent) {
    return postJson(tenantPath('/api/admin/pricing/discounts'), { min_nights: minNights, percent });
}

/**
 * @param {number} id
 * @returns {Promise<{ok: boolean}>}
 */
export function deleteDiscount(id) {
    return requestJson(tenantPath(`/api/admin/pricing/discounts/${id}`), { method: 'DELETE' });
}
