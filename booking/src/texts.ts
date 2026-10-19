import type { BookingType, Lang, RequestRow } from './types';
import { italianDate } from './dates';

/**
 * Server-side texts (email notifications), in the requester's language. The
 * frontend has its own dictionary (public/js/translations.js); the two are
 * kept apart on purpose: the Worker never ships UI strings and the browser
 * never sees email templates.
 */

type EmailTexts = {
    greeting: (name: string) => string;
    submittedSubject: string;
    submittedMessage: string;
    submittedAdminSubject: string;
    submittedAdminMessage: (name: string) => string;
    cancelledSubject: string;
    cancelledMessage: string;
    cancelledAdminSubject: string;
    cancelledAdminMessage: (name: string) => string;
    approvedSubject: string;
    approvedMessage: string;
    rejectedSubject: string;
    rejectedMessage: string;
    rejectedReason: string;
    cancelledByVenueSubject: string;
    cancelledByVenueMessage: string;
    registeredSubject: string;
    registeredMessage: string;
    accessLinkSubject: (reason: string) => string;
    accessLinkMessage: (reason: string, venue: string) => string;
    accessLinkWarning: string;
    accessLink: string;
    personalLink: string;
    personalLinkHint: string;
    footerAuto: (venue: string) => string;
    footerReply: string;
    footerReplyAdmin: string;
    privacy: string;
    labels: { checkIn: string; checkOut: string; guests: string; adults: (count: number) => string; children: (count: number) => string; room: string; date: string; time: string; people: string; notes: string; status: string; total: string; discount: (percent: number, amount: string) => string; taxes: string };
    statuses: Record<string, string>;
};

