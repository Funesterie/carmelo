import * as React from "react";
import canonSound from "./audio/canon.mp3";
import opaleSound from "./audio/opale.mp3";
import rubisSound from "./audio/rubis.mp3";
import saphirSound from "./audio/saphir.mp3";
import { useMemo, useState } from "react";
import marineImg from "./images/marine.png";
import opaleImg from "./images/opale.png";
import rubisImg from "./images/rubis.png";
import saphirImg from "./images/saphir.png";
import drapImg from "./images/drap.png";
import {
  type CasinoProfile,
  type TreasureHuntState,
  revealTreasureHuntTile,
  startTreasureHunt,
} from "./lib/casinoApi";
import { formatCredits } from "./lib/casinoRoomState";

const ROOM_COST = 120;
const HUNT_PRIZES = [
  { reward: 520, label: "Opale reine", art: opaleImg },
  { reward: 320, label: "Rubis braise", art: rubisImg },
  { reward: 180, label: "Saphir du sillage", art: saphirImg },
];

type MiniTreasureGameProps = {
  profile: CasinoProfile;
  mediaReady?: boolean;
  onProfileChange: (profile: CasinoProfile, message?: string) => void;
  onError: (message: string) => void;
};

function getPrizeMeta(reward: number | null) {
  return HUNT_PRIZES.find((entry) => entry.reward === reward) || null;
}

