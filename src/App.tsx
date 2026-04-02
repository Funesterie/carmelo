import * as React from "react";
import {
  Suspense,
  lazy,
  startTransition,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  claimCasinoDailyBonus,
  clearCasinoSession,
  fetchCasinoProfile,
  getCasinoDisplayName,
  hasCasinoToken,
  loginCasino,
  registerCasino,
  requestCasinoPasswordReset,
  type CasinoProfile,
} from "./lib/casinoApi";

const PirateSlotsGame = lazy(() => import("./PirateSlotsGame"));

type AuthMode = "login" | "register" | "forgot";

const featureCards = [
  {
    kicker: "Compte persistant",
    title: "Même identifiants que l’univers A11",
    body: "Le casino réutilise le backend A11 pour garder un vrai compte, un mot de passe, et un solde durable.",
  },
  {
    kicker: "Expérience premium",
    title: "Pensé pour téléphone et ordinateur",
    body: "Une interface poster au premier écran, puis une salle de jeu lisible, dense et fluide sur les petits écrans.",
  },
  {
    kicker: "Style pirate",
    title: "Une vraie ambiance de table",
    body: "Balance, historique, bonus journalier et animations de reels, sans le chaos du vieux prototype.",
  },
];

function LoadingPanel({ label }: { label: string }) {
  return (
    <div className="casino-loading-panel" role="status" aria-live="polite">
      <div className="casino-loading-ring" />
      <p>{label}</p>
    </div>
  );
}

