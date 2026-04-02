import * as React from "react";
import { useMemo, useState } from "react";
import carteImg from "./images/carte.png";
import coffreImg from "./images/coffre.png";
import lingotImg from "./images/lingot.png";
import { type CasinoProfile, playTreasureMap } from "./lib/casinoApi";
import { formatCredits } from "./lib/casinoRoomState";

const MAP_ROOM_COST = 90;
const MAP_REWARD = 340;
const TREASURE_POINTS = [
  { id: "west", left: "24.8%", top: "37.4%", label: "Recif ouest" },
  { id: "south", left: "35.6%", top: "69.7%", label: "Maree du sud" },
  { id: "east", left: "68.3%", top: "53.8%", label: "Crique est" },
] as const;

type CarteMiniGameProps = {
  profile: CasinoProfile;
  onProfileChange: (profile: CasinoProfile, message?: string) => void;
  onError: (message: string) => void;
};

export default function CarteMiniGame({
  profile,
  onProfileChange,
  onError,
}: CarteMiniGameProps) {
  const [selectedPoint, setSelectedPoint] = useState<string | null>(null);
  const [winningPoint, setWinningPoint] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "playing" | "resolved">("idle");
  const [status, setStatus] = useState("Etudie la carte et choisis la bonne croix.");
  const [working, setWorking] = useState(false);
  const [lastDelta, setLastDelta] = useState(0);

  const canPlay = profile.wallet.balance >= MAP_ROOM_COST;
  const isWin = phase === "resolved" && selectedPoint && selectedPoint === winningPoint;

  const visibleDelta = useMemo(() => {
    if (phase === "idle") return 0;
    return lastDelta;
  }, [lastDelta, phase]);

  function startSearch() {
    onError("");
    if (!canPlay) {
      setStatus("Il te manque des credits serveur pour ouvrir une nouvelle carte.");
      return;
    }
    setPhase("playing");
    setSelectedPoint(null);
    setWinningPoint(null);
    setLastDelta(0);
    setStatus("Une seule tentative. Choisis la croix qui te semble la plus juste.");
  }

  async function choosePoint(pointId: string) {
    if (phase !== "playing" || working) return;
    onError("");
    setWorking(true);
    try {
      const result = await playTreasureMap(pointId);
      setSelectedPoint(result.result.selectedPoint);
      setWinningPoint(result.result.winningPoint);
      setPhase("resolved");
      setLastDelta(result.result.netChange);
      setStatus(
        result.result.reward > 0
          ? `Trouve. Le coffre rapporte ${formatCredits(result.result.reward)} credits.`
          : "Mauvaise crique. La carte se referme sans recompense."
      );
      onProfileChange(result.profile);
    } catch (error_) {
      onError(error_ instanceof Error ? error_.message : "La carte n'a pas pu etre jouee.");
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
            <span>Cout de recherche</span>
            <strong>{formatCredits(MAP_ROOM_COST)}</strong>
          </article>
          <article className={isWin ? "tone-positive" : phase === "resolved" ? "tone-negative" : ""}>
            <span>Variation</span>
            <strong>{phase === "idle" ? "Aucune" : `${visibleDelta >= 0 ? "+" : ""}${formatCredits(visibleDelta)}`}</strong>
          </article>
        </div>

        <div className="casino-reel-shell casino-room-shell">
          <div className="casino-reel-shell__header">
            <div>
              <span className="casino-chip">Carte au tresor</span>
              <h2>Archiviste des criques</h2>
            </div>
            <p>{status}</p>
          </div>

          <div className="casino-map-board">
            <div className="casino-map-board__frame">
              <img src={carteImg} alt="Carte au tresor" className="casino-map-board__image" />
              {TREASURE_POINTS.map((point) => {
                const isSelected = selectedPoint === point.id;
                const isWinner = phase === "resolved" && winningPoint === point.id;
                return (
                  <button
                    key={point.id}
                    type="button"
                    className={`casino-map-marker ${isSelected ? "is-selected" : ""} ${isWinner ? "is-winning" : ""}`}
                    style={{ left: point.left, top: point.top }}
                    onClick={() => void choosePoint(point.id)}
                    disabled={phase !== "playing" || working}
                    aria-label={point.label}
                  >
                    {isWinner ? <img src={coffreImg} alt="" /> : <span>✕</span>}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="casino-action-row">
            <div className="casino-chip-row">
              <span className="casino-chip">{phase === "playing" ? "Une seule tentative active" : "Recherche fermee"}</span>
              <span className="casino-chip">Jackpot: +{formatCredits(MAP_REWARD)}</span>
            </div>
            <button
              type="button"
              className="casino-primary-button"
              onClick={startSearch}
              disabled={phase === "playing" || working}
            >
              {phase === "playing" ? "Carte ouverte" : "Ouvrir une carte"}
            </button>
          </div>
        </div>
      </div>

      <aside className="casino-side-rail">
        <section className="casino-panel">
          <div className="casino-panel__header">
            <span className="casino-chip">Butin</span>
            <h3>Coffre du cartographe</h3>
          </div>
          <div className="casino-prize-card casino-prize-card--single">
            <img src={lingotImg} alt="Lingot pirate" />
            <div>
              <strong>Cache principale</strong>
              <span>+{formatCredits(MAP_REWARD)} credits si la croix est juste</span>
            </div>
          </div>
        </section>

        <section className="casino-panel">
          <div className="casino-panel__header">
            <span className="casino-chip">Repere</span>
            <h3>Lecture de carte</h3>
          </div>
          <div className="casino-rule-list">
            <p>Les marqueurs restent centres sur les croix, meme sur mobile.</p>
            <p>La carte est maintenant debitée et resolue cote serveur pour coller au vrai wallet A11.</p>
            <p>Quand le coffre apparait, la manche se ferme sans popup parasite ni solde fantome.</p>
          </div>
        </section>
      </aside>
    </section>
  );
}
