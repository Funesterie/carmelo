import PiratePlayingCardView from "../../../PiratePlayingCard";
import jetonImg from "../../../images/jeton.png";
import { formatCredits } from "../../../lib/casinoRoomState";
import type { CasinoTableRoomParticipant, PokerSeat, PokerState } from "../../../lib/casinoApi";

const POKER_SEAT_LAYOUT = [
  { x: "18%", y: "68%", align: "start", tag: "BG" },
  { x: "19%", y: "28%", align: "start", tag: "HG" },
  { x: "50%", y: "15%", align: "center", tag: "HC" },
  { x: "81%", y: "28%", align: "end", tag: "HD" },
  { x: "82%", y: "68%", align: "end", tag: "BD" },
] as const;

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

function isSeatAbsent(updatedAt: string | null, forcedAbsent = false) {
  if (forcedAbsent) return true;
  if (!updatedAt) return false;
  const heartbeatAt = Date.parse(updatedAt);
  if (Number.isNaN(heartbeatAt)) return false;
  return Date.now() - heartbeatAt > 95_000;
}

function normalizeSeatIdentity(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase();
}

function findParticipantSeat(
  participant: CasinoTableRoomParticipant & { isSelf: boolean },
  seats: PokerSeat[],
) {
  const participantId = normalizeSeatIdentity(participant.userId);
  const participantName = normalizeSeatIdentity(participant.username);

  return (
    seats.find((seat) => {
      const seatId = normalizeSeatIdentity(seat.id);
      const seatName = normalizeSeatIdentity(seat.name);
      return (
        Boolean(participantId && seatId === participantId)
        || Boolean(participantName && seatId === participantName)
        || Boolean(participantName && seatName === participantName)
      );
    }) || null
  );
}

function getParticipantStatus(
  participant: CasinoTableRoomParticipant & { isSelf: boolean },
  seat: PokerSeat | null,
  stage: "idle" | PokerState["stage"],
  absent: boolean,
  folded: boolean,
) {
  if (absent) return "Hors tempo";
  if (folded) return "Fold";
  if (seat?.hand?.label) return seat.hand.label;
  if (seat?.read) return seat.read;
  if (seat?.lastAction) return seat.lastAction;
  if (stage === "showdown") return "Showdown";
  return `${participant.username} en jeu`;
}

type PokerTableSceneProps = {
  state: PokerState | null;
  stage: "idle" | PokerState["stage"];
  playerName: string;
  participants: Array<CasinoTableRoomParticipant & { isSelf: boolean }>;
  activeAnte: number;
  smallBlind: number;
  heroCommitted: number;
  potTotal: number;
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
  heroCommitted,
  potTotal,
  isDecisionPhase,
  dealtCardDelays,
}: PokerTableSceneProps) {
  void activeAnte;
  void smallBlind;
  const communityCards = state?.communityCards || [];
  const remoteParticipants = participants.filter((participant) => !participant.isSelf).slice(0, POKER_SEAT_LAYOUT.length);
  const remoteSeatLayout = getPokerSeatLayout(remoteParticipants.length);
  const remoteSeatBindings = remoteParticipants.map((participant) => ({
    participant,
    seat: findParticipantSeat(participant, state?.aiSeats || []),
  }));
  const heroAbsent = Boolean(state?.playerFolded);
  const heroName = String(playerName || "Toi").trim();

  return (
    <>
      <div className={`casino-card-felt casino-card-felt--poker casino-card-felt--table ${isDecisionPhase ? "is-decision-phase" : ""}`}>
        <div className={`casino-felt-table casino-felt-table--poker ${isDecisionPhase ? "is-decision-phase" : ""}`}>
          <div className="casino-felt-table__halo" />

          {remoteSeatBindings.map(({ participant, seat }, index) => {
            const layout = remoteSeatLayout[index] || POKER_SEAT_LAYOUT[Math.min(index, POKER_SEAT_LAYOUT.length - 1)];
            const absent = isSeatAbsent(participant.updatedAt);
            const folded = Boolean(seat?.folded);
            const seatCards = seat?.cards || [];
            const revealSeatCards = stage === "showdown" && seatCards.length > 0;
            const seatStatus = getParticipantStatus(participant, seat, stage, absent, folded);
            return (
              <article
                key={participant.userId}
                className={`casino-oval-seat casino-oval-seat--poker-peer casino-oval-seat--${layout.align} ${folded ? "is-folded" : ""} ${seat?.isWinner ? "is-winner" : ""}`}
                style={{
                  ["--seat-x" as string]: layout.x,
                  ["--seat-y" as string]: layout.y,
                }}
              >
                <span className="casino-oval-seat__tag">{layout.tag}</span>
                <header>
                  <strong>{participant.username}</strong>
                  <span>{absent ? "Absent" : "Connecte"}</span>
                </header>
                <div className="casino-seat-role-row" aria-label={`Roles de ${participant.username}`}>
                  {seat?.lastAction ? <span className="casino-seat-role-chip casino-seat-role-chip--action">{seat.lastAction}</span> : null}
                  {typeof seat?.totalCommitted === "number" && seat.totalCommitted > 0 ? (
                    <span className="casino-seat-role-chip casino-seat-role-chip--stake">
                      {formatCredits(seat.totalCommitted)}
                    </span>
                  ) : null}
                  {folded ? <span className="casino-seat-role-chip casino-seat-role-chip--absent">Fold</span> : null}
                  {absent && !folded ? <span className="casino-seat-role-chip casino-seat-role-chip--absent">Absent</span> : null}
                </div>
                <div className="casino-card-row casino-card-row--player casino-card-row--fan casino-card-row--fan-peer">
                  {seatCards.length ? (
                    seatCards.map((card, cardIndex) => (
                      <PiratePlayingCardView
                        key={`${seat?.id || participant.userId}-${card.id}-${cardIndex}`}
                        card={card}
                        hidden={!revealSeatCards}
                        dealt={Boolean(dealtCardDelays[`${seat?.id || participant.userId}-${card.id}-${cardIndex}`] !== undefined)}
                        dealDelayMs={dealtCardDelays[`${seat?.id || participant.userId}-${card.id}-${cardIndex}`] || 0}
                      />
                    ))
                  ) : (
                    Array.from({ length: 2 }, (_, cardBackIndex) => (
                      <div key={`${participant.userId}-back-${cardBackIndex}`} className="casino-poker-card-back" aria-hidden="true">
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
            <div className="casino-table-core__footer">
              <span className="casino-table-stat-pill">
                <small>Pot total</small>
                <strong>{formatCredits(potTotal)}</strong>
              </span>
            </div>
          </section>

          <article className={`casino-oval-seat casino-oval-seat--player ${state?.playerFolded ? "is-folded" : ""} ${isDecisionPhase ? "is-focus" : ""}`}>
            <div className="casino-card-seat__meta">
              <strong>{heroName}</strong>
              <span>
                {state?.playerFolded
                  ? "Main couchee"
                  : state?.playerHand?.label || (stage === "showdown"
                    ? "Showdown"
                    : stage === "waiting"
                      ? "En attente"
                      : "Decision ouverte")}
              </span>
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
            <div className="casino-seat-role-row casino-seat-role-row--player casino-seat-role-row--stats" aria-label={`Mise de ${heroName}`}>
              <span className="casino-seat-role-chip casino-seat-role-chip--stake">
                Mise {formatCredits(heroCommitted)}
              </span>
              {heroAbsent ? <span className="casino-seat-role-chip casino-seat-role-chip--absent">Fold</span> : null}
            </div>
          </article>
        </div>
      </div>
    </>
  );
}