const TEXTS: Record<Lang, EmailTexts> = {
    it: {
        greeting: (name) => `Gentile ${name},`,
        submittedSubject: 'Richiesta di prenotazione ricevuta',
        submittedMessage: 'abbiamo ricevuto la richiesta di prenotazione. È in attesa di conferma da parte della struttura: riceverai un\'email con l\'esito.',
        submittedAdminSubject: 'Nuova richiesta di prenotazione',
        submittedAdminMessage: (name) => `${name} ha inviato una richiesta di prenotazione, in attesa di decisione.`,
        cancelledSubject: 'Prenotazione annullata',
        cancelledMessage: 'la richiesta di prenotazione è stata annullata come richiesto.',
        cancelledAdminSubject: 'Prenotazione annullata dal cliente',
        cancelledAdminMessage: (name) => `${name} ha annullato la propria richiesta di prenotazione.`,
        approvedSubject: 'Prenotazione confermata',
        approvedMessage: 'la richiesta di prenotazione è stata confermata dalla struttura. Ti aspettiamo!',
        rejectedSubject: 'Richiesta di prenotazione non accettata',
        rejectedMessage: 'purtroppo la struttura non ha potuto accettare la richiesta di prenotazione.',
        rejectedReason: 'Messaggio della struttura',
        cancelledByVenueSubject: 'Prenotazione annullata dalla struttura',
        cancelledByVenueMessage: 'la prenotazione è stata annullata dalla struttura. Per chiarimenti è possibile rispondere a questa email.',
        registeredSubject: 'Prenotazione registrata',
        registeredMessage: 'la struttura ha registrato a tuo nome la prenotazione riportata sotto, già confermata.',
        accessLinkSubject: (reason) => (reason === 'regeneration' ? 'Nuovo link personale per le prenotazioni' : 'Link personale per le prenotazioni'),
        accessLinkMessage: (reason, venue) => {
            if (reason === 'regeneration') return 'il gestore ha rigenerato il link personale: il link precedente non funziona più. Da ora l\'area riservata si raggiunge con il link riportato sotto.';
            if (reason === 'resend') return 'su richiesta del gestore, ecco di nuovo il link personale con cui accedere all\'area riservata delle prenotazioni.';
            return `il gestore ha registrato la vostra organizzazione nel sistema di prenotazione di ${venue}. Da questo momento è possibile richiedere le prenotazioni dall'area riservata, raggiungibile con il link personale riportato sotto.`;
        },
        accessLinkWarning: 'Il link è personale e non va condiviso: chi lo conosce può prenotare a vostro nome. In caso di smarrimento o sospetto uso improprio, chiedete al gestore di rigenerarlo.',
        accessLink: 'Link di accesso',
        personalLink: 'Link personale',
        personalLinkHint: 'Dal link personale puoi controllare lo stato della richiesta e, se necessario, annullarla. Non condividerlo.',
        footerAuto: (venue) => `Notifica automatica del sistema di prenotazione di ${venue}.`,
        footerReply: 'Per domande è possibile rispondere a questa email.',
        footerReplyAdmin: 'Rispondendo a questa email si scrive direttamente al cliente.',
        privacy: 'Informativa privacy',
        labels: { checkIn: 'Check-in', checkOut: 'Check-out', guests: 'Ospiti', adults: (count) => `${count} ${count === 1 ? 'adulto' : 'adulti'}`, children: (count) => `${count} ${count === 1 ? 'bambino' : 'bambini'}`, room: 'Camera', date: 'Data', time: 'Orario', people: 'Persone', notes: 'Note (scritte dal cliente)', status: 'Stato', total: 'Prezzo totale', discount: (percent, amount) => `Sconto ${percent}% per la durata del soggiorno: -${amount}`, taxes: 'Tasse incluse, tassa di soggiorno esclusa' },
        statuses: { pending: 'in attesa', approved: 'confermata', rejected: 'rifiutata', cancelled: 'annullata' },
    },
    en: {
        greeting: (name) => `Dear ${name},`,
        submittedSubject: 'Booking request received',
        submittedMessage: 'we have received your booking request. It is awaiting confirmation by the venue: you will get an email with the outcome.',
        submittedAdminSubject: 'New booking request',
        submittedAdminMessage: (name) => `${name} sent a booking request, awaiting a decision.`,
        cancelledSubject: 'Booking cancelled',
        cancelledMessage: 'your booking request has been cancelled as requested.',
        cancelledAdminSubject: 'Booking cancelled by the guest',
        cancelledAdminMessage: (name) => `${name} cancelled their booking request.`,
        approvedSubject: 'Booking confirmed',
        approvedMessage: 'your booking request has been confirmed by the venue. See you soon!',
        rejectedSubject: 'Booking request not accepted',
        rejectedMessage: 'unfortunately the venue could not accept your booking request.',
        rejectedReason: 'Message from the venue',
        cancelledByVenueSubject: 'Booking cancelled by the venue',
        cancelledByVenueMessage: 'your booking has been cancelled by the venue. You can reply to this email for any clarification.',
        registeredSubject: 'Booking registered',
        registeredMessage: 'the venue registered the booking below in your name; it is already confirmed.',
        accessLinkSubject: (reason) => (reason === 'regeneration' ? 'New personal link for bookings' : 'Personal link for bookings'),
        accessLinkMessage: (reason, venue) => {
            if (reason === 'regeneration') return 'the venue manager regenerated your personal link: the previous one no longer works. From now on the reserved area is reached with the link below.';
            if (reason === 'resend') return 'at the venue manager\'s request, here is again the personal link to the reserved booking area.';
            return `the venue manager registered your organisation in the booking system of ${venue}. From now on you can request bookings from the reserved area, reached with the personal link below.`;
        },
        accessLinkWarning: 'The link is personal and must not be shared: whoever knows it can book in your name. If lost or misused, ask the venue manager to regenerate it.',
        accessLink: 'Access link',
        personalLink: 'Personal link',
        personalLinkHint: 'From your personal link you can check the status of the request and cancel it if needed. Do not share it.',
        footerAuto: (venue) => `Automatic notification of the booking system of ${venue}.`,
        footerReply: 'You can reply to this email with any question.',
        footerReplyAdmin: 'Replying to this email writes directly to the guest.',
        privacy: 'Privacy notice',
        labels: { checkIn: 'Check-in', checkOut: 'Check-out', guests: 'Guests', adults: (count) => `${count} ${count === 1 ? 'adult' : 'adults'}`, children: (count) => `${count} ${count === 1 ? 'child' : 'children'}`, room: 'Room', date: 'Date', time: 'Time', people: 'People', notes: 'Notes (written by the guest)', status: 'Status', total: 'Total price', discount: (percent, amount) => `${percent}% length-of-stay discount: -${amount}`, taxes: 'Taxes included, tourist tax excluded' },
        statuses: { pending: 'pending', approved: 'confirmed', rejected: 'rejected', cancelled: 'cancelled' },
    },
};

