import * as React from "react";
import { useEffect, useRef, useState } from "react";
import { useTableAudio } from "./audio/useTableAudio";
import PokerSidebar from "./features/poker/components/PokerSidebar";
import PokerTableScene from "./features/poker/components/PokerTableScene";
import jetonImg from "./images/jeton.png";
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
const STREET_ORDER = ["preflop", "flop", "turn", "river", "showdown"] as const;
const TABLE_DEAL_STEP_MS = 92;

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
  const [ante, setAnte] = useState(ANTE_PRESETS[1]);
  const [state, setState] = useState<PokerState | null>(null);
  const [working, setWorking] = useState(false);
  const [roomId, setRoomId] = useState(POKER_SALONS[0].id);
  const [rooms, setRooms] = useState<CasinoTableRoom[]>([]);
  const [infoTab, setInfoTab] = useState<"journal" | "lecture" | "salons" | "joueurs">("journal");
  const [dealtCardDelays, setDealtCardDelays] = useState<Record<string, number>>({});
  const [betTarget, setBetTarget] = useState(0);

  const previousCardKeysRef = useRef<string[]>([]);
  const clearDealAnimationTimeoutRef = useRef<number | null>(null);
  const { clearQueuedAudio, playCardBurst, playCheck } = useTableAudio(mediaReady);

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

  return (
    <section className="casino-table-layout casino-table-layout--compact casino-table-layout--cards">
      <div className="casino-stage casino-stage--cards">
        <div className="casino-room-hud casino-room-hud--poker">
          <div className="casino-room-hud__lead">
            <img className="casino-room-hud__portrait" src={pokerCaptainArt} alt="" aria-hidden="true" />
            <div className="casino-room-hud__identity">
              <span className="casino-chip">Poker ATS</span>
              <strong>Texas Hold'em NL</strong>
              <p>
                {state?.message || "Table pirate premium plus sobre, plus tendue, avec vraies decisions de cash game par street."}
                {" "}
                {activeRoom ? `Salon actif: ${POKER_SALONS.find((entry) => entry.id === activeRoom.id)?.title || activeRoom.id}.` : ""}
              </p>
            </div>
          </div>

          <div className="casino-status-strip casino-status-strip--compact casino-status-strip--poker-compact">
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

          <div className="casino-salon-strip casino-salon-strip--compact" role="tablist" aria-label="Salons poker">
            {POKER_SALONS.map((salon) => {
              const room = rooms.find((entry) => entry.id === salon.id);
              return (
                <button
                  key={salon.id}
                  type="button"
                  className={`casino-salon-pill ${salon.id === roomId ? "is-active" : ""}`}
                  onClick={() => {
                    if (roomSwitchLocked || working) return;
                    resetTableVisualState();
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
          className="casino-reel-shell casino-room-shell casino-room-shell--cards casino-reel-shell--table-compact casino-reel-shell--poker"
          style={{ ["--room-art" as string]: `url("${pokerCaptainArt}")` }}
        >
          <PokerTableScene
            state={state}
            stage={stage}
            playerName={playerName}
            activeAnte={activeAnte}
            smallBlind={smallBlind}
            isDecisionPhase={isDecisionPhase}
            currentStreetIndex={currentStreetIndex}
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
            onBetTargetChange={setBetTarget}
            onFold={() => void act("fold")}
            onCheckOrCall={() => void handleCheckOrCall()}
            onAggression={() => void handleAggression()}
            onDeal={() => void dealHand()}
          />
        </div>
      </div>
    </section>
  );
}
