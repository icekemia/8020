# Architettura V1

## Struttura del repository

```text
web/
  main.tsx                   ingresso pubblico dell'app
  GuestGame.tsx              esperienza originale contro bot, XP locali
  portraits.tsx, style.css   carte, illustrazioni e stile del tavolo
  game/                     regole TS e funzioni di presentazione
  bot/                      strategie locali Easy / Medium / Hard
  online/
    Club.tsx                account, home, classifiche, profili
    RemoteTable.tsx         tavolo remoto, timer, polling e animazioni
    api.ts                  client HTTP, cookie, CSRF, timeout e tipi
    countries.tsx           codici ISO, nomi localizzati e bandiere SVG
public/
  api/index.php             front controller PHP
  policies/                 policy del bot ospite
server/                     NON pubblicare dentro public_html
  bootstrap.php             caricamento servizi e configurazione
  config.example.php        modello senza credenziali reali
  config.php                configurazione privata, ignorata da Git
  schema.sql                schema V1
  src/Game.php              regole autorevoli e bot PHP
  src/Store.php             PDO, transazioni, utenti e rate limit
  src/Matches.php           stanze, mosse, scadenze, XP ed ELO
  src/Accounts.php          account, profili, classifiche e nazione
  bin/                      migrazione, scadenze, reset password assistito
  tests/                    test su un database dedicato
documentation/              documentazione versionata
scripts/package-v1.mjs      creazione dello ZIP di pubblicazione
```

Il solver Python rimane uno strumento offline del progetto. Non viene installato su SiteGround. La policy già esportata viene inclusa nella release sia per gli ospiti sia nel percorso privato del backend.

## Due percorsi di gioco

**Ospite:** il motore TypeScript e il bot funzionano nel browser. Gli XP restano nella chiave `duel8020.xp`. Possono essere persi o modificati dall'utente e non entrano in alcuna classifica.

**Account:** il motore PHP crea e risolve la partita. Il browser invia solamente la scelta per la fase attesa. Risultati, bot e premi non vengono accettati dal client. Anche contro il bot il server sceglie prima della mossa umana. Gli XP dell'account non vengono scritti nel localStorage.

## Modello dati

| Tabella | Contenuti e vincoli principali |
| --- | --- |
| `users` | Email e nickname univoci; hash password; nazione/privacy; XP; ELO e statistiche multiplayer |
| `matches` | ID casuale a 128 bit, codice invito, partecipanti, modalità, stato privato, scadenze in millisecondi UTC, esito, premi e flag `settled` |
| `moves` | Una scelta per giocatore/fase/partita; la chiave primaria rende ripetibili le richieste senza duplicazioni |
| `rate_limits` | Contatori temporanei con chiavi HMAC; nessun IP in chiaro nella tabella |

Lo stato interno della partita è JSON in una colonna LONGTEXT. Contiene anche le mosse non ancora rivelate e non viene mai restituito direttamente. Il DTO costruito da `Matches::view` include solo le carte pubbliche e l'eventuale scelta privata del richiedente. Gli indicatori di conferma dell'avversario sono booleani.

Il DTO presenta sempre il richiedente come giocatore A (`TU`), anche quando occupa il posto B nel database. Carte, risultati e punteggi vengono invertiti coerentemente. Non espone email, hash password o nazione nascosta dell'avversario.

## Sincronizzazione e scadenze

1. Un utente crea una stanza privata; il server genera il codice invito.
2. Il secondo utente entra: il server fissa l'apertura del primo Split dopo 3 secondi di preparazione.
3. Per ogni scelta multiplayer la scadenza è `opens_at + 60000`.
4. La prima conferma viene salvata senza rivelare il valore all'altro giocatore.
5. La seconda conferma risolve la fase in una transazione. Entrambi ricevono la stessa nuova versione pubblica.
6. Dopo Split 1 ci sono 1,8 secondi per la rivelazione; dopo Split 2 ci sono 7 secondi per rivelazione, terza carta automatica e introduzione Fill. Il timer della scelta successiva parte solo dopo questi intervalli.
7. Refresh e riconnessione rileggono gli stessi timestamp. Il client non può riavviare il timer né confermare durante la preparazione.

