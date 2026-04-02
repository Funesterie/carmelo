import * as React from "react";
import { useMemo, useState } from "react";
import marineImg from "./images/marine.png";
import opaleImg from "./images/opale.png";
import rubisImg from "./images/rubis.png";
import saphirImg from "./images/saphir.png";
import drapImg from "./images/drap.png";
import { formatCredits, usePersistentRoomChips } from "./lib/casinoRoomState";

type TreasureTile = {
  id: number;
  reward: number;
  revealed: boolean;
};

const ROOM_COST = 120;
const HUNT_PRIZES = [
  { reward: 520, label: "Opale reine", art: opaleImg },
  { reward: 320, label: "Rubis braise", art: rubisImg },
  { reward: 180, label: "Saphir du sillage", art: saphirImg },
];

function buildTreasureBoard() {
  const winningSlots = [...Array.from({ length: 9 }, (_, index) => index)]
    .sort(() => Math.random() - 0.5)
    .slice(0, HUNT_PRIZES.length);

  return Array.from({ length: 9 }, (_, index) => {
    const prizeIndex = winningSlots.indexOf(index);
    return {
      id: index,
      reward: prizeIndex >= 0 ? HUNT_PRIZES[prizeIndex].reward : 0,
      revealed: false,
    };
  });
}

function getPrizeMeta(reward: number) {
  return HUNT_PRIZES.find((entry) => entry.reward === reward) || null;
}

export default function MiniTreasureGame({ playerName }: { playerName: string }) {
  const [tableChips, setTableChips] = usePersistentRoomChips(
    "treasure-hunt",
    playerName,
    1800,
  );
  const [board, setBoard] = useState<TreasureTile[]>(() => buildTreasureBoard());
  const [shotsLeft, setShotsLeft] = useState(0);
  const [roundReward, setRoundReward] = useState(0);
  const [status, setStatus] = useState("Lance une expedition et tire trois salves sur la baie.");
  const [phase, setPhase] = useState<"idle" | "playing" | "resolved">("idle");

  const revealedPrizes = useMemo(
    () => board.filter((tile) => tile.revealed && tile.reward > 0),
    [board],
  );

  function startRound() {
    if (tableChips < ROOM_COST) {
      setStatus("Tes jetons de salle sont trop bas pour affreter une nouvelle expedition.");
      return;
    }

    setTableChips((current) => current - ROOM_COST);
    setBoard(buildTreasureBoard());
    setShotsLeft(3);
    setRoundReward(0);
    setPhase("playing");
    setStatus("Trois tirs, trois chances. Choisis tes navires avec soin.");
  }

  function revealTile(tileId: number) {
    if (phase !== "playing" || shotsLeft <= 0) return;

    const tile = board.find((entry) => entry.id === tileId);
    if (!tile || tile.revealed) return;

    const reward = tile.reward;
    const remainingShots = shotsLeft - 1;
    const nextReward = roundReward + reward;

    setBoard((current) =>
      current.map((entry) =>
        entry.id === tileId ? { ...entry, revealed: true } : entry,
      ),
    );
    setShotsLeft(remainingShots);
    setRoundReward(nextReward);

    if (remainingShots === 0) {
      setPhase("resolved");
      setTableChips((current) => current + nextReward);
      setStatus(
        reward > 0
          ? `Derniere salve reussie. La cale remonte avec ${formatCredits(nextReward)} jetons.`
          : `Expedition bouclee. Bilan de chasse: ${formatCredits(nextReward)} jetons.`,
      );
      return;
    }

    if (reward > 0) {
      const prizeMeta = getPrizeMeta(reward);
      setStatus(
        `${prizeMeta?.label || "Tresor"} repere. Encore ${remainingShots} tir${remainingShots > 1 ? "s" : ""}.`,
      );
      return;
    }

    setStatus(`Rien que de l'ecume. Il reste ${remainingShots} tir${remainingShots > 1 ? "s" : ""}.`);
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
            <span>Affretement</span>
            <strong>{formatCredits(ROOM_COST)}</strong>
          </article>
          <article className={phase === "resolved" && roundReward > ROOM_COST ? "tone-positive" : ""}>
            <span>Gain de la manche</span>
            <strong>{formatCredits(roundReward - ROOM_COST)}</strong>
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
              {board.map((tile) => {
                const prizeMeta = getPrizeMeta(tile.reward);
                return (
                  <button
                    key={tile.id}
                    type="button"
                    className={`casino-boat-tile ${tile.revealed ? "is-revealed" : ""}`}
                    disabled={phase !== "playing" || tile.revealed}
                    onClick={() => revealTile(tile.id)}
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
                <span className="casino-chip">Tirs restants: {shotsLeft}</span>
                <span className="casino-chip">Pierres relevees: {revealedPrizes.length}</span>
              </div>
              <button
                type="button"
                className="casino-primary-button"
                onClick={startRound}
                disabled={phase === "playing"}
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
                  <span>+{formatCredits(entry.reward)} jetons</span>
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
            <p>Chaque expedition coute {formatCredits(ROOM_COST)} jetons.</p>
            <p>Tu as trois tirs pour reveler jusqu’a trois navires gagnants.</p>
            <p>Les gains sont credites a la fin de la manche pour garder la lecture propre.</p>
          </div>
        </section>
      </aside>
    </section>
  );
}
