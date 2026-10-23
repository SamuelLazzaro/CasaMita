# Prossimi passi: messa in produzione del Worker `booking`

Stato al 23 ottobre 2026. Tutto il codice è committato: modello in
`D:\Personal\Claude\modules\booking` (fino a `cc2fa7e`), copia di deploy in
questa cartella (`e734c07`). Le migrazioni 0002 e 0003 del direttorio sono già
applicate in produzione e il colore `#237a87` è già impostato per le due
strutture di Casa Mita. Il Worker `booking` **non esiste ancora** su
Cloudflare: il vecchio `booking-casamita` è ancora quello in produzione.

Tutti i comandi si lanciano da questa cartella (`NewCasaMita/booking`), con
`npx wrangler whoami` che risponde con l'account giusto.

## 1. Secret del Worker nuovo

I secret sono per Worker e non si copiano: senza, il login non funziona e le
email non partono.

```
npx wrangler secret put ADMIN_SECRET --name booking
npx wrangler secret put BREVO_API_KEY --name booking
```

- `ADMIN_SECRET`: un valore nuovo e lungo va bene (per esempio l'output di
  `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`).
  Chiude solo le sessioni aperte; i link personali degli ospiti non dipendono
  da questa chiave.
- `BREVO_API_KEY`: la chiave API del tuo account Brevo (Impostazioni, chiavi
  API), la stessa usata dal Worker vecchio.

Il primo `secret put` crea il Worker vuoto: è normale.

## 2. Deploy

```
npm run deploy
```

Al termine wrangler stampa `https://booking.samuellazzaro.workers.dev`.

## 3. Verifiche subito dopo

| Cosa | Come | Atteso |
|---|---|---|
| Worker vivo | `curl https://booking.samuellazzaro.workers.dev/api/health` | `{"ok":true}` |
| Struttura e colore | `curl https://booking.samuellazzaro.workers.dev/casamita/api/config` | JSON con `"accent":"#237a87"`, `legal`, `processor` |
| Form hotel | apri `https://booking.samuellazzaro.workers.dev/casamita/` | form teal, avviso "richiesta non vincolante", link alle condizioni |
| Form ristorante | `https://booking.samuellazzaro.workers.dev/casamita-ristorante/` | idem |
| Login | `https://booking.samuellazzaro.workers.dev/admin` con l'utente di Casa Mita | entra nella dashboard; riga "Accessi e operazioni sono registrati" sotto il form |
| Email | invia una richiesta di prova con la tua email dal form, poi approvala dalla dashboard | arrivano richiesta e conferma; nel piè di pagina c'è "Condizioni di prenotazione: …/casamita/conditions" |
| Pagine legali | `/casamita/privacy`, `/casamita/conditions`, `/legal` | le pagine si aprono; i segnaposto restano finché non fai i passi 6 e 7 |
| Cron | dashboard Cloudflare, Workers, `booking`, Triggers | cron `30 3 * * *` presente |

Se qualcosa non va, il Worker vecchio è ancora attivo: il sito pubblicato
continua a usarlo finché non fai il passo 4.

## 4. Sito di Casa Mita con i link nuovi

`index.html` e `admin.html` puntano già a `booking.samuellazzaro.workers.dev`
(commit `e734c07`). Pubblica il sito con il processo che usi per l'hosting,
poi controlla che il form incorporato compaia nella pagina (l'origine
autorizzata `embed_origin` non è cambiata).

## 5. Cancellazione del Worker vecchio

Solo dopo le verifiche dei passi 3 e 4. Da questo momento i link personali
già inviati agli ospiti con l'indirizzo vecchio smettono di funzionare
(decisione presa il 23 ottobre 2026): avvisa il gestore che eventuali ospiti
con una richiesta in corso devono chiedergli lo stato via email o telefono.

```
npx wrangler delete --name booking-casamita
```

I database non vengono toccati: appartengono all'account, non al Worker.

## 6. Chi gestisce il servizio (vars `PROCESSOR_*`)

