export type Bindings = {
    DB: D1Database;
    ASSETS: Fetcher;
    ADMIN_SECRET: string;
    ADMIN_PASSWORD: string;
    /** Brevo API key for the email notifications (secret): missing = sending disabled. */
    BREVO_API_KEY?: string;
    /** Sender of the notifications (address on a domain authenticated in Brevo). */
    EMAIL_SENDER?: string;
    /** Owner's address: receives the admin copy of every event and is the Reply-To of the guest emails. */
    EMAIL_ADMIN?: string;
    /** Booking type served by this deployment: 'hotel' | 'facility' | 'restaurant' (see config.ts). */
    BOOKING_TYPE?: string;
    VENUE_NAME?: string;
    DEFAULT_LANG?: string;
    FACILITY_OPEN?: string;
    FACILITY_CLOSE?: string;
    LUNCH_OPEN?: string;
    LUNCH_CLOSE?: string;
    DINNER_OPEN?: string;
    DINNER_CLOSE?: string;
    RETENTION_DAYS?: string;
    /** Origin of the venue's website allowed to embed the public form (GET /embed); empty = embedding disabled. */
    EMBED_ORIGIN?: string;
};

export type BookingType = 'hotel' | 'facility' | 'restaurant';
export type RequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
/** Payment state of a confirmed hotel stay (migration 0003); always 'none' for the other types. */
export type PaymentStatus = 'none' | 'deposit' | 'paid';
export type RequesterStatus = 'active' | 'suspended';
export type Lang = 'it' | 'en';

export type RequesterRow = {
    id: number;
    name: string;
    contact_name: string;
    email: string;
    phone: string | null;
    status: RequesterStatus;
    color: string;
    access_token: string;
    created_at: string;
};

/** One row of `requests`; the type-specific columns are NULL for the other types. */
export type RequestRow = {
    id: number;
    type: BookingType;
    status: RequestStatus;
    requester_id: number | null;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    phone: string | null;
    lang: Lang;
    notes: string | null;
    check_in: string | null;
    check_out: string | null;
    adults: number | null;
    children: number | null;
    room_type: string | null;
    date: string | null;
    start_time: string | null;
    end_time: string | null;
    party_size: number | null;
    guest_token: string | null;
    /** Hotel quote frozen at submission (migration 0002); NULL when no price was configured. */
    quoted_subtotal: number | null;
    quoted_discount_percent: number | null;
    quoted_total: number | null;
    /** Hotel payment tracking (migration 0003): paid_amount is the deposit, or the total once fully paid. */
    payment_status: PaymentStatus;
    paid_amount: number | null;
    paid_at: string | null;
    created_at: string;
    decided_at: string | null;
    cancelled_at: string | null;
    anonymised_at: string | null;
};

/** Hono context variables set by the requester authentication middleware. */
export type RequesterVariables = { requester: RequesterRow };
