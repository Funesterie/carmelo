import type * as React from "react";
import { featureCards } from "../content";

type AuthMode = "login" | "register" | "forgot";

type CasinoAuthScreenProps = {
  authMode: AuthMode;
  busy: boolean;
  error: string;
  notice: string;
  loginName: string;
  loginPassword: string;
  registerName: string;
  registerEmail: string;
  registerPassword: string;
  registerPasswordConfirm: string;
  forgotEmail: string;
  onAuthModeChange: (mode: AuthMode) => void;
  onLoginNameChange: (value: string) => void;
  onLoginPasswordChange: (value: string) => void;
  onRegisterNameChange: (value: string) => void;
  onRegisterEmailChange: (value: string) => void;
  onRegisterPasswordChange: (value: string) => void;
  onRegisterPasswordConfirmChange: (value: string) => void;
  onForgotEmailChange: (value: string) => void;
  onLoginSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onRegisterSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onForgotSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
};

export default function CasinoAuthScreen({
  authMode,
  busy,
  error,
  notice,
  loginName,
  loginPassword,
  registerName,
  registerEmail,
  registerPassword,
  registerPasswordConfirm,
  forgotEmail,
  onAuthModeChange,
  onLoginNameChange,
  onLoginPasswordChange,
  onRegisterNameChange,
  onRegisterEmailChange,
  onRegisterPasswordChange,
  onRegisterPasswordConfirmChange,
  onForgotEmailChange,
  onLoginSubmit,
  onRegisterSubmit,
  onForgotSubmit,
}: CasinoAuthScreenProps) {
  return (
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
          <button className={authMode === "login" ? "is-active" : ""} onClick={() => onAuthModeChange("login")} type="button">
            Connexion
          </button>
          <button className={authMode === "register" ? "is-active" : ""} onClick={() => onAuthModeChange("register")} type="button">
            Inscription
          </button>
          <button className={authMode === "forgot" ? "is-active" : ""} onClick={() => onAuthModeChange("forgot")} type="button">
            Recuperation
          </button>
        </div>

        {error ? <div className="casino-alert casino-alert--error">{error}</div> : null}
        {notice ? <div className="casino-alert casino-alert--success">{notice}</div> : null}

        {authMode === "login" ? (
          <form className="casino-auth-form" onSubmit={onLoginSubmit}>
            <label>
              Identifiant
              <input value={loginName} onChange={(event) => onLoginNameChange(event.target.value)} placeholder="Nom de joueur ou email" autoComplete="username" />
            </label>
            <label>
              Mot de passe
              <input value={loginPassword} onChange={(event) => onLoginPasswordChange(event.target.value)} placeholder="Mot de passe" type="password" autoComplete="current-password" />
            </label>
            <button type="submit" className="casino-primary-button" disabled={busy}>
              {busy ? "Connexion..." : "Entrer dans le casino"}
            </button>
          </form>
        ) : null}

        {authMode === "register" ? (
          <form className="casino-auth-form" onSubmit={onRegisterSubmit}>
            <label>
              Nom de joueur
              <input value={registerName} onChange={(event) => onRegisterNameChange(event.target.value)} placeholder="Capitaine Carmelo" autoComplete="username" />
            </label>
            <label>
              Email
              <input value={registerEmail} onChange={(event) => onRegisterEmailChange(event.target.value)} placeholder="joueur@exemple.com" type="email" autoComplete="email" />
            </label>
            <label>
              Mot de passe
              <input value={registerPassword} onChange={(event) => onRegisterPasswordChange(event.target.value)} placeholder="Mot de passe" type="password" autoComplete="new-password" />
            </label>
            <label>
              Confirmer le mot de passe
              <input value={registerPasswordConfirm} onChange={(event) => onRegisterPasswordConfirmChange(event.target.value)} placeholder="Confirmer le mot de passe" type="password" autoComplete="new-password" />
            </label>
            <button type="submit" className="casino-primary-button" disabled={busy}>
              {busy ? "Creation..." : "Creer le compte"}
            </button>
          </form>
        ) : null}

        {authMode === "forgot" ? (
          <form className="casino-auth-form" onSubmit={onForgotSubmit}>
            <label>
              Email
              <input value={forgotEmail} onChange={(event) => onForgotEmailChange(event.target.value)} placeholder="joueur@exemple.com" type="email" autoComplete="email" />
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
  );
}
