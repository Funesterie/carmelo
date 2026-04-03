import * as React from "react";
import { useEffect, useRef, useState } from "react";
import { useTableAudio } from "./audio/useTableAudio";
import PirateInspector from "./PirateInspector";
import PiratePlayingCardView from "./PiratePlayingCard";
import jetonImg from "./images/jeton.png";
import blackjackCaptainArt from "./images/blackjack-captain-art.png";
import {
  actBlackjackRound,
  joinBlackjackRoom,
  startBlackjackRound,
  type BlackjackState,
  type CasinoTableRoom,
  type CasinoProfile,
} from "./lib/casinoApi";
import { formatCredits } from "./lib/casinoRoomState";
import { BLACKJACK_SALONS } from "./lib/tableSalons";

const PLAYER_BETS = [50, 100, 200, 400];
const BLACKJACK_SEAT_LAYOUT = [
  { x: "16%", y: "54%", align: "start", tag: "Spot 1" },
  { x: "33%", y: "35%", align: "center", tag: "Spot 2" },
  { x: "67%", y: "35%", align: "center", tag: "Spot 3" },
  { x: "84%", y: "54%", align: "end", tag: "Spot 4" },
] as const;
const TABLE_DEAL_STEP_MS = 96;

function getBlackjackCardKeys(state: BlackjackState | null) {
  const keys: string[] = [];

  state?.dealerCards.forEach((card, index) => {
    keys.push(`dealer-${card.id}-${index}`);
  });

  state?.aiSeats.forEach((seat) => {
    seat.cards.forEach((card, index) => {
      keys.push(`${seat.id}-${card.id}-${index}`);
    });
  });

  state?.playerCards.forEach((card, index) => {
    keys.push(`player-${card.id}-${index}`);
  });

  return keys;
}

type BlackjackRoomProps = {
  playerName: string;
  profile: CasinoProfile;
  mediaReady: boolean;
  onProfileChange: (profile: CasinoProfile, message?: string) => void;
  onError: (message: string) => void;
};

