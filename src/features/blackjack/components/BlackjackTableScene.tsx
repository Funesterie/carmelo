import PiratePlayingCardView from "../../../PiratePlayingCard";
import { formatCredits } from "../../../lib/casinoRoomState";
import type { BlackjackState } from "../../../lib/casinoApi";

const CHIP_TONES: Record<number, "amber" | "cyan" | "crimson" | "ivory"> = {
  10: "amber",
  20: "cyan",
  50: "crimson",
  200: "ivory",
};

type BlackjackTableSceneProps = {
  state: BlackjackState | null;
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

function getRenderableHands(state: BlackjackState | null) {
  if (!state) return [];

  if (state.playerHands?.length) {
    const activeIndex = Math.max(0, Math.min(state.playerHands.length - 1, state.activeHandIndex || 0));
    return state.playerHands.map((hand, index) => ({
      id: hand.id || `hand-${index}`,
      cards: hand.cards || [],
      wager: hand.wager || state.wager,
      score: hand.score || state.playerScore,
      result: hand.result || "",
      lastDelta: hand.lastDelta ?? 0,
      isActive: hand.isActive ?? index === activeIndex,
    }));
  }

  return [
    {
      id: "hand-0",
      cards: state.playerCards,
      wager: state.wager,
      score: state.playerScore,
      result: "",
      lastDelta: state.lastDelta || 0,
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

export default function BlackjackTableScene({
  state,
  playerName,
  bet,
  betChips,
  betLocked,
  isDecisionPhase,
  dealtCardDelays,
  resultFlash,
  onBetChipRemove,
}: BlackjackTableSceneProps) {
  const hands = getRenderableHands(state);
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

        <article className={`casino-oval-seat casino-oval-seat--player casino-oval-seat--blackjack-player ${isDecisionPhase ? "is-focus" : ""}`}>
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
        </article>
      </div>
    </div>
  );
}
