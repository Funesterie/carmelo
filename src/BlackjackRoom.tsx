import * as React from "react";
import { useMemo, useState } from "react";
import PiratePlayingCardView from "./PiratePlayingCard";
import cardArtwork from "./images/Cartes de pirate au crépuscule.png";
import { formatCredits, usePersistentRoomChips } from "./lib/casinoRoomState";
import {
  createShuffledDeck,
  describeHoleCards,
  drawCards,
  getBlackjackScore,
  type PiratePlayingCard,
} from "./lib/pirateCards";

type BlackjackSeat = {
  id: string;
  name: string;
  chips: number;
  wager: number;
  cards: PiratePlayingCard[];
  mood: string;
  result: string;
};

const PLAYER_BETS = [50, 100, 200, 400];
const AI_NAMES = ["Mira Voss", "Blaise Flint", "Nox Vale", "Soren Pike"];

function buildAiSeats() {
  return AI_NAMES.map((name, index) => ({
    id: `blackjack-ai-${index}`,
    name,
    chips: 1800 + index * 220,
    wager: 0,
    cards: [],
    mood: "attend la prochaine donne",
    result: "hors manche",
  }));
}

function getPayoutReturn(
  cards: PiratePlayingCard[],
  dealerCards: PiratePlayingCard[],
  wager: number,
) {
  const playerScore = getBlackjackScore(cards);
  const dealerScore = getBlackjackScore(dealerCards);

  if (playerScore.isBust) {
    return { amount: 0, label: "Brule" };
  }

  if (playerScore.isBlackjack && !dealerScore.isBlackjack) {
    return { amount: Math.round(wager * 2.5), label: "Blackjack" };
  }

  if (dealerScore.isBust) {
    return { amount: wager * 2, label: "Le croupier saute" };
  }

  if (dealerScore.isBlackjack && !playerScore.isBlackjack) {
    return { amount: 0, label: "Le croupier touche blackjack" };
  }

  if (playerScore.total > dealerScore.total) {
    return { amount: wager * 2, label: "Main gagnante" };
  }

  if (playerScore.total === dealerScore.total) {
    return { amount: wager, label: "Push" };
  }

  return { amount: 0, label: "Main perdante" };
}

function completeDealerHand(deck: PiratePlayingCard[], cards: PiratePlayingCard[]) {
  let workingDeck = deck.slice();
  const nextCards = cards.slice();
  let score = getBlackjackScore(nextCards);

  while (score.total < 17) {
    const draw = drawCards(workingDeck, 1);
    workingDeck = draw.deck;
    if (draw.cards[0]) nextCards.push(draw.cards[0]);
    score = getBlackjackScore(nextCards);
  }

  return { cards: nextCards, deck: workingDeck };
}

function completeAiHand(deck: PiratePlayingCard[], seat: BlackjackSeat) {
  let workingDeck = deck.slice();
  const nextSeat = { ...seat, cards: seat.cards.slice() };
  let score = getBlackjackScore(nextSeat.cards);

  while (score.total < 17) {
    const draw = drawCards(workingDeck, 1);
    workingDeck = draw.deck;
    if (draw.cards[0]) nextSeat.cards.push(draw.cards[0]);
    score = getBlackjackScore(nextSeat.cards);
  }

  return { seat: nextSeat, deck: workingDeck };
}

