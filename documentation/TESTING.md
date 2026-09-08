# Ambiente locale e verifica

## Avvio

1. Installare le dipendenze JavaScript con `npm ci`.
2. Creare un database di sviluppo dedicato e copiarne i parametri in `server/config.php`, partendo dal modello.
3. Per HTTP locale impostare `secure_cookies=false`. Il file resta ignorato da Git.
4. Per sviluppo, `policy_path` può puntare al percorso assoluto del file `public/policies/80_20_difficult.policy.json`; in release il pacchetto lo copia anche in `server/data`.
5. Eseguire `php server/bin/migrate.php`.
6. Avviare `npm run serve:api` e, in un altro terminale, `npm run dev`.

Vite inoltra `/api` a `http://127.0.0.1:8088`. Aprire il dominio/porta Vite e non direttamente la porta PHP: così cookie e chiamate sono della stessa origine. Il server PHP integrato è solo per sviluppo; la concorrenza di produzione è fornita da Apache/PHP sull'hosting.

Se PHP non è nel PATH, usare il percorso completo dell'eseguibile. Nell'ambiente locale Windows di questa consegna sono disponibili PHP e MySQL in Laragon; è stata usata una nuova istanza MySQL su `127.0.0.1:3307` con dati in `output/mysql-v1`, separata da altri progetti. Configurazione e dati locali non fanno parte della release.

## Test frontend

```sh
npm run test
npm run build
```

Vitest copre regole originali, bot, partite legali, hidden information del controller locale, rivelazioni ritardate, ridistribuzione Fill, esiti anticipati, XP ospite, replay ed errori di caricamento. I test online verificano anche la macchina temporale usata dal tavolo remoto.

## Test PHP/MySQL

Preparare **un database distinto chiamato esattamente `duel_v1_test`** e il file privato `server/config.test.php` con la stessa struttura della configurazione principale. Il DSN deve contenere `dbname=duel_v1_test`. La policy può essere quella del repository.

```sh
npm run test:php
```

Oppure `php server/tests/run.php` con l'eseguibile PHP desiderato. La suite rifiuta nomi database diversi da `duel_v1_test`. All'inizio svuota le quattro tabelle **di quel database di test**; non usarlo per conservare dati utili.

I controlli includono login, unicità, privacy della nazione, validazione dei numeri, accessi non autorizzati, conferme nascoste, retry, riconnessione, timeout, cron, ELO, classifiche, esito anticipato, tre difficoltà bot e assenza di premi per abbandono. Due processi PHP indipendenti confermano in parallelo usando la stessa istanza MySQL; viene verificata anche la doppia richiesta simultanea della stessa mossa finale.

Non esiste un endpoint pubblico per accelerare il tempo o impostare un risultato. La suite modifica direttamente le scadenze nel database isolato per evitare attese di un minuto in ciascun test.

## Verifica HTTP e browser

Oltre ai test automatici, verificare con due contesti browser realmente distinti: due schede condividono normalmente la stessa sessione e non rappresentano due giocatori.

- Registrazione/login, cookie e CSRF; accesso anonimo a una partita privata rifiutato.
- Gioco ospite senza servizio account configurato.
- Partita multiplayer completa, una conferma in attesa dell'altra, refresh durante l'attesa.
- ELO coerente sui due profili e collegamenti dalla classifica.
- Bot con account: punti su database e nessun aggiornamento della chiave XP ospite.
- Bandiera modificabile/nascondibile e password cambiabile.
- Mobile 320/390 px, tablet e desktop; nessun overflow orizzontale della pagina.
- Timer server, intermezzi e animazioni; preferenza di movimento ridotto.
- Scadenza dopo chiusura di entrambi i browser: eseguire cron e controllare il risultato.

Gli screenshot e gli script esplorativi locali sono sotto `output/ui-review`, esclusi dalla release. La verifica locale non sostituisce lo smoke test sul piano SiteGround effettivo, in particolare per cookie HTTPS, cache, cron e carico.
