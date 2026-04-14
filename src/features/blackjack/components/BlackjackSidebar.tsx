import PirateInspector from "../../../PirateInspector";
import type { BlackjackAction, BlackjackState, CasinoProfile, CasinoTableRoom, CasinoTableRoomParticipant } from "../../../lib/casinoApi";
import { getTableChannelDisplayMeta } from "../../../lib/tableSalons";

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
  activeParticipants: CasinoTableRoomParticipant[];
  infoTab: "salons" | "regles" | "joueurs";
  isDecisionPhase: boolean;
  isBettingPhase: boolean;
  isSpectatingRound: boolean;
  hasPendingSeat: boolean;
  queuedForNextRound: boolean;
  roomSwitchLocked: boolean;
  legalActions: BlackjackAction[];
  actionsLocked: boolean;
  onBetChipAdd: (bet: number) => void;
  onInfoTabChange: (tab: "salons" | "regles" | "joueurs") => void;
  onRoomChange: (roomId: string) => void;
  onHit: () => void;
  onStand: () => void;
  onDouble: () => void;
  onSplit: () => void;
  onDeal: () => void;
};

function playerTurnLabel(state: BlackjackState | null, userId: string) {
  if (!state?.activeSeatId) return "la table";
  if (String(state.activeSeatId).trim() === String(state.selfSeatId || userId || "").trim()) {
    return "toi";
  }
  return "un joueur";
}

export default function BlackjackSidebar({
  profile,
  state,
  bet,
  betChips,
  working,
  roomId,
  rooms,
  activeParticipants,
  infoTab,
  isDecisionPhase,
  isBettingPhase,
  isSpectatingRound,
  hasPendingSeat,
  queuedForNextRound,
  roomSwitchLocked,
  legalActions,
  actionsLocked,
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
  const showBettingPhase = isBettingPhase || stage === "waiting";
  const canDeal = !hasPendingSeat && (stage !== "player-turn" || isSpectatingRound);
  const availableRooms = rooms.length
    ? rooms
    : [
        {
          id: roomId,
          playerCount: 0,
          participants: [],
          isCurrent: true,
          hasSelf: true,
        },
      ] satisfies CasinoTableRoom[];
  const activeRoom = availableRooms.find((entry) => entry.id === roomId) || availableRooms[0] || null;
  const activeSeat = state?.activeSeatId
    ? (state.seats || []).find((seat) => String(seat.id || seat.userId || "").trim() === String(state.activeSeatId || "").trim()) || null
    : null;
  const activeSeatName = activeSeat?.name || activeSeat?.username || playerTurnLabel(state, profile.user.id);
  const canHit = legalActions.includes("hit");
  const canStand = legalActions.includes("stand");
  const canDouble = legalActions.includes("double");
  const canSplit = legalActions.includes("split");
  const primaryActionLabel = queuedForNextRound
    ? "Prochaine donne reservee"
    : isSpectatingRound && stage === "player-turn"
    ? "Prochaine donne"
    : isSpectatingRound
      ? "Prochaine manche"
      : hasPendingSeat && showBettingPhase
      ? "Mise validee"
      : stage === "resolved"
        ? "Rejouer"
        : "Valider la mise";
  const selectedCounts = betChips.reduce<Record<number, number>>((accumulator, chip) => {
    accumulator[chip] = (accumulator[chip] || 0) + 1;
    return accumulator;
  }, {});

  return (
    <div className="casino-stage-sidebar">
      <div className={`casino-command-dock casino-command-dock--blackjack ${isDecisionPhase ? "is-attention" : ""}`}>
        <div className="casino-command-dock__copy">
          <span className="casino-chip">
            {isDecisionPhase ? "Decision" : showBettingPhase ? "Phase de mise" : stage === "player-turn" ? "Tour en cours" : "Table"}
          </span>
          <strong>
            {isDecisionPhase
              ? `Main a ${state?.playerScore.total || 0} points`
              : queuedForNextRound
              ? "Place reservee"
              : hasPendingSeat && showBettingPhase
                ? "Mise enregistree"
                : isSpectatingRound && stage === "player-turn"
                  ? "Rejoins la prochaine donne"
                : showBettingPhase
                  ? "Valide ta place"
                : stage === "player-turn"
                  ? `Tour de ${activeSeatName}`
                    : "Commandes de table"}
          </strong>
          <p>
            {isDecisionPhase
              ? "Concentre-toi sur ta main, la carte visible du croupier et les vraies options de blackjack ouvertes pour cette combinaison."
              : queuedForNextRound
                ? "La donne en cours se termine, puis ta mise entrera automatiquement dans la prochaine manche de cette table."
              : hasPendingSeat && showBettingPhase
                ? "Ta mise est deja posee. La table attend les autres confirmations ou la fin du timer serveur."
                : isSpectatingRound && stage === "player-turn"
                  ? "La table joue encore cette manche, mais tu peux deja poser ta mise pour prendre une place sur la suivante."
                : showBettingPhase
                  ? "Valide ta mise pour entrer dans la prochaine donne. Le timer de table garde la phase ouverte pour tous les joueurs presents."
                : stage === "player-turn"
                  ? "La table reste synchronisee pendant la main en cours, sans melanger le croupier avec les places joueurs."
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
            {primaryActionLabel}
          </button>
          <button
            type="button"
            className="casino-ghost-button casino-ghost-button--danger"
            onClick={onHit}
            disabled={stage !== "player-turn" || working || actionsLocked || !canHit}
          >
            Tirer
          </button>
          <button
            type="button"
            className="casino-ghost-button casino-ghost-button--steady"
            onClick={onStand}
            disabled={stage !== "player-turn" || working || actionsLocked || !canStand}
          >
            Rester
          </button>
          <button
            type="button"
            className="casino-ghost-button"
            onClick={onDouble}
            disabled={stage !== "player-turn" || working || actionsLocked || !canDouble}
          >
            Doubler
          </button>
          <button
            type="button"
            className="casino-ghost-button"
            onClick={onSplit}
            disabled={stage !== "player-turn" || working || actionsLocked || !canSplit}
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
                disabled={(stage === "player-turn" && !isSpectatingRound) || working || bet + preset > profile.wallet.balance}
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
            label: "Canaux",
            badge: rooms.find((entry) => entry.id === roomId)?.playerCount || 0,
            caption: "Change de canal sans perdre la lisibilite du layout.",
            content: (
              <div className="casino-salon-roster">
                {availableRooms.map((room, index) => {
                  const channelMeta = getTableChannelDisplayMeta("blackjack", room.id, index);
                  return (
                    <button
                      key={room.id}
                      type="button"
                      className={`casino-salon-card ${room.id === roomId ? "is-active" : ""} ${roomSwitchLocked ? "is-locked" : ""}`}
                      onClick={() => onRoomChange(room.id)}
                      disabled={roomSwitchLocked || working}
                      title={channelMeta.blurb}
                    >
                      <div>
                        <strong>{channelMeta.channelLabel}</strong>
                        <span>{channelMeta.title}</span>
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
                <p>La phase de mise reste ouverte 5 minutes, ou se ferme plus vite si tous les presents ont deja mise.</p>
              </div>
            ),
          },
          {
            id: "joueurs",
            label: "Joueurs",
            badge: activeParticipants.length,
            caption: "Presence du salon actif.",
            content: (
              <div className="casino-prize-stack">
                {activeParticipants.length ? (
                  activeParticipants.map((participant) => (
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
