# Pubblicazione V1 su SiteGround shared

## 1. Preparazione locale

Requisiti locali: Node compatibile con Vite, npm e Python per comprimere lo ZIP. Per sviluppare/testare il backend servono anche PHP e MySQL; non servono per la sola build della UI.

```sh
npm ci
npm run test
npm run package:v1
```

`package:v1` esegue la build e crea `release/duel-v1-<timestamp>.zip`. Non include `config.php`, database locali, credenziali, test o directory `node_modules`. Include il codice PHP, la policy, i file statici e questa documentazione.

## 2. Predisporre l'hosting

Usare preferibilmente un sottodominio dedicato ai test. In Site Tools:

1. Attivare HTTPS e forzarne l'uso.
2. Scegliere PHP supportato, preferibilmente 8.3/8.4. Verificare PDO MySQL, sessioni e JSON; cURL soltanto se si abilita country.is.
3. Impostare `memory_limit` almeno a 256 MB per il bot con policy.
4. Creare un database MySQL e un utente dedicato, con permessi su quel solo database.
5. Escludere `/api/*` dalla cache dinamica e da eventuale CDN/cache esterna. Non memorizzare risposte con cookie o token CSRF.

I menu precisi e i limiti variano con il piano: verificare CPU, processi PHP, memoria e disponibilità cron nel pannello del proprio account.

## 3. Layout dei file

Estrarre lo ZIP e caricare mantenendo questa struttura:

```text
directory-del-dominio/
  public_html/
    index.html
    assets/
    policies/
    api/index.php
    .htaccess
  server/
    bootstrap.php
    config.php                creato sull'hosting, NON nello ZIP
    config.example.php
    schema.sql
    src/
    bin/
    data/80_20_difficult.policy.json
```

`server` è fratello di `public_html`, non suo figlio. Il front controller risolve il percorso relativo `../../server/bootstrap.php`. La documentazione può rimanere fuori dalla document root. Non caricare lo ZIP o backup SQL nella cartella pubblica. Il file di difesa `server/.htaccess` è aggiuntivo: la separazione dei percorsi resta necessaria.

La V1 assume il sito alla root di un dominio/sottodominio. Per un'installazione in sottocartella occorre prima adattare base Vite, percorsi API/policy e cookie; non è una configurazione già coperta.

## 4. Configurazione privata

Copiare `server/config.example.php` in `server/config.php` e inserire:

- `dsn`: host e nome database assegnati da SiteGround, con `charset=utf8mb4`.
- `db_user`, `db_password`: credenziali dedicate, mai nel repository.
- `app_secret`: almeno 32 caratteri casuali; raccomandati 32 byte codificati in 64 caratteri esadecimali.
- `secure_cookies`: `true` in hosting HTTPS. `false` solo nello sviluppo locale HTTP.
- `registration_code`: facoltativo, un codice condiviso col gruppo di tester per limitare le nuove registrazioni.
- `geoip_enabled`: normalmente `false`; impostare `true` per country.is solo dopo aver predisposto l'informativa applicabile. La UI spiega l'invio dell'IP al servizio durante la registrazione.
- `policy_path`: lasciare il percorso privato incluso nel modello, salvo diversa disposizione.

Generazione del segreto con PHP CLI:

```sh
php -r "echo bin2hex(random_bytes(32)), PHP_EOL;"
```

Conservare il file privato con permessi minimi compatibili con l'utente PHP dell'hosting, normalmente 600 o 640. Non committare o inviare in chat password e segreti.

## 5. Schema

Importare `server/schema.sql` nel database dedicato tramite phpMyAdmin, oppure eseguire via SSH:

```sh
php /percorso-del-dominio/server/bin/migrate.php
```

La migrazione crea le tabelle V1 se assenti; non elimina dati. Non è un sistema generale di aggiornamento degli schemi: eventuali modifiche future richiederanno migrazioni numerate dedicate.

## 6. Cron

Aggiungere un'attività ogni minuto:

```cron
* * * * * /percorso/php /percorso-del-dominio/server/bin/cron.php
```

Usare il percorso PHP effettivo del piano e il percorso reale del dominio mostrati da SiteGround. Lo script non è un endpoint web. Chiude timeout anche quando entrambi i browser sono stati chiusi, scade gli inviti vecchi e rimuove i contatori rate limit scaduti. Conservare gli errori in un log privato; il normale output può essere reindirizzato secondo il pannello.

Nel pannello inserire l'intervallo senza parentesi: `* * * * *` oppure `*/1 * * * *`. Se ci sono campi separati, usare `*/1` nei minuti e `*` negli altri quattro. Se il piano impone un minimo di 30 minuti, nessuna sintassi equivalente aggira il limite: `0,30 * * * *` esegue ai minuti 0 e 30. Il timeout durante il polling resta di 60 secondi; quando entrambi i giocatori sono offline, la chiusura e l'aggiornamento delle statistiche possono attendere fino al successivo cron, salvo un accesso alla partita che ne elabori prima la scadenza. Per un test ristretto questa frequenza può essere accettabile; un'esecuzione esterna più frequente richiederebbe una configurazione dedicata.

## 7. Smoke test sul dominio

1. Aprire il gioco senza login: il bot funziona, gli XP sono locali.
2. Registrare due account distinti in due browser/profili separati.
3. Verificare cookie Secure/HttpOnly e risposte API `no-store`.
4. Giocare contro il bot autenticato: XP aggiornati nel database e nella classifica XP.
5. Creare un invito, entrare dal secondo account, confermare una mossa solo da un lato: il valore resta nascosto all'altro.
6. Ricaricare il primo browser: scelta e scadenza restano quelle originali.
7. Completare il multiplayer: ELO e W/D/L si aggiornano una volta sola; ricontrollare dopo refresh.
8. Aprire la classifica ELO e il profilo; modificare/nascondere la nazione.
9. Provare timeout con una e con zero conferme, e abbandono esplicito.
10. Controllare log PHP, cron e consumo risorse SiteGround.

## Manutenzione del test

Password dimenticata: l'organizzatore può usare `server/bin/reset-password.php email` passando la nuova password via standard input, non come argomento visibile nella lista processi. Comunicarla al tester con un canale appropriato e chiedere di cambiarla nel profilo. Il reset invalida le sessioni precedenti alla richiesta successiva. La V1 non invia email.

Per un gruppo ristretto è utile fissare una durata del test e una politica di cancellazione di account, risultati e log. Le richieste di cancellazione sono gestite dall'organizzatore nella V1; non esiste ancora una procedura self-service.

## Aggiornamento e rollback

Prima di sostituire una release: backup privato di database e `config.php`, poi verifica della nuova build in ambiente di test. Conservare la release precedente fuori da `public_html`. Non sovrascrivere `config.php` con il modello né caricare credenziali locali.

Per il rollback dei soli file, ripristinare insieme frontend e backend della stessa versione, mantenendo la configurazione privata. Per modifiche allo schema valutare prima la compatibilità; non applicare automaticamente vecchi SQL al database con dati reali. Il pacchetto V1 include `BUILD.json` per identificare la build.

CI/CD con GitHub Actions: vedere [configurazione e rilascio automatico](CI_CD.md).

