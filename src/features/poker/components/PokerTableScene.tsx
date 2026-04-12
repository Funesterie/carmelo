import PiratePlayingCardView from "../../../PiratePlayingCard";
import jetonImg from "../../../images/jeton.png";
import { formatCredits } from "../../../lib/casinoRoomState";
import type { CasinoTableRoomParticipant, PokerState } from "../../../lib/casinoApi";

const POKER_SEAT_LAYOUT = [
  { x: "15%", y: "34%", align: "start", tag: "UTG" },
  { x: "35%", y: "18%", align: "center", tag: "HJ" },
  { x: "65%", y: "18%", align: "center", tag: "CO" },
  { x: "85%", y: "34%", align: "end", tag: "BTN" },
] as const;

type PokerTableSceneProps = {
  state: PokerState | null;
  stage: "idle" | PokerState["stage"];
  playerName: string;
  participants: Array<CasinoTableRoomParticipant & { isSelf: boolean }>;
  activeAnte: number;
  smallBlind: number;
  isDecisionPhase: boolean;
  dealtCardDelays: Record<string, number>;
};

export default function PokerTableScene({
  state,
  stage,
  playerName,
  participants,
  activeAnte,
  smallBlind,
  isDecisionPhase,
  dealtCardDelays,
}: PokerTableSceneProps) {
  void activeAnte;
  void smallBlind;
  const communityCards = state?.communityCards || [];
  const remoteParticipants = participants.filter((participant) => !participant.isSelf).slice(0, POKER_SEAT_LAYOUT.length);

  return (
    <>
      <div className={`casino-card-felt casino-card-felt--poker casino-card-felt--table ${isDecisionPhase ? "is-decision-phase" : ""}`}>
        <div className={`casino-felt-table casino-felt-table--poker ${isDecisionPhase ? "is-decision-phase" : ""}`}>
          <div className="casino-felt-table__halo" />

          {remoteParticipants.map((participant, index) => {
            const layout = POKER_SEAT_LAYOUT[index] || POKER_SEAT_LAYOUT[POKER_SEAT_LAYOUT.length - 1];
            return (
              <article
                key={participant.userId}
                className={`casino-oval-seat casino-oval-seat--ai casino-oval-seat--poker-peer casino-oval-seat--${layout.align} ${isDecisionPhase ? "is-muted" : ""}`}
                style={{
                  ["--seat-x" as string]: layout.x,
                  ["--seat-y" as string]: layout.y,
                }}
              >
                <span className="casino-oval-seat__tag">{layout.tag}</span>
                <header>
                  <strong>{participant.username}</strong>
                  <span className="casino-token-inline"><img src={jetonImg} alt="" />Salon</span>
                </header>
                <div className="casino-empty-seat casino-empty-seat--poker-peer">
                  <strong>Joueur connecte</strong>
                  <span>{stage === "showdown" ? "Showdown sur le salon" : "Main partagee sur ce canal"}</span>
                </div>
                <small>{stage === "showdown" ? "Resultat gere par la table" : "En attente de l'action synchronisee"}</small>
              </article>
            );
          })}

          <section className={`casino-table-core casino-table-core--poker ${isDecisionPhase ? "is-focus" : ""}`}>
            <div className="casino-table-core__headline">
              <strong>{stage === "idle" ? "Table au repos" : state?.stageLabel || "Street en cours"}</strong>
              <span className="casino-token-inline"><img src={jetonImg} alt="" />Pot {formatCredits(state?.pot || 0)}</span>
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
            <div className="casino-card-row casino-card-row--player casino-card-row--fan casino-card-row--fan-player">
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
