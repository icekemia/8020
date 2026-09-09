# Contratto HTTP V1

Base: `/api/index.php?route=...`. Non richiede URL rewriting. Frontend e API devono essere sullo stesso dominio, con HTTPS in hosting. Il codice V1 è predisposto per la root di un dominio/sottodominio, non per un prefisso arbitrario come `/giochi/duel/`.

Le risposte riuscite contengono `{"data": ...}`. Gli errori contengono `{"error": "messaggio leggibile"}` e il relativo stato HTTP. L'API usa `Cache-Control: no-store, private`; non deve essere memorizzata da SiteGround/CDN.

## Sessione

`GET ?route=session` inizializza anche la sessione ospite e restituisce:

```json
{
  "data": {
    "user": null,
    "csrf": "token-generato-dal-server",
    "countryLookup": false,
    "registrationCodeRequired": false
  }
}
```

Per tutte le POST: cookie di sessione, `Content-Type: application/json`, header `X-CSRF-Token` con il token corrente. Un login/logout/cambio password restituisce un nuovo token; sostituire quello precedente. Il client web gestisce questi passaggi e non salva credenziali nel localStorage.

## Endpoint

| Metodo e route | Autenticazione | Dati |
| --- | --- | --- |
| GET `session` | No | Utente privato corrente o null, CSRF, opzioni registrazione |
| POST `register` | CSRF ospite | `email`, `password`, `nickname`, `country` opzionale, `countryPublic`, `invite` se configurato |
| POST `login` | CSRF ospite | `email`, `password` |
| POST `logout` | CSRF | `{}`; non abbandona automaticamente una partita |
| GET `country` | No | Suggerimento nazione; può essere null |
| GET `ranking&type=xp&page=0` | No | 25 righe, `hasMore`, pagina a base zero; `type` può essere `elo` |
| GET `profile&id=123` | No | Profilo pubblico e ultimi dieci risultati multiplayer |
| POST `profile` | Sì | `country` ISO/null e `countryPublic` booleano |
| POST `password` | Sì | `currentPassword`, `newPassword` |
| GET `current` | Sì | Partita attiva/in attesa oppure null |
| POST `create` | Sì | `mode: bot|multi`, `difficulty: easy|medium|hard` per il bot |
| POST `join` | Sì | `code`, dieci caratteri esadecimali |
| GET `match&id=...` | Partecipante | Snapshot normalizzato per il richiedente |
| POST `commit` | Partecipante | `id`, `phase`, `action` |
| POST `leave` | Partecipante | `id`; annulla una stanza in attesa, abbandona una partita attiva |
| POST `lobby` | Sì | `available` booleano; aggiorna presenza e restituisce `players`, `offers`, `current`, `serverNow` |
| POST `challenge` | Sì | `target` ID intero per sfida diretta, omesso/null per sfida aperta; restituisce Snapshot in attesa |
| POST `decline-challenge` | Destinatario | `id` della sfida diretta; restituisce true |
| POST `rematch` | Partecipante | `id` del duello concluso, `action: request|accept|decline|cancel`; restituisce lo Snapshot precedente con `rematch` aggiornato |

V1.1: lo Snapshot include `offer: {targeted, expiresAt}|null` e `rematch: {mine, state, expiresAt, nextId}|null`. `state` è `pending`, `accepted`, `declined`, `cancelled` o `expired`. Se `nextId` è presente, leggere quel match per aprire il nuovo duello; il precedente conserva il risultato. La sala espone solo dati pubblici, mai email né scelte di gioco. Gli inviti aperti/diretti scadono dopo 60 secondi; i codici privati ordinari restano validi 24 ore. Dettagli in [V1_1.md](V1_1.md).

## Conferma

```json
{"id":"identificatore-di-32-caratteri-hex","phase":"SPLIT_1_COMMIT","action":27}
```

```json
{"id":"identificatore-di-32-caratteri-hex","phase":"FILL_COMMIT","action":[0,10,10]}
```

Le fasi ammesse sono `SPLIT_1_COMMIT`, `SPLIT_2_COMMIT`, `FILL_COMMIT`. Numeri JSON interi, non stringhe né decimali. La ripetizione identica di una scelta già registrata è idempotente anche se nel frattempo la fase è cambiata. Una ripetizione con valore diverso dà 409. Una richiesta arrivata dopo la scadenza restituisce il risultato autorevole senza applicare la mossa tardiva.

Non esistono endpoint per impostare XP, ELO, vincitore, timer o mossa del bot dal client.

## Snapshot

Campi principali: `id`, `code` solo in attesa, `mode`, `difficulty`, `status`, `game`, `ownCommitted`, `opponentCommitted`, `opponent`, `me`, `phaseAt`, `opensAt`, `deadlineAt`, `serverNow`, `version`, `reason`, `reward`.

`status`: `waiting`, `active`, `finished`, `cancelled`.

`reason`: `completed`, `decided`, `timeout`, `abandon`, `expired`, oppure null prima della conclusione.

`reward`: `{"xp":0,"elo":16}` dal punto di vista del richiedente. Gli XP vengono assegnati solo alle partite bot concluse; le partite multiplayer modificano solo ELO e statistiche.

`game` usa il richiedente come A. `pending.A` può contenere la sua scelta; `pending.B` non viene restituito. `fill` è vuoto prima della fine. `result.scores` è presente solo quando esiste un Fill finale effettivamente giocato; timeout, abbandoni ed esiti anticipati non inventano punteggi. Le partite annullate non hanno vincitore.

## Errori e recupero

- 400/413/415: JSON, dimensione o formato della richiesta non validi.
- 401: login richiesto/sessione non più valida.
- 403: CSRF, password attuale o accesso a una partita privata non consentito.
- 404: risorsa o invito inesistenti.
- 409: conflitto di fase, scelta bloccata, stanza già occupata, email/nickname duplicati.
- 422: valori di gioco o profilo non validi.
- 429: limite di frequenza superato.
- 503: configurazione, policy o servizio temporaneamente indisponibili; nessun dettaglio interno del database viene inviato al browser.

Il client impone un timeout HTTP di 12 secondi. Una risposta persa non dimostra che una conferma non sia stata registrata: rileggere lo snapshot o ripetere la stessa richiesta. Il polling non si sovrappone a se stesso e ignora snapshot più vecchi della versione già ricevuta.

## Limiti di frequenza

Login: 20 tentativi ogni 15 minuti per IP. Registrazione: 5 ogni ora per IP. Suggerimento nazione: 30 ogni ora per IP. Scritture autenticate: 120 al minuto per account. Questi limiti sono espliciti e modificabili nel front controller; per un gruppo sulla stessa rete, valutarne la taratura senza rimuovere i controlli.
