import React, { useCallback, useEffect, useRef, useState } from "react";
import { GuestGame } from "../GuestGame";
import { BotPortrait, BOT_PROFILES } from "../portraits";
import type { Difficulty } from "../bot/levels";
import { api, Account, Player, Session, Snapshot } from "./api";
import { countries, CountryFlag } from "./countries";
import { RemoteTable } from "./RemoteTable";
import "./club.css";
import { LobbyHub } from "./LobbyHub";

type Screen = "guest" | "home" | "auth" | "ranking" | "profile" | "match";
type Profile = Player & {
  recent: {
    outcome: "W" | "D" | "L";
    delta: number;
    opponent: string;
    opponentId: number;
    at: string;
    reason: string;
  }[];
};
export function Club() {
  const [session, setSession] = useState<Session>();
  const [service, setService] = useState<"loading" | "online" | "offline">(
    "loading",
  );
  const [screen, setScreen] = useState<Screen>("guest");
  const [register, setRegister] = useState(false);
  const [ranking, setRanking] = useState<"xp" | "elo">("xp");
  const [profileId, setProfileId] = useState(0);
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [resume, setResume] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const user = session?.user;
  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    api<Session>("session", undefined, controller.signal)
      .then((s) => {
        if (alive) {
          setSession(s);
          setService("online");
          setScreen((current) =>
            current === "guest" && s.user ? "home" : current,
          );
        }
      })
      .catch(() => {
        if (alive) setService("offline");
      });
    return () => {
      alive = false;
      controller.abort();
    };
  }, []);
  useEffect(() => {
    const read = () => {
      const parts = location.hash.slice(1).split("/");
      if (parts[0] === "player" && /^\d+$/.test(parts[1] ?? "")) {
        setProfileId(Number(parts[1]));
        setScreen("profile");
      } else if (parts[0] === "ranking") {
        setRanking(parts[1] === "elo" ? "elo" : "xp");
        setScreen("ranking");
      } else if (!location.hash) {
        setScreen((current) =>
          current === "match" ? current : user ? "home" : "guest",
        );
      }
    };
    read();
    window.addEventListener("hashchange", read);
    window.addEventListener("popstate", read);
    return () => {
      window.removeEventListener("hashchange", read);
      window.removeEventListener("popstate", read);
    };
  }, [user?.id]);
  useEffect(() => {
    if (!user) return;
    let alive = true;
    api<Snapshot | null>("current")
      .then((s) => {
        if (alive) {
          setResume(s);
          if (s && !location.hash) {
            setSnapshot(s);
            setScreen("match");
          }
        }
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [user?.id]);
  const updateAccount = useCallback(
    (account: Account) => setSession((s) => (s ? { ...s, user: account } : s)),
    [],
  );
  function home() {
    history.pushState({}, "", location.pathname);
    setError("");
    setScreen(user ? "home" : "guest");
  }
  function openProfile(id: number) {
    history.pushState({}, "", `#player/${id}`);
    setProfileId(id);
    setScreen("profile");
    setError("");
  }
  function openRanking(type: "xp" | "elo") {
    history.pushState({}, "", `#ranking/${type}`);
    setRanking(type);
    setScreen("ranking");
    setError("");
  }
  async function logout() {
    try {
      const next = await api<Session>("logout", {});
      setSession((previous) => ({ ...previous, ...next }));
      setSnapshot(undefined);
      setResume(null);
      history.pushState({}, "", location.pathname);
      setScreen("guest");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function begin(s: Snapshot) {
    setSnapshot(s);
    setResume(s);
    setScreen("match");
    history.pushState({}, "", location.pathname);
  }
  const nav = (
    <nav className="club-nav" aria-label="Navigazione club">
      <button onClick={home}>{user ? "Il club" : "Gioca ospite"}</button>
      <button onClick={() => openRanking("xp")}>Classifica XP</button>
      <button onClick={() => openRanking("elo")}>Classifica ELO</button>
      {user ? (
        <>
          <button onClick={() => openProfile(user.id)}>
            <CountryFlag code={user.country} /> {user.nickname}
          </button>
          <button onClick={logout}>Esci</button>
        </>
      ) : (
        <button
          disabled={service === "loading"}
          onClick={() => {
            setRegister(false);
            setScreen("auth");
          }}
        >
          Accedi / Registrati
        </button>
      )}
      {service === "offline" && (
        <small>Account offline · il gioco ospite è disponibile</small>
      )}
    </nav>
  );
  if (screen === "guest" && !user)
    return (
      <GuestGame navigation={nav} accountPending={service === "loading"} />
    );
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-symbol">✦</span>80
          <span className="brand-slash">/</span>20<small>DUEL CLUB</small>
        </div>
        {user && (
          <div className="xp-pill">
            <span>✧</span>
            <b>
              {screen === "match" && snapshot?.mode === "multi"
                ? user.elo
                : user.xp}
            </b>
            <small>
              {screen === "match" && snapshot?.mode === "multi" ? "ELO" : "XP"}
            </small>
          </div>
        )}
      </header>
      {screen !== "match" && nav}
      {user && <LobbyHub userId={user.id} inMatch={screen === "match"} showPlayers={screen === "home"} onMatch={begin} />}
      {error && (
        <p role="alert" className="error club-page">
          {error}
        </p>
      )}
      {screen === "auth" && (
        <AuthForm
          register={register}
          session={session}
          switchMode={() => setRegister((v) => !v)}
          onSuccess={(s) => {
            setSession((old) => ({ ...old, ...s }));
            setService("online");
            setScreen("home");
            history.pushState({}, "", location.pathname);
          }}
        />
      )}
      {(screen === "home" || screen === "guest") && user && (
        <MemberHome
          user={user}
          resume={resume}
          onMatch={begin}
          onProfile={() => openProfile(user.id)}
        />
      )}
      {screen === "ranking" && (
        <Rankings
          key={ranking}
          type={ranking}
          onType={openRanking}
          onProfile={openProfile}
        />
      )}
      {screen === "profile" && (
        <PlayerProfile
          key={profileId}
          id={profileId}
          account={user ?? null}
          onUpdate={updateAccount}
          onProfile={openProfile}
        />
      )}
      {screen === "match" && snapshot && user && (
        <RemoteTable
          key={snapshot.id}
          initial={snapshot}
          onNext={begin}
          onAccount={updateAccount}
          onExit={() => {
            setResume(null);
            setSnapshot(undefined);
            home();
          }}
        />
      )}
    </div>
  );
}

function CountryField({
  country,
  setCountry,
}: {
  country: string;
  setCountry: (v: string) => void;
}) {
  return (
    <label>
      Nazione
      <select
        aria-label="Nazione"
        value={country}
        onChange={(e) => setCountry(e.target.value)}
      >
        <option value="">Non indicata</option>
        {countries.map((c) => (
          <option key={c.code} value={c.code}>
            {c.name}
          </option>
        ))}
      </select>
    </label>
  );
}
function AuthForm({
  register,
  session,
  switchMode,
  onSuccess,
}: {
  register: boolean;
  session?: Session;
  switchMode: () => void;
  onSuccess: (s: Session) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [country, setCountry] = useState("");
  const [visible, setVisible] = useState(true);
  const [invite, setInvite] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const countryEdited = useRef(false);
  useEffect(() => {
    if (!register) return;
    let alive = true;
    api<{ country: string | null }>("country")
      .then((s) => {
        if (alive && s.country && !countryEdited.current)
          setCountry((old) => old || s.country!);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [register]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (!session) await api<Session>("session");
      onSuccess(
        await api<Session>(register ? "register" : "login", {
          email,
          password,
          nickname,
          country: country || null,
          countryPublic: visible,
          invite,
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="club-page auth-panel">
      <span className="eyebrow">IL TUO POSTO AL TAVOLO</span>
      <h1>{register ? "Entra nel club." : "Bentornato."}</h1>
      <p>Un account per salvare gli XP e sfidare gli altri giocatori.</p>
      <form onSubmit={submit}>
        {register && (
          <label>
            Nickname
            <input
              required
              pattern="[A-Za-z0-9_]{3,20}"
              minLength={3}
              maxLength={20}
              autoComplete="nickname"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
            />
            <small>3–20 lettere, numeri o underscore</small>
          </label>
        )}
        <label>
          Email
          <input
            required
            type="email"
            maxLength={190}
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label>
          Password
          <input
            required
            type="password"
            minLength={register ? 10 : 1}
            maxLength={72}
            autoComplete={register ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {register && <small>Almeno 10 caratteri; massimo 72 byte.</small>}
        </label>
        {register && (
          <>
            <CountryField
              country={country}
              setCountry={(value) => {
                countryEdited.current = true;
                setCountry(value);
              }}
            />
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={visible}
                onChange={(e) => setVisible(e.target.checked)}
              />
              Mostra la bandiera sul profilo
            </label>
            <p className="privacy-note">
              La nazione suggerita è modificabile.{" "}
              {session?.countryLookup
                ? "Il servizio country.is riceve l’IP per stimarla; conserviamo solo la nazione scelta."
                : "Se il server non può rilevarla, puoi sceglierla manualmente."}{" "}
              Email e password non sono pubbliche. Nickname, punti e risultati
              saranno visibili nelle classifiche.
            </p>
            {session?.registrationCodeRequired && (
              <label>
                Codice di accesso ai test
                <input
                  required
                  value={invite}
                  onChange={(e) => setInvite(e.target.value)}
                />
              </label>
            )}
          </>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <button className="primary" disabled={busy}>
          {busy ? "Attendi…" : register ? "Crea account" : "Accedi"}
          <span>↗</span>
        </button>
      </form>
      <button
        className="text-button"
        onClick={() => {
          switchMode();
          setError("");
        }}
      >
        {register ? "Hai già un account? Accedi" : "Prima volta? Registrati"}
      </button>
      {!register && (
        <p className="privacy-note">
          Password dimenticata? Per questa versione di test contatta
          l’organizzatore.
        </p>
      )}
    </main>
  );
}

function MemberHome({
  user,
  resume,
  onMatch,
  onProfile,
}: {
  user: Account;
  resume: Snapshot | null;
  onMatch: (s: Snapshot) => void;
  onProfile: () => void;
}) {
  const [difficulty, setDifficulty] = useState<Difficulty>("hard");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function run(route: string, body: unknown) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      onMatch(await api<Snapshot>(route, body));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const profile = BOT_PROFILES[difficulty];
  return (
    <main className="club-page member-home">
      <span className="eyebrow">
        <CountryFlag code={user.country} /> BENTORNATO,{" "}
        {user.nickname.toUpperCase()}
      </span>
      <h1>Il tuo prossimo duello.</h1>
      <div className="member-stats">
        <span>
          <b>{user.xp}</b> XP
        </span>
        <span>
          <b>{user.elo}</b> ELO {user.provisional && <small>provvisorio</small>}
        </span>
        <button className="text-button" onClick={onProfile}>
          Il tuo profilo ↗
        </button>
      </div>
      {resume && (
        <button className="resume-banner" onClick={() => onMatch(resume)}>
          Hai una partita aperta. Riprendi →
        </button>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="member-modes">
        <section
          className="opponent-picker"
          style={{ "--bot-accent": profile.color } as React.CSSProperties}
        >
          <span className="eyebrow">ALLENAMENTO · XP</span>
          <div className="portrait-frame" key={difficulty}>
            <BotPortrait difficulty={difficulty} />
            <div className="portrait-label">
              <h2>{profile.name}</h2>
            </div>
          </div>
          <div className="difficulty-control">
            <label htmlFor="member-difficulty">Difficoltà bot</label>
            <input
              id="member-difficulty"
              aria-valuetext={difficulty}
              type="range"
              min={0}
              max={2}
              step={1}
              value={["easy", "medium", "hard"].indexOf(difficulty)}
              onChange={(e) =>
                setDifficulty(
                  (["easy", "medium", "hard"] as Difficulty[])[
                    Number(e.target.value)
                  ],
                )
              }
            />
            <div className="difficulty-labels">
              {(["easy", "medium", "hard"] as Difficulty[]).map((d) => (
                <button
                  key={d}
                  aria-pressed={d === difficulty}
                  onClick={() => setDifficulty(d)}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
          <p className="mode-description">
            {profile.description} Nessun timer. Gli XP vengono salvati sul tuo
            account.
          </p>
          <button
            className="primary"
            disabled={busy}
            onClick={() => run("create", { mode: "bot", difficulty })}
          >
            Sfida il bot <span>↗</span>
          </button>
        </section>
        <section className="multiplayer-picker">
          <span className="eyebrow">MULTIPLAYER · ELO</span>
          <div className="duel-symbol">
            ♠ <span>×</span> ♦
          </div>
          <h2>Invita. Scegli. Rivela.</h2>
          <p>
            Un avversario reale. Mosse simultanee e segrete. Un minuto per ogni
            scelta.
          </p>
          <button
            className="primary"
            disabled={busy}
            onClick={() => run("create", { mode: "multi" })}
          >
            Crea un tavolo privato <span>↗</span>
          </button>
          <div className="join-divider">OPPURE ENTRA CON UN CODICE</div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run("join", { code });
            }}
          >
            <label>
              Codice invito
              <input
                required
                pattern="[A-Fa-f0-9]{10}"
                maxLength={10}
                placeholder="A1B2C3D4E5"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
              />
            </label>
            <button className="secondary" disabled={busy}>
              Entra nel tavolo →
            </button>
          </form>
          <p className="privacy-note">
            Le prime 10 partite hanno un ELO provvisorio. Abbandonare o non
            confermare in tempo può comportare una sconfitta.
          </p>
        </section>
      </div>
    </main>
  );
}

function Rankings({
  type,
  onType,
  onProfile,
}: {
  type: "xp" | "elo";
  onType: (t: "xp" | "elo") => void;
  onProfile: (id: number) => void;
}) {
  const [page, setPage] = useState(0);
  const [data, setData] = useState<{ rows: Player[]; hasMore: boolean }>();
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    setData(undefined);
    setError("");
    api<{ rows: Player[]; hasMore: boolean }>(
      `ranking&type=${type}&page=${page}`,
    )
      .then((d) => {
        if (alive) setData(d);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [type, page]);
  return (
    <main className="club-page">
      <span className="eyebrow">LA CLASSIFICA DEL CLUB</span>
      <h1>{type === "xp" ? "Chi gioca, cresce." : "Chi vince, sale."}</h1>
      <div className="tabs">
        <button aria-pressed={type === "xp"} onClick={() => onType("xp")}>
          Esperienza XP
        </button>
        <button aria-pressed={type === "elo"} onClick={() => onType("elo")}>
          Competizione ELO
        </button>
      </div>
      <p>
        {type === "xp"
          ? "XP guadagnati contro i bot dagli account registrati."
          : "Risultati multiplayer. P = punteggio provvisorio, meno di 10 partite."}
      </p>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : !data ? (
        <p role="status">Caricamento classifica…</p>
      ) : !data.rows.length ? (
        <div className="empty-state">Il tavolo aspetta i primi risultati.</div>
      ) : (
        <div className="ranking-table">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Giocatore</th>
                <th>{type.toUpperCase()}</th>
                {type === "elo" && <th>W / D / L</th>}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((u, i) => (
                <tr key={u.id}>
                  <td>{page * 25 + i + 1}</td>
                  <td>
                    <button onClick={() => onProfile(u.id)}>
                      <CountryFlag code={u.country} /> {u.nickname}
                    </button>
                  </td>
                  <td>
                    {u[type]}{" "}
                    {type === "elo" && u.provisional && (
                      <small title="Provvisorio">P</small>
                    )}
                  </td>
                  {type === "elo" && (
                    <td>
                      {u.wins} / {u.draws} / {u.losses}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="pagination">
        <button disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
          ← Precedente
        </button>
        <button disabled={!data?.hasMore} onClick={() => setPage((p) => p + 1)}>
          Successiva →
        </button>
      </div>
    </main>
  );
}

function PlayerProfile({
  id,
  account,
  onUpdate,
  onProfile,
}: {
  id: number;
  account: Account | null;
  onUpdate: (a: Account) => void;
  onProfile: (id: number) => void;
}) {
  const [profile, setProfile] = useState<Profile>();
  const [error, setError] = useState("");
  const [country, setCountry] = useState(account?.selectedCountry ?? "");
  const [visible, setVisible] = useState(account?.countryPublic ?? true);
  const [saved, setSaved] = useState("");
  const [busy, setBusy] = useState(false);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  useEffect(() => {
    let alive = true;
    api<Profile>(`profile&id=${id}`)
      .then((p) => {
        if (alive) setProfile(p);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [id]);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setSaved("");
    try {
      const a = await api<Account>("profile", {
        country: country || null,
        countryPublic: visible,
      });
      onUpdate(a);
      setProfile((p) => (p ? { ...p, ...a } : p));
      setSaved("Profilo aggiornato.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function password(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setSaved("");
    try {
      await api("password", { currentPassword: oldPassword, newPassword });
      setOldPassword("");
      setNewPassword("");
      setSaved("Password aggiornata.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!profile)
    return (
      <main className="club-page">
        <p role={error ? "alert" : "status"}>
          {error || "Caricamento profilo…"}
        </p>
      </main>
    );
  const played = profile.wins + profile.draws + profile.losses;
  return (
    <main className="club-page">
      <span className="eyebrow">PROFILO GIOCATORE</span>
      <h1>
        <CountryFlag code={profile.country} /> {profile.nickname}
      </h1>
      <p>
        {profile.provisional
          ? `ELO provvisorio · ${played}/10 partite di piazzamento`
          : "Statistiche multiplayer"}
      </p>
      <div className="profile-stats">
        <div>
          <strong>{profile.elo}</strong>
          <span>ELO attuale</span>
        </div>
        <div>
          <strong>{profile.peak_elo}</strong>
          <span>ELO massimo</span>
        </div>
        <div>
          <strong>
            {profile.wins} / {profile.draws} / {profile.losses}
          </strong>
          <span>Vittorie / Pareggi / Sconfitte</span>
        </div>
        <div>
          <strong>
            {played ? Math.round((profile.wins / played) * 100) : 0}%
          </strong>
          <span>Vittorie su {played} partite</span>
        </div>
        <div>
          <strong>{profile.best_streak}</strong>
          <span>Miglior serie di vittorie</span>
        </div>
        <div>
          <strong>{profile.xp}</strong>
          <span>XP contro i bot</span>
        </div>
      </div>
      <h2>Gli ultimi duelli</h2>
      {!profile.recent.length ? (
        <p className="empty-state">Nessuna partita multiplayer completata.</p>
      ) : (
        <ul className="recent-matches">
          {profile.recent.map((r, i) => (
            <li key={i}>
              <b className={`outcome-${r.outcome}`}>{r.outcome}</b>
              <button onClick={() => onProfile(r.opponentId)}>
                {r.opponent}
              </button>
              <span>
                {r.delta >= 0 ? "+" : ""}
                {r.delta} ELO
              </span>
              <small>
                {r.reason === "timeout"
                  ? "Tempo"
                  : r.reason === "abandon"
                    ? "Abbandono"
                    : new Date(r.at.replace(" ", "T") + "Z").toLocaleDateString(
                        "it-IT",
                      )}
              </small>
            </li>
          ))}
        </ul>
      )}
      {account?.id === id && (
        <section className="profile-settings">
          <h2>Il tuo profilo</h2>
          <form onSubmit={save}>
            <CountryField country={country} setCountry={setCountry} />
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={visible}
                onChange={(e) => setVisible(e.target.checked)}
              />
              Mostra la bandiera sul profilo
            </label>
            <button className="secondary" disabled={busy}>
              Salva profilo
            </button>
          </form>
          <details>
            <summary>Cambia password</summary>
            <form onSubmit={password}>
              <label>
                Password attuale
                <input
                  required
                  type="password"
                  autoComplete="current-password"
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                />
              </label>
              <label>
                Nuova password
                <input
                  required
                  type="password"
                  autoComplete="new-password"
                  minLength={10}
                  maxLength={72}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </label>
              <button className="secondary" disabled={busy}>
                Aggiorna password
              </button>
            </form>
          </details>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {saved && <p role="status">{saved}</p>}
        </section>
      )}
    </main>
  );
}
