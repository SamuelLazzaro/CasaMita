/* api.js — all HTTP calls, one function per endpoint. No other logic. */

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
 * @returns {Promise<{type: string, name: string, defaultLang: string, facility: object, restaurant: {lunch: {open: string, close: string}, dinner: {open: string, close: string}, stepMinutes: number}}>}
 */
export function fetchConfig() {
    return requestJson('/api/config');
}

/**
 * @param {string} checkIn - 'YYYY-MM-DD'
 * @param {string} checkOut - 'YYYY-MM-DD'
 * @returns {Promise<{rooms: {name: string, max_guests: number, quantity: number, available: number}[]}>}
 */
export function fetchAvailability(checkIn, checkOut) {
    return requestJson(`/api/availability?check_in=${encodeURIComponent(checkIn)}&check_out=${encodeURIComponent(checkOut)}`);
}

/**
 * @param {Record<string, unknown>} payload - fields of the hotel or restaurant form
 * @returns {Promise<{id: number, status: string}>}
 */
export function submitRequest(payload) {
    return requestJson('/api/requests', { method: 'POST', body: JSON.stringify(payload) });
}

/**
 * @param {string} token - personal token from the URL
 * @returns {Promise<object>} the guest view of the request
 */
export function fetchBooking(token) {
    return requestJson(`/api/booking/${encodeURIComponent(token)}`);
}

/**
 * @param {string} token
 * @returns {Promise<{ok: boolean, status: string}>}
 */
export function cancelBooking(token) {
    return requestJson(`/api/booking/${encodeURIComponent(token)}/cancel`, { method: 'POST' });
}

/* -------------------------------------------------------------- admin API */

/**
 * @param {string} password
 * @returns {Promise<{ok: boolean}>}
 */
export function adminLogin(password) {
    return postJson('/api/admin/login', { password });
}

/** @returns {Promise<{ok: boolean}>} */
export function adminLogout() {
    return postJson('/api/admin/logout');
}

/** @returns {Promise<{ok: boolean}>} 401 when there is no valid session */
export function adminMe() {
    return requestJson('/api/admin/me');
}

/**
 * @param {'day'|'week'|'month'} view
 * @param {string} date - 'YYYY-MM-DD' inside the interval
 * @returns {Promise<{view: string, date: string, from: string, to: string, items: object[]}>}
 */
export function fetchCalendar(view, date) {
    return requestJson(`/api/admin/calendar?view=${view}&date=${date}`);
}

/**
 * @param {string} [status]
 * @returns {Promise<{status: string, items: object[]}>}
 */
export function fetchRequests(status = 'pending') {
    return requestJson(`/api/admin/requests?status=${status}`);
}

/**
 * @param {number} id
 * @returns {Promise<{ok: boolean, status: string}>}
 */
export function approveRequest(id) {
    return postJson(`/api/admin/requests/${id}/approve`);
}

/**
 * @param {number} id
 * @param {string} reason - optional message to the guest
 * @returns {Promise<{ok: boolean, status: string}>}
 */
export function rejectRequest(id, reason) {
    return postJson(`/api/admin/requests/${id}/reject`, { reason });
}

/**
 * @param {number} id
 * @returns {Promise<{ok: boolean, status: string}>}
 */
export function cancelRequestAdmin(id) {
    return postJson(`/api/admin/requests/${id}/cancel`);
}

/**
 * Hotel: records the deposit received on a confirmed stay.
 * @param {number} id
 * @param {number} amount - euro, below the total of the stay
 * @returns {Promise<{ok: boolean, payment_status: string, item: object}>} item = the updated request
 */
export function recordDeposit(id, amount) {
    return postJson(`/api/admin/requests/${id}/deposit`, { amount });
}

/**
 * Hotel: marks a confirmed stay as paid in full.
 * @param {number} id
 * @returns {Promise<{ok: boolean, payment_status: string, item: object}>} item = the updated request
 */
export function markPaid(id) {
    return postJson(`/api/admin/requests/${id}/paid`);
}

/**
 * Direct booking by the venue, born approved.
 * @param {Record<string, unknown>} payload - fields of the hotel, restaurant or facility form
 * @returns {Promise<{id: number, status: string}>}
 */
export function createBooking(payload) {
    return postJson('/api/admin/bookings', payload);
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
    return requestJson('/api/admin/rooms');
}

/**
 * @param {RoomPayload} payload
 * @returns {Promise<{id: number}>}
 */
export function createRoomType(payload) {
    return postJson('/api/admin/rooms', payload);
}

