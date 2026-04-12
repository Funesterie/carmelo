import PiratePlayingCardView from "../../../PiratePlayingCard";
import { formatCredits } from "../../../lib/casinoRoomState";
import type { BlackjackState } from "../../../lib/casinoApi";

type BlackjackTableSceneProps = {
  state: BlackjackState | null;
  playerName: string;
  bet: number;
  isDecisionPhase: boolean;
  dealtCardDelays: Record<string, number>;
  resultFlash: { label: string; detail?: string; tone: "win" | "lose" } | null;
};

export default function BlackjackTableScene({
  state,
  playerName,
  bet,
  isDecisionPhase,
  dealtCardDelays,
  resultFlash,
}: BlackjackTableSceneProps) {
  void bet;
  const visibleDealerCards = (state?.dealerCards || []).filter((_, index) => !(state?.dealerHidden && index === 1));
  const hasPlayerWin = state?.stage === "resolved" && (state?.lastDelta || 0) > 0;
  const playerSeatName = String(playerName || "Toi").trim();

  return (
    <div className={`casino-card-felt casino-card-felt--blackjack casino-card-felt--table ${isDecisionPhase ? "is-decision-phase" : ""}`}>
      <div className={`casino-felt-table casino-felt-table--blackjack ${isDecisionPhase ? "is-decision-phase" : ""}`}>
        {resultFlash ? (
          <div className={`casino-blackjack-result-flash is-${resultFlash.tone}`} aria-live="polite">
            <strong>{resultFlash.label}</strong>
            {resultFlash.detail ? <span>{resultFlash.detail}</span> : null}
          </div>
        ) : null}

        <section className="casino-blackjack-dealer-rail">
          <div className="casino-blackjack-hand-meta">
            <span>Croupier</span>
            <strong>
              {state?.dealerHidden
                ? "Main cachee"
                : `${state?.dealerScore.total || 0} points`}
            </strong>
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
          <header className="casino-blackjack-hand-meta casino-blackjack-hand-meta--player">
            <span>Joueur</span>
            <strong>{state?.playerScore.total || 0} points</strong>
          </header>

          <div className="casino-card-row casino-card-row--player casino-card-row--fan casino-card-row--fan-player">
            {state?.playerCards.length ? (
              state.playerCards.map((card, index) => (
                <PiratePlayingCardView
                  key={`player-${card.id}-${index}`}
                  card={card}
                  emphasis="strong"
                  dealt={Boolean(dealtCardDelays[`player-${card.id}-${index}`] !== undefined)}
                  dealDelayMs={dealtCardDelays[`player-${card.id}-${index}`] || 0}
                />
              ))
            ) : null}
          </div>

          <div className="casino-blackjack-player-banner" aria-label={`Main de ${playerSeatName}`}>
            <strong>{playerSeatName}</strong>
            <span>{state?.playerScore.total || 0} points</span>
          </div>

          {hasPlayerWin ? (
            <div className="casino-blackjack-seat-outcome is-win" aria-live="polite">
              <strong>WIN</strong>
              <span>+{formatCredits(Math.max(0, state?.lastDelta || 0))}</span>
            </div>
          ) : null}
        </article>
      </div>
    </div>
  );
}
