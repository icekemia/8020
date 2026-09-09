# Stack e motivazioni

## Scelta V1

| Livello | Tecnologia | Motivo |
| --- | --- | --- |
| Interfaccia | React, TypeScript | Conserva il tavolo e le animazioni del prototipo; tipi condivisi tra viste e API |
| Build locale | Vite, Node.js | Produce HTML/CSS/JS statici; Node non è necessario su SiteGround |
| API | PHP 8.1+ senza framework | Compatibilità con hosting condiviso, installazione piccola e nessun processo permanente |
| Database | MySQL / InnoDB, PDO | Transazioni, blocchi di riga, vincoli univoci e assegnazione atomica dei punti |
| Sincronizzazione | Polling HTTP | Sufficiente per scelte a turni; nessun requisito WebSocket, Redis o daemon |
| Login | Sessione PHP, cookie HttpOnly/SameSite | La credenziale di sessione non è accessibile a JavaScript né conservata nel localStorage |
| Password | `password_hash` / `password_verify` | Hash adattivo nativo PHP, nessuna password in chiaro nel database |
| Test | Vitest, Testing Library, test PHP/MySQL, browser reali | Verifica regole, interfaccia, concorrenza e integrazione |
| Deployment | ZIP con `public_html/` e `server/` separati | Upload via File Manager/SFTP, codice privato esterno alla document root |

Le versioni JavaScript esatte sono fissate in `package-lock.json`: usare `npm ci` per riprodurre la build. L'ambiente di verifica locale utilizza Node 22.13.1, PHP 8.1.10 e MySQL 8.0.30. Per l'hosting scegliere una versione PHP attualmente supportata, preferibilmente 8.3 o 8.4, ed eseguire lo smoke test anche lì. PHP 8.1 è il minimo sintattico, non una raccomandazione di manutenzione per produzione.

## Perché non WebSocket nella V1

I giocatori non devono inviare coordinate o azioni decine di volte al secondo. Confermano una scelta per fase; il server la conserva e la rivela dopo la doppia conferma. Il polling avviene ogni secondo in partita e ogni 1,5 secondi nella sala d'attesa, senza richieste periodiche sovrapposte. Termina quando il risultato è noto o la vista viene smontata.

La latenza visiva può essere di circa un intervallo di polling, oltre al tempo di rete. Le scadenze sono comunque decise dal server. Non vengono mantenute aperte connessioni PHP per long polling/SSE.

## Risorse e dipendenze

PHP richiede PDO MySQL, sessioni e JSON. cURL serve soltanto per la geolocalizzazione esterna opzionale. Non servono Composer, npm, Python o il solver sul server pubblico.

La strategia Hard viene esportata prima della pubblicazione. Il backend carica il JSON della policy per scegliere il bot: nella suite locale il picco del processo è di circa 100 MB. Configurare almeno 256 MB di `memory_limit` e controllare il consumo reale del piano. La sola parte multiplayer non carica quella policy.

L'interfaccia usa font Google con fallback locali di sistema. Le illustrazioni dei bot sono SVG originali inclusi nel codice. Le bandiere sono SVG locali della libreria `flag-icons` (MIT), così vengono visualizzate anche su sistemi che non supportano le emoji regionali. Non viene contattato un CDN per le bandiere.

## Capacità attesa

Questa scelta è proporzionata a un gruppo ristretto, non certifica una capacità di utenti simultanei. Due giocatori in partita producono circa due letture API al secondo, oltre alle conferme. I limiti CPU, processi PHP e richieste del piano SiteGround devono essere osservati durante il test. Le API e il database sono separati dalla UI per permettere uno spostamento successivo del backend.
