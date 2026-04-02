import * as React from "react";
import { useEffect, useRef, useState } from "react";
import { useTableAudio } from "./audio/useTableAudio";
import PiratePlayingCardView from "./PiratePlayingCard";
import jetonImg from "./images/jeton.png";
import cardArtwork from "./images/Cartes de pirate au crépuscule.png";
import {
  actPokerRound,
  joinPokerRoom,
  startPokerRound,
  type CasinoTableRoom,
  type CasinoProfile,
  type PokerState,
} from "./lib/casinoApi";
import { formatCredits } from "./lib/casinoRoomState";
import { POKER_SALONS } from "./lib/tableSalons";

const ANTE_PRESETS = [60, 120, 200, 320];
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
const TABLE_DEAL_STEP_MS = 92;

type PokerAction = "reveal" | "showdown" | "check" | "call" | "bet" | "raise" | "fold";

type PokerRoomProps = {
  playerName: string;
  profile: CasinoProfile;
  onProfileChange: (profile: CasinoProfile, message?: string) => void;
  onError: (message: string) => void;
};

function getPokerCardKeys(state: PokerState | null) {
  const keys: string[] = [];

  state?.aiSeats.forEach((seat) => {
    seat.cards.forEach((card, index) => {
      keys.push(`${seat.id}-${card.id}-${index}`);
    });
  });

  state?.communityCards.forEach((card, index) => {
    keys.push(`community-${card.id}-${index}`);
  });

  state?.playerCards.forEach((card, index) => {
    keys.push(`poker-player-${card.id}-${index}`);
  });

  return keys;
}

function normalizeAggressionTarget(rawValue: number, minValue: number, maxValue: number, step: number) {
  if (!maxValue) return 0;
  const safeStep = Math.max(1, step);
  const snapped = Math.round(rawValue / safeStep) * safeStep;
  return Math.max(minValue, Math.min(maxValue, snapped));
}

function buildAggressionPresets(state: PokerState | null, blindUnit: number) {
  if (!state) return [];
  const minValue = state.legalActions.includes("raise") ? state.minRaiseTo : state.minBet;
  const maxValue = state.playerStreetCommitted + state.playerChips;
  if (!minValue || !maxValue || maxValue < minValue) return [];

  const referencePot = Math.max(state.pot + state.toCall, minValue);
  const rawCandidates = [
    minValue,
    referencePot * 0.5,
    referencePot * 0.75,
    referencePot,
    maxValue,
  ];

  return rawCandidates
    .map((value) => normalizeAggressionTarget(value, minValue, maxValue, blindUnit))
    .filter((value, index, array) => value >= minValue && value <= maxValue && array.indexOf(value) === index)
    .slice(0, 5);
}

function getDecisionHeadline(state: PokerState | null) {
  if (!state) return "Selectionne une structure puis distribue.";
  if (state.playerFolded) return "Main couchee";
  if (state.stage === "showdown") return "Pot resolu";
  if (state.legalActions.includes("call")) return `Defense a ${formatCredits(state.toCall)}`;
  if (state.legalActions.includes("raise")) return "Spot de re-raise ouvert";
  if (state.legalActions.includes("bet")) return "Spot checke, initiative disponible";
  if (state.legalActions.includes("check")) return "Check disponible";
  return "Decision en cours";
}

function getDecisionCaption(state: PokerState | null) {
  if (!state) {
    return "Le backend gere maintenant les vrais spots par street: check, call, bet, raise et fold avec sizing.";
  }
  if (state.stage === "showdown") {
    return state.message;
  }
  if (state.legalActions.includes("call")) {
    return `${state.aggressorName || "La table"} ouvre l'action. Tu peux payer ${formatCredits(state.toCall)}, relancer ou jeter.`;
  }
  if (state.legalActions.includes("bet")) {
    return "La table t'a checke la parole. Tu peux controler le pot ou attaquer avec un sizing reel.";
  }
  return state.message;
}

