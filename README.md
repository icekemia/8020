# 80/20 — Duel Club V1

Beta privata multiplayer per hosting SiteGround LAMP: React/TypeScript statico, API PHP e MySQL/InnoDB.

Gli ospiti possono giocare contro i bot con XP nel localStorage. Gli account salvano gli XP sul database e accedono a stanze multiplayer con invito, timer da 60 secondi, ELO, classifiche e profili pubblici.

## Documentazione

Partire da [documentation/README.md](documentation/README.md): stack e motivazioni, struttura dell'applicazione, regole e sincronizzazione, contratto API, test, pubblicazione su SiteGround e registro delle decisioni V1. Il TODO V2 verrà definito dopo i test.

## Sviluppo

```sh
npm ci
npm run dev
```

Il gioco ospite funziona anche senza backend. Per account e multiplayer configurare `server/config.php`, creare il database e avviare in un secondo terminale:

```sh
npm run db:migrate
npm run serve:api
```

Vite inoltra `/api` al server PHP locale sulla porta 8088. Requisiti e configurazione in [TESTING.md](documentation/TESTING.md).

## Verifica e pacchetto

```sh
npm run test
npm run test:php
npm run package:v1
```

La suite PHP richiede un database isolato `duel_v1_test` e il file privato `server/config.test.php`; svuota esclusivamente le tabelle del database di test. Lo ZIP viene creato in `release/`, con frontend pubblico e backend privato separati, senza credenziali. Python è usato solo localmente per creare lo ZIP. Consultare [DEPLOYMENT.md](documentation/DEPLOYMENT.md) prima dell'upload.

## Solver offline

Il solver matematico originale rimane in `src/duel_solver`: Split 80, Turn 20, backward induction esatta. Richiede Python 3.12+, NumPy, SciPy e pandas (`pip install -e .`). Test con `pytest`.

```sh
python -m duel_solver solve --split 80 --turn 20 --output output
```

Le policy runtime già esportate sono in `public/policies`. `npm run export:policy` le rigenera e `npm run verify:policy` le verifica; non occorre rigenerarle per modifiche all'interfaccia o all'API. La release include la policy anche nel backend, senza installare Python o il solver sull'hosting.

CI/CD con GitHub Actions: vedere [configurazione e rilascio automatico](documentation/CI_CD.md).
