import PiratePlayingCardView from "../../../PiratePlayingCard";
import { formatCredits } from "../../../lib/casinoRoomState";
import type { BlackjackSeat, BlackjackState, CasinoTableRoomParticipant } from "../../../lib/casinoApi";

const CHIP_TONES: Record<number, "amber" | "cyan" | "crimson" | "ivory"> = {
  10: "amber",
  20: "cyan",
  50: "crimson",
  200: "ivory",
};

type BlackjackTableSceneProps = {
  state: BlackjackState | null;
  participants: CasinoTableRoomParticipant[];
  currentUserId: string;
  playerName: string;
  bet: number;
  betChips: number[];
  betLocked: boolean;
  isDecisionPhase: boolean;
  dealtCardDelays: Record<string, number>;
  resultFlash: { label: string; detail?: string; tone: "win" | "lose" } | null;
  onBetChipRemove: () => void;
};

function buildChipStackValues(total: number) {
  const normalizedTotal = Math.max(0, Math.round(total));
  if (!normalizedTotal) return [];

  const values: number[] = [];
  let remaining = normalizedTotal;
  [200, 50, 20, 10].forEach((chipValue) => {
    while (remaining >= chipValue) {
      values.push(chipValue);
      remaining -= chipValue;
    }
  });

  if (remaining > 0) {
    values.push(remaining);
  }

  return values;
}

function sumChipValues(chips: number[]) {
  return chips.reduce((total, chip) => total + chip, 0);
}

function resolveBlackjackScore(
  primary: BlackjackState["playerScore"] | BlackjackSeat["score"] | undefined,
  fallback: BlackjackSeat["score"] | undefined,
  cardCount: number,
) {
  if (primary && (cardCount === 0 || primary.total > 0 || primary.isBlackjack || primary.isBust)) {
    return primary;
  }

  return fallback || primary || {
    total: 0,
    isSoft: false,
    isBlackjack: false,
    isBust: false,
  };
}

function findBlackjackSelfSeat(
  state: BlackjackState | null,
  currentUserId: string,
  playerName: string,
) {
  const normalizedSelfSeatId = normalizeBlackjackIdentity(state?.selfSeatId);
  const normalizedCurrentUserId = normalizeBlackjackIdentity(currentUserId);
  const normalizedPlayerName = normalizeBlackjackIdentity(playerName);
  const candidates = [...(state?.seats || []), ...(state?.aiSeats || [])];

  const explicitSeat = candidates.find((seat) => {
      const seatId = normalizeBlackjackIdentity(seat.id);
      const seatUserId = normalizeBlackjackIdentity(seat.userId);
      const seatName = normalizeBlackjackIdentity(seat.name || seat.username);
      return Boolean(
        seat.isSelf
        || (normalizedSelfSeatId && seatId === normalizedSelfSeatId)
        || (normalizedCurrentUserId && (seatId === normalizedCurrentUserId || seatUserId === normalizedCurrentUserId))
        || (normalizedPlayerName && seatName === normalizedPlayerName),
      );
    }) || null;

  if (explicitSeat) return explicitSeat;

  const playerAlreadyHasCards = Boolean(
    state?.playerCards.length
    || state?.playerHands?.some((hand) => Boolean(hand.cards?.length)),
  );
  if (playerAlreadyHasCards) return null;

  const normalizedActiveSeatId = normalizeBlackjackIdentity(state?.activeSeatId);
  const activeSeat =
    candidates.find((seat) => {
      const seatId = normalizeBlackjackIdentity(seat.id);
      return Boolean(
        (normalizedActiveSeatId && seatId === normalizedActiveSeatId)
        || seat.isActive,
      );
    }) || null;

  if (activeSeat?.cards?.length) {
    return activeSeat;
  }

  const seatsWithCards = candidates.filter((seat) => seat.cards?.length);
  return seatsWithCards.length === 1 ? seatsWithCards[0] : null;
}

function getRenderableHands(state: BlackjackState | null, selfSeat: BlackjackSeat | null) {
  if (!state) return [];

  const fallbackCards = state.playerCards.length ? state.playerCards : selfSeat?.cards || [];
  const fallbackScore = resolveBlackjackScore(state.playerScore, selfSeat?.score, fallbackCards.length);
  const fallbackWager = state.wager || selfSeat?.wager || 0;
  const fallbackDelta = state.lastDelta || selfSeat?.lastDelta || 0;

  if (state.playerHands?.length) {
    const activeIndex = Math.max(0, Math.min(state.playerHands.length - 1, state.activeHandIndex || 0));
    return state.playerHands.map((hand, index) => ({
      id: hand.id || `hand-${index}`,
      cards: hand.cards?.length ? hand.cards : fallbackCards,
      wager: hand.wager || fallbackWager,
      score: resolveBlackjackScore(hand.score, selfSeat?.score, hand.cards?.length || 0),
      result: hand.result || "",
      lastDelta: hand.lastDelta ?? fallbackDelta,
      isActive: hand.isActive ?? index === activeIndex,
    }));
  }

  return [
    {
      id: "hand-0",
      cards: fallbackCards,
      wager: fallbackWager,
      score: fallbackScore,
      result: "",
      lastDelta: fallbackDelta,
      isActive: true,
    },
  ];
}

