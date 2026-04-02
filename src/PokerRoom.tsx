import * as React from "react";
import { useState } from "react";
import PiratePlayingCardView from "./PiratePlayingCard";
import cardArtwork from "./images/Cartes de pirate au crépuscule.png";
import {
  actPokerRound,
  startPokerRound,
  type CasinoProfile,
  type PokerState,
} from "./lib/casinoApi";
import { formatCredits } from "./lib/casinoRoomState";

const ANTE_PRESETS = [60, 120, 200, 320];

type PokerRoomProps = {
  playerName: string;
  profile: CasinoProfile;
  onProfileChange: (profile: CasinoProfile, message?: string) => void;
  onError: (message: string) => void;
};

export default function PokerRoom({
  playerName,
  profile,
  onProfileChange,
  onError,
}: PokerRoomProps) {
  const [ante, setAnte] = useState(ANTE_PRESETS[1]);
  const [state, setState] = useState<PokerState | null>(null);
  const [working, setWorking] = useState(false);

  const stage = state?.stage || "idle";
  const lastDelta = state?.lastDelta || 0;

  async function dealHand() {
    onError("");
    setWorking(true);
    try {
      const result = await startPokerRound(ante);
      setState(result.state);
      if (result.profile) {
        onProfileChange(result.profile);
      }
    } catch (error_) {
      onError(error_ instanceof Error ? error_.message : "La main n'a pas pu etre distribuee.");
    } finally {
      setWorking(false);
    }
  }

  async function act(action: "reveal" | "showdown" | "fold") {
    if (!state?.token || stage === "showdown" || working) return;
    onError("");
    setWorking(true);
    try {
      const result = await actPokerRound(state.token, action);
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
            <span>Ante</span>
            <strong>{formatCredits(state?.ante || ante)}</strong>
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
            <p>{state?.message || "Table de hold'em rapide. Cinq places, quatre IA, une seule question: qui emporte le pot ?"}</p>
          </div>

          <div className="casino-card-felt casino-card-felt--poker">
            <div className="casino-seat-ring">
              {(state?.aiSeats || []).map((seat) => (
                <article key={seat.id} className={`casino-seat-chip ${seat.isWinner ? "is-winner" : ""}`}>
                  <header>
                    <strong>{seat.name}</strong>
                    <span>{formatCredits(seat.chips)} jetons</span>
                  </header>
                  <div className="casino-card-row casino-card-row--compact">
                    {seat.cards.length ? (
                      seat.cards.map((card, index) => (
                        <PiratePlayingCardView key={`${seat.id}-${card.id}-${index}`} card={card} hidden={stage !== "showdown"} />
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
                <strong>{state?.stageLabel || "Table au repos"}</strong>
                <span>Pot: {formatCredits(state?.pot || 0)} jetons</span>
              </div>
              <div className="casino-card-row casino-card-row--community">
                {state?.communityCards.length ? (
                  state.communityCards.map((card, index) => (
                    <PiratePlayingCardView key={`community-${card.id}-${index}`} card={card} />
                  ))
                ) : (
                  <div className="casino-empty-seat">Le board attend encore sa premiere carte.</div>
                )}
              </div>
            </div>

            <div className={`casino-card-seat casino-card-seat--player ${state?.playerFolded ? "is-folded" : ""}`}>
              <div className="casino-card-seat__meta">
                <strong>{playerName}</strong>
                <span>{state?.playerFolded ? "Main couchee" : state?.playerHand?.label || "Lecture incomplete"}</span>
              </div>
              <div className="casino-card-row">
                {state?.playerCards.length ? (
                  state.playerCards.map((card, index) => (
                    <PiratePlayingCardView key={`poker-player-${card.id}-${index}`} card={card} emphasis="strong" />
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
                  disabled={stage !== "idle" && stage !== "showdown" || working}
                >
                  {preset}
                </button>
              ))}
            </div>

            <div className="casino-action-row__buttons">
              <button type="button" className="casino-ghost-button" onClick={() => void act("fold")} disabled={stage === "idle" || stage === "showdown" || working}>
                Se coucher
              </button>
              <button
                type="button"
                className="casino-ghost-button"
                onClick={() => void act("reveal")}
                disabled={!(stage === "preflop" || stage === "flop" || stage === "turn") || working}
              >
                {stage === "preflop" ? "Reveler le flop" : stage === "flop" ? "Tourner la turn" : "Tourner la river"}
              </button>
              <button
                type="button"
                className="casino-primary-button"
                onClick={stage === "idle" || stage === "showdown" ? () => void dealHand() : () => void act("showdown")}
                disabled={working || (stage === "idle" && profile.wallet.balance < ante)}
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
            <p>Le pot et les paiements suivent maintenant le wallet backend A11.</p>
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
                <span>{state?.playerFolded ? "Couchee" : state?.playerHand?.label || "Pas encore complete"}</span>
              </div>
            </article>
            <article className="casino-prize-card">
              <div className="casino-prize-card__glyph">◉</div>
              <div>
                <strong>Phase</strong>
                <span>{state?.stageLabel || "Table au repos"}</span>
              </div>
            </article>
          </div>
        </section>
      </aside>
    </section>
  );
}
