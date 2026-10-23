# Passaggio al piano Workers Paid: cosa cambiare

Il modulo è tarato sui limiti del piano **Workers Free** di Cloudflare. Questo
file elenca, punto per punto, quale limite del Free ha dettato una scelta nel
codice o nella configurazione, dove sta quella scelta, e cosa fare il giorno
in cui l'account passa al piano **Paid** (5 $ al mese). Serve come lista di
controllo: ogni voce è indipendente dalle altre.

Fonti dei limiti: [Workers limits](https://developers.cloudflare.com/workers/platform/limits/),
[Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/),
[D1 limits](https://developers.cloudflare.com/d1/platform/limits/),
[D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/).
Versione del documento: ottobre 2026.

## Limiti che contano per questo modulo

| Limite | Free | Paid | Dove pesa |
|---|---|---|---|
| CPU per richiesta | 10 ms | 30 s (alzabile a 5 min) | hash delle password al login e al cambio password |
| Database D1 per account | 10 | 50.000 | un database per struttura più il direttorio |
| Dimensione di un database D1 | 500 MB | 10 GB | prenotazioni e audit di una struttura |
| Query D1 per invocazione | 50 | 1.000 | cron di anonimizzazione, che cicla su tutte le strutture |
| Righe D1 lette / scritte | 5 M / 100 k al giorno, poi blocco | 25 G / 50 M al mese, poi a consumo | tutto il traffico |
| Richieste al Worker | 100.000 al giorno, poi blocco | 10 M al mese, poi a consumo | tutto il traffico |
| Variabili per Worker (vars più secret) | 64 | 128 | `wrangler.jsonc`: oggi ne usiamo 4 |
| Time Travel di D1 (ripristino a un istante passato) | 7 giorni | 30 giorni | finestra di ripristino dichiarata alle strutture nel contratto (`docs/contratto-servizio-e-nomina-responsabile.docx`, Allegato 3) |

I binding D1 non contano come variabili. Le richieste ai file statici
(`css/`, `js/`, HTML alla radice) non contano come richieste al Worker.

## 1. Iterazioni dell'hash delle password

**Oggi (Free).** `PASSWORD_HASH_ITERATIONS = "10000"` in `wrangler.jsonc`.
Misura del 22 ottobre 2026 con Workers Logs (`observability` in
`wrangler.jsonc`): a 20.000 iterazioni un login costava 9-10 ms di CPU a
isolate caldo (circa 2 ms di richiesta più 7-8 ms di PBKDF2-HMAC-SHA256) e
24 ms al primo login dopo il deploy, cioè esattamente il limite del Free; a
10.000 il login costa 6 ms a caldo e 9 ms a freddo (stessa misura, stesso
giorno). Sul PC di sviluppo l'hash a 20.000 costava 5 ms: la CPU di un
isolate è più lenta. È una deroga dichiarata alle 600.000
iterazioni raccomandate da OWASP (`src/password.ts`, commento in testa;
README, sezione Sicurezza e privacy).

**Al passaggio al Paid.** Portare la variabile a `"600000"` e fare il deploy.
Non serve alcuna migrazione: il numero di iterazioni è salvato dentro ogni
hash e `POST /api/admin/login` (`src/routes/session.ts`) ricalcola l'hash
con il valore nuovo al primo login riuscito di ogni utente. Fino a quel
login l'utente resta protetto dal vecchio hash, che continua a funzionare.

**Attenzione.** Quel primo login dopo il cambio esegue due calcoli (verifica
con il vecchio numero di iterazioni più il nuovo hash): va bene sul Paid,
dove il limite è 30 s, ma non va fatto il contrario. Se un giorno si
tornasse al Free con hash a 600.000 iterazioni, ogni login supererebbe i 10 ms
e fallirebbe per tutti: prima di un eventuale ritorno al Free bisogna
riportare la variabile a 10.000 e far rifare il login a ogni utente mentre
si è ancora sul Paid.

**Verifica al primo deploy, su qualunque piano.** Nella dashboard di
Cloudflare (Workers & Pages, il Worker, scheda Observability) ogni
invocazione riporta la sua CPU time: filtrare per `POST /api/admin/login`,
ignorando il primo login dopo un deploy (isolate freddo, costa più del
doppio), e controllare che sul Free resti sotto i 10 ms. Cloudflare tollera
gli sforamenti occasionali, ma termina con errore 1102 le richieste di un
Worker che supera il limite in modo sistematico (soglia non documentata,
[Workers limits](https://developers.cloudflare.com/workers/platform/limits/)).
Se non basta, scendere a `"5000"`, annotandolo nel README.

## 2. Politica delle password

**Oggi (Free).** Con l'hash veloce, la robustezza dipende quasi solo dalla
password. Per questo la politica è stretta: almeno 12 caratteri
(`MIN_PASSWORD_LENGTH` in `src/password.ts`), rifiuto delle password
presenti nelle violazioni note (`PASSWORD_BREACH_CHECK = "on"`), password
iniziale generata dallo script (fase 3), blocco dell'account dopo 10 errori
(`LOCK_AFTER_FAILURES` in `src/routes/session.ts`).

**Al passaggio al Paid.** Nessuna modifica necessaria: la politica resta
valida e OWASP la raccomanda anche con l'hash lento. Si può al massimo
discutere se abbassare la lunghezza minima a 8, il minimo OWASP; sconsigliato.

## 3. Numero di strutture

**Oggi (Free).** Al massimo 10 database: il direttorio più 9 strutture.
`npm run tenant:add -- ... --remote` si ferma quando `wrangler.jsonc` ne
elenca già 10 (`FREE_PLAN_MAX_DATABASES` in `scripts/lib.mjs`).

**Al passaggio al Paid.** Nessuna modifica al codice: passare
`--allow-many-databases` a `tenant:add`. Con decine di strutture:

- `npm run migrate:all -- --remote` applica le migrazioni a tutti i
  database in sequenza, perché `wrangler d1 migrations apply` lavora su un
  database alla volta;
- tenere d'occhio il numero di voci in `d1_databases` di `wrangler.jsonc`:
  non c'è un limite documentato ai binding D1 per Worker, ma oltre qualche
  decina conviene chiedere conferma a Cloudflare o fare una prova.

## 4. Cron di anonimizzazione

**Oggi (Free).** `runRetention` in `src/index.ts` esegue, in una sola
invocazione, tre query sul direttorio (pulizia dei contatori anti-abuso,
pulizia del registro di audit, elenco delle strutture) più da tre a quattro
query per struttura (l'`UPDATE` di anonimizzazione e, se ha toccato righe,
l'audit; poi le due pulizie). Con il limite di 50 query per invocazione il
cron regge fino a circa 11 strutture; oltre, le ultime strutture dell'elenco
resterebbero senza pulizia, e l'errore finirebbe solo nei log.

**Al passaggio al Paid.** Il limite sale a 1.000 query per invocazione:
basta per centinaia di strutture, nessuna modifica necessaria. Se invece si
restasse sul Free avvicinandosi alle 20 strutture, la soluzione è spezzare
il lavoro in lotti: il cron elabora N strutture per invocazione e riparte
dal punto in cui si era fermato (colonna `retention_run_at` in `tenants`,
da aggiungere con una migrazione del direttorio).

## 5. Query per richiesta della dashboard

**Oggi (Free).** Ogni richiesta autenticata della dashboard fa una query al
direttorio (ricarica dell'utente in `requireAdmin`, `src/auth.ts`) più
quelle della route; la più pesante, l'approvazione di una prenotazione di
impianto, resta sotto le 10 query. Nessuna route si avvicina alle 50.

**Al passaggio al Paid.** Nessuna modifica.

## 6. Traffico e dimensione dei dati

**Oggi (Free).** Nessuna scelta nel codice dipende dai tetti giornalieri
di richieste e righe: con poche strutture si resta a meno dell'1 %. Superarli
sul Free significa che le richieste successive falliscono fino alla
mezzanotte UTC, non un costo.

**Al passaggio al Paid.** I tetti diventano mensili e oltre la soglia si
paga a consumo (vedi la tabella in testa). Impostare nella dashboard di
Cloudflare un avviso di spesa. I 500 MB per database del Free bastano per
anni di prenotazioni di una struttura; sul Paid sono 10 GB.

## 7. Sessioni

**Oggi.** La sessione della dashboard dura 8 ore (`ADMIN_SESSION_S` in
`src/auth.ts`). Non è un limite del piano: è una scelta di sicurezza, e
ogni richiesta autenticata costa una verifica HMAC trascurabile. Non cambia
con il piano.

## Lista di controllo del passaggio

1. Dalla dashboard di Cloudflare, Workers & Pages, Plans: passare a Workers Paid.
2. In `wrangler.jsonc`: `PASSWORD_HASH_ITERATIONS` a `"600000"`.
3. `npm run deploy`.
4. Chiedere a ogni gestore di rifare il login (gli hash si aggiornano da soli).
5. Nel README, sezione Sicurezza e privacy, togliere la frase sulla deroga
   OWASP e indicare il valore nuovo.
6. Impostare l'avviso di spesa nella dashboard di Cloudflare.
7. Verificare con la metrica CPU time che il login resti ben sotto il
   secondo (atteso: circa 150 ms).