function getOutcomeTone(result: string, delta: number) {
  if (delta > 0) return "win" as const;
  if (delta < 0) return "lose" as const;

  const normalized = result.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.includes("win") || normalized.includes("gain") || normalized.includes("blackjack")) return "win" as const;
  if (normalized.includes("lose") || normalized.includes("bust") || normalized.includes("perd")) return "lose" as const;
  return null;
}

const BLACKJACK_REMOTE_LAYOUT = [
  { x: "15%", y: "55%", align: "start", tag: "P1" },
  { x: "85%", y: "55%", align: "end", tag: "P2" },
] as const;

function getBlackjackSeatLayout() {
  return BLACKJACK_REMOTE_LAYOUT;
}

function normalizeBlackjackIdentity(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase();
}

function findBlackjackSeat(
  participant: CasinoTableRoomParticipant,
  seats: BlackjackSeat[],
) {
  const participantId = normalizeBlackjackIdentity(participant.userId);
  const participantName = normalizeBlackjackIdentity(participant.username);

  return (
    seats.find((seat) => {
      const seatId = normalizeBlackjackIdentity(seat.id || seat.userId);
      const seatUserId = normalizeBlackjackIdentity(seat.userId);
      const seatName = normalizeBlackjackIdentity(seat.name || seat.username);
      return (
        Boolean(participantId && (seatId === participantId || seatUserId === participantId))
        || Boolean(participantName && seatName === participantName)
      );
    }) || null
  );
}

function getRemoteBlackjackBindings(
  state: BlackjackState | null,
  participants: CasinoTableRoomParticipant[],
  currentUserId: string,
  playerName: string,
) {
  const selfSeat = findBlackjackSelfSeat(state, currentUserId, playerName);
  const normalizedSelfSeatId = normalizeBlackjackIdentity(selfSeat?.id || selfSeat?.userId);
  const normalizedSelfSeatName = normalizeBlackjackIdentity(selfSeat?.name || selfSeat?.username);
  const seats = [...(state?.aiSeats || [])].filter((seat) => {
    const seatId = normalizeBlackjackIdentity(seat.id || seat.userId);
    const seatName = normalizeBlackjackIdentity(seat.name || seat.username);
    return !(
      seat.isSelf
      || (normalizedSelfSeatId && seatId === normalizedSelfSeatId)
      || (normalizedSelfSeatName && seatName === normalizedSelfSeatName)
    );
  });
  const normalizedCurrentUserId = normalizeBlackjackIdentity(currentUserId);
  const normalizedPlayerName = normalizeBlackjackIdentity(playerName);
  const remoteParticipants = participants.filter(
    (participant) => {
      const participantId = normalizeBlackjackIdentity(participant.userId);
      const participantName = normalizeBlackjackIdentity(participant.username);
      return participantId !== normalizedCurrentUserId && participantName !== normalizedPlayerName;
    },
  );

  const participantBindings = remoteParticipants.map((participant) => {
    const seat = findBlackjackSeat(participant, seats);
    if (seat) {
      const usedIndex = seats.findIndex((entry) => entry === seat);
      if (usedIndex >= 0) {
        seats.splice(usedIndex, 1);
      }
    }
    return {
      key: participant.userId,
      label: participant.username,
      participant,
      seat,
      waiting: !seat,
    };
  });

  const orphanSeats = seats.map((seat) => ({
    key: seat.id || seat.userId || seat.name,
    label: seat.name || seat.username || "Joueur",
    participant: null,
    seat,
    waiting: false,
  }));

  const bindings = [...participantBindings, ...orphanSeats].slice(0, BLACKJACK_REMOTE_LAYOUT.length);

  while (bindings.length < BLACKJACK_REMOTE_LAYOUT.length) {
    const slotNumber = bindings.length + 1;
    bindings.push({
      key: `blackjack-empty-${slotNumber}`,
      label: `Place ${slotNumber}`,
      participant: null,
      seat: null,
      waiting: true,
    });
  }

  return bindings;
}

