import PiratePlayingCardView from "../../../PiratePlayingCard";
import jetonImg from "../../../images/jeton.png";
import { formatCredits } from "../../../lib/casinoRoomState";
import type { PokerState } from "../../../lib/casinoApi";

const POKER_SEAT_LAYOUT = [
  { x: "15%", y: "34%", align: "start", tag: "UTG" },
  { x: "35%", y: "18%", align: "center", tag: "HJ" },
  { x: "65%", y: "18%", align: "center", tag: "CO" },
  { x: "85%", y: "34%", align: "end", tag: "BTN" },
] as const;

const STREET_ORDER = ["preflop", "flop", "turn", "river", "showdown"] as const;

const STREET_LABELS: Record<(typeof STREET_ORDER)[number], { title: string; caption: string }> = {
  preflop: { title: "Preflop", caption: "Ouverture de ranges et premiere pression." },
  flop: { title: "Flop", caption: "Trois cartes au centre, le spot se precise." },
  turn: { title: "Turn", caption: "La quatrieme street durcit les sizings." },
  river: { title: "River", caption: "Derniere decision avant l'abattage." },
  showdown: { title: "Showdown", caption: "Les mains sont retournees et le pot est pousse." },
};

type PokerTableSceneProps = {
  state: PokerState | null;
  stage: "idle" | PokerState["stage"];
  playerName: string;
  activeAnte: number;
  smallBlind: number;
  isDecisionPhase: boolean;
  currentStreetIndex: number;
  dealtCardDelays: Record<string, number>;
};

export default function PokerTableScene({
  state,
  stage,
  playerName,
  activeAnte,
  smallBlind,
  isDecisionPhase,
  currentStreetIndex,
  dealtCardDelays,
}: PokerTableSceneProps) {
  const communityCards = state?.communityCards || [];

  return (
    <>
      <div className="casino-poker-street-rail casino-poker-street-rail--compact" aria-label="Progression de la main">
        {STREET_ORDER.map((street, index) => {
          const isCurrent = index === currentStreetIndex;
          const isComplete = currentStreetIndex > index || stage === "showdown";
          return (
            <article
              key={street}
              className={`casino-poker-street-step ${isCurrent ? "is-current" : ""} ${isComplete ? "is-complete" : ""}`}
            >
              <span>{index + 1}</span>
              <strong>{STREET_LABELS[street].title}</strong>
              <small>{STREET_LABELS[street].caption}</small>
            </article>
          );
        })}
      </div>

      <div className={`casino-card-felt casino-card-felt--poker casino-card-felt--table ${isDecisionPhase ? "is-decision-phase" : ""}`}>
        <div className={`casino-felt-table casino-felt-table--poker ${isDecisionPhase ? "is-decision-phase" : ""}`}>
          <div className="casino-felt-table__halo" />

          {(state?.aiSeats || []).map((seat, index) => {
            const layout = POKER_SEAT_LAYOUT[index] || POKER_SEAT_LAYOUT[POKER_SEAT_LAYOUT.length - 1];
            return (
              <article
                key={seat.id}
                className={`casino-oval-seat casino-oval-seat--ai casino-oval-seat--${layout.align} ${seat.isWinner ? "is-winner" : ""} ${seat.folded ? "is-folded" : ""} ${isDecisionPhase ? "is-muted" : ""}`}
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
                        hidden={stage !== "showdown"}
                        dealt={Boolean(dealtCardDelays[`${seat.id}-${card.id}-${cardIndex}`] !== undefined)}
                        dealDelayMs={dealtCardDelays[`${seat.id}-${card.id}-${cardIndex}`] || 0}
                      />
                    ))
                  ) : (
                    <div className="casino-empty-seat">En attente</div>
                  )}
                </div>
                <p>{seat.read}</p>
                <small>{seat.folded ? "Seat couche" : seat.lastAction || (stage === "showdown" ? seat.hand?.label || "Lecture cachee" : "Observe le coup")}</small>
              </article>
            );
          })}

          <section className={`casino-table-core casino-table-core--poker ${isDecisionPhase ? "is-focus" : ""}`}>
            <div className="casino-table-core__headline">
              <strong>{stage === "idle" ? "Table au repos" : state?.stageLabel || "Street en cours"}</strong>
              <span className="casino-token-inline"><img src={jetonImg} alt="" />Pot {formatCredits(state?.pot || 0)}</span>
            </div>
            <div className="casino-chip-row">
              <span className="casino-chip">5-max NL</span>
              <span className="casino-chip">SB / BB {formatCredits(smallBlind)} / {formatCredits(activeAnte)}</span>
              <span className="casino-chip">{state?.playerFolded ? "Hero couche" : state?.aggressorName ? `Action de ${state.aggressorName}` : "Action checkee"}</span>
            </div>
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
          </section>

          <article className={`casino-oval-seat casino-oval-seat--player ${state?.playerFolded ? "is-folded" : ""} ${isDecisionPhase ? "is-focus" : ""}`}>
            <div className="casino-card-seat__meta">
              <strong>{playerName}</strong>
              <span>{state?.playerFolded ? "Main couchee" : state?.playerHand?.label || (stage === "showdown" ? "Showdown" : "Decision ouverte")}</span>
            </div>
            <div className="casino-card-row casino-card-row--player">
              {state?.playerCards.length ? (
                state.playerCards.map((card, index) => (
                  <PiratePlayingCardView
                    key={`poker-player-${card.id}-${index}`}
                    card={card}
                    emphasis="strong"
                    dealt={Boolean(dealtCardDelays[`poker-player-${card.id}-${index}`] !== undefined)}
                    dealDelayMs={dealtCardDelays[`poker-player-${card.id}-${index}`] || 0}
                  />
                ))
              ) : (
                <div className="casino-empty-seat">Le joueur n'a pas encore touche ses cartes.</div>
              )}
            </div>
          </article>
        </div>
      </div>
    </>
  );
}