In `wrangler.jsonc` di questa cartella compila `PROCESSOR_NAME`,
`PROCESSOR_ADDRESS`, `PROCESSOR_EMAIL`, `PROCESSOR_VAT` con i tuoi dati
(informazioni pubbliche: pagina `/legal`, responsabile nelle informative,
contatto di `security.txt`), poi:

```
npm run deploy
curl https://booking.samuellazzaro.workers.dev/.well-known/security.txt
```

Committa il `wrangler.jsonc` aggiornato.

## 7. Dati legali di Casa Mita nel direttorio

Senza, la pagina delle condizioni e le email mostrano i segnaposto o
omettono l'identità. Chiedi al gestore ragione sociale, indirizzo, telefono,
partita IVA e il testo delle condizioni (acconti, pagamenti, cancellazioni,
orari), per entrambe le strutture. Esempio per l'hotel (gli apostrofi nel
testo vanno raddoppiati):

```
npx wrangler d1 execute booking-directory --remote --command "UPDATE tenants SET privacy_controller = 'RAGIONE SOCIALE', privacy_address = 'INDIRIZZO', phone = '+39 ...', vat_number = 'IT...', conditions_text = 'Primo paragrafo.

Secondo paragrafo.' WHERE slug = 'casamita'"
```

Stessa cosa con `slug = 'casamita-ristorante'`. Se Casa Mita preferisce
pubblicare le condizioni sul proprio sito, imposta invece `conditions_url`.
Poi controlla `/casamita/privacy`, `/casamita/conditions` e le email di
prova. Nessun deploy necessario.

## 8. Sicurezza degli account

- Autenticazione a due fattori su Cloudflare e su Brevo (il contratto la
  dichiara, Allegato 3).
- Token API di Cloudflare con i soli permessi necessari se ne usi uno al
  posto del login OAuth.

## 9. Contratto con Casa Mita

Il modello è `D:\Personal\Claude\modules\booking\docs\contratto-servizio-e-nomina-responsabile.docx`
(non sta in questo repo, che è pubblico).

1. Compila le parti tra parentesi quadre (tuoi dati, dati di Casa Mita,
   corrispettivo, durata, foro) e l'Allegato 5 con i parametri delle due
   strutture.
2. Stampa l'elenco dei sub-responsabili di Brevo (condizioni d'uso,
   Appendice 3, annesso, visibile solo nel browser) e quello di Cloudflare
   (`https://www.cloudflare.com/gdpr/subprocessors/`): Allegato 4-bis.
3. Fai rivedere la Parte A e la tua posizione fiscale a un professionista.
4. Firma in elettronico o via PEC.
5. Consegna al gestore l'Allegato 6 (informativa per chi usa la dashboard).
6. Nella privacy policy del sito di Casa Mita aggiungi te come responsabile
   del trattamento per il modulo di prenotazione (oggi cita solo Cloudflare e
   Brevo) e metti ragione sociale e partita IVA nel footer della home.

## 10. Push

Nessun push è stato fatto. Quando sei pronto:

```
cd D:\Personal\Claude && git push
cd D:\Personal\NewCasaMita && git push
```

## 11. Rinviati a dopo (decisioni del 23 ottobre 2026)

- Spostare questa cartella in un repo privato dedicato al deploy (serve
  tutti i clienti e contiene gli ID dei database; il repo del sito è
  pubblico), lasciando nel sito solo lo script di embed.
- Script `sync-deploy` nel modello per copiare i file nella copia di deploy
  (oggi: `tar` escludendo `node_modules`, `.wrangler`, `wrangler.jsonc`,
  `.dev.vars`, `package-lock.json`).
- Piano Paid di Cloudflare quando servirà il nono database (oggi ne usi 3 su
  10); al passaggio, `PASSWORD_HASH_ITERATIONS` a `600000` (vedi
  `docs/piano-paid.md`).
- Per ogni nuova struttura: `npm run tenant:add -- <slug> --type ... --name
  ... --username ... --phone ... --vat ... --accent ... --remote`, condizioni
  nel direttorio, deploy, contratto firmato.