/**
 * @param {number} id
 * @param {Partial<RoomPayload>} payload - the fields to change
 * @returns {Promise<{ok: boolean, overbooked: number}>} overbooked = rooms short at the busiest future night
 */
export function updateRoomType(id, payload) {
    return requestJson(`/api/admin/rooms/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
}

/**
 * @param {number} id
 * @returns {Promise<{ok: boolean}>} 409 room_in_use while a future booking names the type
 */
export function deleteRoomType(id) {
    return requestJson(`/api/admin/rooms/${id}`, { method: 'DELETE' });
}

/** @returns {Promise<{items: object[]}>} */
export function fetchRequesters() {
    return requestJson('/api/admin/requesters');
}

/**
 * @param {{name: string, contact_name: string, email: string, phone: string, color?: string}} payload
 * @returns {Promise<{id: number, access_link: string}>}
 */
export function createRequester(payload) {
    return postJson('/api/admin/requesters', payload);
}

/**
 * @param {number} id
 * @param {Record<string, unknown>} payload - the fields to change
 * @returns {Promise<{ok: boolean}>}
 */
export function updateRequester(id, payload) {
    return requestJson(`/api/admin/requesters/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
}

/**
 * @param {number} id
 * @param {'suspend'|'reactivate'|'regenerate-link'|'send-link'} action
 * @returns {Promise<{ok: boolean, access_link?: string, slots_freed?: number, requests_cancelled?: number}>}
 */
export function requesterAction(id, action) {
    return postJson(`/api/admin/requesters/${id}/${action}`);
}

/* ---------------------------------------------------------- requester API */

/** @returns {Promise<{id: number, name: string, contact_name: string, email: string, phone: string|null, color: string}>} 401 without a session */
export function requesterMe() {
    return requestJson('/api/requester/me');
}

/** @returns {Promise<{ok: boolean}>} */
export function requesterLogout() {
    return postJson('/api/requester/logout');
}

/**
 * @param {'day'|'week'|'month'} view
 * @param {string} date - 'YYYY-MM-DD'
 * @returns {Promise<{from: string, to: string, items: object[]}>} approved bookings of everybody plus own pending ones
 */
export function fetchRequesterCalendar(view, date) {
    return requestJson(`/api/requester/calendar?view=${view}&date=${date}`);
}

/** @returns {Promise<{items: object[]}>} the caller's own requests */
export function fetchMyRequests() {
    return requestJson('/api/requester/requests');
}

/**
 * @param {{date: string, start_time: string, end_time: string, notes?: string}} payload
 * @returns {Promise<{id: number, status: string}>}
 */
export function submitFacilityRequest(payload) {
    return postJson('/api/requester/requests', payload);
}

/**
 * @param {number} id
 * @returns {Promise<{ok: boolean, status: string}>}
 */
export function cancelMyRequest(id) {
    return postJson(`/api/requester/requests/${id}/cancel`);
}

/* ---------------------------------------------------------- pricing API */

/**
 * @param {string} roomType
 * @param {string} checkIn - 'YYYY-MM-DD'
 * @param {string} checkOut - 'YYYY-MM-DD'
 * @returns {Promise<{priced: boolean, nights?: {date: string, price: number}[], subtotal?: number, discount_percent?: number, discount_amount?: number, total?: number}>}
 */
export function fetchQuote(roomType, checkIn, checkOut) {
    return requestJson(`/api/quote?room_type=${encodeURIComponent(roomType)}&check_in=${encodeURIComponent(checkIn)}&check_out=${encodeURIComponent(checkOut)}`);
}

/** @returns {Promise<{base: {room_type: string, price_per_night: number|null}[], periods: object[], discounts: object[]}>} */
export function fetchPricing() {
    return requestJson('/api/admin/pricing');
}

/**
 * @param {{room_type: string, date_from: string, date_to: string, price_per_night: number, label?: string}} payload
 * @returns {Promise<{id: number}>}
 */
export function createPeriod(payload) {
    return postJson('/api/admin/pricing/periods', payload);
}

/**
 * @param {number} id
 * @returns {Promise<{ok: boolean}>}
 */
export function deletePeriod(id) {
    return requestJson(`/api/admin/pricing/periods/${id}`, { method: 'DELETE' });
}

/**
 * @param {number} minNights
 * @param {number} percent
 * @returns {Promise<{id: number}>}
 */
export function createDiscount(minNights, percent) {
    return postJson('/api/admin/pricing/discounts', { min_nights: minNights, percent });
}

/**
 * @param {number} id
 * @returns {Promise<{ok: boolean}>}
 */
export function deleteDiscount(id) {
    return requestJson(`/api/admin/pricing/discounts/${id}`, { method: 'DELETE' });
}
