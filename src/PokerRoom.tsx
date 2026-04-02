import * as React from "react";
import { useMemo, useState } from "react";
import PiratePlayingCardView from "./PiratePlayingCard";
import cardArtwork from "./images/Cartes de pirate au crépuscule.png";
import { formatCredits, usePersistentRoomChips } from "./lib/casinoRoomState";
import {
  comparePokerScores,
  createShuffledDeck,
  describeHoleCards,
  drawCards,
  evaluateBestPokerHand,
  type PiratePlayingCard,
  type PokerScore,
} from "./lib/pirateCards";

type PokerSeat = {
  id: string;
  name: string;
  chips: number;
  cards: PiratePlayingCard[];
  hand: PokerScore | null;
  read: string;
  isWinner: boolean;
};

const ANTE_PRESETS = [60, 120, 200, 320];
const POKER_NAMES = ["Iris Dray", "Cain Voss", "Leda Crow", "Marek Tide"];

function buildPokerSeats() {
  return POKER_NAMES.map((name, index) => ({
    id: `poker-ai-${index}`,
    name,
    chips: 2200 + index * 260,
    cards: [],
    hand: null,
    read: "attend la prochaine main",
    isWinner: false,
  }));
}

function getStageLabel(stage: "idle" | "preflop" | "flop" | "turn" | "river" | "showdown") {
  switch (stage) {
    case "preflop":
      return "Preflop";
    case "flop":
      return "Flop";
    case "turn":
      return "Turn";
    case "river":
      return "River";
    case "showdown":
      return "Showdown";
    default:
      return "Table au repos";
  }
}

