import * as React from "react";
import { useState } from "react";
import PiratePlayingCardView from "./PiratePlayingCard";
import cardArtwork from "./images/Cartes de pirate au crépuscule.png";
import {
  actBlackjackRound,
  startBlackjackRound,
  type BlackjackState,
  type CasinoProfile,
} from "./lib/casinoApi";
import { formatCredits } from "./lib/casinoRoomState";

const PLAYER_BETS = [50, 100, 200, 400];
const BLACKJACK_SEAT_LAYOUT = [
  { x: "16%", y: "54%", align: "start", tag: "Spot 1" },
  { x: "33%", y: "35%", align: "center", tag: "Spot 2" },
  { x: "67%", y: "35%", align: "center", tag: "Spot 3" },
  { x: "84%", y: "54%", align: "end", tag: "Spot 4" },
] as const;

type BlackjackRoomProps = {
  playerName: string;
  profile: CasinoProfile;
  onProfileChange: (profile: CasinoProfile, message?: string) => void;
  onError: (message: string) => void;
};

export default function BlackjackRoom({
  playerName,
  profile,
  onProfileChange,
  onError,
}: BlackjackRoomProps) {
  const [bet, setBet] = useState(PLAYER_BETS[1]);
  const [state, setState] = useState<BlackjackState | null>(null);
  const [working, setWorking] = useState(false);

  const stage = state?.stage || "idle";
  const lastDelta = state?.lastDelta || 0;

  async function startRound() {
    onError("");
    setWorking(true);
    try {
      const result = await startBlackjackRound(bet);
      setState(result.state);
      if (result.profile) {
        onProfileChange(result.profile);
      }
    } catch (error_) {
      onError(error_ instanceof Error ? error_.message : "La donne n'a pas pu commencer.");
    } finally {
      setWorking(false);
    }
  }

  async function act(action: "hit" | "stand") {
    if (!state?.token || stage !== "player-turn" || working) return;
    onError("");
    setWorking(true);
    try {
      const result = await actBlackjackRound(state.token, action);
      setState(result.state);
      if (result.profile) {
        onProfileChange(result.profile);
      }
    } catch (error_) {
      onError(error_ instanceof Error ? error_.message : "La table n'a pas accepte cette action.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <section className="casino-table-layout">
      <div className="casino-stage">
        <div className="casino-status-strip">
          <article>
            <span>Solde serveur</span>
            <strong>{formatCredits(profile.wallet.balance)}</strong>
          </article>
          <article>
            <span>Mise en cours</span>
            <strong>{formatCredits(state?.wager || bet)}</strong>
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
            <p>{state?.message || "Une vraie table semi-circulaire, le croupier en face et quatre marins IA sur l'arc central."}</p>
          </div>

          <div className="casino-card-felt casino-card-felt--blackjack casino-card-felt--table">
            <div className="casino-felt-table casino-felt-table--blackjack">
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
                    className={`casino-oval-seat casino-oval-seat--ai casino-oval-seat--${layout.align}`}
                    style={{
                      ["--seat-x" as string]: layout.x,
                      ["--seat-y" as string]: layout.y,
                    }}
                  >
                    <span className="casino-oval-seat__tag">{layout.tag}</span>
                    <header>
                      <strong>{seat.name}</strong>
                      <span>{formatCredits(seat.chips)} jetons</span>
                    </header>
                    <div className="casino-card-row casino-card-row--compact casino-card-row--tight">
                      {seat.cards.length ? (
                        seat.cards.map((card, cardIndex) => (
                          <PiratePlayingCardView key={`${seat.id}-${card.id}-${cardIndex}`} card={card} />
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

              <section className="casino-table-core casino-table-core--blackjack">
                <div className="casino-table-core__headline">
                  <strong>{stage === "player-turn" ? "Decision du joueur" : "Table en resolution"}</strong>
                  <span>{state?.message || "Le croupier attend la prochaine donne."}</span>
                </div>
                <div className="casino-chip-row">
                  <span className="casino-chip">Mise {formatCredits(state?.wager || bet)}</span>
                  <span className="casino-chip">
                    Croupier {state?.dealerCards.length ? `${state.dealerHidden ? "?" : state.dealerScore.total} pts` : "ferme"}
                  </span>
                </div>
              </section>

              <article className="casino-oval-seat casino-oval-seat--player casino-oval-seat--blackjack-player">
                <div className="casino-card-seat__meta">
                  <strong>{playerName}</strong>
                  <span>{state?.playerCards.length ? `${state.playerScore.total} points` : "En attente de la donne"}</span>
                </div>
                <div className="casino-card-row casino-card-row--player">
                  {state?.playerCards.length ? (
                    state.playerCards.map((card, index) => (
                      <PiratePlayingCardView key={`player-${card.id}-${index}`} card={card} emphasis="strong" />
                    ))
                  ) : (
                    <div className="casino-empty-seat">Le sabot n'est pas encore ouvert.</div>
                  )}
                </div>
              </article>
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
                  disabled={stage === "player-turn" || working}
                >
                  {preset}
                </button>
              ))}
            </div>

            <div className="casino-action-row__buttons">
              <button type="button" className="casino-ghost-button" onClick={() => void act("hit")} disabled={stage !== "player-turn" || working}>
                Tirer
              </button>
              <button type="button" className="casino-ghost-button" onClick={() => void act("stand")} disabled={stage !== "player-turn" || working}>
                Rester
              </button>
              <button
                type="button"
                className="casino-primary-button"
                onClick={() => void startRound()}
                disabled={working || stage === "player-turn" || profile.wallet.balance < bet}
              >
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
            <p>Tu joues face au croupier, avec quatre autres marins IA poses sur l'arc de table.</p>
            <p>Blackjack naturel paie 3:2. Une egalite rend simplement la mise.</p>
            <p>La mise et le paiement passent par le wallet A11, pas par des jetons locaux.</p>
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
                <span>{state?.playerCards.length ? `${state.playerScore.total} points` : "Pas encore distribuee"}</span>
              </div>
            </article>
            <article className="casino-prize-card">
              <div className="casino-prize-card__glyph">☠</div>
              <div>
                <strong>Main du croupier</strong>
                <span>{state?.dealerCards.length ? `${state.dealerHidden ? "?" : state.dealerScore.total} points` : "Sabot ferme"}</span>
              </div>
            </article>
          </div>
        </section>
      </aside>
    </section>
  );
}
