import type { Bindings, Lang, RequestRow } from './types';
import { venueConfig } from './config';
import { emailTexts, requestDetails } from './texts';
import { writeAudit } from './util';

/**
 * Email notifications on the booking life cycle, sent through Brevo's
 * transactional API (EU provider; https://developers.brevo.com/reference/sendtransacemail).
 *
 * Design choices:
 *  - Best effort: a failed send NEVER fails the booking operation. Sending
 *    runs in executionCtx.waitUntil() (does not delay the HTTP response) and
 *    an error only leaves a 'notification_failed' row in the audit log.
 *  - Two emails per guest-initiated event: one to the guest (Reply-To the
 *    owner) and one to the owner (Reply-To the guest, so replying = writing
 *    to the guest). Owner-initiated events notify the guest only.
 *  - Plain text only: no HTML, so user-written content (notes) cannot inject
 *    markup; multi-line notes are quoted (see texts.requestDetails).
 *  - Data minimisation (GDPR art. 5.1.c): the owner's copy carries the data
 *    needed to decide and nothing else; the personal link goes to the guest only.
 *  - Without BREVO_API_KEY sending is disabled: local development and tests
 *    run like that, never touching the network.
 */

const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';
const SEND_TIMEOUT_MS = 10_000;

export type Recipient = { name: string; email: string };

export type Notification = {
    lang: Lang;
    recipient: Recipient;
    subject: string;
    message: string;
    details: string[];
    /** Present only for guest-initiated events, which are the only ones mailed to the owner too. */
    adminSubject?: string;
    adminMessage?: string;
};

/** Structural subset of the Hono context used here, so any route can pass its own. */
type NotificationContext = {
    env: Bindings;
    req: { url: string };
    executionCtx: { waitUntil(promise: Promise<unknown>): void };
};

export function guestName(request: Pick<RequestRow, 'first_name' | 'last_name'>): string {
    return `${request.first_name ?? ''} ${request.last_name ?? ''}`.trim();
}

export function personalLink(origin: string, token: string): string {
    return `${origin}/booking/${token}`;
}

/** Plain-text body of the guest email (exported for tests). */
export function guestBody(notification: Notification, origin: string, venueName: string): string {
    const texts = emailTexts(notification.lang);
    return [texts.greeting(notification.recipient.name), '', notification.message, '', ...notification.details.map((row) => `  ${row}`), '', '—', texts.footerAuto(venueName), texts.footerReply, `${texts.privacy}: ${origin}/privacy.html`].join('\n');
}

/** Plain-text body of the owner email (exported for tests). */
export function adminBody(notification: Notification, origin: string, venueName: string): string {
    const texts = emailTexts(notification.lang);
    return [notification.adminMessage ?? '', '', ...notification.details.map((row) => `  ${row}`), '', '—', texts.footerAuto(venueName), texts.footerReplyAdmin, `${texts.privacy}: ${origin}/privacy.html`].join('\n');
}

function send(c: NotificationContext, notification: Notification): void {
    const sending = deliver(c.env, new URL(c.req.url).origin, notification);
    try {
        c.executionCtx.waitUntil(sending);
    } catch {
        // No ExecutionContext (unit tests): the send stays detached, best effort.
    }
}

async function deliver(env: Bindings, origin: string, notification: Notification): Promise<void> {
    if (!env.BREVO_API_KEY) return;
    if (!env.EMAIL_SENDER || !env.EMAIL_ADMIN) {
        console.error('notifications: EMAIL_SENDER or EMAIL_ADMIN not configured, send skipped');
        return;
    }
    const venue = venueConfig(env);
    const sender = { name: venue.name, email: env.EMAIL_SENDER };
    const prefix = `[${venue.name}]`;

    await sendBrevo(env, { sender, to: [{ email: notification.recipient.email, name: notification.recipient.name }], replyTo: { email: env.EMAIL_ADMIN }, subject: `${prefix} ${notification.subject}`, textContent: guestBody(notification, origin, venue.name) }, `"${notification.subject}" to ${notification.recipient.name}`);

    if (notification.adminMessage) {
        const adminSubject = notification.adminSubject ?? notification.subject;
        await sendBrevo(env, { sender, to: [{ email: env.EMAIL_ADMIN }], replyTo: { email: notification.recipient.email, name: notification.recipient.name }, subject: `${prefix} ${adminSubject}`, textContent: adminBody(notification, origin, venue.name) }, `"${adminSubject}" to the owner (${notification.recipient.name})`);
    }
}

