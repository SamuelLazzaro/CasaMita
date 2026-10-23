/*
 * legal.js — entry point of the root legal page (/legal): writes who runs
 * the deployment (GET /api/legal, from the PROCESSOR_* vars) into the page.
 * Without those vars the placeholders stay as they are.
 */
import { fetchLegal } from './api.js';
import { initI18n } from './i18n.js';
import { startTapFeedback } from './tap-feedback.js';
import { fillAll } from './ui.js';

startTapFeedback();
initI18n();

async function init() {
    const legal = await fetchLegal();
    fillAll('processor-name', legal.name);
    fillAll('processor-address', legal.address);
    fillAll('processor-email', legal.email);
    fillAll('processor-vat', legal.vat);
}

init();