export default function MiniTreasureGame({
  profile,
  mediaReady = false,
  onProfileChange,
  onError,
}: MiniTreasureGameProps) {
  const [state, setState] = useState<TreasureHuntState | null>(null);
  const [status, setStatus] = useState("Lance une expedition et tire trois salves sur la baie.");
  const [working, setWorking] = useState(false);
  const canonAudioRef = React.useRef<HTMLAudioElement | null>(null);
  const opaleAudioRef = React.useRef<HTMLAudioElement | null>(null);
  const rubisAudioRef = React.useRef<HTMLAudioElement | null>(null);
  const saphirAudioRef = React.useRef<HTMLAudioElement | null>(null);

  const phase = state?.phase || "idle";
  const revealedPrizes = useMemo(
    () => (state?.board || []).filter((tile) => tile.revealed && (tile.reward || 0) > 0),
    [state],
  );
  const lastDelta = phase === "resolved" ? (state?.reward || 0) - ROOM_COST : 0;

  function playCue(ref: React.MutableRefObject<HTMLAudioElement | null>, src: string, volume: number) {
    if (!mediaReady) return;
    if (!ref.current) {
      ref.current = new Audio(src);
      ref.current.preload = "auto";
    }
    ref.current.pause();
    try {
      ref.current.currentTime = 0;
    } catch {
      // ignore
    }
    ref.current.volume = volume;
    void ref.current.play().catch(() => undefined);
  }

  React.useEffect(() => {
    return () => {
      canonAudioRef.current?.pause();
      opaleAudioRef.current?.pause();
      rubisAudioRef.current?.pause();
      saphirAudioRef.current?.pause();
    };
  }, []);

  async function handleStartRound() {
    onError("");
    setWorking(true);
    try {
      const result = await startTreasureHunt();
      setState(result.state);
      setStatus(result.state.message);
      if (result.profile) {
        onProfileChange(result.profile);
      }
    } catch (error_) {
      onError(error_ instanceof Error ? error_.message : "L'expedition n'a pas pu etre lancee.");
    } finally {
      setWorking(false);
    }
  }

  async function revealTile(tileId: number) {
    if (!state?.token || phase !== "playing" || working) return;
    onError("");
    setWorking(true);
    try {
      const result = await revealTreasureHuntTile(state.token, tileId);
      setState(result.state);
      setStatus(result.state.message);
      const revealedTile = result.state.board.find((tile) => tile.id === tileId);
      const reward = Number(revealedTile?.reward || 0);
      if (reward >= 520) {
        playCue(opaleAudioRef, opaleSound, 0.84);
      } else if (reward >= 320) {
        playCue(rubisAudioRef, rubisSound, 0.82);
      } else if (reward >= 180) {
        playCue(saphirAudioRef, saphirSound, 0.8);
      } else {
        playCue(canonAudioRef, canonSound, 0.76);
      }
      if (result.profile) {
        onProfileChange(result.profile);
      }
    } catch (error_) {
      onError(error_ instanceof Error ? error_.message : "La salve n'a pas pu etre jouee.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <section className="casino-table-layout">
      <div className="casino-stage">
        <div className="casino-status-strip">
          <article>
            <span>Solde serveur</span>
            <strong>{formatCredits(profile.wallet.balance)}</strong>
          </article>
          <article>
            <span>Affretement</span>
            <strong>{formatCredits(ROOM_COST)}</strong>
          </article>
          <article className={phase === "resolved" && lastDelta > 0 ? "tone-positive" : phase === "resolved" ? "tone-negative" : ""}>
            <span>Gain de la manche</span>
            <strong>{phase === "resolved" ? `${lastDelta >= 0 ? "+" : ""}${formatCredits(lastDelta)}` : "Aucun"}</strong>
          </article>
        </div>

        <div className="casino-reel-shell casino-room-shell">
          <div className="casino-reel-shell__header">
            <div>
              <span className="casino-chip">Chasse navale</span>
              <h2>Baie aux epaves</h2>
            </div>
            <p>{status}</p>
          </div>

          <div className="casino-treasure-hunt">
            <div className="casino-treasure-hunt__hero">
              <img src={drapImg} alt="Drapeau pirate" />
              <div>
                <strong>Trois navires cachent des pierres fines.</strong>
                <span>Les autres ne laissent qu’un nuage de poudre sur l’eau.</span>
              </div>
            </div>

            <div className="casino-boat-grid">
              {(state?.board || Array.from({ length: 9 }, (_, id) => ({ id, revealed: false, reward: null }))).map((tile) => {
                const prizeMeta = getPrizeMeta(tile.reward);
                return (
                  <button
                    key={tile.id}
                    type="button"
                    className={`casino-boat-tile ${tile.revealed ? "is-revealed" : ""}`}
                    disabled={phase !== "playing" || tile.revealed || working}
                    onClick={() => void revealTile(tile.id)}
                  >
                    {!tile.revealed ? (
                      <img src={marineImg} alt="Navire" />
                    ) : prizeMeta ? (
                      <div className="casino-boat-tile__treasure">
                        <img src={prizeMeta.art} alt={prizeMeta.label} />
                        <strong>{formatCredits(prizeMeta.reward)}</strong>
                      </div>
                    ) : (
                      <div className="casino-boat-tile__miss">
                        <span>💥</span>
                        <strong>Eau vide</strong>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="casino-action-row">
              <div className="casino-chip-row">
                <span className="casino-chip">Tirs restants: {state?.shotsLeft ?? 0}</span>
                <span className="casino-chip">Pierres relevees: {revealedPrizes.length}</span>
              </div>
              <button
                type="button"
                className="casino-primary-button"
                onClick={() => void handleStartRound()}
                disabled={phase === "playing" || working}
              >
                {phase === "playing" ? "Expedition en cours" : "Lancer une expedition"}
              </button>
            </div>
          </div>
        </div>
      </div>

      <aside className="casino-side-rail">
        <section className="casino-panel">
          <div className="casino-panel__header">
            <span className="casino-chip">Table</span>
            <h3>Recompenses</h3>
          </div>
          <div className="casino-prize-stack">
            {HUNT_PRIZES.map((entry) => (
              <article key={entry.reward} className="casino-prize-card">
                <img src={entry.art} alt={entry.label} />
                <div>
                  <strong>{entry.label}</strong>
                  <span>+{formatCredits(entry.reward)} credits</span>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="casino-panel">
          <div className="casino-panel__header">
            <span className="casino-chip">Regles</span>
            <h3>Comment jouer</h3>
          </div>
          <div className="casino-rule-list">
            <p>Chaque expedition coute {formatCredits(ROOM_COST)} credits.</p>
            <p>Tu as trois tirs pour reveler jusqu’a trois navires gagnants.</p>
            <p>Le plateau et le paiement vivent maintenant cote serveur pour suivre le vrai wallet A11.</p>
          </div>
        </section>
      </aside>
    </section>
  );
}
