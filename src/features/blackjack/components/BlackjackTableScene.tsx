import PiratePlayingCardView from "../../../PiratePlayingCard";
import type { BlackjackState } from "../../../lib/casinoApi";

const BLACKJACK_SEAT_LAYOUT = [
  { x: "16%", y: "54%", align: "start" },
  { x: "33%", y: "35%", align: "center" },
  { x: "67%", y: "35%", align: "center" },
  { x: "84%", y: "54%", align: "end" },
] as const;

type BlackjackTableSceneProps = {
  state: BlackjackState | null;
  playerName: string;
  bet: number;
  isDecisionPhase: boolean;
  dealtCardDelays: Record<string, number>;
  resultFlash: { label: string; tone: "win" | "lose" } | null;
};

export default function BlackjackTableScene({
  state,
  playerName,
  bet,
  isDecisionPhase,
  dealtCardDelays,
  resultFlash,
}: BlackjackTableSceneProps) {
  void playerName;
  void bet;
  return (
    <div className={`casino-card-felt casino-card-felt--blackjack casino-card-felt--table ${isDecisionPhase ? "is-decision-phase" : ""}`}>
      <div className={`casino-felt-table casino-felt-table--blackjack ${isDecisionPhase ? "is-decision-phase" : ""}`}>
        {resultFlash ? (
          <div className={`casino-blackjack-result-flash is-${resultFlash.tone}`} aria-live="polite">
            <strong>{resultFlash.label}</strong>
          </div>
        ) : null}

        <section className="casino-blackjack-dealer-rail">
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

        {(state?.aiSeats || []).map((seat, index) => {
          const layout = BLACKJACK_SEAT_LAYOUT[index] || BLACKJACK_SEAT_LAYOUT[BLACKJACK_SEAT_LAYOUT.length - 1];
          return (
            <article
              key={seat.id}
              className={`casino-oval-seat casino-oval-seat--ai casino-oval-seat--${layout.align} ${isDecisionPhase ? "is-muted" : ""}`}
              style={{
                ["--seat-x" as string]: layout.x,
                ["--seat-y" as string]: layout.y,
              }}
            >
              <div className="casino-card-row casino-card-row--compact casino-card-row--tight">
                {seat.cards.length ? (
                  seat.cards.map((card, cardIndex) => (
                    <PiratePlayingCardView
                      key={`${seat.id}-${card.id}-${cardIndex}`}
                      card={card}
                      dealt={Boolean(dealtCardDelays[`${seat.id}-${card.id}-${cardIndex}`] !== undefined)}
                      dealDelayMs={dealtCardDelays[`${seat.id}-${card.id}-${cardIndex}`] || 0}
                    />
                  ))
                ) : null}
              </div>
            </article>
          );
        })}

        <article className={`casino-oval-seat casino-oval-seat--player casino-oval-seat--blackjack-player ${isDecisionPhase ? "is-focus" : ""}`}>
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
        </article>
      </div>
    </div>
  );
}