export function emailTexts(lang: Lang): EmailTexts {
    return TEXTS[lang];
}

/** Date in the reader's convention: 19/10/2026 for Italian, 2026-10-19 for English. */
export function formatDate(date: string, lang: Lang): string {
    return lang === 'it' ? italianDate(date) : date;
}

/**
 * Detail rows of a request ("Label: value"), by booking type. Notes are the
 * guest's free text, possibly multi-line, so they are rendered as a quoted
 * block ('> ' on every line): otherwise a line break inside the notes would
 * produce lines indistinguishable from the system-generated details in the
 * owner's email, which is exactly where the decision is taken.
 */
export type RequestSummary = Pick<RequestRow, 'type' | 'check_in' | 'check_out' | 'adults' | 'children' | 'room_type' | 'date' | 'start_time' | 'end_time' | 'party_size' | 'notes'> & Partial<Pick<RequestRow, 'quoted_subtotal' | 'quoted_discount_percent' | 'quoted_total'>>;

/** Euro amount as written in the reader's language: "1.234,50 €" or "€1,234.50". */
export function formatEuro(amount: number, lang: Lang): string {
    return new Intl.NumberFormat(lang === 'it' ? 'it-IT' : 'en-GB', { style: 'currency', currency: 'EUR' }).format(amount);
}

/** Price rows of a hotel request: total, the discount when one applied, and the tax wording (owner's decision). */
function priceRows(request: RequestSummary, lang: Lang): string[] {
    if (request.quoted_total === null || request.quoted_total === undefined) return [];
    const texts = emailTexts(lang);
    const rows = [`${texts.labels.total}: ${formatEuro(request.quoted_total, lang)} (${texts.labels.taxes})`];
    const percent = request.quoted_discount_percent ?? 0;
    const subtotal = request.quoted_subtotal ?? request.quoted_total;
    if (percent > 0) rows.push(texts.labels.discount(percent, formatEuro(subtotal - request.quoted_total, lang)));
    return rows;
}

export function requestDetails(request: RequestSummary, lang: Lang, withNotes: boolean): string[] {
    const texts = emailTexts(lang);
    const rows: string[] = [];
    const type: BookingType = request.type;
    if (type === 'hotel') {
        rows.push(`${texts.labels.checkIn}: ${formatDate(request.check_in ?? '', lang)}`);
        rows.push(`${texts.labels.checkOut}: ${formatDate(request.check_out ?? '', lang)}`);
        rows.push(`${texts.labels.guests}: ${texts.labels.adults(request.adults ?? 0)}, ${texts.labels.children(request.children ?? 0)}`);
        rows.push(`${texts.labels.room}: ${request.room_type ?? ''}`);
        rows.push(...priceRows(request, lang));
    } else if (type === 'restaurant') {
        rows.push(`${texts.labels.date}: ${formatDate(request.date ?? '', lang)}`);
        rows.push(`${texts.labels.time}: ${request.start_time ?? ''}`);
        rows.push(`${texts.labels.people}: ${request.party_size ?? ''}`);
    } else {
        rows.push(`${texts.labels.date}: ${formatDate(request.date ?? '', lang)}, ${request.start_time ?? ''} - ${request.end_time ?? ''}`);
    }
    if (withNotes && request.notes) {
        const noteLines = request.notes.replace(/\r\n?/g, '\n').split('\n');
        rows.push(`${texts.labels.notes}:`, ...noteLines.map((line) => `> ${line}`));
    }
    return rows;
}
