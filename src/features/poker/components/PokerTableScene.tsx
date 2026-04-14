import PiratePlayingCardView from "../../../PiratePlayingCard";
import jetonImg from "../../../images/jeton.png";
import { formatCredits } from "../../../lib/casinoRoomState";
import type { CasinoTableRoomParticipant, PokerPendingSeat, PokerSeat, PokerState } from "../../../lib/casinoApi";

const POKER_SEAT_LAYOUT = [
  { x: "18%", y: "68%", align: "start", tag: "BG" },
  { x: "19%", y: "28%", align: "start", tag: "HG" },
  { x: "50%", y: "15%", align: "center", tag: "HC" },
  { x: "81%", y: "28%", align: "end", tag: "HD" },
  { x: "82%", y: "68%", align: "end", tag: "BD" },
] as const;
const DEFAULT_ABSENT_SEAT_TIMEOUT_MS = 75_000;

function getPokerSeatLayout(count: number) {
  if (count <= 1) {
    return [{ x: "50%", y: "19%", align: "center", tag: "P1" }] as const;
  }

  if (count === 2) {
    return [
      { x: "28%", y: "26%", align: "start", tag: "P1" },
      { x: "72%", y: "26%", align: "end", tag: "P2" },
    ] as const;
  }

  if (count === 3) {
    return [
      { x: "20%", y: "34%", align: "start", tag: "P1" },
      { x: "50%", y: "18%", align: "center", tag: "P2" },
      { x: "80%", y: "34%", align: "end", tag: "P3" },
    ] as const;
  }

  if (count === 4) {
    return [
      { x: "18%", y: "62%", align: "start", tag: "P1" },
      { x: "24%", y: "24%", align: "start", tag: "P2" },
      { x: "76%", y: "24%", align: "end", tag: "P3" },
      { x: "82%", y: "62%", align: "end", tag: "P4" },
    ] as const;
  }

  return POKER_SEAT_LAYOUT;
}

function isSeatAbsent(updatedAt: string | null, presenceWindowMs: number, forcedAbsent = false) {
  if (forcedAbsent) return true;
  if (!updatedAt) return false;
  const heartbeatAt = Date.parse(updatedAt);
  if (Number.isNaN(heartbeatAt)) return false;
  return Date.now() - heartbeatAt > Math.max(10_000, Number(presenceWindowMs) || DEFAULT_ABSENT_SEAT_TIMEOUT_MS);
}

function normalizeSeatIdentity(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase();
}

