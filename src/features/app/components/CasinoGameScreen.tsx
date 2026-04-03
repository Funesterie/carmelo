import type { MutableRefObject, ReactNode } from "react";
import type { CasinoProfile } from "../../../lib/casinoApi";
import LoadingPanel from "./LoadingPanel";

type CasinoGameScreenProps = {
  profile: CasinoProfile;
  busy: boolean;
  error: string;
  notice: string;
  displayName: string;
  activeCasinoRoom: string;
  ambientVideoAudible: boolean;
  showImmersion: boolean;
  immersionLine: string;
  mediaReady: boolean;
  ambientVideoRef: MutableRefObject<HTMLVideoElement | null>;
  freshVideo: string;
  districtArtwork: string;
  cardArtwork: string;
  onClaimBonus: () => void;
  onRefreshProfile: () => void;
  onLogout: () => void;
  gameTable: ReactNode;
};

export default function CasinoGameScreen({
  profile,
  busy,
  error,
  notice,
  displayName,
  activeCasinoRoom,
  ambientVideoAudible,
  showImmersion,
  immersionLine,
  mediaReady,
  ambientVideoRef,
  freshVideo,
  districtArtwork,
  cardArtwork,
  onClaimBonus,
  onRefreshProfile,
  onLogout,
  gameTable,
}: CasinoGameScreenProps) {
  return (
    <div className="casino-game-shell">
      {activeCasinoRoom !== "slots" ? (
        <div className="casino-ambient-mount" aria-hidden="true">
          <video
            ref={ambientVideoRef}
            className="casino-ambient-mount__video"
            src={freshVideo}
            autoPlay
            loop
            playsInline
            muted
          />
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
            onClick={onClaimBonus}
          >
            {profile.wallet.canClaimDailyBonus ? `Bonus +${profile.wallet.dailyBonusAmount}` : "Bonus deja recupere"}
          </button>
          <button type="button" className="casino-ghost-button" disabled={busy} onClick={onRefreshProfile}>
            Synchroniser
          </button>
          <button type="button" className="casino-ghost-button" onClick={onLogout}>
            Deconnexion
          </button>
          {activeCasinoRoom !== "slots" ? (
            <div className="casino-ambient-indicator" aria-live="polite">
              <span className="casino-chip">Pont ATS</span>
              <small>{ambientVideoAudible ? "Ambiance live active" : "Ambiance en attente d'un geste"}</small>
            </div>
          ) : null}
        </div>
      </header>

      {(error || notice) ? (
        <div className="casino-toast-rail" aria-live="polite">
          {error ? <div className="casino-alert casino-alert--error">{error}</div> : null}
          {notice ? <div className="casino-alert casino-alert--success">{notice}</div> : null}
        </div>
      ) : null}

      {gameTable ?? <LoadingPanel label="Chargement de la table..." />}
    </div>
  );
}