/** One Brevo call; throws when the network or Brevo fail. */
async function callBrevo(env: Bindings, body: Record<string, unknown>): Promise<void> {
    const response = await fetch(BREVO_URL, { method: 'POST', headers: { 'api-key': env.BREVO_API_KEY!, 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(SEND_TIMEOUT_MS) });
    if (!response.ok) throw new Error(`Brevo answered ${response.status}`);
}

/** Brevo call with its own error handling: one failed send must not block the next nor reach waitUntil. */
async function sendBrevo(env: Bindings, body: Record<string, unknown>, auditDescription: string): Promise<void> {
    try {
        await callBrevo(env, body);
    } catch (error) {
        // No email addresses in the audit (minimisation): subject and name are enough to resend by hand.
        console.error('notifications: send failed', error);
        try {
            await writeAudit(env.DB, 'notification_failed', auditDescription, 'system');
        } catch {
            // Audit is best effort too: never propagate from waitUntil.
        }
    }
}

// ---------------------------------------------------------------------------
// Life cycle events
// ---------------------------------------------------------------------------

/**
 * Requester-initiated: request submitted, awaiting the owner's decision.
 * Guests (hotel, restaurant) get their personal link; facility requesters
 * already have their reserved area, so no link.
 */
export function notifyRequestSubmitted(c: NotificationContext, request: RequestRow, requester: Recipient | null = null): void {
    const texts = emailTexts(request.lang);
    const origin = new URL(c.req.url).origin;
    const recipient = recipientOf(request, requester);
    const linkRows = request.guest_token ? [`${texts.personalLink}: ${personalLink(origin, request.guest_token)}`] : [];
    const message = request.guest_token ? `${texts.submittedMessage} ${texts.personalLinkHint}` : texts.submittedMessage;
    send(c, {
        lang: request.lang,
        recipient,
        subject: texts.submittedSubject,
        message,
        adminSubject: texts.submittedAdminSubject,
        adminMessage: texts.submittedAdminMessage(recipient.name),
        details: [...requestDetails(request, request.lang, true), ...linkRows],
    });
}

/** Recipient of the notifications of a request: the guest, or the facility requester. */
export function recipientOf(request: RequestRow, requester: Recipient | null): Recipient {
    if (requester !== null) return requester;
    return { name: guestName(request), email: request.email ?? '' };
}

/** Admin: request approved. Owner-initiated, so no owner copy. */
export function notifyApproved(c: NotificationContext, request: RequestRow, requester: Recipient | null = null): void {
    const texts = emailTexts(request.lang);
    send(c, { lang: request.lang, recipient: recipientOf(request, requester), subject: texts.approvedSubject, message: texts.approvedMessage, details: requestDetails(request, request.lang, false) });
}

/** Admin: request rejected, with an optional message for the guest. */
export function notifyRejected(c: NotificationContext, request: RequestRow, reason: string | null, requester: Recipient | null = null): void {
    const texts = emailTexts(request.lang);
    const reasonRows = reason ? [`${texts.rejectedReason}: ${reason}`] : [];
    send(c, { lang: request.lang, recipient: recipientOf(request, requester), subject: texts.rejectedSubject, message: texts.rejectedMessage, details: [...requestDetails(request, request.lang, false), ...reasonRows] });
}

/** Admin: pending or approved booking cancelled by the venue. */
export function notifyCancelledByAdmin(c: NotificationContext, request: RequestRow, requester: Recipient | null = null): void {
    const texts = emailTexts(request.lang);
    send(c, { lang: request.lang, recipient: recipientOf(request, requester), subject: texts.cancelledByVenueSubject, message: texts.cancelledByVenueMessage, details: requestDetails(request, request.lang, false) });
}

/** Admin: booking registered directly by the venue, already confirmed. Guests get their personal link. */
export function notifyRegisteredByAdmin(c: NotificationContext, request: RequestRow, requester: Recipient | null = null): void {
    const texts = emailTexts(request.lang);
    const origin = new URL(c.req.url).origin;
    const linkRows = request.guest_token ? [`${texts.personalLink}: ${personalLink(origin, request.guest_token)}`] : [];
    const message = request.guest_token ? `${texts.registeredMessage} ${texts.personalLinkHint}` : texts.registeredMessage;
    send(c, { lang: request.lang, recipient: recipientOf(request, requester), subject: texts.registeredSubject, message, details: [...requestDetails(request, request.lang, false), ...linkRows] });
}

/** Why the access link of a facility requester is being delivered. */
export type AccessLinkReason = 'creation' | 'regeneration' | 'resend';

/**
 * Admin: delivery of the personal access link to a facility requester. The
 * ONLY email carrying the requester's credential (owner's choice, as in the
 * original project): whoever reads it can book in the requester's name until
 * the admin regenerates the link.
 */
export function notifyAccessLink(c: NotificationContext, requester: Recipient, lang: Lang, accessLink: string, reason: AccessLinkReason): void {
    const texts = emailTexts(lang);
    const venue = venueConfig(c.env);
    send(c, { lang, recipient: requester, subject: texts.accessLinkSubject(reason), message: `${texts.accessLinkMessage(reason, venue.name)} ${texts.accessLinkWarning}`, details: [`${texts.accessLink}: ${accessLink}`] });
}

/** Requester-initiated: request cancelled by the guest (personal link) or by the facility requester (reserved area). */
export function notifyCancelledByGuest(c: NotificationContext, request: RequestRow, requester: Recipient | null = null): void {
    const texts = emailTexts(request.lang);
    const recipient = recipientOf(request, requester);
    send(c, {
        lang: request.lang,
        recipient,
        subject: texts.cancelledSubject,
        message: texts.cancelledMessage,
        adminSubject: texts.cancelledAdminSubject,
        adminMessage: texts.cancelledAdminMessage(recipient.name),
        details: requestDetails(request, request.lang, false),
    });
}
