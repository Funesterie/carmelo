import PirateInspector from "../../../PirateInspector";
import { formatCredits } from "../../../lib/casinoRoomState";
import { BLACKJACK_SALONS } from "../../../lib/tableSalons";
import type { BlackjackState, CasinoProfile, CasinoTableRoom } from "../../../lib/casinoApi";

const PLAYER_BETS = [50, 100, 200, 400];

type BlackjackSidebarProps = {
  profile: CasinoProfile;
  state: BlackjackState | null;
  bet: number;
  working: boolean;
  roomId: string;
  rooms: CasinoTableRoom[];
  infoTab: "salons" | "regles" | "joueurs";
  isDecisionPhase: boolean;
  roomSwitchLocked: boolean;
  onBetChange: (bet: number) => void;
  onInfoTabChange: (tab: "salons" | "regles" | "joueurs") => void;
  onHit: () => void;
  onStand: () => void;
  onDeal: () => void;
};

export default function BlackjackSidebar({
  profile,
  state,
  bet,
  working,
  roomId,
  rooms,
  infoTab,
  isDecisionPhase,
  roomSwitchLocked,
  onBetChange,
  onInfoTabChange,
  onHit,
  onStand,
  onDeal,
}: BlackjackSidebarProps) {
  const stage = state?.stage || "idle";
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
              : "La table reste visible; les reglages et la vie du salon passent dans la colonne laterale."}
          </p>
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

          <div className="casino-chip-row">
            <span className="casino-chip">Mise {formatCredits(state?.wager || bet)}</span>
            <span className="casino-chip">{state?.dealerHidden ? "Une carte cachee" : "Lecture ouverte"}</span>
            <span className="casino-chip">Payout {formatCredits(state?.payoutAmount || 0)}</span>
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
          <button
            type="button"
            className="casino-primary-button casino-primary-button--cyan"
            onClick={onDeal}
            disabled={working || stage === "player-turn" || profile.wallet.balance < bet}
          >
            {stage === "player-turn" ? "Main en cours" : "Distribuer"}
          </button>
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
              <div className="casino-salon-roster">
                {BLACKJACK_SALONS.map((salon) => {
                  const room = rooms.find((entry) => entry.id === salon.id);
                  return (
                    <article key={salon.id} className={`casino-salon-card ${salon.id === roomId ? "is-active" : ""} ${roomSwitchLocked ? "is-locked" : ""}`}>
                      <div>
                        <strong>{salon.title}</strong>
                        <span>{salon.blurb}</span>
                      </div>
                      <b>{room?.playerCount || 0} joueur{(room?.playerCount || 0) > 1 ? "s" : ""}</b>
                    </article>
                  );
                })}
              </div>
            ),
          },
          {
            id: "regles",
            label: "Regles",
            caption: "Resume compact pour garder le regard sur la table.",
            content: (
              <div className="casino-rule-list">
                <p>Tu joues face au croupier avec quatre marins IA places sur l'arc de table.</p>
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
