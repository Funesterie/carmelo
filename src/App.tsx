import * as React from "react";
import {
  Suspense,
  lazy,
  useEffect,
} from "react";
import districtArtwork from "./images/ChatGPT Image 2 avr. 2026, 21_17_56.png";
import cardArtwork from "./images/Cartes de pirate au crépuscule.png";
import freshVideo from "./videos/fresh.mp4";
import { featureCards } from "./features/app/content";
import { useCasinoMedia } from "./features/app/useCasinoMedia";
import { useCasinoSession } from "./features/app/useCasinoSession";

const PirateSlotsGame = lazy(() => import("./PirateSlotsGame"));

function LoadingPanel({ label }: { label: string }) {
  return (
    <div className="casino-loading-panel" role="status" aria-live="polite">
      <div className="casino-loading-ring" />
      <p>{label}</p>
    </div>
  );
}

export default function App() {
  const session = useCasinoSession();
  const media = useCasinoMedia({
    activeCasinoRoom: session.activeCasinoRoom,
    profileLoaded: Boolean(session.profile),
  });

  useEffect(() => {
    if (!session.profile || !session.pendingImmersionName) return;
    const nextImmersionName = session.consumePendingImmersionName();
    if (!nextImmersionName) return;
    void media.startConnectionImmersion(nextImmersionName);
  }, [session.profile, session.pendingImmersionName]);

  if (session.booting) {
    return (
      <main className="casino-shell casino-shell--loading">
        <LoadingPanel label="Ouverture du salon prive..." />
      </main>
    );
  }

  return (
    <main className={`casino-shell ${session.profile ? "casino-shell--game" : ""}`}>
      {!session.profile ? (
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
              <h2>{session.authMode === "login" ? "Connexion" : session.authMode === "register" ? "Inscription" : "Mot de passe oublie"}</h2>
              <p>
                {session.authMode === "login"
                  ? "Reconnecte-toi avec tes identifiants pour retrouver instantanement ton solde."
                  : session.authMode === "register"
                    ? "Cree un compte joueur avec le meme backend que l’univers A11."
                    : "On reutilise le circuit mail A11 pour te renvoyer un lien de recuperation."}
              </p>
            </div>

            <div className="casino-auth-tabs" role="tablist" aria-label="Modes d’authentification">
              <button className={session.authMode === "login" ? "is-active" : ""} onClick={() => session.setAuthMode("login")} type="button">
                Connexion
              </button>
              <button className={session.authMode === "register" ? "is-active" : ""} onClick={() => session.setAuthMode("register")} type="button">
                Inscription
              </button>
              <button className={session.authMode === "forgot" ? "is-active" : ""} onClick={() => session.setAuthMode("forgot")} type="button">
                Recuperation
              </button>
            </div>

            {session.error ? <div className="casino-alert casino-alert--error">{session.error}</div> : null}
            {session.notice ? <div className="casino-alert casino-alert--success">{session.notice}</div> : null}

            {session.authMode === "login" ? (
              <form className="casino-auth-form" onSubmit={(event) => {
                void media.requestMediaPlayback();
                void session.handleLogin(event);
              }}>
                <label>
                  Identifiant
                  <input value={session.loginName} onChange={(event) => session.setLoginName(event.target.value)} placeholder="Nom de joueur ou email" autoComplete="username" />
                </label>
                <label>
                  Mot de passe
                  <input value={session.loginPassword} onChange={(event) => session.setLoginPassword(event.target.value)} placeholder="Mot de passe" type="password" autoComplete="current-password" />
                </label>
                <button type="submit" className="casino-primary-button" disabled={session.busy}>
                  {session.busy ? "Connexion..." : "Entrer dans le casino"}
                </button>
              </form>
            ) : null}

            {session.authMode === "register" ? (
              <form className="casino-auth-form" onSubmit={(event) => {
                void media.requestMediaPlayback();
                void session.handleRegister(event);
              }}>
                <label>
                  Nom de joueur
                  <input value={session.registerName} onChange={(event) => session.setRegisterName(event.target.value)} placeholder="Capitaine Carmelo" autoComplete="username" />
                </label>
                <label>
                  Email
                  <input value={session.registerEmail} onChange={(event) => session.setRegisterEmail(event.target.value)} placeholder="joueur@exemple.com" type="email" autoComplete="email" />
                </label>
                <label>
                  Mot de passe
                  <input value={session.registerPassword} onChange={(event) => session.setRegisterPassword(event.target.value)} placeholder="Mot de passe" type="password" autoComplete="new-password" />
                </label>
                <label>
                  Confirmer le mot de passe
                  <input value={session.registerPasswordConfirm} onChange={(event) => session.setRegisterPasswordConfirm(event.target.value)} placeholder="Confirmer le mot de passe" type="password" autoComplete="new-password" />
                </label>
                <button type="submit" className="casino-primary-button" disabled={session.busy}>
                  {session.busy ? "Creation..." : "Creer le compte"}
                </button>
              </form>
            ) : null}

            {session.authMode === "forgot" ? (
              <form className="casino-auth-form" onSubmit={session.handleForgot}>
                <label>
                  Email
                  <input value={session.forgotEmail} onChange={(event) => session.setForgotEmail(event.target.value)} placeholder="joueur@exemple.com" type="email" autoComplete="email" />
                </label>
                <button type="submit" className="casino-primary-button" disabled={session.busy}>
                  {session.busy ? "Envoi..." : "Recevoir le lien"}
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
          {session.activeCasinoRoom !== "slots" ? (
            <div className="casino-ambient-corner">
              <div className="casino-ambient-corner__frame">
                <video
                  ref={media.ambientVideoRef}
                  className="casino-ambient-corner__video"
                  src={freshVideo}
                  autoPlay
                  loop
                  playsInline
                  muted
                />
                <div className="casino-ambient-corner__veil" />
                <div className="casino-ambient-corner__copy">
                  <span className="casino-chip">Pont ATS</span>
                  <strong>Ambiance live</strong>
                  <small>{media.ambientVideoAudible ? "Son d'ambiance reduit actif" : "Le son s'activera au premier geste."}</small>
                </div>
              </div>
            </div>
          ) : null}

          {media.showImmersion ? (
            <div
              className="casino-immersion-overlay"
              style={{
                backgroundImage: `linear-gradient(140deg, rgba(5, 8, 12, 0.86), rgba(7, 12, 20, 0.94)), radial-gradient(circle at top left, rgba(255, 200, 87, 0.18), transparent 24%), url("${cardArtwork}")`,
              }}
            >
              <div className="casino-immersion-overlay__panel">
                <div className="casino-immersion-overlay__copy">
                  <span className="casino-chip">Connexion rituelle</span>
                  <h2>Cap sur le pont pirate</h2>
                  <p>{media.immersionLine}</p>
                  <div className="casino-immersion-overlay__stats">
                    <span>Musique d'ouverture Funesterie</span>
                    <span>Tables ATS en cours d'arrimage</span>
                    <span>Canon live en veille sur la roulette</span>
                  </div>
                </div>

                <div
                  className="casino-immersion-overlay__video-shell"
                  style={{
                    backgroundImage: `linear-gradient(180deg, rgba(4, 8, 14, 0.14), rgba(4, 8, 14, 0.84)), url("${districtArtwork}")`,
                  }}
                >
                  <video
                    className="casino-immersion-overlay__video"
                    src={freshVideo}
                    autoPlay
                    loop
                    playsInline
                    muted
                  />
                </div>
              </div>
            </div>
          ) : null}

          <header className="casino-account-bar">
            <div>
              <span className="casino-eyebrow">Salle privee</span>
              <h1>{session.displayName}</h1>
            </div>

            <div className="casino-account-bar__actions">
              <button
                type="button"
                className="casino-ghost-button"
                disabled={session.busy || !session.profile.wallet.canClaimDailyBonus}
                onClick={session.handleClaimBonus}
              >
                {session.profile.wallet.canClaimDailyBonus ? `Bonus +${session.profile.wallet.dailyBonusAmount}` : "Bonus deja recupere"}
              </button>
              <button type="button" className="casino-ghost-button" disabled={session.busy} onClick={() => void session.refreshProfile("Compte synchronise.")}>
                Synchroniser
              </button>
              <button type="button" className="casino-ghost-button" onClick={() => {
                media.resetMediaSession();
                session.handleLogout();
              }}>
                Deconnexion
              </button>
            </div>
          </header>

          {(session.error || session.notice) ? (
            <div className="casino-toast-rail" aria-live="polite">
              {session.error ? <div className="casino-alert casino-alert--error">{session.error}</div> : null}
              {session.notice ? <div className="casino-alert casino-alert--success">{session.notice}</div> : null}
            </div>
          ) : null}

          <Suspense fallback={<LoadingPanel label="Chargement de la table..." />}>
            <PirateSlotsGame
              profile={session.profile}
              busy={session.busy}
              mediaReady={media.mediaReady}
              onRouletteEvent={media.handleRouletteEvent}
              onRequestMediaPlayback={() => {
                void media.requestMediaPlayback();
              }}
              onProfileChange={session.handleProfileChange}
              onError={session.setError}
              onRoomChange={session.setActiveCasinoRoom}
            />
          </Suspense>
        </div>
      )}
    </main>
  );
}
