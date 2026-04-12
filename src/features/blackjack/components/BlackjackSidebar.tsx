import PirateInspector from "../../../PirateInspector";
import { BLACKJACK_SALONS } from "../../../lib/tableSalons";
import type { BlackjackAction, BlackjackState, CasinoProfile, CasinoTableRoom } from "../../../lib/casinoApi";

const PLAYER_BETS = [10, 20, 50, 200];
const CHIP_TONES: Record<number, "amber" | "cyan" | "crimson" | "ivory"> = {
  10: "amber",
  20: "cyan",
  50: "crimson",
  200: "ivory",
};

type BlackjackSidebarProps = {
  profile: CasinoProfile;
  state: BlackjackState | null;
  bet: number;
  betChips: number[];
  working: boolean;
  roomId: string;
  rooms: CasinoTableRoom[];
  infoTab: "salons" | "regles" | "joueurs";
  isDecisionPhase: boolean;
  roomSwitchLocked: boolean;
  legalActions: BlackjackAction[];
  onBetChipAdd: (bet: number) => void;
  onInfoTabChange: (tab: "salons" | "regles" | "joueurs") => void;
  onRoomChange: (roomId: string) => void;
  onHit: () => void;
  onStand: () => void;
  onDouble: () => void;
  onSplit: () => void;
  onDeal: () => void;
};

export default function BlackjackSidebar({
  profile,
  state,
  bet,
  betChips,
  working,
  roomId,
  rooms,
  infoTab,
  isDecisionPhase,
  roomSwitchLocked,
  legalActions,
  onBetChipAdd,
  onInfoTabChange,
  onRoomChange,
  onHit,
  onStand,
  onDouble,
  onSplit,
  onDeal,
}: BlackjackSidebarProps) {
  const stage = state?.stage || "idle";
  const canDeal = stage !== "player-turn";
  const activeRoom = rooms.find((entry) => entry.id === roomId) || null;
  const canHit = legalActions.includes("hit");
  const canStand = legalActions.includes("stand");
  const canDouble = legalActions.includes("double");
  const canSplit = legalActions.includes("split");
  const selectedCounts = betChips.reduce<Record<number, number>>((accumulator, chip) => {
    accumulator[chip] = (accumulator[chip] || 0) + 1;
    return accumulator;
  }, {});

  return (
    <div className="casino-stage-sidebar">
      <div className={`casino-command-dock casino-command-dock--blackjack ${isDecisionPhase ? "is-attention" : ""}`}>
        <div className="casino-command-dock__copy">
          <span className="casino-chip">{isDecisionPhase ? "Decision" : "Distribution"}</span>
          <strong>{isDecisionPhase ? `Main a ${state?.playerScore.total || 0} points` : "Commandes de table"}</strong>
          <p>
            {isDecisionPhase
              ? "Concentre-toi sur ta main, la carte visible du croupier et les vraies options de blackjack ouvertes pour cette combinaison."
              : "Le salon garde la meme table et se synchronise selon les joueurs presents."}
          </p>
        </div>

        <div className="casino-command-dock__actions casino-command-dock__actions--blackjack-layout">
          <button
            type="button"
            className="casino-primary-button casino-primary-button--cyan casino-command-dock__primary-action"
            onClick={onDeal}
            disabled={!canDeal || working || !bet || profile.wallet.balance < bet}
          >
            Defier
          </button>
          <button
            type="button"
            className="casino-ghost-button casino-ghost-button--danger"
            onClick={onHit}
            disabled={stage !== "player-turn" || working || !canHit}
          >
            Tirer
          </button>
          <button
            type="button"
            className="casino-ghost-button casino-ghost-button--steady"
            onClick={onStand}
            disabled={stage !== "player-turn" || working || !canStand}
          >
            Rester
          </button>
          <button
            type="button"
            className="casino-ghost-button"
            onClick={onDouble}
            disabled={stage !== "player-turn" || working || !canDouble}
          >
            Doubler
          </button>
          <button
            type="button"
            className="casino-ghost-button"
            onClick={onSplit}
            disabled={stage !== "player-turn" || working || !canSplit}
          >
            Split
          </button>
        </div>

        <div className="casino-command-dock__betline">
          <div className="casino-chip-stack-picker" aria-label="Jetons de mise blackjack">
            {PLAYER_BETS.map((preset) => (
              <button
                key={preset}
                type="button"
                className={`casino-stack-chip casino-stack-chip--picker casino-stack-chip--${CHIP_TONES[preset]} ${(selectedCounts[preset] || 0) > 0 ? "is-active" : ""}`}
                onClick={() => onBetChipAdd(preset)}
                disabled={stage === "player-turn" || working || bet + preset > profile.wallet.balance}
                aria-label={`Ajouter un jeton de ${preset}`}
              >
                <strong>{preset}</strong>
                <span>x{selectedCounts[preset] || 0}</span>
              </button>
            ))}
          </div>
          <div className="casino-command-dock__betline-meta">
            <span>Total {bet}</span>
            <span>{betChips.length || 0} jeton{betChips.length > 1 ? "s" : ""}</span>
          </div>
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
                <p>Doubler se joue sur une main de 2 cartes: tu doubles la mise, prends une seule carte, puis ta main reste.</p>
                <p>Split se joue sur une paire de meme rang: la paire devient deux mains separees si ton solde couvre la deuxieme mise.</p>
                <p>La mise et le paiement passent par le wallet A11, pas par des jetons locaux.</p>
                <p>Le dock ouvre Doubler et Split seulement quand la main active suit les regles et que ton solde peut couvrir la mise supplementaire.</p>
                <p>Le salon se cale seul en solo si tu es seul, puis passe en multijoueur si quelqu'un rejoint la table.</p>
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
