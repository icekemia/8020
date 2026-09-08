# Registro decisioni — V1

Data: 8 settembre 2026. Ambito: beta privata.

| Decisione | Motivazione e conseguenza |
| --- | --- |
| Usare SiteGround LAMP esistente | Il gruppo è ristretto e il gioco è a turni. Evita un nuovo hosting prima di validare il multiplayer |
| Frontend statico + API PHP | Il tavolo React resta riutilizzabile, senza Node sul server |
| Polling, non WebSocket | Funziona su shared hosting senza processi persistenti; piccolo ritardo di rivelazione accettato per il test |
| Account opzionale contro bot | Si può provare subito. Chi accede ottiene progressione persistente |
| Nessuna importazione XP ospite | Il localStorage è modificabile e non è una fonte attendibile per una classifica |
| Bot autenticato sul server | Non accettare dal client dichiarazioni di vittoria o punti |
| Una partita attiva per account | Evita sovrapposizioni, facilita riconnessione e mantiene semplice l'ordine dei risultati |
| Stanze tramite codice | Sufficiente per gli amici/tester; nessun matchmaking pubblico nella V1 |
| 60 secondi per scelta multiplayer | Prima verificare comprensione e strategia; la pressione di una modalità rapida non è introdotta ora |
| Nessun timer contro bot | Rimane una modalità di allenamento |
| Timer successivo agli intermezzi | Le animazioni non consumano il minuto destinato alla scelta |
| Forfait se manca una conferma | Regola esplicita e semplice; la riconnessione non modifica la scadenza |
| Due assenze annullano la partita | Nessun vincitore inventato e nessuna variazione ELO |
| XP ed ELO separati | XP = progressione contro bot; ELO = risultati contro persone |
| ELO 1200, K=32, provvisorio per 10 partite | Formula trasparente e leggibile nel gruppo di test; nessuna pretesa di ranking competitivo definitivo |
| Profilo accessibile da entrambe le classifiche | Una pagina pubblica unica con statistiche distinte e storico recente |
| Nazione facoltativa e nascondibile | La geolocalizzazione può essere errata o influenzata da VPN; prevale la scelta dell'utente |
| Geolocalizzazione esterna configurabile | Evita una dipendenza necessaria al login; il fallimento non blocca la registrazione |
| Recupero password assistito | Per il test privato non richiede SMTP o servizi email; resta documentato come limite operativo |
| Documentazione in `documentation/` | Versionata nel repository; la precedente cartella `/docs` era ignorata da Git |

## Cosa osservare durante il test

Raccogliere durata delle scelte, comprensione del Fill, frequenza dei timeout, ritardo percepito nelle rivelazioni, affidabilità delle riconnessioni, difficoltà bot e consumo risorse dell'hosting. Queste osservazioni serviranno a decidere il TODO V2 in una fase successiva, senza anticiparlo come lavoro già approvato.
