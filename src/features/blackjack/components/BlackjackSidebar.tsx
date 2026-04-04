import { useEffect } from "react";
import PirateInspector from "../../../PirateInspector";
import { formatCredits } from "../../../lib/casinoRoomState";
import { BLACKJACK_SALONS } from "../../../lib/tableSalons";
import type { BlackjackState, CasinoProfile, CasinoTableRoom } from "../../../lib/casinoApi";

const PLAYER_BETS = [50, 100, 200, 400];
type BlackjackPlayMode = "solo" | "live";

type BlackjackSidebarProps = {
  profile: CasinoProfile;
  state: BlackjackState | null;
  bet: number;
  working: boolean;
  playMode: BlackjackPlayMode;
  roomId: string;
  rooms: CasinoTableRoom[];
  infoTab: "salons" | "regles" | "joueurs";
  isDecisionPhase: boolean;
  roomSwitchLocked: boolean;
  onBetChange: (bet: number) => void;
  onPlayModeChange: (mode: BlackjackPlayMode) => void;
  onInfoTabChange: (tab: "salons" | "regles" | "joueurs") => void;
  onRoomChange: (roomId: string) => void;
  onHit: () => void;
  onStand: () => void;
  onDeal: () => void;
};

export default function BlackjackSidebar({
  profile,
  state,
  bet,
  working,
  playMode,
  roomId,
  rooms,
  infoTab,
  isDecisionPhase,
  roomSwitchLocked,
  onBetChange,
  onPlayModeChange,
  onInfoTabChange,
  onRoomChange,
  onHit,
  onStand,
  onDeal,
}: BlackjackSidebarProps) {
  const stage = state?.stage || "idle";
  const canDeal = stage !== "player-turn";
  const activeRoom = rooms.find((entry) => entry.id === roomId) || null;

  return (
    <div className="casino-stage-sidebar">
      <div className={`casino-command-dock casino-command-dock--blackjack ${isDecisionPhase ? "is-attention" : ""}`}>
        <div className="casino-command-dock__copy">
          <span className="casino-chip">{isDecisionPhase ? "Decision" : "Distribution"}</span>
          <strong>{isDecisionPhase ? `Main a ${state?.playerScore.total || 0} points` : "Commandes de table"}</strong>
          <p>
            {isDecisionPhase
              ? "Concentre-toi sur ta main, la carte visible du croupier et l'ordre du prochain choix."
              : playMode === "solo"
                ? "Mode solo: tu joues uniquement contre le croupier, sans bots ajoutes sur le tapis."
                : "Mode live: les reglages et la vie du salon passent dans la colonne laterale."}
          </p>
        </div>

        <div className="casino-command-dock__betline">
          <div className="casino-bet-pills">
            <button
              type="button"
              className={`casino-bet-pill casino-bet-pill--dubloon ${playMode === "solo" ? "is-active" : ""}`}
              onClick={() => onPlayModeChange("solo")}
              disabled={roomSwitchLocked || working}
            >
              Solo
            </button>
            <button
              type="button"
              className={`casino-bet-pill casino-bet-pill--dubloon ${playMode === "live" ? "is-active" : ""}`}
              onClick={() => onPlayModeChange("live")}
              disabled={roomSwitchLocked || working}
            >
              Live
            </button>
          </div>
        </div>

        <div className="casino-command-dock__betline">
          <div className="casino-bet-pills">
            {PLAYER_BETS.map((preset) => (
              <button
                key={preset}
                type="button"
                className={`casino-bet-pill casino-bet-pill--dubloon ${bet === preset ? "is-active" : ""}`}
                onClick={() => onBetChange(preset)}
                disabled={stage === "player-turn" || working}
              >
                {preset}
              </button>
            ))}
          </div>
        </div>

        <div className="casino-command-dock__actions">
          <button
            type="button"
            className="casino-ghost-button casino-ghost-button--danger"
            onClick={onHit}
            disabled={stage !== "player-turn" || working}
          >
            Tirer
          </button>
          <button
            type="button"
            className="casino-ghost-button casino-ghost-button--steady"
            onClick={onStand}
            disabled={stage !== "player-turn" || working}
          >
            Rester
          </button>
          {canDeal ? (
              <button
                type="button"
                className="casino-primary-button casino-primary-button--cyan"
                onClick={onDeal}
                disabled={working || profile.wallet.balance < bet}
              >
                {playMode === "solo" ? "Distribuer solo" : "Distribuer"}
              </button>
            ) : null}
        </div>
      </div>

      <PirateInspector
        title="Carnet de bord"
        eyebrow="Table"
        activeTab={infoTab}
        onChange={(tabId) => onInfoTabChange(tabId as typeof infoTab)}
        tabs={[
          {
            id: "salons",
            label: "Salons",
            badge: rooms.find((entry) => entry.id === roomId)?.playerCount || 0,
            caption: "Change de table sans perdre la lisibilite du layout.",
            content: (
              playMode === "live" ? (
                <div className="casino-salon-roster">
                  {BLACKJACK_SALONS.map((salon) => {
                    const room = rooms.find((entry) => entry.id === salon.id);
                    return (
                      <button
                        key={salon.id}
                        type="button"
                        className={`casino-salon-card ${salon.id === roomId ? "is-active" : ""} ${roomSwitchLocked ? "is-locked" : ""}`}
                        onClick={() => onRoomChange(salon.id)}
                        disabled={roomSwitchLocked || working}
                      >
                        <div>
                          <strong>{salon.title}</strong>
                          <span>{salon.blurb}</span>
                        </div>
                        <b>{room?.playerCount || 0} joueur{(room?.playerCount || 0) > 1 ? "s" : ""}</b>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="casino-rule-list">
                  <p>Le mode solo ne rejoint aucun salon et ne remplit pas la table avec des bots.</p>
                  <p>Bascule sur Live si tu veux retrouver les salons humains partages.</p>
                </div>
              )
            ),
          },
          {
            id: "regles",
            label: "Regles",
            caption: "Resume compact pour garder le regard sur la table.",
            content: (
              <div className="casino-rule-list">
                <p>Tu joues face au croupier avec lecture claire de ta main et de la carte visible.</p>
                <p>Blackjack naturel paie 3:2. Une egalite rend simplement la mise.</p>
                <p>La mise et le paiement passent par le wallet A11, pas par des jetons locaux.</p>
              </div>
            ),
          },
          {
            id: "joueurs",
            label: "Joueurs",
            badge: (activeRoom?.participants || []).length,
            caption: "Presence du salon actif.",
            content: (
              <div className="casino-prize-stack">
                {(activeRoom?.participants || []).length ? (
                  activeRoom.participants.map((participant) => (
                    <article key={participant.userId} className="casino-prize-card">
                      <div className="casino-prize-card__glyph">21</div>
                      <div>
                        <strong>{participant.username}</strong>
                        <span>{participant.userId === profile.user.id ? "toi" : "connecte sur le salon"}</span>
                      </div>
                    </article>
                  ))
                ) : (
                  <p className="casino-history-empty">Tu es seul sur ce salon pour le moment.</p>
                )}
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