function formatPokerActionLabel(action: string | null | undefined) {
  const normalized = normalizeSeatIdentity(action);
  if (!normalized) return "";

  const labels: Record<string, string> = {
    attend: "Attend",
    check: "Check",
    call: "Call",
    bet: "Bet",
    raise: "Raise",
    fold: "Fold",
  };

  return labels[normalized] || normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function findParticipantSeat(
  participant: CasinoTableRoomParticipant & { isSelf: boolean },
  seats: PokerSeat[],
) {
  const participantId = normalizeSeatIdentity(participant.userId);
  const participantName = normalizeSeatIdentity(participant.username);

  return (
    seats.find((seat) => {
      const seatId = normalizeSeatIdentity(seat.id || seat.userId);
      const seatUserId = normalizeSeatIdentity(seat.userId);
      const seatName = normalizeSeatIdentity(seat.name || seat.username);
      return (
        Boolean(participantId && (seatId === participantId || seatUserId === participantId))
        || Boolean(participantName && seatName === participantName)
        || Boolean(participantName && seatId === participantName)
      );
    }) || null
  );
}

function findPendingSeat(
  participant: CasinoTableRoomParticipant & { isSelf: boolean },
  pendingSeats: PokerPendingSeat[],
) {
  const participantId = normalizeSeatIdentity(participant.userId);
  const participantName = normalizeSeatIdentity(participant.username);

  return (
    pendingSeats.find((seat) => {
      const seatUserId = normalizeSeatIdentity(seat.userId);
      const seatName = normalizeSeatIdentity(seat.username);
      return (
        Boolean(participantId && seatUserId === participantId)
        || Boolean(participantName && seatName === participantName)
      );
    }) || null
  );
}

function getParticipantStatus(
  participantLabel: string,
  seat: PokerSeat | null,
  stage: "idle" | PokerState["stage"],
  pending: boolean,
  absent: boolean,
  folded: boolean,
) {
  if (pending) return "Inscrit prochaine main";
  if (absent) return "Absent";
  if (seat?.isActive) return "Tour actif";
  if (folded) return "Fold";
  if (seat?.hand?.label) return seat.hand.label;
  if (seat?.read) return seat.read;
  if (seat?.lastAction) return formatPokerActionLabel(seat.lastAction);
  if (stage === "showdown") return "Showdown";
  return `${participantLabel} en jeu`;
}

function findPokerSelfSeat(
  state: PokerState | null,
  currentUserId: string,
  playerName: string,
) {
  const normalizedSelfSeatId = normalizeSeatIdentity(state?.selfSeatId);
  const normalizedCurrentUserId = normalizeSeatIdentity(currentUserId);
  const normalizedPlayerName = normalizeSeatIdentity(playerName);
  const candidates = [...(state?.seats || []), ...(state?.aiSeats || [])];

  return (
    candidates.find((seat) => {
      const seatId = normalizeSeatIdentity(seat.id);
      const seatUserId = normalizeSeatIdentity(seat.userId);
      const seatName = normalizeSeatIdentity(seat.name || seat.username);
      return Boolean(
        seat.isSelf
        || (normalizedSelfSeatId && seatId === normalizedSelfSeatId)
        || (normalizedCurrentUserId && (seatId === normalizedCurrentUserId || seatUserId === normalizedCurrentUserId))
        || (normalizedPlayerName && seatName === normalizedPlayerName),
      );
    }) || null
  );
}

function getRemotePokerBindings(
  state: PokerState | null,
  participants: Array<CasinoTableRoomParticipant & { isSelf: boolean }>,
  currentUserId: string,
  playerName: string,
  presenceWindowMs: number,
) {
  const selfSeat = findPokerSelfSeat(state, currentUserId, playerName);
  const normalizedSelfSeatId = normalizeSeatIdentity(selfSeat?.id || selfSeat?.userId);
  const normalizedSelfSeatName = normalizeSeatIdentity(selfSeat?.name || selfSeat?.username);
  const seenSeats = new Set<string>();
  const seats = [...(state?.seats || []), ...(state?.aiSeats || [])].filter((seat) => {
    const dedupeKey = normalizeSeatIdentity(seat.id || seat.userId || seat.name || seat.username);
    if (dedupeKey && seenSeats.has(dedupeKey)) {
      return false;
    }
    if (dedupeKey) {
      seenSeats.add(dedupeKey);
    }

    const seatId = normalizeSeatIdentity(seat.id || seat.userId);
    const seatUserId = normalizeSeatIdentity(seat.userId);
    const seatName = normalizeSeatIdentity(seat.name || seat.username);
    return !(
      seat.isSelf
      || (normalizedSelfSeatId && (seatId === normalizedSelfSeatId || seatUserId === normalizedSelfSeatId))
      || (normalizedSelfSeatName && seatName === normalizedSelfSeatName)
    );
  });
  const normalizedCurrentUserId = normalizeSeatIdentity(currentUserId);
  const normalizedPlayerName = normalizeSeatIdentity(playerName);
  const pendingSeats = state?.pendingSeats || [];
  const remoteParticipants = participants.filter((participant) => {
    const participantId = normalizeSeatIdentity(participant.userId);
    const participantName = normalizeSeatIdentity(participant.username);
    return !participant.isSelf && participantId !== normalizedCurrentUserId && participantName !== normalizedPlayerName;
  });

  const participantBindings = remoteParticipants.map((participant) => {
    const seat = findParticipantSeat(participant, seats);
    const pendingSeat = findPendingSeat(participant, pendingSeats);
    if (seat) {
      const usedIndex = seats.findIndex((entry) => entry === seat);
      if (usedIndex >= 0) {
        seats.splice(usedIndex, 1);
      }
    }
    const absent = Boolean(seat?.isAbsent) || isSeatAbsent(participant?.updatedAt || null, presenceWindowMs);
    return {
      key: participant.userId || participant.username,
      label: participant.username,
      participant,
      seat,
      pendingSeat,
      waiting: !seat && Boolean(pendingSeat),
      absent,
    };
  });

  const orphanSeats = seats.map((seat) => ({
    key: seat.id || seat.userId || seat.name || seat.username,
    label: seat.name || seat.username || "Joueur",
    participant: null,
    seat,
    pendingSeat: null,
    waiting: false,
    absent: Boolean(seat.isAbsent),
  }));

  return [...participantBindings, ...orphanSeats]
    .filter(({ seat, pendingSeat, absent }) => Boolean(seat || pendingSeat || absent))
    .sort((left, right) => {
      const leftPosition = typeof left.seat?.position === "number" ? left.seat.position : Number.MAX_SAFE_INTEGER;
      const rightPosition = typeof right.seat?.position === "number" ? right.seat.position : Number.MAX_SAFE_INTEGER;
      if (leftPosition !== rightPosition) {
        return leftPosition - rightPosition;
      }
      return String(left.label || "").localeCompare(String(right.label || ""));
    })
    .slice(0, POKER_SEAT_LAYOUT.length);
}

type PokerTableSceneProps = {
  state: PokerState | null;
  stage: "idle" | PokerState["stage"];
  currentUserId: string;
  playerName: string;
  isSpectatingRound: boolean;
  queuedForNextHand: boolean;
  participants: Array<CasinoTableRoomParticipant & { isSelf: boolean }>;
  activeAnte: number;
  smallBlind: number;
  heroCommitted: number;
  potTotal: number;
  isDecisionPhase: boolean;
  dealtCardDelays: Record<string, number>;
  presenceWindowMs: number;
  removingAbsentUserId: string | null;
  lastHandRecap: {
    message: string;
    winners: Array<{
      id: string;
      name: string;
      handLabel: string;
      amount: number;
      isSelf: boolean;
    }>;
    heroHandLabel: string;
  } | null;
  onRemoveAbsent: (userId: string) => void;
};

export default function PokerTableScene({
  state,
  stage,
  currentUserId,
  playerName,
  isSpectatingRound,
  queuedForNextHand,
  participants,
  activeAnte,
  smallBlind,
  heroCommitted,
  potTotal,
  isDecisionPhase,
  dealtCardDelays,
  presenceWindowMs,
  removingAbsentUserId,
  lastHandRecap,
  onRemoveAbsent,
}: PokerTableSceneProps) {
  void activeAnte;
  void smallBlind;
  const selfSeat = findPokerSelfSeat(state, currentUserId, playerName);
  const communityCards = stage === "waiting" ? [] : state?.communityCards || [];
  const remoteBindings = getRemotePokerBindings(state, participants, currentUserId, playerName, presenceWindowMs);
  const remoteSeatLayout = getPokerSeatLayout(remoteBindings.length);
  const heroCards = state?.playerCards?.length ? state.playerCards : selfSeat?.cards || [];
  const heroAbsent = Boolean(state?.playerFolded || selfSeat?.folded);
  const heroName = String(playerName || "Toi").trim();
  const showHeroSeat = (!isSpectatingRound || Boolean(selfSeat) || Boolean(heroCards.length)) && !queuedForNextHand;
  const displayedPotTotal = stage === "waiting" ? 0 : potTotal;
  const heroWon = Boolean(selfSeat?.isWinner || state?.lastDelta > 0 || state?.payoutAmount > 0);
  const heroStatus =
    state?.playerFolded
      ? "Main couchee"
      : state?.playerHand?.label || selfSeat?.hand?.label || (stage === "showdown"
        ? "Showdown"
        : stage === "waiting"
          ? "En attente"
          : "Decision ouverte");
  const heroStake = state?.playerCommitted || selfSeat?.totalCommitted || heroCommitted;
  const showdownWinnersLabel = lastHandRecap?.winners.length
    ? lastHandRecap.winners.map((winner) => winner.name).join(", ")
    : "";

  return (
    <>
      <div className={`casino-card-felt casino-card-felt--poker casino-card-felt--table ${isDecisionPhase ? "is-decision-phase" : ""}`}>
        <div className={`casino-felt-table casino-felt-table--poker ${isDecisionPhase ? "is-decision-phase" : ""}`}>
          <div className="casino-felt-table__halo" />

          {remoteBindings.map(({ key, label, participant, seat, pendingSeat, absent }, index) => {
            const layout = remoteSeatLayout[index] || POKER_SEAT_LAYOUT[Math.min(index, POKER_SEAT_LAYOUT.length - 1)];
            const pending = Boolean(pendingSeat && !seat);
            const folded = Boolean(seat?.folded);
            const seatCards = seat?.cards || [];
            const revealSeatCards = stage === "showdown" && seatCards.length > 0;
            const seatLabel = seat?.name || seat?.username || label || "Joueur";
            const seatStatus = getParticipantStatus(seatLabel, seat, stage, pending, absent, folded);
            const targetUserId = String(seat?.userId || participant?.userId || pendingSeat?.userId || "").trim();
            const isRemovingAbsent = Boolean(removingAbsentUserId && normalizeSeatIdentity(removingAbsentUserId) === normalizeSeatIdentity(targetUserId));
            const isSelfSeat = normalizeSeatIdentity(targetUserId) === normalizeSeatIdentity(currentUserId);
            const canRemoveAbsent = Boolean(absent && targetUserId);
            return (
              <article
                key={key}
                className={`casino-oval-seat casino-oval-seat--poker-peer casino-oval-seat--${layout.align} ${folded ? "is-folded" : ""} ${seat?.isWinner ? "is-winner" : ""} ${seat?.isActive ? "is-active" : ""}`}
                style={{
                  ["--seat-x" as string]: layout.x,
                  ["--seat-y" as string]: layout.y,
                }}
              >
                <span className="casino-oval-seat__tag">{layout.tag}</span>
                <header>
                  <strong>{seatLabel}</strong>
                  <span>{absent ? "Absent" : pending ? "Inscrit" : seat?.isActive ? "Tour actif" : "Connecte"}</span>
                </header>
                <div className="casino-seat-role-row" aria-label={`Roles de ${seatLabel}`}>
                  {seat?.lastAction && !seat.isActive ? (
                    <span className="casino-seat-role-chip casino-seat-role-chip--action">{formatPokerActionLabel(seat.lastAction)}</span>
                  ) : null}
                  {pending ? (
                    <span className="casino-seat-role-chip casino-seat-role-chip--action">
                      Inscrit {formatCredits(pendingSeat?.ante || 0)}
                    </span>
                  ) : null}
                  {typeof seat?.totalCommitted === "number" && seat.totalCommitted > 0 ? (
                    <span className="casino-seat-role-chip casino-seat-role-chip--stake">
                      {formatCredits(seat.totalCommitted)}
                    </span>
                  ) : null}
                  {seat?.isActive ? <span className="casino-seat-role-chip casino-seat-role-chip--action">A jouer</span> : null}
                  {seat?.isWinner ? <span className="casino-seat-role-chip casino-seat-role-chip--winner">Gagnant</span> : null}
                  {folded ? <span className="casino-seat-role-chip casino-seat-role-chip--absent">Fold</span> : null}
                  {absent && !folded ? <span className="casino-seat-role-chip casino-seat-role-chip--absent">Absent</span> : null}
                  {canRemoveAbsent ? (
                    <button
                      type="button"
                      className="casino-seat-role-chip casino-seat-role-chip--absent casino-seat-role-chip--clickable"
                      onClick={() => onRemoveAbsent(targetUserId)}
                      disabled={isRemovingAbsent}
                    >
                      {isRemovingAbsent ? "Retour..." : isSelfSeat ? "Revenir" : "Retirer"}
                    </button>
                  ) : null}
                </div>
                <div className="casino-card-row casino-card-row--player casino-card-row--fan casino-card-row--fan-peer">
                  {seatCards.length ? (
                    seatCards.map((card, cardIndex) => (
                      <PiratePlayingCardView
                        key={`${seat?.id || key}-${card.id}-${cardIndex}`}
                        card={card}
                        hidden={!revealSeatCards}
                        dealt={Boolean(dealtCardDelays[`${seat?.id || key}-${card.id}-${cardIndex}`] !== undefined)}
                        dealDelayMs={dealtCardDelays[`${seat?.id || key}-${card.id}-${cardIndex}`] || 0}
                      />
                    ))
                  ) : pending ? (
                    <div className="casino-empty-seat casino-empty-seat--poker-peer">Inscrit pour la prochaine main.</div>
                  ) : absent ? (
                    <div className="casino-empty-seat casino-empty-seat--poker-peer">Presence a nettoyer.</div>
                  ) : (
                    Array.from({ length: 2 }, (_, cardBackIndex) => (
                      <div key={`${key}-back-${cardBackIndex}`} className="casino-poker-card-back" aria-hidden="true">
                        <span>☠</span>
                      </div>
                    ))
                  )}
                </div>
                <small>{seatStatus}</small>
              </article>
            );
          })}

          <section className={`casino-table-core casino-table-core--poker ${isDecisionPhase ? "is-focus" : ""}`}>
            <div className="casino-table-core__headline">
              <strong>{stage === "idle" ? "Table au repos" : state?.stageLabel || (stage === "waiting" ? "En attente d'un joueur" : "Street en cours")}</strong>
              <span className="casino-token-inline"><img src={jetonImg} alt="" />Pot {formatCredits(displayedPotTotal)}</span>
            </div>
            {stage === "showdown" && lastHandRecap ? (
              <div className="casino-poker-showdown-banner" aria-live="polite">
                <strong>{showdownWinnersLabel ? `Gagnant${lastHandRecap.winners.length > 1 ? "s" : ""}: ${showdownWinnersLabel}` : "Showdown"}</strong>
                <span>{lastHandRecap.message}</span>
              </div>
            ) : null}
            <div className="casino-poker-board">
              {Array.from({ length: 5 }, (_, index) => {
                const card = communityCards[index] || null;
                const cardKey = card ? `community-${card.id}-${index}` : `community-slot-${index}`;
                return card ? (
                  <PiratePlayingCardView
                    key={cardKey}
                    card={card}
                    dealt={Boolean(dealtCardDelays[cardKey] !== undefined)}
                    dealDelayMs={dealtCardDelays[cardKey] || 0}
                  />
                ) : (
                  <div key={cardKey} className="pirate-card pirate-card--ghost" aria-hidden="true">
                    <span>{index + 1}</span>
                  </div>
                );
              })}
            </div>
            <div className="casino-table-core__footer">
              <span className="casino-table-stat-pill">
                <small>Pot total</small>
                <strong>{formatCredits(displayedPotTotal)}</strong>
              </span>
            </div>
          </section>

          {showHeroSeat ? (
            <article className={`casino-oval-seat casino-oval-seat--player ${heroAbsent ? "is-folded" : ""} ${isDecisionPhase ? "is-focus" : ""}`}>
              <div className="casino-card-seat__meta">
                <strong>{heroName}</strong>
                <span>{heroStatus}</span>
              </div>
              <div className="casino-card-row casino-card-row--player casino-card-row--fan casino-card-row--fan-player">
                {heroCards.length ? (
                  heroCards.map((card, index) => {
                    const cardKey = `poker-player-${card.id}-${index}`;
                    return (
                      <PiratePlayingCardView
                        key={cardKey}
                        card={card}
                        emphasis="strong"
                        dealt={Boolean(dealtCardDelays[cardKey] !== undefined)}
                        dealDelayMs={dealtCardDelays[cardKey] || 0}
                      />
                    );
                  })
                ) : (
                  <div className="casino-empty-seat">Le joueur n'a pas encore touche ses cartes.</div>
                )}
              </div>
              <div className="casino-seat-role-row casino-seat-role-row--player casino-seat-role-row--stats" aria-label={`Mise de ${heroName}`}>
                <span className="casino-seat-role-chip casino-seat-role-chip--stake">
                  Mise {formatCredits(heroStake)}
                </span>
                {heroWon ? <span className="casino-seat-role-chip casino-seat-role-chip--winner">Gagnant</span> : null}
                {heroAbsent ? <span className="casino-seat-role-chip casino-seat-role-chip--absent">Fold</span> : null}
              </div>
            </article>
          ) : null}
        </div>
      </div>
    </>
  );
}