Il browser sincronizza il conto alla rovescia con `serverNow`. Gli errori di rete non annullano la partita; il polling tenta il recupero. Una risposta con versione inferiore a quella già visualizzata viene scartata.

Se manca una conferma alla scadenza, il giocatore che ha confermato vince per tempo. Se mancano entrambe, la partita viene annullata senza ELO. Le scadenze vengono controllate sulle letture/scritture e da un cron ogni minuto, così non dipendono da un browser lasciato aperto. Il cron può registrare materialmente la chiusura fino a circa un minuto dopo la scadenza; una richiesta tardiva non viene comunque accettata.

È consentita una sola stanza/partita attiva per account. Gli inviti scadono dopo 24 ore. Le partite bot abbandonate senza chiusura vengono eliminate dalla lista attiva dopo 48 ore senza avanzamento di fase; non hanno un timer di scelta.

## Transazioni e idempotenza

Le conferme acquisiscono `SELECT … FOR UPDATE` sulla partita. Il server controlla appartenenza, scadenza, fase e valori all'interno della stessa transazione. Una ripetizione della stessa scelta per la stessa fase restituisce la situazione aggiornata; una scelta diversa già confermata viene rifiutata.

La risoluzione aggiorna partita, punti e statistiche nella stessa transazione. `settled` impedisce doppi premi. Gli account coinvolti nell'ELO sono bloccati in ordine di ID; deadlock e lock timeout vengono ritentati al massimo due volte dopo il rollback. I test lanciano processi PHP concorrenti contro MySQL per controllare questo comportamento.

## Esiti e punti

- Il Fill deve usare esattamente 20 unità, ciascuna carta da 0 a 20. L'interfaccia ridistribuisce automaticamente le differenze; PHP valida comunque il totale.
- Il vincitore conquista più manche dell'avversario. Le manche pareggiate valgono mezzo punto nella visualizzazione del risultato.
- Se ogni coppia legale di Fill produce lo stesso esito, la partita termina dopo Split. Non si inventano aggiunte o punteggi finali.
- XP: vittoria Easy 30, Medium 60, Hard 100; pareggio 20; sconfitta giocata 10. Abbandono o scadenza di una partita bot non assegnano XP.
- ELO iniziale 1200, K=32, aspettativa standard `1 / (1 + 10^((ELO_avversario − ELO_proprio)/400))`. La variazione di A viene arrotondata all'intero più vicino; B riceve l'opposto. Vittoria 1, pareggio 0,5, sconfitta 0. Abbandoni e timeout con un vincitore contano nelle statistiche multiplayer.
- ELO provvisorio per meno di 10 partite concluse. Account senza partite non compaiono nella classifica ELO; account con 0 XP non compaiono in quella XP.

La barra di vantaggio è soltanto una stima su completamenti casuali delle carte pubbliche, con i pareggi pesati metà. Non è una previsione calibrata contro il particolare bot o giocatore.

## Autenticazione e privacy

Cookie di sessione HttpOnly, SameSite=Lax e Secure sull'hosting HTTPS. Ogni scrittura richiede un token CSRF ottenuto dalla sessione. Il login ruota ID e token; logout e cambio password ruotano la sessione. Il cambio/reset della password invalida le altre sessioni alla loro richiesta successiva.

Il server non si fida di intestazioni IP fornite dal browser. L'eventuale rilevamento nazione usa `REMOTE_ADDR`, un'estensione GeoIP locale se disponibile, oppure country.is se abilitato. Salva solo la scelta ISO dell'utente e non la modifica ai login successivi. I log del web server SiteGround possono conservare IP indipendentemente dall'applicazione: la loro conservazione va configurata sull'hosting.
