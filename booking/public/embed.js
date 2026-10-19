/*
 * embed.js — include the booking form in the venue's website.
 *
 *   <div id="booking"></div>
 *   <script src="https://BOOKING-HOST/embed.js" data-target="#booking" defer></script>
 *
 * The script creates an iframe pointing at /embed of the host it was loaded
 * from and resizes it whenever the form reports a new height, so the page
 * never shows an inner scrollbar. Only messages coming from that host are
 * trusted. The deployment must set EMBED_ORIGIN to the website's origin.
 *
 * Language: the form follows the `lang` attribute of the website's <html>
 * element. The current value is sent once the iframe has loaded and again
 * every time the attribute changes (a runtime i18n switch on the page), so
 * the visitor never sees the page in one language and the form in another.
 */
(() => {
    const script = document.currentScript;
    if (script === null) return;
    const bookingOrigin = new URL(script.src).origin;
    const target = document.querySelector(script.dataset.target ?? '#booking');
    if (target === null) {
        console.error('embed.js: target element not found', script.dataset.target);
        return;
    }
    const frame = document.createElement('iframe');
    frame.src = `${bookingOrigin}/embed`;
    frame.title = script.dataset.title ?? 'Booking';
    frame.style.width = '100%';
    frame.style.border = '0';
    frame.style.display = 'block';
    frame.style.minHeight = '600px';
    frame.setAttribute('loading', 'lazy');
    frame.setAttribute('scrolling', 'no');
    target.replaceChildren(frame);
    window.addEventListener('message', (event) => {
        if (event.origin !== bookingOrigin || event.data?.type !== 'booking-height') return;
        frame.style.height = `${Math.ceil(event.data.height)}px`;
        frame.style.minHeight = '0';
    });

    // The page language is the primary language subtag of <html lang>
    // ("it-IT" -> "it"); the form ignores codes it does not support.
    const sendLanguage = () => {
        const pageLang = document.documentElement.lang.split('-')[0].toLowerCase();
        if (pageLang !== '' && frame.contentWindow !== null) frame.contentWindow.postMessage({ type: 'booking-lang', lang: pageLang }, bookingOrigin);
    };
    frame.addEventListener('load', sendLanguage);
    new MutationObserver(sendLanguage).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
})();
