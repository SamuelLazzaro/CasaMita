import type { VenueConfig } from './config';

/**
 * Worker bindings (wrangler.jsonc).
 *
 * One deployment serves MANY venues (tenants). The DIRECTORY database holds
 * the tenants, their configuration and the dashboard users; every tenant has
 * its own D1 database, reached through the binding named in its directory
 * row (tenants.binding, e.g. "DB_HOTEL_ROSSI"). Those per-tenant bindings
 * are not listed here: the code looks them up by name (see tenant.ts).
 */
export type Bindings = {
    DIRECTORY: D1Database;
    ASSETS: Fetcher;
    /** HMAC key signing the session cookies (secret). */
    ADMIN_SECRET: string;
    /** Brevo API key for the email notifications (secret): missing = sending disabled. */
    BREVO_API_KEY?: string;
    /** PBKDF2 iterations for NEW password hashes (see password.ts): the Free plan's 10 ms of CPU cap it far below the OWASP figure. */
    PASSWORD_HASH_ITERATIONS?: string;
    /** 'off' disables the Have I Been Pwned check of new passwords (tests, offline development). */
    PASSWORD_BREACH_CHECK?: string;
};

export type BookingType = 'hotel' | 'facility' | 'restaurant';
export type RequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
/** Payment state of a confirmed hotel stay (migration 0003); always 'none' for the other types. */
export type PaymentStatus = 'none' | 'deposit' | 'paid';
export type RequesterStatus = 'active' | 'suspended';
export type TenantStatus = 'active' | 'suspended';
export type Lang = 'it' | 'en';

/** One row of the directory's `tenants` table: a venue, its database and its configuration. */
export type TenantRow = {
    slug: string;
    binding: string;
    type: string;
    name: string;
    default_lang: string;
    email_sender: string | null;
    email_admin: string | null;
    facility_open: string | null;
    facility_close: string | null;
    lunch_open: string | null;
    lunch_close: string | null;
    dinner_open: string | null;
    dinner_close: string | null;
    retention_days: number;
    embed_origin: string | null;
    privacy_controller: string | null;
    privacy_address: string | null;
    privacy_email: string | null;
    status: TenantStatus;
    created_at: string;
};

/** One row of the directory's `users` table: a dashboard account of a tenant. */
export type UserRow = {
    id: number;
    tenant_slug: string;
    username: string;
    password_hash: string;
    failed_attempts: number;
    locked_until: string | null;
    password_changed_at: string | null;
    last_login_at: string | null;
    created_at: string;
};

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

/** Hono context variables set by the tenant resolution middleware (tenant.ts) on every /:slug/... route. */
export type TenantVariables = { tenant: TenantRow; db: D1Database; venue: VenueConfig };

/** Variables of the admin dashboard routes: the tenant plus the signed-in user. */
export type AdminVariables = TenantVariables & { user: UserRow };

/** Variables of the requesters' reserved area: the tenant plus the signed-in requester. */
export type RequesterVariables = TenantVariables & { requester: RequesterRow };

/** Hono environment shared by every tenant-scoped route. */
export type TenantEnv = { Bindings: Bindings; Variables: TenantVariables };
