import * as React from "react";
import { useMemo, useState } from "react";
import carteImg from "./images/carte.png";
import coffreImg from "./images/coffre.png";
import lingotImg from "./images/lingot.png";
import { formatCredits, usePersistentRoomChips } from "./lib/casinoRoomState";

const MAP_ROOM_COST = 90;
const MAP_REWARD = 340;
const TREASURE_POINTS = [
  { id: "west", left: "24.8%", top: "37.4%", label: "Recif ouest" },
  { id: "south", left: "35.6%", top: "69.7%", label: "Maree du sud" },
  { id: "east", left: "68.3%", top: "53.8%", label: "Crique est" },
];

export default function CarteMiniGame({ playerName }: { playerName: string }) {
  const [tableChips, setTableChips] = usePersistentRoomChips("treasure-map", playerName, 1500);
  const [winningPoint, setWinningPoint] = useState(() => TREASURE_POINTS[Math.floor(Math.random() * TREASURE_POINTS.length)]?.id || "west");
  const [selectedPoint, setSelectedPoint] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "playing" | "resolved">("idle");
  const [status, setStatus] = useState("Etudie la carte et choisis la bonne croix.");

  const netChange = useMemo(() => {
    if (phase !== "resolved") return -MAP_ROOM_COST;
    return selectedPoint === winningPoint ? MAP_REWARD - MAP_ROOM_COST : -MAP_ROOM_COST;
  }, [phase, selectedPoint, winningPoint]);

  function startSearch() {
    if (tableChips < MAP_ROOM_COST) {
      setStatus("Il te manque des jetons de salle pour lancer une nouvelle recherche.");
      return;
    }

    setTableChips((current) => current - MAP_ROOM_COST);
    setWinningPoint(TREASURE_POINTS[Math.floor(Math.random() * TREASURE_POINTS.length)]?.id || "west");
    setSelectedPoint(null);
    setPhase("playing");
    setStatus("Une seule tentative. Choisis la croix qui te semble la plus juste.");
  }

  function choosePoint(pointId: string) {
    if (phase !== "playing") return;

    const foundTreasure = pointId === winningPoint;
    setSelectedPoint(pointId);
    setPhase("resolved");

    if (foundTreasure) {
      setTableChips((current) => current + MAP_REWARD);
      setStatus(`Trouve. Le coffre rapporte ${formatCredits(MAP_REWARD)} jetons.`);
      return;
    }

    setStatus("Mauvaise crique. La carte se referme sans recompense.");
  }

  return (
    <section className="casino-table-layout">
      <div className="casino-stage">
        <div className="casino-status-strip">
          <article>
            <span>Jetons de salle</span>
            <strong>{formatCredits(tableChips)}</strong>
          </article>
          <article>
            <span>Cout de recherche</span>
            <strong>{formatCredits(MAP_ROOM_COST)}</strong>
          </article>
          <article className={phase === "resolved" && selectedPoint === winningPoint ? "tone-positive" : phase === "resolved" ? "tone-negative" : ""}>
            <span>Variation</span>
            <strong>{phase === "idle" ? "Aucune" : `${netChange >= 0 ? "+" : ""}${formatCredits(netChange)}`}</strong>
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
                    onClick={() => choosePoint(point.id)}
                    disabled={phase !== "playing"}
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
              <span className="casino-chip">
                {phase === "playing" ? "Une seule tentative active" : "Recherche fermee"}
              </span>
              <span className="casino-chip">
                Jackpot: +{formatCredits(MAP_REWARD)}
              </span>
            </div>
            <button
              type="button"
              className="casino-primary-button"
              onClick={startSearch}
              disabled={phase === "playing"}
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
              <span>+{formatCredits(MAP_REWARD)} jetons si la croix est juste</span>
            </div>
          </div>
        </section>

        <section className="casino-panel">
          <div className="casino-panel__header">
            <span className="casino-chip">Repere</span>
            <h3>Lecture de carte</h3>
          </div>
          <div className="casino-rule-list">
            <p>Les marqueurs sont maintenant centres sur les croix de la carte, meme sur mobile.</p>
            <p>Une carte coute {formatCredits(MAP_ROOM_COST)} jetons et ne donne qu’une chance.</p>
            <p>Quand le coffre apparait, la manche se solde instantanement sans popup cassant la lecture.</p>
          </div>
        </section>
      </aside>
    </section>
  );
}
