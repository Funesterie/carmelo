import * as React from "react";
import {
  Suspense,
  lazy,
  startTransition,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import canonAudio from "./audio/canon.mp3";
import entryAudio from "./audio/entrée.mp3";
import fantomeAudio from "./audio/fantome.mp3";
import funesterieAudio from "./audio/funesterie.mp3";
import moussaillonAudio from "./audio/moussaillon.mp3";
import districtArtwork from "./images/ChatGPT Image 2 avr. 2026, 21_17_56.png";
import cardArtwork from "./images/Cartes de pirate au crépuscule.png";
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
import type { RoomId, RouletteSoundEvent } from "./PirateSlotsGame";
import freshVideo from "./videos/fresh.mp4";

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

function waitForMs(durationMs: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, durationMs);
  });
}

function stopMedia(media: HTMLMediaElement | null) {
  if (!media) return;
  media.pause();
  try {
    media.currentTime = 0;
  } catch {
    // ignore reset errors
  }
}

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
  const [showImmersion, setShowImmersion] = useState(false);
  const [immersionLine, setImmersionLine] = useState("Ouverture du pont prive...");
  const [queuedImmersionName, setQueuedImmersionName] = useState("");
  const [ambientVideoAudible, setAmbientVideoAudible] = useState(false);
  const [mediaReady, setMediaReady] = useState(false);
  const [activeCasinoRoom, setActiveCasinoRoom] = useState<RoomId>("slots");

  const introAudioRef = useRef<HTMLAudioElement | null>(null);
  const cueAudioRef = useRef<HTMLAudioElement | null>(null);
  const cannonAudioRef = useRef<HTMLAudioElement | null>(null);
  const ambientVideoRef = useRef<HTMLVideoElement | null>(null);
  const introHideTimeoutRef = useRef<number | null>(null);
  const introStopTimeoutRef = useRef<number | null>(null);
  const mediaUnlockedRef = useRef(false);
  const rouletteQueueRef = useRef(Promise.resolve());
  const lastRouletteJoinCueAtRef = useRef(0);

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

  useEffect(() => {
    return () => {
      clearImmersionTimers();
      stopMedia(introAudioRef.current);
      stopMedia(cueAudioRef.current);
      stopMedia(cannonAudioRef.current);
      stopMedia(ambientVideoRef.current);
    };
  }, []);

  useEffect(() => {
    if (!profile) return;
    if (!queuedImmersionName) return;
    setQueuedImmersionName("");
    void runConnectionImmersion(queuedImmersionName);
  }, [profile, queuedImmersionName]);

  useEffect(() => {
    if (!profile) return;
    void syncAmbientVideo(mediaUnlockedRef.current, activeCasinoRoom !== "slots");

    const unlockOnFirstGesture = () => {
      void armMediaPlayback();
    };

    window.addEventListener("pointerdown", unlockOnFirstGesture, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlockOnFirstGesture);
    };
  }, [activeCasinoRoom, profile]);

  const displayName = useMemo(() => {
    return profile?.user?.username || getCasinoDisplayName() || "Capitaine";
  }, [profile]);

  function getAudio(ref: React.MutableRefObject<HTMLAudioElement | null>, src: string) {
    if (!ref.current) {
      ref.current = new Audio(src);
      ref.current.preload = "auto";
    }
    if (ref.current.src !== src) {
      ref.current.src = src;
    }
    return ref.current;
  }

  function clearImmersionTimers() {
    if (introHideTimeoutRef.current) {
      window.clearTimeout(introHideTimeoutRef.current);
      introHideTimeoutRef.current = null;
    }
    if (introStopTimeoutRef.current) {
      window.clearTimeout(introStopTimeoutRef.current);
      introStopTimeoutRef.current = null;
    }
  }

  async function playAudioClip(
    ref: React.MutableRefObject<HTMLAudioElement | null>,
    src: string,
    volume: number,
    waitUntilEnd = false,
  ) {
    const audio = getAudio(ref, src);
    audio.pause();
    try {
      audio.currentTime = 0;
    } catch {
      // ignore reset errors
    }
    audio.volume = volume;
    audio.muted = false;

    try {
      await audio.play();
    } catch {
      return;
    }

    if (!waitUntilEnd) return;

    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        audio.removeEventListener("ended", finish);
        audio.removeEventListener("error", finish);
        resolve();
      };

      audio.addEventListener("ended", finish, { once: true });
      audio.addEventListener("error", finish, { once: true });
      window.setTimeout(finish, Math.max(1800, Math.ceil((audio.duration || 0) * 1000) + 300));
    });
  }

  async function syncAmbientVideo(withSound: boolean, shouldPlay = true) {
    const video = ambientVideoRef.current;
    if (!video) return;

    if (!shouldPlay) {
      stopMedia(video);
      setAmbientVideoAudible(false);
      return;
    }

    video.volume = withSound ? 0.14 : 0;
    video.muted = !withSound;

    try {
      await video.play();
      setAmbientVideoAudible(withSound);
    } catch {
      video.muted = true;
      video.volume = 0;
      setAmbientVideoAudible(false);
      try {
        await video.play();
      } catch {
        // ignore autoplay failures
      }
    }
  }

  async function armMediaPlayback() {
    const intro = getAudio(introAudioRef, funesterieAudio);
    intro.volume = 0.01;
    intro.muted = false;
    try {
      await intro.play();
      intro.pause();
      intro.currentTime = 0;
      mediaUnlockedRef.current = true;
      setMediaReady(true);
    } catch {
      mediaUnlockedRef.current = false;
      setMediaReady(false);
    }

    await syncAmbientVideo(mediaUnlockedRef.current, activeCasinoRoom !== "slots");
  }

  async function runConnectionImmersion(playerName: string) {
    clearImmersionTimers();
    setImmersionLine(`Pont prive en preparation pour ${playerName || "le capitaine"}...`);
    setShowImmersion(true);
    await syncAmbientVideo(mediaUnlockedRef.current, activeCasinoRoom !== "slots");
    void playAudioClip(introAudioRef, funesterieAudio, 0.56);

    introHideTimeoutRef.current = window.setTimeout(() => {
      setShowImmersion(false);
      introHideTimeoutRef.current = null;
    }, 5200);

    introStopTimeoutRef.current = window.setTimeout(() => {
      if (introAudioRef.current) {
        introAudioRef.current.pause();
      }
      introStopTimeoutRef.current = null;
    }, 7600);
  }

  function queueRouletteAudio(task: () => Promise<void>) {
    rouletteQueueRef.current = rouletteQueueRef.current.then(task).catch(() => undefined);
  }

  function handleRouletteEvent(event: RouletteSoundEvent) {
    if (event.type === "enter" || event.type === "join") {
      const now = Date.now();
      if (now - lastRouletteJoinCueAtRef.current < 2600) return;
      lastRouletteJoinCueAtRef.current = now;
      queueRouletteAudio(async () => {
        await playAudioClip(cueAudioRef, entryAudio, 0.78, true);
      });
      return;
    }

    queueRouletteAudio(async () => {
      const introVoice = Math.random() > 0.5 ? fantomeAudio : moussaillonAudio;
      await playAudioClip(cueAudioRef, introVoice, 0.74, true);
      await waitForMs(120);
      await playAudioClip(cannonAudioRef, canonAudio, 0.92, true);
    });
  }

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
    void armMediaPlayback();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await loginCasino(loginName, loginPassword);
      const nextProfile = await fetchCasinoProfile();
      startTransition(() => setProfile(nextProfile));
      setQueuedImmersionName(nextProfile.user.username);
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

    void armMediaPlayback();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await registerCasino(registerName, registerEmail, registerPassword);
      const nextProfile = await fetchCasinoProfile();
      startTransition(() => setProfile(nextProfile));
      setQueuedImmersionName(nextProfile.user.username);
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
    clearImmersionTimers();
    setShowImmersion(false);
    setQueuedImmersionName("");
    setActiveCasinoRoom("slots");
    setAmbientVideoAudible(false);
    setMediaReady(false);
    stopMedia(introAudioRef.current);
    stopMedia(cueAudioRef.current);
    stopMedia(cannonAudioRef.current);
    stopMedia(ambientVideoRef.current);
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
          {activeCasinoRoom !== "slots" ? (
            <div className="casino-ambient-corner">
              <div className="casino-ambient-corner__frame">
                <video
                  ref={ambientVideoRef}
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
                  <small>{ambientVideoAudible ? "Son d'ambiance reduit actif" : "Le son s'activera au premier geste."}</small>
                </div>
              </div>
            </div>
          ) : null}

          {showImmersion ? (
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
                  <p>{immersionLine}</p>
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
              mediaReady={mediaReady}
              onRouletteEvent={handleRouletteEvent}
              onRequestMediaPlayback={() => {
                void armMediaPlayback();
              }}
              onProfileChange={(nextProfile, message) => {
                startTransition(() => setProfile(nextProfile));
                if (message) setNotice(message);
              }}
              onError={(message) => setError(message)}
              onRoomChange={setActiveCasinoRoom}
            />
          </Suspense>
        </div>
      )}
    </main>
  );
}