export default function BlackjackRoom({
  playerName,
  profile,
  mediaReady,
  onProfileChange,
  onError,
}: BlackjackRoomProps) {
  const [bet, setBet] = useState(PLAYER_BETS[1]);
  const [state, setState] = useState<BlackjackState | null>(null);
  const [working, setWorking] = useState(false);
  const [roomId, setRoomId] = useState(BLACKJACK_SALONS[0].id);
  const [rooms, setRooms] = useState<CasinoTableRoom[]>([]);
  const [infoTab, setInfoTab] = useState<"salons" | "regles" | "joueurs">("salons");
  const [dealtCardDelays, setDealtCardDelays] = useState<Record<string, number>>({});
  const previousCardKeysRef = useRef<string[]>([]);
  const clearDealAnimationTimeoutRef = useRef<number | null>(null);
  const { clearQueuedAudio, playCardBurst, playCheck } = useTableAudio(mediaReady);

  const stage = state?.stage || "idle";
  const lastDelta = state?.lastDelta || 0;
  const roomSwitchLocked = stage === "player-turn";
  const activeRoom = rooms.find((entry) => entry.id === roomId) || null;
  const isDecisionPhase = stage === "player-turn";

  useEffect(() => {
    let cancelled = false;

    async function syncRoom() {
      try {
        const result = await joinBlackjackRoom(roomId);
        if (cancelled) return;
        setRooms(result.rooms);
      } catch (error_) {
        if (cancelled) return;
        onError(error_ instanceof Error ? error_.message : "Le salon blackjack ne repond pas.");
      }
    }

    void syncRoom();
    const intervalId = window.setInterval(() => void syncRoom(), 15000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [onError, roomId]);

  useEffect(() => {
    return () => {
      if (clearDealAnimationTimeoutRef.current) {
        window.clearTimeout(clearDealAnimationTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const currentCardKeys = getBlackjackCardKeys(state);
    const previousCardKeys = new Set(previousCardKeysRef.current);
    const nextFreshKeys = currentCardKeys.filter((key) => !previousCardKeys.has(key));
    previousCardKeysRef.current = currentCardKeys;

    if (!nextFreshKeys.length) return;

    const nextDelays = nextFreshKeys.reduce<Record<string, number>>((accumulator, key, index) => {
      accumulator[key] = index * TABLE_DEAL_STEP_MS;
      return accumulator;
    }, {});

    setDealtCardDelays((current) => ({ ...current, ...nextDelays }));
    playCardBurst(nextFreshKeys.length, { stepMs: TABLE_DEAL_STEP_MS, volume: 0.7 });

    if (clearDealAnimationTimeoutRef.current) {
      window.clearTimeout(clearDealAnimationTimeoutRef.current);
    }

    clearDealAnimationTimeoutRef.current = window.setTimeout(() => {
      setDealtCardDelays((current) => {
        const remaining = { ...current };
        nextFreshKeys.forEach((key) => {
          delete remaining[key];
        });
        return remaining;
      });
      clearDealAnimationTimeoutRef.current = null;
    }, 1100 + nextFreshKeys.length * TABLE_DEAL_STEP_MS);
  }, [state]);

  async function startRound() {
    onError("");
    clearQueuedAudio();
    previousCardKeysRef.current = [];
    setDealtCardDelays({});
    if (clearDealAnimationTimeoutRef.current) {
      window.clearTimeout(clearDealAnimationTimeoutRef.current);
      clearDealAnimationTimeoutRef.current = null;
    }
    setWorking(true);
    try {
      const result = await startBlackjackRound(bet, roomId);
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
    if (action === "hit") {
      playCheck();
    }
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
    <section className="casino-table-layout casino-table-layout--compact casino-table-layout--cards">
      <div className="casino-stage casino-stage--cards">
        <div className="casino-room-hud casino-room-hud--blackjack">
          <div className="casino-room-hud__lead">
            <img className="casino-room-hud__portrait" src={blackjackCaptainArt} alt="" aria-hidden="true" />
            <div className="casino-room-hud__identity">
              <span className="casino-chip">Blackjack ATS</span>
              <strong>Table des lanternes</strong>
              <p>
                {state?.message || "Table pirate premium, croupier en face, pression nette sur la prise de decision."}
                {activeRoom ? ` Salon actif: ${BLACKJACK_SALONS.find((entry) => entry.id === activeRoom.id)?.title || activeRoom.id}.` : ""}
              </p>
            </div>
          </div>

          <div className="casino-status-strip casino-status-strip--compact">
            <article>
              <span>Solde serveur</span>
              <strong className="casino-token-inline"><img src={jetonImg} alt="" />{formatCredits(profile.wallet.balance)}</strong>
            </article>
            <article>
              <span>Mise en cours</span>
              <strong className="casino-token-inline"><img src={jetonImg} alt="" />{formatCredits(state?.wager || bet)}</strong>
            </article>
            <article className={lastDelta >= 0 ? "tone-positive" : "tone-negative"}>
              <span>Derniere variation</span>
              <strong className="casino-token-inline"><img src={jetonImg} alt="" />{`${lastDelta >= 0 ? "+" : ""}${formatCredits(lastDelta)}`}</strong>
            </article>
          </div>

          <div className="casino-salon-strip casino-salon-strip--compact" role="tablist" aria-label="Salons blackjack">
            {BLACKJACK_SALONS.map((salon) => {
              const room = rooms.find((entry) => entry.id === salon.id);
              return (
                <button
                  key={salon.id}
                  type="button"
                  className={`casino-salon-pill ${salon.id === roomId ? "is-active" : ""}`}
                  onClick={() => {
                    if (roomSwitchLocked || working) return;
                    clearQueuedAudio();
                    previousCardKeysRef.current = [];
                    setDealtCardDelays({});
                    if (clearDealAnimationTimeoutRef.current) {
                      window.clearTimeout(clearDealAnimationTimeoutRef.current);
                      clearDealAnimationTimeoutRef.current = null;
                    }
                    setState(null);
                    setRoomId(salon.id);
                  }}
                  disabled={roomSwitchLocked || working}
                  role="tab"
                  aria-selected={salon.id === roomId}
                >
                  <div>
                    <strong>{salon.title}</strong>
                    <span>{salon.chip}</span>
                  </div>
                  <b>{room?.playerCount || 0}</b>
                </button>
              );
            })}
          </div>
        </div>

        <div
          className="casino-reel-shell casino-room-shell casino-room-shell--cards casino-reel-shell--table-compact casino-reel-shell--blackjack"
          style={{ ["--room-art" as string]: `url("${blackjackCaptainArt}")` }}
        >
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

          <div className="casino-stage-sidebar">
            <div className={`casino-command-dock casino-command-dock--blackjack ${isDecisionPhase ? "is-attention" : ""}`}>
              <div className="casino-command-dock__copy">
                <span className="casino-chip">{isDecisionPhase ? "Decision" : "Distribution"}</span>
                <strong>{isDecisionPhase ? `Main a ${state?.playerScore.total || 0} points` : "Commandes de table"}</strong>
                <p>
                  {isDecisionPhase
                    ? "Concentre-toi sur ta main, la carte visible du croupier et l'ordre du prochain choix."
                    : "La table reste visible; les reglages et la vie du salon passent dans la colonne laterale."}
                </p>
              </div>

              <div className="casino-command-dock__betline">
                <div className="casino-bet-pills">
                  {PLAYER_BETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      className={`casino-bet-pill casino-bet-pill--dubloon ${bet === preset ? "is-active" : ""}`}
                      onClick={() => setBet(preset)}
                      disabled={stage === "player-turn" || working}
                    >
                      {preset}
                    </button>
                  ))}
                </div>

                <div className="casino-chip-row">
                  <span className="casino-chip">Mise {formatCredits(state?.wager || bet)}</span>
                  <span className="casino-chip">{state?.dealerHidden ? "Une carte cachee" : "Lecture ouverte"}</span>
                  <span className="casino-chip">Payout {formatCredits(state?.payoutAmount || 0)}</span>
                </div>
              </div>

              <div className="casino-command-dock__actions">
                <button
                  type="button"
                  className="casino-ghost-button casino-ghost-button--danger"
                  onClick={() => void act("hit")}
                  disabled={stage !== "player-turn" || working}
                >
                  Tirer
                </button>
                <button
                  type="button"
                  className="casino-ghost-button casino-ghost-button--steady"
                  onClick={() => void act("stand")}
                  disabled={stage !== "player-turn" || working}
                >
                  Rester
                </button>
                <button
                  type="button"
                  className="casino-primary-button casino-primary-button--cyan"
                  onClick={() => void startRound()}
                  disabled={working || stage === "player-turn" || profile.wallet.balance < bet}
                >
                  {stage === "player-turn" ? "Main en cours" : "Distribuer"}
                </button>
              </div>
            </div>

            <PirateInspector
              title="Carnet de bord"
              eyebrow="Table"
              activeTab={infoTab}
              onChange={(tabId) => setInfoTab(tabId as typeof infoTab)}
              tabs={[
                {
                  id: "salons",
                  label: "Salons",
                  badge: rooms.find((entry) => entry.id === roomId)?.playerCount || 0,
                  caption: "Change de table sans perdre la lisibilite du layout.",
                  content: (
                    <div className="casino-salon-roster">
                      {BLACKJACK_SALONS.map((salon) => {
                        const room = rooms.find((entry) => entry.id === salon.id);
                        return (
                          <article key={salon.id} className={`casino-salon-card ${salon.id === roomId ? "is-active" : ""}`}>
                            <div>
                              <strong>{salon.title}</strong>
                              <span>{salon.blurb}</span>
                            </div>
                            <b>{room?.playerCount || 0} joueur{(room?.playerCount || 0) > 1 ? "s" : ""}</b>
                          </article>
                        );
                      })}
                    </div>
                  ),
                },
                {
                  id: "regles",
                  label: "Regles",
                  caption: "Resume compact pour garder le regard sur la table.",
                  content: (
                    <div className="casino-rule-list">
                      <p>Tu joues face au croupier avec quatre marins IA places sur l'arc de table.</p>
                      <p>Blackjack naturel paie 3:2. Une egalite rend simplement la mise.</p>
                      <p>La mise et le paiement passent par le wallet A11, pas par des jetons locaux.</p>
                    </div>
                  ),
                },
                {
                  id: "joueurs",
                  label: "Joueurs",
                  badge: (activeRoom?.participants || []).length,
                  caption: "Presence du salon actif.",
                  content: (
                    <div className="casino-prize-stack">
                      {(activeRoom?.participants || []).length ? (
                        activeRoom?.participants.map((participant) => (
                          <article key={participant.userId} className="casino-prize-card">
                            <div className="casino-prize-card__glyph">21</div>
                            <div>
                              <strong>{participant.username}</strong>
                              <span>{participant.userId === profile.user.id ? "toi" : "connecte sur le salon"}</span>
                            </div>
                          </article>
                        ))
                      ) : (
                        <p className="casino-history-empty">Tu es seul sur ce salon pour le moment.</p>
                      )}
                    </div>
                  ),
                },
              ]}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
