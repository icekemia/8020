# 80/20 Duel Club — V1 multiplayer

Versione `1.0.0-beta.1`, destinata a una cerchia ristretta di tester su hosting condiviso SiteGround. Questa documentazione descrive ciò che è implementato, come eseguirlo e come pubblicarlo. Il TODO della V2 verrà definito dopo i test; non è incluso in questa consegna.

## Indice

- [Stack e decisioni](STACK.md): tecnologie, motivazioni e limiti della scelta.
- [Architettura e regole](ARCHITECTURE.md): struttura dell'applicazione, flussi, database e sincronizzazione.
- [Contratto API](API.md): autenticazione, endpoint, payload e gestione errori.
- [Pubblicazione su SiteGround](DEPLOYMENT.md): configurazione, database, cron, cache e rollback.
- [Verifica e ambiente locale](TESTING.md): test automatici, database isolato e prove manuali.
- [Registro delle decisioni](DECISIONS.md): scelte di prodotto e tecniche della V1.

## Perimetro consegnato

- Ospiti: bot Easy/Medium/Hard, nessuna registrazione richiesta, XP nel localStorage.
- Account: registrazione con email/password/nickname, login/logout, cambio password, nazione modificabile e bandiera nascondibile.
- Bot con account: partite arbitrate da PHP e XP persistenti in MySQL. Nessuna importazione di XP locali.
- Multiplayer: stanze private tramite codice, due giocatori, scelte simultanee segrete, polling, riconnessione, abbandono e timeout.
- Classifiche XP ed ELO con paginazione e collegamenti ai profili pubblici.
- Profili: ELO attuale/massimo, W/D/L, percentuale di vittorie, miglior serie, ultimi dieci risultati multiplayer e XP separati.
- Interfaccia responsive con rivelazioni, Fill, risultati animati e supporto al movimento ridotto.
- Backend compatibile con LAMP shared, schema SQL, strumenti CLI e pacchetto di pubblicazione senza segreti.

## Stato della pubblicazione

Il codice e il pacchetto sono preparati e verificati localmente. La pubblicazione sul dominio richiede la creazione del database e l'inserimento delle credenziali reali SiteGround in `server/config.php`; tali credenziali non sono nel repository né nello ZIP.

## Limiti deliberati del test

Nessun matchmaking pubblico, chat, pagamento o server Node in produzione. Nessuna email automatica: il recupero password è assistito dall'organizzatore tramite CLI. L'email non viene verificata. Il sistema ELO è utilizzabile nel gruppo di test ma non include protezioni avanzate contro account multipli e accordi tra giocatori. Il servizio di geolocalizzazione esterno è opzionale e disabilitato nella configurazione di esempio.

CI/CD con GitHub Actions: vedere [configurazione e rilascio automatico](CI_CD.md).