export default function PokerRoom({ playerName }: { playerName: string }) {
  const [tableChips, setTableChips] = usePersistentRoomChips("poker", playerName, 2600);
  const [ante, setAnte] = useState(ANTE_PRESETS[1]);
  const [stage, setStage] = useState<"idle" | "preflop" | "flop" | "turn" | "river" | "showdown">("idle");
  const [pot, setPot] = useState(0);
  const [playerCards, setPlayerCards] = useState<PiratePlayingCard[]>([]);
  const [communityCards, setCommunityCards] = useState<PiratePlayingCard[]>([]);
  const [communityReserve, setCommunityReserve] = useState<PiratePlayingCard[]>([]);
  const [aiSeats, setAiSeats] = useState<PokerSeat[]>(() => buildPokerSeats());
  const [playerFolded, setPlayerFolded] = useState(false);
  const [message, setMessage] = useState(
    "Table de hold'em rapide. Cinq places, quatre IA, une seule question: qui emporte le pot ?",
  );
  const [lastDelta, setLastDelta] = useState(0);

  const playerHand = useMemo(() => {
    if (playerFolded) return null;
    const visibleCards = [...playerCards, ...communityCards];
    if (visibleCards.length < 5) return null;
    return evaluateBestPokerHand(visibleCards);
  }, [communityCards, playerCards, playerFolded]);

  function dealHand() {
    if (tableChips < ante) {
      setMessage("Le buy-in de cette table est trop haut pour ta pile de jetons actuelle.");
      return;
    }

    let workingDeck = createShuffledDeck();
    const playerDeal = drawCards(workingDeck, 2);
    workingDeck = playerDeal.deck;

    const nextAiSeats = aiSeats.map((seat, index) => {
      const resetStack = seat.chips < ante ? 1800 + index * 220 : seat.chips;
      const dealt = drawCards(workingDeck, 2);
      workingDeck = dealt.deck;
      return {
        ...seat,
        chips: resetStack - ante,
        cards: dealt.cards,
        hand: null,
        read: describeHoleCards(dealt.cards),
        isWinner: false,
      };
    });

    const board = drawCards(workingDeck, 5);
    workingDeck = board.deck;

    setTableChips((current) => current - ante);
    setLastDelta(-ante);
    setPot(ante * (nextAiSeats.length + 1));
    setPlayerCards(playerDeal.cards);
    setCommunityCards([]);
    setCommunityReserve(board.cards);
    setAiSeats(nextAiSeats);
    setPlayerFolded(false);
    setStage("preflop");
    setMessage("Les antes tombent sur le feutre. La table attend le flop.");
  }

  function revealStreet() {
    if (stage === "preflop") {
      const nextCommunity = communityReserve.slice(0, 3);
      setCommunityCards(nextCommunity);
      setAiSeats((current) =>
        current.map((seat) => ({
          ...seat,
          read: evaluateBestPokerHand([...seat.cards, ...nextCommunity]).label.toLowerCase(),
        })),
      );
      setStage("flop");
      setMessage("Le flop est dehors. Les regards se ferment et la fumee s'epaissit.");
      return;
    }

    if (stage === "flop") {
      const nextCommunity = communityReserve.slice(0, 4);
      setCommunityCards(nextCommunity);
      setAiSeats((current) =>
        current.map((seat) => ({
          ...seat,
          read: evaluateBestPokerHand([...seat.cards, ...nextCommunity]).label.toLowerCase(),
        })),
      );
      setStage("turn");
      setMessage("La turn change la temperature de la table.");
      return;
    }

    if (stage === "turn") {
      const nextCommunity = communityReserve.slice(0, 5);
      setCommunityCards(nextCommunity);
      setAiSeats((current) =>
        current.map((seat) => ({
          ...seat,
          read: evaluateBestPokerHand([...seat.cards, ...nextCommunity]).label.toLowerCase(),
        })),
      );
      setStage("river");
      setMessage("River ouverte. Les jeux sont presque faits.");
    }
  }

  function runShowdown(forceFold = false) {
    if (stage === "idle" || stage === "showdown") return;

    const fullBoard = communityReserve.slice(0, 5);
    const resolvedAiSeats = aiSeats.map((seat) => ({
      ...seat,
      hand: evaluateBestPokerHand([...seat.cards, ...fullBoard]),
      isWinner: false,
      read: evaluateBestPokerHand([...seat.cards, ...fullBoard]).label,
    }));

    const playerResult = !forceFold && !playerFolded
      ? evaluateBestPokerHand([...playerCards, ...fullBoard])
      : null;

    let bestScore: PokerScore | null = playerResult;
    resolvedAiSeats.forEach((seat) => {
      if (!bestScore || comparePokerScores(seat.hand!, bestScore) > 0) {
        bestScore = seat.hand!;
      }
    });

    const winningAiIds = resolvedAiSeats
      .filter((seat) => bestScore && comparePokerScores(seat.hand!, bestScore) === 0)
      .map((seat) => seat.id);
    const playerWins = Boolean(playerResult && bestScore && comparePokerScores(playerResult, bestScore) === 0);
    const winnersCount = winningAiIds.length + (playerWins ? 1 : 0);
    const share = winnersCount ? Math.floor(pot / winnersCount) : 0;

    setCommunityCards(fullBoard);
    setStage("showdown");
    setPlayerFolded(forceFold || playerFolded);
    setAiSeats(
      resolvedAiSeats.map((seat) => ({
        ...seat,
        chips: winningAiIds.includes(seat.id) ? seat.chips + share : seat.chips,
        isWinner: winningAiIds.includes(seat.id),
      })),
    );

    if (playerWins) {
      setTableChips((current) => current + share);
      setLastDelta(share - ante);
      setMessage(`Showdown propre. Tu prends ${formatCredits(share)} jetons avec ${playerResult?.label.toLowerCase()}.`);
    } else {
      setLastDelta(-ante);
      setMessage(
        forceFold || playerFolded
          ? "Tu couches la main. Le pot part chez les IA."
          : `Le pot glisse ailleurs. La meilleure main est ${bestScore?.label.toLowerCase()}.`,
      );
    }
  }

  function foldHand() {
    if (stage === "idle" || stage === "showdown") return;
    runShowdown(true);
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
            <span>Ante</span>
            <strong>{formatCredits(ante)}</strong>
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
              <span className="casino-chip">Poker</span>
              <h2>Salon hold'em</h2>
            </div>
            <p>{message}</p>
          </div>

          <div className="casino-card-felt casino-card-felt--poker">
            <div className="casino-seat-ring">
              {aiSeats.map((seat) => (
                <article key={seat.id} className={`casino-seat-chip ${seat.isWinner ? "is-winner" : ""}`}>
                  <header>
                    <strong>{seat.name}</strong>
                    <span>{formatCredits(seat.chips)} jetons</span>
                  </header>
                  <div className="casino-card-row casino-card-row--compact">
                    {seat.cards.length ? (
                      seat.cards.map((card, index) => (
                        <PiratePlayingCardView
                          key={`${seat.id}-${card.id}-${index}`}
                          card={card}
                          hidden={stage !== "showdown"}
                        />
                      ))
                    ) : (
                      <div className="casino-empty-seat">En attente</div>
                    )}
                  </div>
                  <p>{seat.read}</p>
                  <small>{seat.hand?.label || "aucune lecture finale"}</small>
                </article>
              ))}
            </div>

            <div className="casino-community-lane">
              <div className="casino-community-lane__meta">
                <strong>{getStageLabel(stage)}</strong>
                <span>Pot: {formatCredits(pot)} jetons</span>
              </div>
              <div className="casino-card-row casino-card-row--community">
                {(stage === "showdown" ? communityReserve : communityCards).length ? (
                  (stage === "showdown" ? communityReserve : communityCards).map((card, index) => (
                    <PiratePlayingCardView
                      key={`community-${card.id}-${index}`}
                      card={card}
                    />
                  ))
                ) : (
                  <div className="casino-empty-seat">Le board attend encore sa premiere carte.</div>
                )}
              </div>
            </div>

            <div className={`casino-card-seat casino-card-seat--player ${playerFolded ? "is-folded" : ""}`}>
              <div className="casino-card-seat__meta">
                <strong>{playerName}</strong>
                <span>{playerFolded ? "Main couchee" : playerHand?.label || "Lecture incomplete"}</span>
              </div>
              <div className="casino-card-row">
                {playerCards.length ? (
                  playerCards.map((card, index) => (
                    <PiratePlayingCardView
                      key={`poker-player-${card.id}-${index}`}
                      card={card}
                      emphasis="strong"
                    />
                  ))
                ) : (
                  <div className="casino-empty-seat">Le joueur n'a pas encore touche ses cartes.</div>
                )}
              </div>
            </div>
          </div>

          <div className="casino-action-row">
            <div className="casino-bet-pills">
              {ANTE_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className={`casino-bet-pill ${ante === preset ? "is-active" : ""}`}
                  onClick={() => setAnte(preset)}
                  disabled={stage !== "idle" && stage !== "showdown"}
                >
                  {preset}
                </button>
              ))}
            </div>

            <div className="casino-action-row__buttons">
              <button type="button" className="casino-ghost-button" onClick={foldHand} disabled={stage === "idle" || stage === "showdown"}>
                Se coucher
              </button>
              <button
                type="button"
                className="casino-ghost-button"
                onClick={revealStreet}
                disabled={!(stage === "preflop" || stage === "flop" || stage === "turn")}
              >
                {stage === "preflop" ? "Reveler le flop" : stage === "flop" ? "Tourner la turn" : "Tourner la river"}
              </button>
              <button
                type="button"
                className="casino-primary-button"
                onClick={stage === "idle" || stage === "showdown" ? dealHand : () => runShowdown(false)}
              >
                {stage === "idle" || stage === "showdown" ? "Distribuer une main" : "Aller au showdown"}
              </button>
            </div>
          </div>
        </div>
      </div>

      <aside className="casino-side-rail">
        <section className="casino-panel">
          <div className="casino-panel__header">
            <span className="casino-chip">Regles</span>
            <h3>Texas hold'em rapide</h3>
          </div>
          <div className="casino-rule-list">
            <p>Cinq joueurs a table: toi et quatre IA qui paient tous l’ante.</p>
            <p>Le format va droit a l’essentiel: preflop, flop, turn, river, showdown.</p>
            <p>Le pot est partage en cas d’egalite, sans menus lourds ni overlays cassants.</p>
          </div>
        </section>

        <section className="casino-panel">
          <div className="casino-panel__header">
            <span className="casino-chip">Lecture</span>
            <h3>Ta meilleure main</h3>
          </div>
          <div className="casino-prize-stack">
            <article className="casino-prize-card">
              <div className="casino-prize-card__glyph">♠</div>
              <div>
                <strong>Main du joueur</strong>
                <span>{playerFolded ? "Couchée" : playerHand?.label || "Pas encore complete"}</span>
              </div>
            </article>
            <article className="casino-prize-card">
              <div className="casino-prize-card__glyph">◉</div>
              <div>
                <strong>Phase</strong>
                <span>{getStageLabel(stage)}</span>
              </div>
            </article>
          </div>
        </section>
      </aside>
    </section>
  );
}