export default function BlackjackRoom({ playerName }: { playerName: string }) {
  const [tableChips, setTableChips] = usePersistentRoomChips("blackjack", playerName, 2200);
  const [bet, setBet] = useState(PLAYER_BETS[1]);
  const [deck, setDeck] = useState<PiratePlayingCard[]>([]);
  const [playerCards, setPlayerCards] = useState<PiratePlayingCard[]>([]);
  const [dealerCards, setDealerCards] = useState<PiratePlayingCard[]>([]);
  const [dealerHidden, setDealerHidden] = useState(true);
  const [aiSeats, setAiSeats] = useState<BlackjackSeat[]>(() => buildAiSeats());
  const [stage, setStage] = useState<"idle" | "player-turn" | "resolved">("idle");
  const [roundMessage, setRoundMessage] = useState(
    "Table ouverte. Choisis une mise et attends la prochaine donne.",
  );
  const [currentWager, setCurrentWager] = useState(0);
  const [lastDelta, setLastDelta] = useState(0);

  const playerScore = useMemo(() => getBlackjackScore(playerCards), [playerCards]);
  const dealerScore = useMemo(() => getBlackjackScore(dealerCards), [dealerCards]);

  function settleRound(
    nextDealerCards: PiratePlayingCard[],
    nextAiSeats: BlackjackSeat[],
    nextDeck: PiratePlayingCard[],
    sourcePlayerCards = playerCards,
    wager = currentWager,
  ) {
    const playerOutcome = getPayoutReturn(sourcePlayerCards, nextDealerCards, wager);
    setTableChips((current) => current + playerOutcome.amount);
    setLastDelta(playerOutcome.amount - wager);

    const settledAiSeats = nextAiSeats.map((seat) => {
      const payout = getPayoutReturn(seat.cards, nextDealerCards, seat.wager);
      return {
        ...seat,
        chips: seat.chips + payout.amount,
        result: payout.label,
        mood: payout.amount > seat.wager ? "empoche le pot" : payout.amount === seat.wager ? "annule la manche" : "encaisse le choc",
      };
    });

    setAiSeats(settledAiSeats);
    setDealerCards(nextDealerCards);
    setDealerHidden(false);
    setDeck(nextDeck);
    setStage("resolved");
    setRoundMessage(
      `${playerOutcome.label}. Ta main finit a ${getBlackjackScore(sourcePlayerCards).total}, le croupier a ${getBlackjackScore(nextDealerCards).total}.`,
    );
  }

  function startRound() {
    if (tableChips < bet) {
      setRoundMessage("Il n'y a pas assez de jetons sur la table pour cette mise.");
      return;
    }

    let workingDeck = createShuffledDeck();
    const playerOpening = drawCards(workingDeck, 2);
    workingDeck = playerOpening.deck;

    const dealerOpening = drawCards(workingDeck, 2);
    workingDeck = dealerOpening.deck;

    const nextAiSeats = aiSeats.map((seat, index) => {
      const resetStack = seat.chips < 80 ? 1600 + index * 180 : seat.chips;
      const wager = Math.min(resetStack, PLAYER_BETS[index % PLAYER_BETS.length]);
      const dealt = drawCards(workingDeck, 2);
      workingDeck = dealt.deck;
      return {
        ...seat,
        chips: resetStack - wager,
        wager,
        cards: dealt.cards,
        result: "en jeu",
        mood: describeHoleCards(dealt.cards),
      };
    });

    setTableChips((current) => current - bet);
    setCurrentWager(bet);
    setPlayerCards(playerOpening.cards);
    setDealerCards(dealerOpening.cards);
    setDealerHidden(true);
    setAiSeats(nextAiSeats);
    setDeck(workingDeck);
    setLastDelta(-bet);
    setStage("player-turn");
    setRoundMessage("Le sabot est chaud. A toi de tirer ou de rester.");

    const immediatePlayerScore = getBlackjackScore(playerOpening.cards);
    if (immediatePlayerScore.isBlackjack) {
      const dealerFinal = completeDealerHand(workingDeck, dealerOpening.cards);
      const aiFinal = nextAiSeats.reduce(
        (state, seat) => {
          const completed = completeAiHand(state.deck, seat);
          return {
            deck: completed.deck,
            seats: [...state.seats, completed.seat],
          };
        },
        { deck: dealerFinal.deck, seats: [] as BlackjackSeat[] },
      );
      settleRound(dealerFinal.cards, aiFinal.seats, aiFinal.deck, playerOpening.cards, bet);
    }
  }

  function hitPlayer() {
    if (stage !== "player-turn") return;

    const draw = drawCards(deck, 1);
    const nextCards = [...playerCards, ...draw.cards];
    setPlayerCards(nextCards);
    setDeck(draw.deck);

    if (getBlackjackScore(nextCards).isBust) {
      const dealerFinal = completeDealerHand(draw.deck, dealerCards);
      const aiFinal = aiSeats.reduce(
        (state, seat) => {
          const completed = completeAiHand(state.deck, seat);
          return {
            deck: completed.deck,
            seats: [...state.seats, completed.seat],
          };
        },
        { deck: dealerFinal.deck, seats: [] as BlackjackSeat[] },
      );
      settleRound(dealerFinal.cards, aiFinal.seats, aiFinal.deck, nextCards);
      return;
    }

    setRoundMessage("Encore une carte. Le croupier te regarde sans broncher.");
  }

  function standPlayer() {
    if (stage !== "player-turn") return;

    const dealerFinal = completeDealerHand(deck, dealerCards);
    const aiFinal = aiSeats.reduce(
      (state, seat) => {
        const completed = completeAiHand(state.deck, seat);
        return {
          deck: completed.deck,
          seats: [...state.seats, completed.seat],
        };
      },
      { deck: dealerFinal.deck, seats: [] as BlackjackSeat[] },
    );

    settleRound(dealerFinal.cards, aiFinal.seats, aiFinal.deck);
  }

  return (
    <section className="casino-table-layout">
      <div className="casino-stage">
        <div className="casino-status-strip">
          <article>
            <span>Jetons de salle</span>
            <strong>{formatCredits(tableChips)}</strong>
          </article>
          <article>
            <span>Mise en cours</span>
            <strong>{formatCredits(currentWager || bet)}</strong>
          </article>
          <article className={lastDelta >= 0 ? "tone-positive" : "tone-negative"}>
            <span>Derniere variation</span>
            <strong>{`${lastDelta >= 0 ? "+" : ""}${formatCredits(lastDelta)}`}</strong>
          </article>
        </div>

        <div
          className="casino-reel-shell casino-room-shell casino-room-shell--cards"
          style={{ ["--room-art" as string]: `url("${cardArtwork}")` }}
        >
          <div className="casino-reel-shell__header">
            <div>
              <span className="casino-chip">Blackjack</span>
              <h2>Table des lanternes</h2>
            </div>
            <p>{roundMessage}</p>
          </div>

          <div className="casino-card-felt">
            <div className="casino-card-seat casino-card-seat--dealer">
              <div className="casino-card-seat__meta">
                <strong>Le croupier</strong>
                <span>{dealerHidden && stage === "player-turn" ? "Carte cachee" : `${dealerScore.total} points`}</span>
              </div>
              <div className="casino-card-row">
                {dealerCards.map((card, index) => (
                  <PiratePlayingCardView
                    key={`dealer-${card.id}-${index}`}
                    card={card}
                    hidden={dealerHidden && index === 1 && stage === "player-turn"}
                  />
                ))}
              </div>
            </div>

            <div className="casino-seat-ring">
              {aiSeats.map((seat) => (
                <article key={seat.id} className="casino-seat-chip">
                  <header>
                    <strong>{seat.name}</strong>
                    <span>{formatCredits(seat.chips)} jetons</span>
                  </header>
                  <div className="casino-card-row casino-card-row--compact">
                    {seat.cards.map((card, index) => (
                      <PiratePlayingCardView
                        key={`${seat.id}-${card.id}-${index}`}
                        card={card}
                      />
                    ))}
                  </div>
                  <p>{seat.mood}</p>
                  <small>{seat.result}</small>
                </article>
              ))}
            </div>

            <div className="casino-card-seat casino-card-seat--player">
              <div className="casino-card-seat__meta">
                <strong>{playerName}</strong>
                <span>{playerCards.length ? `${playerScore.total} points` : "En attente de la donne"}</span>
              </div>
              <div className="casino-card-row">
                {playerCards.length ? (
                  playerCards.map((card, index) => (
                    <PiratePlayingCardView
                      key={`player-${card.id}-${index}`}
                      card={card}
                      emphasis="strong"
                    />
                  ))
                ) : (
                  <div className="casino-empty-seat">Le sabot n'est pas encore ouvert.</div>
                )}
              </div>
            </div>
          </div>

          <div className="casino-action-row">
            <div className="casino-bet-pills">
              {PLAYER_BETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className={`casino-bet-pill ${bet === preset ? "is-active" : ""}`}
                  onClick={() => setBet(preset)}
                  disabled={stage === "player-turn"}
                >
                  {preset}
                </button>
              ))}
            </div>

            <div className="casino-action-row__buttons">
              <button type="button" className="casino-ghost-button" onClick={hitPlayer} disabled={stage !== "player-turn"}>
                Tirer
              </button>
              <button type="button" className="casino-ghost-button" onClick={standPlayer} disabled={stage !== "player-turn"}>
                Rester
              </button>
              <button type="button" className="casino-primary-button" onClick={startRound} disabled={stage === "player-turn"}>
                {stage === "player-turn" ? "Main en cours" : "Distribuer"}
              </button>
            </div>
          </div>
        </div>
      </div>

      <aside className="casino-side-rail">
        <section className="casino-panel">
          <div className="casino-panel__header">
            <span className="casino-chip">Regles</span>
            <h3>Table rapide</h3>
          </div>
          <div className="casino-rule-list">
            <p>Tu joues face au croupier, avec quatre autres marins IA autour de la table.</p>
            <p>Blackjack naturel paie 3:2. Une egalite rend simplement la mise.</p>
            <p>Les stacks des IA vivent sur la session pour donner une vraie sensation de salle.</p>
          </div>
        </section>

        <section className="casino-panel">
          <div className="casino-panel__header">
            <span className="casino-chip">Table</span>
            <h3>Lecture du sabot</h3>
          </div>
          <div className="casino-prize-stack">
            <article className="casino-prize-card">
              <div className="casino-prize-card__glyph">21</div>
              <div>
                <strong>Main du joueur</strong>
                <span>{playerCards.length ? `${playerScore.total} points` : "Pas encore distribuee"}</span>
              </div>
            </article>
            <article className="casino-prize-card">
              <div className="casino-prize-card__glyph">☠</div>
              <div>
                <strong>Main du croupier</strong>
                <span>{dealerCards.length ? `${dealerHidden && stage === "player-turn" ? "?" : dealerScore.total} points` : "Sabot ferme"}</span>
              </div>
            </article>
          </div>
        </section>
      </aside>
    </section>
  );
}