export default function PokerRoom({
  playerName,
  profile,
  onProfileChange,
  onError,
}: PokerRoomProps) {
  const [ante, setAnte] = useState(ANTE_PRESETS[1]);
  const [state, setState] = useState<PokerState | null>(null);
  const [working, setWorking] = useState(false);
  const [roomId, setRoomId] = useState(POKER_SALONS[0].id);
  const [rooms, setRooms] = useState<CasinoTableRoom[]>([]);
  const [dealtCardDelays, setDealtCardDelays] = useState<Record<string, number>>({});
  const [betTarget, setBetTarget] = useState(0);

  const previousCardKeysRef = useRef<string[]>([]);
  const clearDealAnimationTimeoutRef = useRef<number | null>(null);
  const { clearQueuedAudio, playCardBurst, playCheck } = useTableAudio();

  const stage = state?.stage || "idle";
  const lastDelta = state?.lastDelta || 0;
  const roomSwitchLocked = !(stage === "idle" || stage === "showdown");
  const activeRoom = rooms.find((entry) => entry.id === roomId) || null;
  const activeAnte = state?.ante || ante;
  const smallBlind = Math.max(10, Math.round(activeAnte / 2));
  const blindUnit = Math.max(10, Math.round(activeAnte / 2));
  const currentStreetIndex = stage === "idle" ? -1 : STREET_ORDER.indexOf(stage);
  const communityCards = state?.communityCards || [];
  const toCall = state?.toCall || 0;
  const playerChips = state?.playerChips || 0;
  const playerCommitted = state?.playerCommitted || activeAnte;
  const playerStreetCommitted = state?.playerStreetCommitted || 0;
  const canCheck = Boolean(state?.legalActions.includes("check"));
  const canCall = Boolean(state?.legalActions.includes("call"));
  const canBet = Boolean(state?.legalActions.includes("bet"));
  const canRaise = Boolean(state?.legalActions.includes("raise"));
  const aggressionMin = canRaise ? state?.minRaiseTo || 0 : canBet ? state?.minBet || 0 : 0;
  const aggressionMax = state ? playerStreetCommitted + playerChips : 0;
  const aggressionPresets = buildAggressionPresets(state, blindUnit);
  const normalizedBetTarget =
    canBet || canRaise ? normalizeAggressionTarget(betTarget || aggressionMin, aggressionMin, aggressionMax, blindUnit) : 0;

  useEffect(() => {
    let cancelled = false;

    async function syncRoom() {
      try {
        const result = await joinPokerRoom(roomId);
        if (cancelled) return;
        setRooms(result.rooms);
      } catch (error_) {
        if (cancelled) return;
        onError(error_ instanceof Error ? error_.message : "Le salon poker ne repond pas.");
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
    const currentCardKeys = getPokerCardKeys(state);
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
  }, [playCardBurst, state]);

  useEffect(() => {
    if (!(canBet || canRaise)) {
      setBetTarget(0);
      return;
    }

    const suggested =
      aggressionPresets[1] || aggressionPresets[0] || normalizeAggressionTarget(aggressionMin, aggressionMin, aggressionMax, blindUnit);

    setBetTarget((current) => {
      if (current >= aggressionMin && current <= aggressionMax) {
        return normalizeAggressionTarget(current, aggressionMin, aggressionMax, blindUnit);
      }
      return suggested;
    });
  }, [aggressionMax, aggressionMin, aggressionPresets, blindUnit, canBet, canRaise]);

  async function dealHand() {
    onError("");
    clearQueuedAudio();
    previousCardKeysRef.current = [];
    setDealtCardDelays({});
    setBetTarget(0);
    if (clearDealAnimationTimeoutRef.current) {
      window.clearTimeout(clearDealAnimationTimeoutRef.current);
      clearDealAnimationTimeoutRef.current = null;
    }
    setWorking(true);
    try {
      const result = await startPokerRound(ante, roomId);
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

  async function act(action: PokerAction, amount?: number) {
    if (!state?.token || stage === "showdown" || working) return;
    onError("");
    setWorking(true);
    try {
      const result = await actPokerRound(state.token, action, amount);
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

  async function handleCheckOrCall() {
    if (working) return;
    if (canCheck) {
      playCheck();
      await act("check");
      return;
    }
    if (canCall) {
      await act("call");
    }
  }

  async function handleAggression() {
    if (working || !(canBet || canRaise) || !normalizedBetTarget) return;
    await act(canRaise ? "raise" : "bet", normalizedBetTarget);
  }

  return (
    <section className="casino-table-layout">
      <div className="casino-stage">
        <div className="casino-status-strip casino-status-strip--poker">
          <article>
            <span>Solde serveur</span>
            <strong className="casino-token-inline"><img src={jetonImg} alt="" />{formatCredits(profile.wallet.balance)}</strong>
          </article>
          <article>
            <span>Blindes</span>
            <strong className="casino-token-inline"><img src={jetonImg} alt="" />{formatCredits(smallBlind)} / {formatCredits(activeAnte)}</strong>
          </article>
          <article>
            <span>Pot</span>
            <strong className="casino-token-inline"><img src={jetonImg} alt="" />{formatCredits(state?.pot || 0)}</strong>
          </article>
          <article>
            <span>Tapis hero</span>
            <strong className="casino-token-inline"><img src={jetonImg} alt="" />{formatCredits(playerChips)}</strong>
          </article>
          <article className={lastDelta >= 0 ? "tone-positive" : "tone-negative"}>
            <span>Derniere variation</span>
            <strong className="casino-token-inline"><img src={jetonImg} alt="" />{`${lastDelta >= 0 ? "+" : ""}${formatCredits(lastDelta)}`}</strong>
          </article>
        </div>

        <div className="casino-salon-strip" role="tablist" aria-label="Salons poker">
          {POKER_SALONS.map((salon) => {
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
                  setBetTarget(0);
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

        <div
          className="casino-reel-shell casino-room-shell casino-room-shell--cards"
          style={{ ["--room-art" as string]: `url("${cardArtwork}")` }}
        >
          <div className="casino-reel-shell__header">
            <div>
              <span className="casino-chip">Poker</span>
              <h2>Texas Hold'em NL</h2>
            </div>
            <p>
              {state?.message || "Cash game 5-max avec vraies decisions par street: check, call, bet, raise et fold sur le backend A11."}
              {" "}
              {activeRoom ? `Salon actif: ${POKER_SALONS.find((entry) => entry.id === activeRoom.id)?.title || activeRoom.id}.` : ""}
            </p>
          </div>

          <div className="casino-poker-street-rail" aria-label="Progression de la main">
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

          <div className="casino-card-felt casino-card-felt--poker casino-card-felt--table">
            <div className="casino-felt-table casino-felt-table--poker">
              <div className="casino-felt-table__halo" />

              {(state?.aiSeats || []).map((seat, index) => {
                const layout = POKER_SEAT_LAYOUT[index] || POKER_SEAT_LAYOUT[POKER_SEAT_LAYOUT.length - 1];
                return (
                  <article
                    key={seat.id}
                    className={`casino-oval-seat casino-oval-seat--ai casino-oval-seat--${layout.align} ${seat.isWinner ? "is-winner" : ""} ${seat.folded ? "is-folded" : ""}`}
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

              <section className="casino-table-core casino-table-core--poker">
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

              <article className={`casino-oval-seat casino-oval-seat--player ${state?.playerFolded ? "is-folded" : ""}`}>
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

          <div className="casino-poker-decision-bar">
            <div className="casino-poker-decision-bar__copy">
              <span className="casino-chip">Tour de mise</span>
              <strong>{getDecisionHeadline(state)}</strong>
              <p>{getDecisionCaption(state)}</p>
            </div>
            <div className="casino-chip-row">
              <span className="casino-chip">A payer {formatCredits(toCall)}</span>
              <span className="casino-chip">Investi {formatCredits(playerCommitted)}</span>
              <span className="casino-chip">{stage === "showdown" ? "Main closee" : state?.aggressorName ? `Ouverture ${state.aggressorName}` : "Spot checke"}</span>
            </div>
          </div>

          {(canBet || canRaise) ? (
            <div className="casino-poker-betbox">
              <div className="casino-poker-betbox__header">
                <div>
                  <span className="casino-chip">{canRaise ? "Relance" : "Mise"}</span>
                  <strong>{canRaise ? "Sizing de raise" : "Sizing d'ouverture"}</strong>
                </div>
                <b>{formatCredits(normalizedBetTarget)}</b>
              </div>
              <input
                className="casino-poker-betbox__slider"
                type="range"
                min={aggressionMin}
                max={aggressionMax}
                step={blindUnit}
                value={normalizedBetTarget}
                onChange={(event) => setBetTarget(Number(event.target.value))}
                disabled={working || !(canBet || canRaise)}
              />
              <div className="casino-bet-pills">
                {aggressionPresets.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className={`casino-bet-pill ${normalizedBetTarget === preset ? "is-active" : ""}`}
                    onClick={() => setBetTarget(preset)}
                    disabled={working}
                  >
                    {formatCredits(preset)}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="casino-action-row">
            <div className="casino-bet-pills">
              {ANTE_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className={`casino-bet-pill ${ante === preset ? "is-active" : ""}`}
                  onClick={() => setAnte(preset)}
                  disabled={((stage !== "idle" && stage !== "showdown")) || working}
                >
                  {Math.max(10, Math.round(preset / 2))}/{preset}
                </button>
              ))}
            </div>

            <div className="casino-action-row__buttons">
              <button
                type="button"
                className="casino-ghost-button"
                onClick={() => void act("fold")}
                disabled={stage === "idle" || stage === "showdown" || working}
              >
                Fold
              </button>
              <button
                type="button"
                className="casino-ghost-button"
                onClick={() => void handleCheckOrCall()}
                disabled={working || (!canCheck && !canCall)}
              >
                {canCheck ? "Check" : canCall ? `Call ${formatCredits(toCall)}` : "Check / Call"}
              </button>
              <button
                type="button"
                className="casino-primary-button"
                onClick={() => void handleAggression()}
                disabled={working || (!(canBet || canRaise)) || !normalizedBetTarget}
              >
                {canRaise ? `Raise a ${formatCredits(normalizedBetTarget)}` : canBet ? `Bet ${formatCredits(normalizedBetTarget)}` : "Bet / Raise"}
              </button>
              <button
                type="button"
                className="casino-primary-button"
                onClick={() => void dealHand()}
                disabled={working || (!(stage === "idle" || stage === "showdown")) || profile.wallet.balance < ante}
              >
                {stage === "idle" || stage === "showdown" ? "Distribuer une main" : "Main en cours"}
              </button>
            </div>
          </div>
        </div>
      </div>

      <aside className="casino-side-rail">
        <section className="casino-panel">
          <div className="casino-panel__header">
            <span className="casino-chip">Salons</span>
            <h3>Canaux rejoignables</h3>
          </div>
          <div className="casino-salon-roster">
            {POKER_SALONS.map((salon) => {
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
        </section>

        <section className="casino-panel">
          <div className="casino-panel__header">
            <span className="casino-chip">Structure</span>
            <h3>Cash game short-handed</h3>
          </div>
          <div className="casino-rule-list">
            <p>Le backend Railway gere maintenant un vrai cycle par street avec check, call, bet, raise et fold.</p>
            <p>Les sizings debitent le wallet A11 au fur et a mesure de la main, puis le pot est regle au showdown.</p>
            <p>Le front expose un slider de sizing, des presets de mise et une table 5-max beaucoup plus proche d'un site de cash game.</p>
          </div>
        </section>

        <section className="casino-panel">
          <div className="casino-panel__header">
            <span className="casino-chip">Lecture</span>
            <h3>Tour courant</h3>
          </div>
          <div className="casino-metric-list">
            <div>
              <span>Street</span>
              <strong>{stage === "idle" ? "En attente" : STREET_LABELS[state?.stage || "preflop"].title}</strong>
            </div>
            <div>
              <span>Pot courant</span>
              <strong>{formatCredits(state?.pot || 0)}</strong>
            </div>
            <div>
              <span>A payer</span>
              <strong>{formatCredits(toCall)}</strong>
            </div>
            <div>
              <span>Tapis hero</span>
              <strong>{formatCredits(playerChips)}</strong>
            </div>
          </div>
        </section>

        <section className="casino-panel">
          <div className="casino-panel__header">
            <span className="casino-chip">Historique</span>
            <h3>Dernieres actions</h3>
          </div>
          <div className="casino-rule-list">
            {(state?.actionLog || []).length ? (
              [...(state?.actionLog || [])].slice(-6).reverse().map((entry, index) => (
                <p key={`${entry}-${index}`}>{entry}</p>
              ))
            ) : (
              <p>Les actions de la main s'afficheront ici des que le coup demarre.</p>
            )}
          </div>
        </section>

        <section className="casino-panel">
          <div className="casino-panel__header">
            <span className="casino-chip">Salon actif</span>
            <h3>Joueurs presents</h3>
          </div>
          <div className="casino-prize-stack">
            {(activeRoom?.participants || []).length ? (
              activeRoom?.participants.map((participant) => (
                <article key={participant.userId} className="casino-prize-card">
                  <div className="casino-prize-card__glyph">♠</div>
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
        </section>
      </aside>
    </section>
  );
}