export default function BlackjackTableScene({
  state,
  participants,
  currentUserId,
  playerName,
  bet,
  betChips,
  betLocked,
  isDecisionPhase,
  dealtCardDelays,
  resultFlash,
  onBetChipRemove,
}: BlackjackTableSceneProps) {
  void bet;
  const selfSeat = findBlackjackSelfSeat(state, currentUserId, playerName);
  const hands = getRenderableHands(state, selfSeat);
  const remoteBindings = getRemoteBlackjackBindings(state, participants, currentUserId, playerName);
  const remoteSeatLayout = getBlackjackSeatLayout();
  const selectedChipTotal = sumChipValues(betChips);
  const lockedWager = hands.reduce((sum, hand) => sum + (hand.wager || 0), 0) || state?.wager || 0;
  const totalWager = betLocked ? lockedWager || selectedChipTotal : selectedChipTotal;
  const displayedBetChips = !betLocked
    ? betChips
    : betChips.length && selectedChipTotal === totalWager
      ? betChips
      : buildChipStackValues(totalWager);
  const playerDelta = state?.lastDelta || 0;
  const playerOutcome =
    state?.stage === "resolved"
      ? resultFlash || (
          playerDelta > 0
            ? { label: "WIN", detail: `+${formatCredits(playerDelta)}`, tone: "win" as const }
            : playerDelta < 0
              ? { label: "LOSE", detail: `-${formatCredits(Math.abs(playerDelta))}`, tone: "lose" as const }
              : null
        )
      : null;
  const playerSeatName = String(playerName || "Toi").trim();

  return (
    <div className={`casino-card-felt casino-card-felt--blackjack casino-card-felt--table ${isDecisionPhase ? "is-decision-phase" : ""}`}>
      <div className={`casino-felt-table casino-felt-table--blackjack ${isDecisionPhase ? "is-decision-phase" : ""}`}>
        <div className="casino-blackjack-dealer-layer">
          <section className="casino-blackjack-dealer-rail">
            <div className="casino-blackjack-player-banner casino-blackjack-player-banner--dealer" aria-label="Main du croupier">
              <strong>Croupier</strong>
              <span>{state?.dealerHidden ? "Main cachee" : `${state?.dealerScore.total || 0} points`}</span>
            </div>
            <div className="casino-card-row casino-card-row--dealer casino-card-row--fan casino-card-row--fan-dealer">
              {(state?.dealerCards || []).length ? (
                (state?.dealerCards || []).map((card, index) => (
                  <PiratePlayingCardView
                    key={`dealer-${card.id}-${index}`}
                    card={card}
                    hidden={Boolean(state?.dealerHidden && index === 1)}
                    dealt={Boolean(dealtCardDelays[`dealer-${card.id}-${index}`] !== undefined)}
                    dealDelayMs={dealtCardDelays[`dealer-${card.id}-${index}`] || 0}
                  />
                ))
              ) : null}
            </div>
          </section>
        </div>

        {remoteBindings.map(({ key, label, seat, waiting }, index) => {
          const layout = remoteSeatLayout[index] || BLACKJACK_REMOTE_LAYOUT[Math.min(index, BLACKJACK_REMOTE_LAYOUT.length - 1)];
          const seatCards = seat?.cards || [];
          const seatName = seat?.name || seat?.username || label;
          const seatStatus = waiting
            ? "En attente"
            : seat?.isActive
              ? "A jouer"
              : seat?.result
                ? seat.result
                : seat?.status
                  ? seat.status
                  : seat?.score
                    ? `${seat.score.total || 0} points`
                    : "En jeu";

          return (
            <article
              key={key}
              className={`casino-oval-seat casino-oval-seat--blackjack-peer casino-oval-seat--${layout.align} ${seat?.isActive ? "is-active" : ""}`}
              style={{
                ["--seat-x" as string]: layout.x,
                ["--seat-y" as string]: layout.y,
              }}
            >
              <span className="casino-oval-seat__tag">{layout.tag}</span>
              <header>
                <strong>{seatName}</strong>
                <span>{waiting ? "Connecte" : seat?.isActive ? "Tour actif" : "Table"}</span>
              </header>
              <div className="casino-seat-role-row" aria-label={`Informations de ${seatName}`}>
                {typeof seat?.wager === "number" && seat.wager > 0 ? (
                  <span className="casino-seat-role-chip casino-seat-role-chip--stake">
                    {formatCredits(seat.wager)}
                  </span>
                ) : null}
                {seat?.isActive ? <span className="casino-seat-role-chip casino-seat-role-chip--action">A jouer</span> : null}
              </div>
              <div className="casino-card-row casino-card-row--player casino-card-row--fan casino-card-row--fan-peer">
                {seatCards.length ? (
                  seatCards.map((card, cardIndex) => (
                    <PiratePlayingCardView
                      key={`${seat?.id || key}-${card.id}-${cardIndex}`}
                      card={card}
                      dealt={Boolean(dealtCardDelays[`${seat?.id || key}-${card.id}-${cardIndex}`] !== undefined)}
                      dealDelayMs={dealtCardDelays[`${seat?.id || key}-${card.id}-${cardIndex}`] || 0}
                    />
                  ))
                ) : (
                  <div className="casino-empty-seat casino-empty-seat--blackjack-peer">
                    <strong>{waiting ? "Pret a rejoindre" : "Main vide"}</strong>
                    <span>{waiting ? "La table attend la prochaine donne." : "Les cartes apparaitront des que la donne commencera."}</span>
                  </div>
                )}
              </div>
              <small>{seatStatus}</small>
            </article>
          );
        })}

        <div className="casino-blackjack-player-layer">
          <article className={`casino-oval-seat casino-oval-seat--player casino-oval-seat--blackjack-player ${isDecisionPhase ? "is-focus" : ""}`}>
            <div className="casino-blackjack-player-core">
              {playerOutcome ? (
                <div className={`casino-blackjack-seat-outcome casino-blackjack-seat-outcome--hero is-${playerOutcome.tone}`} aria-live="polite">
                  <strong>{playerOutcome.label}</strong>
                  {playerOutcome.detail ? <span>{playerOutcome.detail}</span> : null}
                </div>
              ) : null}

              <div className={`casino-blackjack-hand-stack ${hands.length > 1 ? "is-split" : ""}`}>
                {hands.map((hand, handIndex) => {
                  const tone = getOutcomeTone(hand.result, hand.lastDelta);
                  const handOutcome =
                    state?.stage === "resolved"
                    && (hands.length > 1 || handIndex > 0)
                    && tone
                      ? {
                          label: tone === "win" ? "WIN" : "LOSE",
                          detail:
                            hand.lastDelta > 0
                              ? `+${formatCredits(hand.lastDelta)}`
                              : hand.lastDelta < 0
                                ? `-${formatCredits(Math.abs(hand.lastDelta))}`
                                : hand.result,
                          tone,
                        }
                      : null;

                  return (
                    <section
                      key={hand.id}
                      className={`casino-blackjack-player-hand ${hand.isActive ? "is-active" : ""} ${hands.length > 1 ? "is-split-hand" : ""}`}
                    >
                      <header className="casino-blackjack-hand-meta casino-blackjack-hand-meta--player">
                        <span>{hands.length > 1 ? `Main ${handIndex + 1}` : "Joueur"}</span>
                        <strong>{hand.score.total || 0} points</strong>
                      </header>

                      <div className="casino-card-row casino-card-row--player casino-card-row--fan casino-card-row--fan-player">
                        {hand.cards.length ? (
                          hand.cards.map((card, index) => (
                            <PiratePlayingCardView
                              key={`${hand.id}-${card.id}-${index}`}
                              card={card}
                              emphasis="strong"
                              dealt={Boolean(dealtCardDelays[`player-${handIndex}-${card.id}-${index}`] !== undefined)}
                              dealDelayMs={dealtCardDelays[`player-${handIndex}-${card.id}-${index}`] || 0}
                            />
                          ))
                        ) : null}
                      </div>

                      <div className="casino-blackjack-player-banner" aria-label={`Main de ${playerSeatName}`}>
                        <strong>{hands.length > 1 ? `${playerSeatName} · Main ${handIndex + 1}` : playerSeatName}</strong>
                        <span>{hand.score.total || 0} points</span>
                      </div>

                      {handOutcome ? (
                        <div className={`casino-blackjack-seat-outcome is-${handOutcome.tone}`} aria-live="polite">
                          <strong>{handOutcome.label}</strong>
                          {handOutcome.detail ? <span>{handOutcome.detail}</span> : null}
                        </div>
                      ) : null}
                    </section>
                  );
                })}
              </div>
            </div>
          </article>

          <div className={`casino-seat-chip-stack ${betLocked ? "is-locked" : ""}`} aria-label={`Pile de mise ${formatCredits(totalWager)}`}>
            <div className="casino-seat-chip-stack__tokens">
              {displayedBetChips.map((chipValue, index) => (
                <button
                  key={`${chipValue}-${index}`}
                  type="button"
                  className={`casino-stack-chip casino-stack-chip--seat casino-stack-chip--${CHIP_TONES[chipValue] || "amber"}`}
                  style={{ ["--chip-index" as string]: String(index) }}
                  onClick={onBetChipRemove}
                  disabled={betLocked}
                  aria-label={`Retirer le dernier jeton de la mise (${chipValue})`}
                >
                  <strong>{chipValue}</strong>
                </button>
              ))}
            </div>
            <span className="casino-seat-chip-stack__total">{formatCredits(totalWager)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