export default function App() {
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [profile, setProfile] = useState<CasinoProfile | null>(null);
  const [booting, setBooting] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [loginName, setLoginName] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  const [registerName, setRegisterName] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [registerPasswordConfirm, setRegisterPasswordConfirm] = useState("");

  const [forgotEmail, setForgotEmail] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      if (!hasCasinoToken()) {
        if (!cancelled) setBooting(false);
        return;
      }

      try {
        const nextProfile = await fetchCasinoProfile();
        if (cancelled) return;
        startTransition(() => setProfile(nextProfile));
        setNotice(`Bienvenue a bord, ${nextProfile.user.username}.`);
      } catch (error_) {
        if (cancelled) return;
        clearCasinoSession();
        setError("La session a expire. Reconnecte-toi pour retrouver ton solde.");
      } finally {
        if (!cancelled) setBooting(false);
      }
    }

    void boot();
    return () => {
      cancelled = true;
    };
  }, []);

  const displayName = useMemo(() => {
    return profile?.user?.username || getCasinoDisplayName() || "Capitaine";
  }, [profile]);

  async function refreshProfile(message = "") {
    setBusy(true);
    setError("");
    try {
      const nextProfile = await fetchCasinoProfile();
      startTransition(() => setProfile(nextProfile));
      if (message) setNotice(message);
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : "Impossible de charger le compte.");
    } finally {
      setBusy(false);
    }
  }

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await loginCasino(loginName, loginPassword);
      const nextProfile = await fetchCasinoProfile();
      startTransition(() => setProfile(nextProfile));
      setNotice(`Bienvenue a bord, ${nextProfile.user.username}.`);
      setLoginPassword("");
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : "Connexion impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRegister(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (registerPassword !== registerPasswordConfirm) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }

    setBusy(true);
    setError("");
    setNotice("");
    try {
      await registerCasino(registerName, registerEmail, registerPassword);
      const nextProfile = await fetchCasinoProfile();
      startTransition(() => setProfile(nextProfile));
      setNotice(`Compte cree. Bon vent, ${nextProfile.user.username}.`);
      setRegisterPassword("");
      setRegisterPasswordConfirm("");
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : "Inscription impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function handleForgot(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await requestCasinoPasswordReset(forgotEmail);
      setNotice("Un lien de reinitialisation a ete envoye si l’email existe.");
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : "Envoi impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function handleClaimBonus() {
    setBusy(true);
    setError("");
    try {
      const result = await claimCasinoDailyBonus();
      startTransition(() => setProfile(result.profile));
      setNotice(`Bonus journalier recupere: +${result.claimedAmount} credits.`);
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : "Bonus indisponible.");
    } finally {
      setBusy(false);
    }
  }

  function handleLogout() {
    clearCasinoSession();
    setProfile(null);
    setNotice("Session fermee.");
    setError("");
    setLoginPassword("");
  }

  if (booting) {
    return (
      <main className="casino-shell casino-shell--loading">
        <LoadingPanel label="Ouverture du salon prive..." />
      </main>
    );
  }

  return (
    <main className={`casino-shell ${profile ? "casino-shell--game" : ""}`}>
      {!profile ? (
        <div className="casino-auth-layout">
          <section className="casino-poster">
            <div className="casino-poster__veil" />
            <div className="casino-poster__content">
              <span className="casino-eyebrow">casino.funesterie.pro</span>
              <h1>Treasor Cruse</h1>
              <p>
                Un salon pirate plus propre, avec vrai compte, vrai solde persistant
                et une salle de jeu enfin lisible sur telephone comme sur grand ecran.
              </p>

              <div className="casino-hero-stats" aria-label="points forts">
                <div>
                  <strong>24/7</strong>
                  <span>solde sauve cote serveur</span>
                </div>
                <div>
                  <strong>5 lignes</strong>
                  <span>machine a sous calculee cote backend</span>
                </div>
                <div>
                  <strong>A11</strong>
                  <span>meme identite, meme auth, meme recuperation</span>
                </div>
              </div>

              <div className="casino-feature-stack">
                {featureCards.map((feature) => (
                  <article key={feature.title} className="casino-feature">
                    <span>{feature.kicker}</span>
                    <h2>{feature.title}</h2>
                    <p>{feature.body}</p>
                  </article>
                ))}
              </div>
            </div>
          </section>

          <aside className="casino-auth-panel">
            <div className="casino-auth-panel__header">
              <span className="casino-chip">Compte joueur</span>
              <h2>{authMode === "login" ? "Connexion" : authMode === "register" ? "Inscription" : "Mot de passe oublie"}</h2>
              <p>
                {authMode === "login"
                  ? "Reconnecte-toi avec tes identifiants pour retrouver instantanement ton solde."
                  : authMode === "register"
                    ? "Cree un compte joueur avec le meme backend que l’univers A11."
                    : "On reutilise le circuit mail A11 pour te renvoyer un lien de recuperation."}
              </p>
            </div>

            <div className="casino-auth-tabs" role="tablist" aria-label="Modes d’authentification">
              <button className={authMode === "login" ? "is-active" : ""} onClick={() => setAuthMode("login")} type="button">
                Connexion
              </button>
              <button className={authMode === "register" ? "is-active" : ""} onClick={() => setAuthMode("register")} type="button">
                Inscription
              </button>
              <button className={authMode === "forgot" ? "is-active" : ""} onClick={() => setAuthMode("forgot")} type="button">
                Recuperation
              </button>
            </div>

            {error ? <div className="casino-alert casino-alert--error">{error}</div> : null}
            {notice ? <div className="casino-alert casino-alert--success">{notice}</div> : null}

            {authMode === "login" ? (
              <form className="casino-auth-form" onSubmit={handleLogin}>
                <label>
                  Identifiant
                  <input value={loginName} onChange={(event) => setLoginName(event.target.value)} placeholder="Nom de joueur ou email" autoComplete="username" />
                </label>
                <label>
                  Mot de passe
                  <input value={loginPassword} onChange={(event) => setLoginPassword(event.target.value)} placeholder="Mot de passe" type="password" autoComplete="current-password" />
                </label>
                <button type="submit" className="casino-primary-button" disabled={busy}>
                  {busy ? "Connexion..." : "Entrer dans le casino"}
                </button>
              </form>
            ) : null}

            {authMode === "register" ? (
              <form className="casino-auth-form" onSubmit={handleRegister}>
                <label>
                  Nom de joueur
                  <input value={registerName} onChange={(event) => setRegisterName(event.target.value)} placeholder="Capitaine Carmelo" autoComplete="username" />
                </label>
                <label>
                  Email
                  <input value={registerEmail} onChange={(event) => setRegisterEmail(event.target.value)} placeholder="joueur@exemple.com" type="email" autoComplete="email" />
                </label>
                <label>
                  Mot de passe
                  <input value={registerPassword} onChange={(event) => setRegisterPassword(event.target.value)} placeholder="Mot de passe" type="password" autoComplete="new-password" />
                </label>
                <label>
                  Confirmer le mot de passe
                  <input value={registerPasswordConfirm} onChange={(event) => setRegisterPasswordConfirm(event.target.value)} placeholder="Confirmer le mot de passe" type="password" autoComplete="new-password" />
                </label>
                <button type="submit" className="casino-primary-button" disabled={busy}>
                  {busy ? "Creation..." : "Creer le compte"}
                </button>
              </form>
            ) : null}

            {authMode === "forgot" ? (
              <form className="casino-auth-form" onSubmit={handleForgot}>
                <label>
                  Email
                  <input value={forgotEmail} onChange={(event) => setForgotEmail(event.target.value)} placeholder="joueur@exemple.com" type="email" autoComplete="email" />
                </label>
                <button type="submit" className="casino-primary-button" disabled={busy}>
                  {busy ? "Envoi..." : "Recevoir le lien"}
                </button>
              </form>
            ) : null}

            <div className="casino-auth-footnote">
              <p>Le solde n’est plus stocke dans le navigateur. Il vit maintenant sur le backend A11, avec un vrai compte JWT.</p>
            </div>
          </aside>
        </div>
      ) : (
        <div className="casino-game-shell">
          <header className="casino-account-bar">
            <div>
              <span className="casino-eyebrow">Salle privee</span>
              <h1>{displayName}</h1>
            </div>

            <div className="casino-account-bar__actions">
              <button
                type="button"
                className="casino-ghost-button"
                disabled={busy || !profile.wallet.canClaimDailyBonus}
                onClick={handleClaimBonus}
              >
                {profile.wallet.canClaimDailyBonus ? `Bonus +${profile.wallet.dailyBonusAmount}` : "Bonus deja recupere"}
              </button>
              <button type="button" className="casino-ghost-button" disabled={busy} onClick={() => void refreshProfile("Compte synchronise.")}>
                Synchroniser
              </button>
              <button type="button" className="casino-ghost-button" onClick={handleLogout}>
                Deconnexion
              </button>
            </div>
          </header>

          {error ? <div className="casino-alert casino-alert--error">{error}</div> : null}
          {notice ? <div className="casino-alert casino-alert--success">{notice}</div> : null}

          <Suspense fallback={<LoadingPanel label="Chargement de la table..." />}>
            <PirateSlotsGame
              profile={profile}
              busy={busy}
              onProfileChange={(nextProfile, message) => {
                startTransition(() => setProfile(nextProfile));
                if (message) setNotice(message);
              }}
              onError={(message) => setError(message)}
            />
          </Suspense>
        </div>
      )}
    </main>
  );
}
