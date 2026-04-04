import * as React from "react";
import { useEffect, useRef, useState } from "react";
import { useTableAudio } from "./audio/useTableAudio";
import { ROOM_DEFINITIONS } from "./features/casino/catalog";
import PokerSidebar from "./features/poker/components/PokerSidebar";
import PokerTableScene from "./features/poker/components/PokerTableScene";
import pokerCaptainArt from "./images/poker-captain-art.png";
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
const TABLE_DEAL_STEP_MS = 92;
const LIVE_MIN_PLAYERS = 2;

type PokerAction = "reveal" | "showdown" | "check" | "call" | "bet" | "raise" | "fold";

type PokerRoomProps = {
  playerName: string;
  profile: CasinoProfile;
  mediaReady: boolean;
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

export default function PokerRoom({
  playerName,
  profile,
  mediaReady,
  onProfileChange,
  onError,
}: PokerRoomProps) {
  const pokerRoomMeta = ROOM_DEFINITIONS.find((roomEntry) => roomEntry.id === "poker");
  const [ante, setAnte] = useState(ANTE_PRESETS[1]);
  const [state, setState] = useState<PokerState | null>(null);
  const [working, setWorking] = useState(false);
  const [roomId, setRoomId] = useState(POKER_SALONS[0].id);
  const [rooms, setRooms] = useState<CasinoTableRoom[]>([]);
  const [infoTab, setInfoTab] = useState<"journal" | "lecture" | "salons" | "joueurs">("journal");
  const [showRoomInfo, setShowRoomInfo] = useState(false);
  const [activeHeaderInfo, setActiveHeaderInfo] = useState<"structure" | "mises" | "live">("structure");
  const [dealtCardDelays, setDealtCardDelays] = useState<Record<string, number>>({});
  const [betTarget, setBetTarget] = useState(0);

  const previousCardKeysRef = useRef<string[]>([]);
  const clearDealAnimationTimeoutRef = useRef<number | null>(null);
  const { clearQueuedAudio, playCardBurst, playCheck } = useTableAudio(mediaReady);

  const stage = state?.stage || "idle";
  const lastDelta = state?.lastDelta || 0;
  const roomSwitchLocked = !(stage === "idle" || stage === "showdown");
  const activeRoom = rooms.find((entry) => entry.id === roomId) || null;
  const activePlayerCount = activeRoom?.playerCount || 0;
  const isLiveMultiplayerReady = activePlayerCount >= LIVE_MIN_PLAYERS;
  const activeAnte = state?.ante || ante;
  const smallBlind = Math.max(10, Math.round(activeAnte / 2));
  const blindUnit = Math.max(10, Math.round(activeAnte / 2));
  const communityCards = state?.communityCards || [];
  const toCall = state?.toCall || 0;
  const isDecisionPhase = Boolean(state && stage !== "showdown" && !state.playerFolded);
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
    if (!isLiveMultiplayerReady) {
      onError("Mode multijoueur: en attente d'au moins un autre joueur sur ce salon.");
      return;
    }
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

  function resetTableVisualState() {
    clearQueuedAudio();
    previousCardKeysRef.current = [];
    setDealtCardDelays({});
    setBetTarget(0);
    if (clearDealAnimationTimeoutRef.current) {
      window.clearTimeout(clearDealAnimationTimeoutRef.current);
      clearDealAnimationTimeoutRef.current = null;
    }
  }

  function handleRoomChange(nextRoomId: string) {
    if (roomSwitchLocked || working || nextRoomId === roomId) return;
    resetTableVisualState();
    setState(null);
    setRoomId(nextRoomId);
  }

  return (
    <section className="casino-table-layout casino-table-layout--compact casino-table-layout--cards">
      <div className="casino-stage casino-stage--cards casino-stage--cards--poker">
        <div
          className="casino-card-fused-stage casino-card-fused-stage--poker"
          style={{ ["--room-art" as string]: `url("${pokerCaptainArt}")` }}
        >
          <div className="casino-room-hud casino-room-hud--poker">
            <div className="casino-room-hud__lead">
              <img className="casino-room-hud__portrait" src={pokerCaptainArt} alt="" aria-hidden="true" />
              <div className="casino-room-hud__identity">
                <div className="casino-topdeck__chip-row">
                  <span className="casino-chip">{pokerRoomMeta?.chip || "Salon hold'em"}</span>
                  <button
                    type="button"
                    className={`casino-ghost-button casino-topdeck__info-toggle ${showRoomInfo ? "is-open" : ""}`}
                    onClick={() => setShowRoomInfo((value) => !value)}
                    aria-label="Informations poker"
                    aria-expanded={showRoomInfo}
                  >
                    <span className="casino-button-icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24">
                        <path d="M4 7h16" />
                        <path d="M4 12h16" />
                        <path d="M4 17h16" />
                      </svg>
                    </span>
                  </button>
                </div>
                <strong>{pokerRoomMeta?.title || "Texas hold'em rapide"}</strong>
                <p>
                  {state?.message || "Table pirate premium plus sobre, plus tendue, avec vraies decisions de cash game par street."}
                  {" "}
                  {activeRoom ? `Salon actif: ${POKER_SALONS.find((entry) => entry.id === activeRoom.id)?.title || activeRoom.id}.` : ""}
                </p>
              </div>
            </div>

            {showRoomInfo ? (
              <article className="casino-topdeck__info-panel" aria-label="Informations poker">
                <div className="casino-topdeck__info-buttons" role="tablist" aria-label="Sections poker">
                  <button
                    type="button"
                    role="tab"
                    className={`casino-topdeck__info-button ${activeHeaderInfo === "structure" ? "is-active" : ""}`}
                    aria-selected={activeHeaderInfo === "structure"}
                    onClick={() => setActiveHeaderInfo("structure")}
                  >
                    Structure
                  </button>
                  <button
                    type="button"
                    role="tab"
                    className={`casino-topdeck__info-button ${activeHeaderInfo === "mises" ? "is-active" : ""}`}
                    aria-selected={activeHeaderInfo === "mises"}
                    onClick={() => setActiveHeaderInfo("mises")}
                  >
                    Mises
                  </button>
                  <button
                    type="button"
                    role="tab"
                    className={`casino-topdeck__info-button ${activeHeaderInfo === "live" ? "is-active" : ""}`}
                    aria-selected={activeHeaderInfo === "live"}
                    onClick={() => setActiveHeaderInfo("live")}
                  >
                    Live
                  </button>
                </div>
                <div className="casino-topdeck__info-body" role="tabpanel">
                  {activeHeaderInfo === "structure" ? (
                    <div className="casino-rule-list">
                      <p>Texas hold'em rapide avec preflop, flop, turn, river et showdown.</p>
                      <p>Le backend gere les vraies decisions de check, call, bet, raise et fold.</p>
                      <p>Le journal detaille et la lecture du spot restent disponibles dans le dock de table.</p>
                    </div>
                  ) : null}
                  {activeHeaderInfo === "mises" ? (
                    <div className="casino-metric-list">
                      <div>
                        <span>Ante presets</span>
                        <strong>60 / 120 / 200 / 320</strong>
                      </div>
                      <div>
                        <span>Blind unit</span>
                        <strong>{formatCredits(blindUnit)}</strong>
                      </div>
                      <div>
                        <span>A payer</span>
                        <strong>{formatCredits(toCall)}</strong>
                      </div>
                      <div>
                        <span>Pot</span>
                        <strong>{formatCredits(state?.pot || 0)}</strong>
                      </div>
                    </div>
                  ) : null}
                  {activeHeaderInfo === "live" ? (
                    <div className="casino-rule-list">
                      <p>Le salon doit compter au moins 2 joueurs pour distribuer une main.</p>
                      <p>Table en cours: {activeRoom ? POKER_SALONS.find((entry) => entry.id === activeRoom.id)?.title || activeRoom.id : "Aucune"}</p>
                      <p>Joueurs presents: {activePlayerCount}</p>
                    </div>
                  ) : null}
                </div>
              </article>
            ) : null}

            <div className="casino-salon-strip casino-salon-strip--compact" role="tablist" aria-label="Salons poker">
              {POKER_SALONS.map((salon) => {
                const room = rooms.find((entry) => entry.id === salon.id);
                return (
                  <button
                    key={salon.id}
                    type="button"
                    className={`casino-salon-pill ${salon.id === roomId ? "is-active" : ""}`}
                    onClick={() => handleRoomChange(salon.id)}
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

          <div className="casino-reel-shell casino-room-shell casino-room-shell--cards casino-reel-shell--table-compact casino-reel-shell--poker">
            <PokerTableScene
              state={state}
              stage={stage}
              playerName={playerName}
              activeAnte={activeAnte}
              smallBlind={smallBlind}
              isDecisionPhase={isDecisionPhase}
              dealtCardDelays={dealtCardDelays}
            />

            <PokerSidebar
              profile={profile}
              state={state}
              stage={stage}
              working={working}
              roomId={roomId}
              rooms={rooms}
              infoTab={infoTab}
              isDecisionPhase={isDecisionPhase}
              roomSwitchLocked={roomSwitchLocked}
              ante={ante}
              playerChips={playerChips}
              playerCommitted={playerCommitted}
              playerStreetCommitted={playerStreetCommitted}
              toCall={toCall}
              canCheck={canCheck}
              canCall={canCall}
              canBet={canBet}
              canRaise={canRaise}
              normalizedBetTarget={normalizedBetTarget}
              aggressionMin={aggressionMin}
              aggressionMax={aggressionMax}
              blindUnit={blindUnit}
              aggressionPresets={aggressionPresets}
              onAnteChange={setAnte}
              onInfoTabChange={setInfoTab}
              onRoomChange={handleRoomChange}
              onBetTargetChange={setBetTarget}
              onFold={() => void act("fold")}
              onCheckOrCall={() => void handleCheckOrCall()}
              onAggression={() => void handleAggression()}
              onDeal={() => void dealHand()}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
