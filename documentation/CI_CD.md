# GitHub Actions e deploy SiteGround

Il workflow `.github/workflows/ci-cd.yml` verifica pull request e push su `main`/`master`. Tre job indipendenti eseguono test e build React/TypeScript, test PHP 8.3 con MySQL 8 e test Python 3.12 del solver. I test del deploy controllano anche rollback, protezione della configurazione e rifiuto di archivi non validi. Le action sono fissate a commit specifici.

La build produce l'artefatto `siteground-release`, conservato su GitHub per 14 giorni. `BUILD.json` identifica il commit. Node e Python girano sui runner GitHub: SiteGround esegue solo PHP e MySQL. SSH/SCP permette di aggiornare anche il backend fuori dalla document root, mantenendo le credenziali sul server.

## Prima configurazione

1. Completare [DEPLOYMENT.md](DEPLOYMENT.md): dominio HTTPS dedicato, database, `server/config.php`, schema e cron. Per il deploy PHP CLI deve avere PDO MySQL, cURL e ZipArchive; verificare il percorso del binario e almeno 256 MB di memoria.
2. Attivare SSH in Site Tools e autorizzare una chiave dedicata al deploy. Conservare la chiave privata nei secrets GitHub. Verificare la fingerprint del server tramite un canale attendibile prima di salvare la relativa riga `known_hosts`; per porte non standard il nome ha forma `[host]:porta`.
3. Nella directory del dominio, genitore di `public_html`, creare il file privato `.duel-deploy-enabled` contenente esattamente `DUEL8020` (un newline finale è ammesso). Questo abilita esplicitamente quella destinazione. La directory deve essere scrivibile dall'utente SSH.
4. Se esiste già un'API precedente, installare una volta il nuovo `public/api/index.php`, che gestisce il file `.duel-maintenance`, prima del primo deploy automatico. Il deploy rifiuta un'API esistente senza questa protezione.
5. In GitHub, Settings → Environments, creare `siteground-testing` e limitare i deployment al branch `main`. Le impostazioni dell'environment possono richiedere il proprietario/amministratore del repository.

Configurare i seguenti **secrets**, a livello repository oppure nell'environment `siteground-testing`:

| Nome | Contenuto |
| --- | --- |
| `SSH_HOST` | Host SSH indicato da SiteGround |
| `SSH_USER` | Utente SSH |
| `SSH_PRIVATE_KEY` | Chiave privata dedicata completa, senza passphrase interattiva |
| `SSH_PORT` | Porta SSH effettiva |
| `SITEGROUND_KNOWN_HOSTS` | Riga/e della chiave host SSH, con fingerprint verificata |

Sono compatibili anche i nomi precedenti `SITEGROUND_HOST`, `SITEGROUND_USER` e `SITEGROUND_SSH_KEY`. I nomi `SSH_*` hanno precedenza; per la porta il fallback è la variabile `SITEGROUND_PORT`, poi 18765. GitHub non permette di recuperare i valori dei secrets tramite CLI: per verifiche SSH locali occorre conoscere separatamente host e utente. La chiave privata locale resta fuori dal repository.

Configurare le seguenti **environment variables**:

| Nome | Contenuto |
| --- | --- |
| `SITEGROUND_PORT` | Porta SSH effettiva; default 18765 |
| `SITEGROUND_ROOT` | Percorso assoluto della directory del dominio, genitore di `public_html`, senza slash finale |
| `SITEGROUND_PHP` | Percorso assoluto del binario PHP CLI compatibile |
| `SITEGROUND_URL` | URL HTTPS alla root del dominio di test, senza sottocartelle |

I percorsi del deploy ammettono lettere, cifre, `_`, `.`, `/` e `-`, senza spazi né componenti `..`. Non inserire password MySQL nei secrets GitHub: il deploy usa la configurazione privata già presente sull'hosting.

## Primo rilascio e automazione

Dopo il merge della pipeline su `main`, aprire Actions → CI / SiteGround testing → Run workflow, scegliere `main` e attivare `deploy`. Il rilascio parte solo quando tutti e tre i job passano e usa lo ZIP prodotto dalla stessa esecuzione. Una pull request non può avviare il deploy.

Dopo il primo rilascio riuscito, per pubblicare automaticamente ogni push su `main`, creare la **repository variable** `DEPLOY_TESTING` con valore `true` (Settings → Secrets and variables → Actions → Variables). Lasciarla assente o `false` mantiene i rilasci manuali. Il workflow deve trovarsi sul branch predefinito per essere avviato dall'interfaccia Actions.

## Protezioni e limiti operativi

Il deploy usa un lock e una breve manutenzione API (HTTP 503 con `Retry-After`). Rifiuta il rilascio se ci sono partite multiplayer attive: attendere la loro conclusione o la scadenza gestita dal cron, quindi riprovare. Eseguire preferibilmente gli aggiornamenti quando i tester sono disconnessi; il controllo non blocca partite bot già aperte.

Ogni file viene sostituito tramite rename, backend prima e `index.html` per ultimo. Non è uno scambio atomico dell'intera directory. I file precedenti vengono salvati in `.deploy/releases/<commit-run-attempt>/backup`; i vecchi asset rimangono disponibili. `server/config.php` non viene sovrascritto, lo schema non viene migrato automaticamente e il database non viene ripristinato dal rollback.

Dopo l'aggiornamento un controllo HTTPS verifica la sessione anonima dell'API. Se fallisce, vengono ripristinati i file precedenti e rimossi solo quelli appena aggiunti. Se il ripristino fallisce, il sito resta in manutenzione: controllare il log Actions e ripristinare i file dal backup prima di rimuovere `public_html/.duel-maintenance`. Il controllo finale non sostituisce una partita di prova sul dominio.

Il server conserva archivi ricevuti, staging e backup nella directory privata `.deploy`; non esegue pulizie automatiche. Monitorare lo spazio e rimuovere manualmente le vecchie release dopo aver verificato quella corrente, identificata da `.deploy/current.json`. Conservare separatamente backup di database e configurazione.

## Installazione di test del 9 settembre 2026

Il primo rilascio su `https://8020.smartsup.lt` è riuscito tramite [GitHub Actions](https://github.com/icekemia/8020/actions/runs/34318378634). L'environment `siteground-testing` è stato creato automaticamente dalla prima esecuzione del job. La variabile repository `DEPLOY_TESTING=true` abilita ora i rilasci dopo i test sui push a `main`.

PHP CLI dell'hosting è 8.2.33, con memoria 768 MB, PDO MySQL, cURL e ZipArchive disponibili. Schema e configurazione privata sono installati; le credenziali database restano esclusivamente sull'hosting. La chiave host SSH è stata registrata al primo collegamento al nome host fornito dal proprietario e fissata nel secret `SITEGROUND_KNOWN_HOSTS`; non è stata confrontata con una fingerprint fornita separatamente da SiteGround.

Verificati via HTTPS: registrazione/login con due sessioni indipendenti, partita multiplayer completa con Split e Fill, segretezza delle mosse, aggiornamento singolo delle statistiche, bot Hard autenticato, XP persistenti e classifiche. Gli account e le partite temporanei della verifica sono stati rimossi.

La pianificazione del cron richiede Site Tools perché `crontab` non è disponibile via SSH. Lo script è stato eseguito correttamente a mano; la frequenza consentita dal pannello è ancora da confermare. Se il piano permette soltanto ogni 30 minuti, vedere le conseguenze descritte in DEPLOYMENT.md. La protezione dell'environment al solo branch `main` può essere aggiunta dal proprietario in Settings; il workflow limita già il deploy al branch predefinito.
