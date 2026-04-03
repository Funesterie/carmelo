import type { MutableRefObject, ReactNode } from "react";
import type { CasinoProfile } from "../../../lib/casinoApi";
import LoadingPanel from "./LoadingPanel";

type MenuIconKind = "bonus" | "sync" | "logout";

function HeaderActionIcon({ kind }: { kind: MenuIconKind }) {
  switch (kind) {
    case "bonus":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 7.5C6 6.12 8.02 5 10.5 5S15 6.12 15 7.5 12.98 10 10.5 10 6 8.88 6 7.5Z" />
          <path d="M6 12c0 1.38 2.02 2.5 4.5 2.5S15 13.38 15 12" />
          <path d="M6 16.5c0 1.38 2.02 2.5 4.5 2.5S15 17.88 15 16.5" />
          <path d="M6 7.5v9" />
          <path d="M15 7.5v9" />
          <path d="M17.5 8.5h3" />
          <path d="M19 7v3" />
        </svg>
      );
    case "sync":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M20 6v5h-5" />
          <path d="M4 18v-5h5" />
          <path d="M7.5 9A6.5 6.5 0 0 1 20 11" />
          <path d="M16.5 15A6.5 6.5 0 0 1 4 13" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" />
          <path d="M10 16l4-4-4-4" />
          <path d="M14 12H4" />
        </svg>
      );
  }
}

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
    <div className={`casino-game-shell ${activeCasinoRoom !== "slots" ? "casino-game-shell--with-ambient" : ""}`}>

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
                preload="metadata"
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
            className="casino-ghost-button casino-ghost-button--menu"
            disabled={busy || !profile.wallet.canClaimDailyBonus}
            onClick={onClaimBonus}
            title={profile.wallet.canClaimDailyBonus ? "Recuperer le bonus journalier" : "Bonus journalier deja recupere"}
          >
            <span className="casino-button-icon">
              <HeaderActionIcon kind="bonus" />
            </span>
            <span className="casino-button-label">
              {profile.wallet.canClaimDailyBonus ? `Bonus +${profile.wallet.dailyBonusAmount}` : "Bonus pris"}
            </span>
          </button>
          <button
            type="button"
            className="casino-ghost-button casino-ghost-button--menu"
            disabled={busy}
            onClick={onRefreshProfile}
            title="Synchroniser le compte"
          >
            <span className="casino-button-icon">
              <HeaderActionIcon kind="sync" />
            </span>
            <span className="casino-button-label">Sync</span>
          </button>
          <button
            type="button"
            className="casino-ghost-button casino-ghost-button--menu"
            onClick={onLogout}
            title="Fermer la session"
          >
            <span className="casino-button-icon">
              <HeaderActionIcon kind="logout" />
            </span>
            <span className="casino-button-label">Quitter</span>
          </button>
          {activeCasinoRoom !== "slots" ? (
            <div className="casino-ambient-indicator" aria-live="polite">
              <span className="casino-chip">Pont ATS</span>
              <small>{ambientVideoAudible ? "Video d'ambiance en haut a droite" : "Video visible, audio en attente d'un geste"}</small>
            </div>
          ) : null}
        </div>
      </header>

      {activeCasinoRoom !== "slots" ? (
        <div className="casino-ambient-corner" aria-live="polite">
          <div className="casino-ambient-corner__frame">
            <video
              ref={ambientVideoRef}
              className="casino-ambient-corner__video"
              src={freshVideo}
              autoPlay
              loop
              playsInline
              muted={!ambientVideoAudible}
              preload="metadata"
            />
            <div className="casino-ambient-corner__veil" />
            <div className="casino-ambient-corner__copy">
              <span className="casino-chip">Pont ATS</span>
              <strong>Ambiance live</strong>
              <small>{ambientVideoAudible ? "Flux ambiance actif" : "En attente d'un geste pour l'audio"}</small>
            </div>
          </div>
        </div>
      ) : null}

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
