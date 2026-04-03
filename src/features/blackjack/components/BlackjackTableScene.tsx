import PiratePlayingCardView from "../../../PiratePlayingCard";
import jetonImg from "../../../images/jeton.png";
import { formatCredits } from "../../../lib/casinoRoomState";
import type { BlackjackState } from "../../../lib/casinoApi";

const BLACKJACK_SEAT_LAYOUT = [
  { x: "16%", y: "54%", align: "start", tag: "Spot 1" },
  { x: "33%", y: "35%", align: "center", tag: "Spot 2" },
  { x: "67%", y: "35%", align: "center", tag: "Spot 3" },
  { x: "84%", y: "54%", align: "end", tag: "Spot 4" },
] as const;

type BlackjackTableSceneProps = {
  state: BlackjackState | null;
  playerName: string;
  bet: number;
  isDecisionPhase: boolean;
  dealtCardDelays: Record<string, number>;
};

export default function BlackjackTableScene({
  state,
  playerName,
  bet,
  isDecisionPhase,
  dealtCardDelays,
}: BlackjackTableSceneProps) {
  return (
    <div className={`casino-card-felt casino-card-felt--blackjack casino-card-felt--table ${isDecisionPhase ? "is-decision-phase" : ""}`}>
      <div className={`casino-felt-table casino-felt-table--blackjack ${isDecisionPhase ? "is-decision-phase" : ""}`}>
        <div className="casino-blackjack-arc-label">Blackjack paie 3:2</div>

        <section className="casino-blackjack-dealer-rail">
          <div className="casino-card-seat__meta">
            <strong>Le croupier</strong>
            <span>
              {state
                ? state.dealerHidden
                  ? "Carte cachee"
                  : `${state.dealerScore.total} points`
                : "Sabot ferme"}
            </span>
          </div>
          <div className="casino-card-row casino-card-row--dealer">
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
            ) : (
              <div className="casino-empty-seat">Le sabot n'est pas encore ouvert.</div>
            )}
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
              <span className="casino-oval-seat__tag">{layout.tag}</span>
              <header>
                <strong>{seat.name}</strong>
                <span className="casino-token-inline"><img src={jetonImg} alt="" />{formatCredits(seat.chips)}</span>
              </header>
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
                ) : (
                  <div className="casino-empty-seat">En attente</div>
                )}
              </div>
              <p>{seat.mood}</p>
              <small>{seat.result}</small>
            </article>
          );
        })}

        <section className={`casino-table-core casino-table-core--blackjack ${isDecisionPhase ? "is-focus" : ""}`}>
          <div className="casino-table-core__headline">
            <strong>{isDecisionPhase ? "A toi de jouer" : "Table en resolution"}</strong>
            <span>{state?.message || "Le croupier attend la prochaine donne."}</span>
          </div>
          <div className="casino-chip-row">
            <span className="casino-chip">Mise {formatCredits(state?.wager || bet)}</span>
            <span className="casino-chip">
              Croupier {state?.dealerCards.length ? `${state.dealerHidden ? "?" : state.dealerScore.total} pts` : "ferme"}
            </span>
            <span className="casino-chip">Hero {state?.playerCards.length ? `${state.playerScore.total} pts` : "en attente"}</span>
          </div>
        </section>

        <article className={`casino-oval-seat casino-oval-seat--player casino-oval-seat--blackjack-player ${isDecisionPhase ? "is-focus" : ""}`}>
          <div className="casino-card-seat__meta">
            <strong>{playerName}</strong>
            <span>{state?.playerCards.length ? `${state.playerScore.total} points` : "En attente de la donne"}</span>
          </div>
          <div className="casino-card-row casino-card-row--player">
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
            ) : (
              <div className="casino-empty-seat">Le sabot n'est pas encore ouvert.</div>
            )}
          </div>
        </article>
      </div>
    </div>
  );
}
