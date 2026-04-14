import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTableAudio } from "./audio/useTableAudio";
import { ROOM_DEFINITIONS } from "./features/casino/catalog";
import PokerSidebar from "./features/poker/components/PokerSidebar";
import PokerTableScene from "./features/poker/components/PokerTableScene";
import pokerCaptainArt from "./images/poker-captain-art.png";
import {
  actPokerRound,
  fetchPokerRoomState,
  joinPokerRoom,
  leaveCasinoTableRoom,
  removeAbsentPokerSeat,
  startPokerRound,
  type CasinoTableRoom,
  type CasinoTableRoomParticipant,
  type CasinoProfile,
  type PokerState,
} from "./lib/casinoApi";
import { formatCredits } from "./lib/casinoRoomState";
import {
  readTableChannelSnapshot,
  readSyncedTableSelection,
  subscribeTableChannel,
  subscribeSyncedTableSelection,
  writeTableLobbySnapshot,
  writeSyncedTableSelection,
  writeTableChannelSnapshot,
} from "./lib/tableChannelSync";
import { POKER_SALONS, getTableChannelDisplayMeta } from "./lib/tableSalons";

const TABLE_DEAL_STEP_MS = 92;
const LIVE_MIN_OPPONENTS = 1;
const LIVE_ROOM_POLL_INTERVAL_MS = 4000;
const LIVE_ROOM_LOBBY_SYNC_INTERVAL_MS = 20_000;
const POKER_MAX_PLAYERS = 6;
const DEFAULT_POKER_PRESENCE_WINDOW_MS = 75_000;
const POKER_SHOWDOWN_REVEAL_MS = 8_000;

type PokerAction = "check" | "call" | "bet" | "raise" | "fold";

type PokerLastHandRecapWinner = {
  id: string;
  name: string;
  handLabel: string;
  amount: number;
  isSelf: boolean;
};

type PokerLastHandRecap = {
  handId: string;
  resolvedAt: number;
  message: string;
  winners: PokerLastHandRecapWinner[];
  heroHandLabel: string;
  actionLog: string[];
};

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

function isActivePokerHandStage(value: string | null | undefined): value is Exclude<PokerState["stage"], "waiting" | "showdown"> {
  return value === "preflop" || value === "flop" || value === "turn" || value === "river";
}

function findPokerSelfSeat(state: PokerState | null, currentUserId: string, playerName: string) {
  const normalizedSelfSeatId = normalizeIdentity(state?.selfSeatId);
  const normalizedCurrentUserId = normalizeIdentity(currentUserId);
  const normalizedPlayerName = normalizeIdentity(playerName);
  const candidates = [...(state?.seats || []), ...(state?.aiSeats || [])];

  return (
    candidates.find((seat) => {
      const seatId = normalizeIdentity(seat.id);
      const seatUserId = normalizeIdentity(seat.userId);
      const seatName = normalizeIdentity(seat.name || seat.username);

      return Boolean(
        seat.isSelf
        || (normalizedSelfSeatId && seatId === normalizedSelfSeatId)
        || (normalizedCurrentUserId && (seatId === normalizedCurrentUserId || seatUserId === normalizedCurrentUserId))
        || (normalizedPlayerName && seatName === normalizedPlayerName),
      );
    }) || null
  );
}

function hasPokerPendingSeat(state: PokerState | null, currentUserId: string, playerName: string) {
  const normalizedCurrentUserId = normalizeIdentity(currentUserId);
  const normalizedPlayerName = normalizeIdentity(playerName);

  return Boolean(
    state?.pendingSeats?.some((seat) => {
      const seatUserId = normalizeIdentity(seat.userId);
      const seatName = normalizeIdentity(seat.username);
      return Boolean(
        (normalizedCurrentUserId && seatUserId === normalizedCurrentUserId)
        || (normalizedPlayerName && seatName === normalizedPlayerName),
      );
    }),
  );
}

function hasPokerHeroRound(state: PokerState | null, currentUserId: string, playerName: string) {
  if (!state) return false;
  if (state.playerCards.length || state.playerChips > 0 || state.playerCommitted > 0 || state.playerStreetCommitted > 0) {
    return true;
  }
  if (findPokerSelfSeat(state, currentUserId, playerName)) {
    return true;
  }
  return hasPokerPendingSeat(state, currentUserId, playerName);
}

function isPokerSpectatorRound(state: PokerState | null, currentUserId: string, playerName: string) {
  if (!state?.token || !state.roomId) return false;
  return !hasPokerHeroRound(state, currentUserId, playerName);
}

function isPokerSelfTurn(state: PokerState | null, currentUserId: string, playerName: string) {
  if (!state || !state.token || !isActivePokerHandStage(state.stage) || state.playerFolded) {
    return false;
  }

  const selfSeat = findPokerSelfSeat(state, currentUserId, playerName);
  const selfSeatId = normalizeIdentity(selfSeat?.id || selfSeat?.userId || state.selfSeatId);
  const activeSeatId = normalizeIdentity(state.activeSeatId);
  if (selfSeatId && activeSeatId) {
    return selfSeatId === activeSeatId;
  }

  if (selfSeat?.isActive) {
    return true;
  }

  return Boolean(hasPokerHeroRound(state, currentUserId, playerName) && state.legalActions.length);
}

function getPokerShowdownReplayKey(state: PokerState | null) {
  if (!state || state.stage !== "showdown") return "";
  const roomKey = String(state.roomId || "").trim();
  const handId = Number(state.handId || 0);
  if (!roomKey && !handId) return "";
  return `${roomKey || "room"}:${handId || 0}`;
}

function buildPokerLastHandRecap(state: PokerState | null, currentUserId: string, playerName: string): PokerLastHandRecap | null {
  const replayKey = getPokerShowdownReplayKey(state);
  if (!replayKey) return null;

  const selfSeat = findPokerSelfSeat(state, currentUserId, playerName);
  const normalizedSelfSeatId = normalizeIdentity(selfSeat?.id || selfSeat?.userId || state.selfSeatId);
  const normalizedPlayerName = normalizeIdentity(playerName);
  const heroName = String(playerName || selfSeat?.name || selfSeat?.username || "Toi").trim();
  const heroHandLabel = state.playerHand?.label || selfSeat?.hand?.label || "";
  const heroAmount = Number(state.lastDelta || state.payoutAmount || 0);
  const heroWon = Boolean(selfSeat?.isWinner || heroAmount > 0);
  const winners: PokerLastHandRecapWinner[] = [];

  if (heroWon) {
    winners.push({
      id: normalizedSelfSeatId || normalizedPlayerName || "self",
      name: heroName,
      handLabel: heroHandLabel || "Main gagnante",
      amount: heroAmount,
      isSelf: true,
    });
  }

  const seenSeatIds = new Set<string>(winners.map((winner) => winner.id));
  [...(state.seats || []), ...(state.aiSeats || [])].forEach((seat) => {
    const seatId = normalizeIdentity(seat.id || seat.userId || seat.name || seat.username);
    const seatName = String(seat.name || seat.username || "Joueur").trim();
    const seatHandLabel = seat.hand?.label || seat.read || "";
    const seatAmount = Number(seat.lastDelta || seat.payoutAmount || 0);
    const isSeatSelf = Boolean(
      seat.isSelf
      || (normalizedSelfSeatId && seatId === normalizedSelfSeatId)
      || (normalizedPlayerName && normalizeIdentity(seatName) === normalizedPlayerName),
    );

    if (!seatId || seenSeatIds.has(seatId) || !seat.isWinner || isSeatSelf) {
      return;
    }

    seenSeatIds.add(seatId);
    winners.push({
      id: seatId,
      name: seatName,
      handLabel: seatHandLabel || "Main gagnante",
      amount: seatAmount,
      isSelf: false,
    });
  });

  return {
    handId: String(state.handId || replayKey),
    resolvedAt: Date.now(),
    message: state.message || "Main terminee.",
    winners,
    heroHandLabel,
    actionLog: [...(state.actionLog || [])].slice(-8),
  };
}

function buildPokerSyncSignature(state: PokerState | null, currentUserId: string, playerName: string) {
  if (!state?.token) return "";
  return JSON.stringify({
    token: state.token,
    roomId: state.roomId || null,
    stage: state.stage,
    bettingClosesAt: state.bettingClosesAt || null,
    selfSeatId: state.selfSeatId || null,
    activeSeatId: state.activeSeatId || null,
    pot: state.pot,
    currentBet: state.currentBet,
    toCall: state.toCall,
    playerFolded: state.playerFolded,
    playerCards: state.playerCards.map((card) => card.id),
    playerChips: state.playerChips,
    playerCommitted: state.playerCommitted,
    communityCards: state.communityCards.map((card) => card.id),
    aiSeats: state.aiSeats.map((seat) => ({
      id: seat.id,
      folded: Boolean(seat.folded),
      lastAction: seat.lastAction || "",
      committed: seat.totalCommitted || 0,
      cards: seat.cards.map((card) => card.id),
      winner: seat.isWinner,
      absent: Boolean(seat.isAbsent),
    })),
    pendingSeats: (state.pendingSeats || []).map((seat) => `${seat.userId}:${seat.username}:${seat.ante}:${seat.readyAt || ""}`),
    legalActions: state.legalActions,
    isSpectating: isPokerSpectatorRound(state, currentUserId, playerName),
    actionLogSize: state.actionLog.length,
    lastDelta: state.lastDelta,
  });
}

function formatTurnClock(remainingMs: number) {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function parseTableDeadline(value: string | null | undefined) {
  const timestamp = Date.parse(String(value || ""));
  return Number.isFinite(timestamp) ? timestamp : null;
}

function getPokerPhaseDeadlineAt(state: PokerState | null) {
  if (!state) return null;
  if (state.stage === "waiting") {
    return parseTableDeadline(state.bettingClosesAt);
  }
  return parseTableDeadline(state.turnDeadlineAt);
}

function normalizeIdentity(value: string | number | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

function isPokerParticipantSelf(
  participant: Pick<CasinoTableRoomParticipant, "userId" | "username">,
  profile: CasinoProfile,
  playerName: string,
) {
  const participantId = normalizeIdentity(participant.userId);
  const participantName = normalizeIdentity(participant.username);
  const selfId = normalizeIdentity(profile.user.id);
  const selfUsername = normalizeIdentity(profile.user.username);
  const selfDisplayName = normalizeIdentity(playerName);

  return Boolean(
    (participantId && participantId === selfId)
    || (participantName && participantName === selfUsername)
    || (participantName && participantName === selfDisplayName),
  );
}

function isParticipantFresh(updatedAt: string | null, presenceWindowMs: number) {
  if (!updatedAt) return true;
  const heartbeatAt = Date.parse(updatedAt);
  if (Number.isNaN(heartbeatAt)) return true;
  return Date.now() - heartbeatAt <= Math.max(10_000, Number(presenceWindowMs) || DEFAULT_POKER_PRESENCE_WINDOW_MS);
}

export default function PokerRoom({
  playerName,
  profile,
  mediaReady,
  onProfileChange,
  onError,
}: PokerRoomProps) {
  const pokerRoomMeta = ROOM_DEFINITIONS.find((roomEntry) => roomEntry.id === "poker");
  const [ante] = useState(20);
  const [state, setState] = useState<PokerState | null>(null);
  const [working, setWorking] = useState(false);
  const [roomId, setRoomId] = useState(() => readSyncedTableSelection("poker") || POKER_SALONS[0].id);
  const [rooms, setRooms] = useState<CasinoTableRoom[]>([]);
  const [infoTab, setInfoTab] = useState<"journal" | "lecture" | "salons" | "joueurs">("journal");
  const [showRoomInfo, setShowRoomInfo] = useState(false);
  const [activeHeaderInfo, setActiveHeaderInfo] = useState<"structure" | "mises" | "historique">("structure");
  const [dealtCardDelays, setDealtCardDelays] = useState<Record<string, number>>({});
  const [betTarget, setBetTarget] = useState(0);
  const [turnDeadlineAt, setTurnDeadlineAt] = useState<number | null>(null);
  const [removingAbsentUserId, setRemovingAbsentUserId] = useState<string | null>(null);
  const [showdownReplayState, setShowdownReplayState] = useState<PokerState | null>(null);
  const [lastResolvedHand, setLastResolvedHand] = useState<PokerLastHandRecap | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [isDocumentVisible, setIsDocumentVisible] = useState(() => {
    if (typeof document === "undefined") return true;
    return document.visibilityState !== "hidden";
  });
  const displayState = useMemo<PokerState | null>(() => {
    return showdownReplayState || state;
  }, [showdownReplayState, state]);

  const previousCardKeysRef = useRef<string[]>([]);
  const clearDealAnimationTimeoutRef = useRef<number | null>(null);
  const clearShowdownReplayTimeoutRef = useRef<number | null>(null);
  const lastShowdownReplayKeyRef = useRef("");
  const latestAppliedSyncAtRef = useRef(0);
  const latestStateRef = useRef<PokerState | null>(state);
  const latestRoomsRef = useRef<CasinoTableRoom[]>(rooms);
  const lastLobbySyncAtRef = useRef(0);
  const skipNextSyncPublishRef = useRef(false);
  const lastTurnSignatureRef = useRef("");
  const lastTimedOutSignatureRef = useRef("");
  const lastExpiredSyncSignatureRef = useRef("");
  const onErrorRef = useRef(onError);
  const { clearQueuedAudio, playCardBurst, playCheck } = useTableAudio(mediaReady);

  const stage = state?.stage || "idle";
  const displayStage = displayState?.stage || "idle";
  const lastDelta = state?.lastDelta || 0;
  const isSpectatingRound = isPokerSpectatorRound(state, profile.user.id, playerName);
  const hasPendingSeat = hasPokerPendingSeat(state, profile.user.id, playerName);
  const availableRooms = useMemo(() => {
    if (rooms.length) return rooms;
    return [
      {
        id: roomId,
        playerCount: 0,
        participants: [],
        isCurrent: true,
        hasSelf: true,
      },
    ] satisfies CasinoTableRoom[];
  }, [roomId, rooms]);
  const activeRoom = availableRooms.find((entry) => entry.id === roomId) || availableRooms[0] || null;
  const activeRoomIndex = Math.max(0, availableRooms.findIndex((entry) => entry.id === (activeRoom?.id || roomId)));
  const activeChannelMeta = getTableChannelDisplayMeta("poker", activeRoom?.id || roomId, activeRoomIndex);
  const presenceWindowMs = Math.max(10_000, Number(state?.presenceWindowMs || 0) || DEFAULT_POKER_PRESENCE_WINDOW_MS);
  const tableParticipants = useMemo<Array<CasinoTableRoomParticipant & { isSelf: boolean }>>(() => {
    const deduped = new Map<string, CasinoTableRoomParticipant & { isSelf: boolean }>();

    [...(activeRoom?.participants || []), ...(state?.roomParticipants || [])].forEach((participant) => {
      const dedupeKey = normalizeIdentity(participant.userId) || normalizeIdentity(participant.username);
      const isSelf = isPokerParticipantSelf(participant, profile, playerName);
      deduped.set(dedupeKey, {
        ...participant,
        isSelf,
      });
    });

    const selfKey = normalizeIdentity(profile.user.id) || normalizeIdentity(playerName) || normalizeIdentity(profile.user.username);

    if (!deduped.has(selfKey)) {
      deduped.set(selfKey, {
        userId: profile.user.id,
        username: String(playerName || profile.user.username || "Toi").trim(),
        updatedAt: null,
        isSelf: true,
      });
    }

    return [...deduped.values()];
  }, [activeRoom?.participants, playerName, profile.user.id, profile.user.username, state?.roomParticipants]);
  const activePlayerCount = Math.max(activeRoom?.playerCount || 0, tableParticipants.length);
  const connectedOpponentCount = tableParticipants.filter(
    (participant) => !participant.isSelf && isParticipantFresh(participant.updatedAt, presenceWindowMs),
  ).length;
  const lastResolvedWinnersLabel = lastResolvedHand?.winners.length
    ? lastResolvedHand.winners.map((winner) => winner.name).join(", ")
    : "";
  const isLiveMultiplayerReady = connectedOpponentCount >= LIVE_MIN_OPPONENTS;
  const roomHasSelf = Boolean(activeRoom?.hasSelf || tableParticipants.some((participant) => participant.isSelf));
  const isTableFull = activePlayerCount >= POKER_MAX_PLAYERS && !roomHasSelf;
  const activeAnte = state?.ante || ante;
  const smallBlind = Math.max(10, Math.round(activeAnte / 2));
  const blindUnit = Math.max(20, Math.round(activeAnte));
  const communityCards = state?.communityCards || [];
  const toCall = state?.toCall || 0;
  const isDecisionPhase = isPokerSelfTurn(state, profile.user.id, playerName);
  const selfSeat = findPokerSelfSeat(state, profile.user.id, playerName);
  const queuedForNextHand = Boolean(hasPendingSeat && !selfSeat && !(state?.playerCards?.length));
  const playerChips = state?.playerChips || 0;
  const playerCommitted = state?.playerCommitted || activeAnte;
  const playerStreetCommitted = state?.playerStreetCommitted || 0;
  const canFold = Boolean(state?.legalActions.includes("fold"));
  const canCheck = Boolean(state?.legalActions.includes("check"));
  const canCall = Boolean(state?.legalActions.includes("call"));
  const canBet = Boolean(state?.legalActions.includes("bet"));
  const canRaise = Boolean(state?.legalActions.includes("raise"));
  const aggressionMin = canRaise ? state?.minRaiseTo || 0 : canBet ? state?.minBet || 0 : 0;
  const aggressionMax = state ? playerStreetCommitted + playerChips : 0;
  const normalizedBetTarget =
    canBet || canRaise ? normalizeAggressionTarget(betTarget || aggressionMin, aggressionMin, aggressionMax, blindUnit) : 0;
  const turnCountdownMs = turnDeadlineAt ? Math.max(0, turnDeadlineAt - nowTick) : 0;
  const isTurnClockStale = Boolean(turnDeadlineAt && nowTick - turnDeadlineAt > 6_000);
  const canSoftUnlockExpiredRound = Boolean(turnDeadlineAt && nowTick - turnDeadlineAt > 12_000);
  const turnCountdownLabel = turnDeadlineAt ? (isTurnClockStale ? "Attente" : formatTurnClock(turnCountdownMs)) : "--:--";
  const turnTimerAriaLabel = turnDeadlineAt
    ? isTurnClockStale
      ? "Resynchronisation de la table poker"
      : `${stage === "waiting" ? "Fin de mise" : "Temps restant"} ${turnCountdownLabel}`
    : "Timer de table en attente";
  const roomSwitchLocked = !isSpectatingRound && !canSoftUnlockExpiredRound && !(stage === "idle" || stage === "waiting" || stage === "showdown");

  function applySyncedState(nextState: PokerState | null, syncedAt: number, nextDeadlineAt: number | null) {
    if (!nextState) return;
    if (syncedAt <= latestAppliedSyncAtRef.current) return;
    latestAppliedSyncAtRef.current = syncedAt;
    skipNextSyncPublishRef.current = true;
    setState(nextState);
    setTurnDeadlineAt(nextDeadlineAt);
  }

  useEffect(() => {
    latestStateRef.current = state;
  }, [state]);

  useEffect(() => {
    latestRoomsRef.current = rooms;
  }, [rooms]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  async function refreshPokerLobby(targetRoomId: string) {
    const result = await joinPokerRoom(targetRoomId);
    setRooms(result.rooms);
    lastLobbySyncAtRef.current = Date.now();

    const joinedRoomId = String(result.joinedRoomId || targetRoomId).trim() || targetRoomId;
    if (joinedRoomId && joinedRoomId !== roomId) {
      setRoomId(joinedRoomId);
    }

    return {
      joinedRoomId,
      rooms: result.rooms,
    };
  }

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNowTick(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;

    function updateVisibility() {
      setIsDocumentVisible(document.visibilityState !== "hidden");
    }

    updateVisibility();
    document.addEventListener("visibilitychange", updateVisibility);
    window.addEventListener("focus", updateVisibility);

    return () => {
      document.removeEventListener("visibilitychange", updateVisibility);
      window.removeEventListener("focus", updateVisibility);
    };
  }, []);

  useEffect(() => {
    async function releasePresence(keepalive = false) {
      try {
        await leaveCasinoTableRoom("poker", roomId, { keepalive });
      } catch {
        // Best effort only: tab-based presence should not crash the table UI.
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") {
        void releasePresence(true);
      }
    }

    function handlePageHide() {
      void releasePresence(true);
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageHide);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
      void releasePresence(true);
    };
  }, [roomId]);

  useEffect(() => {
    latestAppliedSyncAtRef.current = 0;
    lastLobbySyncAtRef.current = 0;
    skipNextSyncPublishRef.current = false;
    lastTurnSignatureRef.current = "";
    lastTimedOutSignatureRef.current = "";
    lastExpiredSyncSignatureRef.current = "";
    lastShowdownReplayKeyRef.current = "";
    setTurnDeadlineAt(null);
    setShowdownReplayState(null);
    setLastResolvedHand(null);
    if (clearShowdownReplayTimeoutRef.current) {
      window.clearTimeout(clearShowdownReplayTimeoutRef.current);
      clearShowdownReplayTimeoutRef.current = null;
    }
  }, [roomId]);

  useEffect(() => {
    if (!turnDeadlineAt || turnDeadlineAt > nowTick) {
      lastExpiredSyncSignatureRef.current = "";
    }
  }, [nowTick, roomId, turnDeadlineAt]);

  useEffect(() => {
    writeSyncedTableSelection("poker", roomId);
  }, [roomId]);

  useEffect(() => {
    if (!rooms.length) return;

    writeTableLobbySnapshot({
      game: "poker",
      joinedRoomId: roomId,
      syncedAt: Date.now(),
      rooms,
    });
  }, [roomId, rooms]);

  useEffect(() => {
    return subscribeSyncedTableSelection("poker", (nextRoomId) => {
      if (!nextRoomId || nextRoomId === roomId || roomSwitchLocked || working) return;
      resetTableVisualState();
      setState(null);
      setRoomId(nextRoomId);
    });
  }, [roomId, roomSwitchLocked, working]);

  useEffect(() => {
    if (!isDocumentVisible) {
      return undefined;
    }

    let cancelled = false;
    let syncing = false;

    async function syncRoom(forceLobbySync = false) {
      if (syncing) return;
      syncing = true;
      let joinedRoomId = roomId;
      let lobbyError: Error | null = null;
      try {
        const currentState = latestStateRef.current;
        const shouldRefreshLobby = forceLobbySync
          || !latestRoomsRef.current.length
          || (Date.now() - lastLobbySyncAtRef.current) >= LIVE_ROOM_LOBBY_SYNC_INTERVAL_MS;

        if (shouldRefreshLobby) {
          try {
            const result = await joinPokerRoom(roomId);
            if (cancelled) return;
            setRooms(result.rooms);
            lastLobbySyncAtRef.current = Date.now();
            joinedRoomId = String(result.joinedRoomId || roomId).trim() || roomId;
            if (joinedRoomId && joinedRoomId !== roomId) {
              setRoomId(joinedRoomId);
            }
          } catch (error_) {
            if (error_ instanceof Error) {
              lobbyError = error_;
            } else {
              lobbyError = new Error("Le salon poker ne repond pas.");
            }
          }
        }

        try {
          const sharedState = await fetchPokerRoomState(joinedRoomId);
          if (cancelled || !sharedState) return;
          if (
            hasPokerHeroRound(currentState, profile.user.id, playerName)
            && !hasPokerHeroRound(sharedState, profile.user.id, playerName)
          ) {
            return;
          }
          applySyncedState(sharedState, Date.now(), getPokerPhaseDeadlineAt(sharedState));
          return;
        } catch (syncError) {
          if (cancelled) return;
          if (!lobbyError && syncError instanceof Error) {
            lobbyError = syncError;
          }
        }

        const snapshot = readTableChannelSnapshot<PokerState>("poker", joinedRoomId);
        if (!cancelled && snapshot?.state) {
          applySyncedState(snapshot.state, snapshot.syncedAt, snapshot.turnDeadlineAt);
          return;
        }

        if (!cancelled && lobbyError) {
          onErrorRef.current(lobbyError.message);
        }
      } catch (error_) {
        if (cancelled) return;
        onErrorRef.current(error_ instanceof Error ? error_.message : "Le salon poker ne repond pas.");
      } finally {
        syncing = false;
      }
    }

    void syncRoom(true);
    const intervalId = window.setInterval(() => void syncRoom(false), LIVE_ROOM_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [isDocumentVisible, playerName, profile.user.id, roomId]);

  useEffect(() => {
    const existingSnapshot = readTableChannelSnapshot<PokerState>("poker", roomId);
    if (existingSnapshot?.state) {
      applySyncedState(existingSnapshot.state, existingSnapshot.syncedAt, existingSnapshot.turnDeadlineAt);
    }

    return subscribeTableChannel<PokerState>("poker", roomId, (snapshot) => {
      if (snapshot.roomId !== roomId) return;
      applySyncedState(snapshot.state, snapshot.syncedAt, snapshot.turnDeadlineAt);
    });
  }, [roomId]);

  useEffect(() => {
    if (!state) return;

    if (skipNextSyncPublishRef.current) {
      skipNextSyncPublishRef.current = false;
      return;
    }

    const signature = buildPokerSyncSignature(state, profile.user.id, playerName);
    if (signature !== lastTurnSignatureRef.current) {
      lastTimedOutSignatureRef.current = "";
    }
    lastTurnSignatureRef.current = signature;

    const nextDeadlineAt = getPokerPhaseDeadlineAt(state);
    if (nextDeadlineAt !== turnDeadlineAt) {
      setTurnDeadlineAt(nextDeadlineAt);
    }

    const syncedAt = Date.now();
    latestAppliedSyncAtRef.current = syncedAt;
    writeTableChannelSnapshot<PokerState>({
      game: "poker",
      roomId,
      syncedAt,
      turnDeadlineAt: nextDeadlineAt,
      state,
    });
  }, [playerName, profile.user.id, roomId, state, turnDeadlineAt]);

  useEffect(() => {
    if (!state?.token || !turnDeadlineAt || turnDeadlineAt > nowTick || working || !isDocumentVisible) {
      return;
    }

    const signature = buildPokerSyncSignature(state, profile.user.id, playerName);
    if (!signature || lastExpiredSyncSignatureRef.current === signature) return;

    lastExpiredSyncSignatureRef.current = signature;
    let cancelled = false;
    const timeoutId = window.setTimeout(async () => {
      try {
        const sharedState = await fetchPokerRoomState(roomId);
        if (cancelled || !sharedState) return;
        if (
          hasPokerHeroRound(state, profile.user.id, playerName)
          && !hasPokerHeroRound(sharedState, profile.user.id, playerName)
        ) {
          return;
        }
        applySyncedState(sharedState, Date.now(), getPokerPhaseDeadlineAt(sharedState));
      } catch {
        // The standard room poll will keep retrying; this just speeds up recovery after an expired timer.
      }
    }, 900);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [isDocumentVisible, nowTick, playerName, profile.user.id, roomId, state, turnDeadlineAt, working]);

  useEffect(() => {
    if (
      !state?.token
      || !isActivePokerHandStage(stage)
      || state.playerFolded
      || !turnDeadlineAt
      || working
      || !isDocumentVisible
      || !isPokerSelfTurn(state, profile.user.id, playerName)
    ) {
      return;
    }

    const signature = buildPokerSyncSignature(state, profile.user.id, playerName);
    if (!signature || turnDeadlineAt > nowTick || lastTimedOutSignatureRef.current === signature) return;

    lastTimedOutSignatureRef.current = signature;
    onError("Temps ecoule: la main est automatiquement couchee.");
    void act("fold");
  }, [act, isDocumentVisible, nowTick, onError, playerName, profile.user.id, stage, state, turnDeadlineAt, working]);

  useEffect(() => {
    return () => {
      if (clearDealAnimationTimeoutRef.current) {
        window.clearTimeout(clearDealAnimationTimeoutRef.current);
      }
      if (clearShowdownReplayTimeoutRef.current) {
        window.clearTimeout(clearShowdownReplayTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const showdownReplayKey = getPokerShowdownReplayKey(state);
    if (stage !== "showdown" || !showdownReplayKey) {
      return;
    }
    if (lastShowdownReplayKeyRef.current === showdownReplayKey) {
      return;
    }
    lastShowdownReplayKeyRef.current = showdownReplayKey;

    setShowdownReplayState(state);
    const nextRecap = buildPokerLastHandRecap(state, profile.user.id, playerName);
    if (nextRecap) {
      setLastResolvedHand(nextRecap);
    }

    if (clearShowdownReplayTimeoutRef.current) {
      window.clearTimeout(clearShowdownReplayTimeoutRef.current);
    }

    clearShowdownReplayTimeoutRef.current = window.setTimeout(() => {
      setShowdownReplayState((current) => (getPokerShowdownReplayKey(current) === showdownReplayKey ? null : current));
      clearShowdownReplayTimeoutRef.current = null;
    }, POKER_SHOWDOWN_REVEAL_MS);
  }, [playerName, profile.user.id, stage, state]);

  useEffect(() => {
    const currentCardKeys = getPokerCardKeys(displayState);
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
  }, [displayState, playCardBurst]);

  useEffect(() => {
    if (!(canBet || canRaise)) {
      setBetTarget(0);
      return;
    }

    const suggested = normalizeAggressionTarget(aggressionMin, aggressionMin, aggressionMax, blindUnit);

    setBetTarget((current) => {
      if (current >= aggressionMin && current <= aggressionMax) {
        return normalizeAggressionTarget(current, aggressionMin, aggressionMax, blindUnit);
      }
      return suggested;
    });
  }, [aggressionMax, aggressionMin, blindUnit, canBet, canRaise]);

  async function joinHand() {
    if (removingAbsentUserId) return;
    if (queuedForNextHand) {
      onError("Ta place est deja reservee pour la prochaine main sur cette table.");
      return;
    }
    if (isTableFull) {
      onError("La table est pleine: 6 joueurs maximum.");
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
      let joinedRoomId = roomId;
      try {
        const lobby = await refreshPokerLobby(roomId);
        joinedRoomId = lobby.joinedRoomId;
      } catch (error_) {
        onError(error_ instanceof Error ? error_.message : "Le salon poker ne repond pas.");
        return;
      }

      try {
        const sharedState = await fetchPokerRoomState(joinedRoomId);
        if (sharedState) {
          applySyncedState(sharedState, Date.now(), getPokerPhaseDeadlineAt(sharedState));
          if (hasPokerPendingSeat(sharedState, profile.user.id, playerName)) {
            onError("");
            return;
          }
        }
      } catch {
        // If the shared room state is briefly unavailable, keep going with the start call.
      }

      const result = await startPokerRound(ante, joinedRoomId);
      let nextState = result.state;
      if (result.state.roomId && result.state.token) {
        try {
          const sharedState = await fetchPokerRoomState(result.state.roomId);
          if (sharedState?.token === result.state.token) {
            nextState = sharedState;
          }
        } catch {
          // The normal polling loop will recover if the immediate sync fails.
        }
      }
      setState(nextState);
      if (result.profile) {
        onProfileChange(result.profile);
      }
      if (isPokerSpectatorRound(nextState, profile.user.id, playerName)) {
        onError("La table n'a pas encore pu confirmer ta place pour la prochaine main. Reessaie dans ce salon.");
        return;
      }
    } catch (error_) {
      if (error_ instanceof Error && error_.message.trim().toLowerCase() === "table_full") {
        onError("Cette table poker est complete. Maximum 6 joueurs sur la meme main.");
      } else {
        onError(error_ instanceof Error ? error_.message : "L'entree a la table a echoue.");
      }
    } finally {
      setWorking(false);
    }
  }

  async function act(action: PokerAction, amount?: number) {
    if (!state?.token || !isActivePokerHandStage(stage) || working || removingAbsentUserId) return;
    if (!isPokerSelfTurn(state, profile.user.id, playerName)) {
      onError("Ce n'est pas ton tour.");
      return;
    }
    if (!state.legalActions.includes(action)) {
      onError("Cette action n'est pas disponible sur ce coup.");
      return;
    }
    onError("");
    setWorking(true);
    try {
      const result = await actPokerRound(state.token, action, amount);
      if (isPokerSpectatorRound(result.state, profile.user.id, playerName)) {
        onError("Le serveur a renvoye une manche qui ne t'appartient pas. La table reste disponible pour la prochaine donne.");
        return;
      }
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

  async function handleCheck() {
    if (working || !isDecisionPhase || !canCheck) return;
    playCheck();
    await act("check");
  }

  async function handleCall() {
    if (working || !isDecisionPhase || !canCall) return;
    await act("call");
  }

  async function handleAggression() {
    if (working || !isDecisionPhase || !(canBet || canRaise) || !normalizedBetTarget) return;
    await act(canRaise ? "raise" : "bet", normalizedBetTarget);
  }

  async function handleFold() {
    if (working || !isDecisionPhase || !canFold) return;
    await act("fold");
  }

  async function handleRemoveAbsent(userId: string) {
    const normalizedTargetId = normalizeIdentity(userId);
    if (!normalizedTargetId || working || removingAbsentUserId === normalizedTargetId) return;
    onError("");
    setRemovingAbsentUserId(normalizedTargetId);
    try {
      const result = await removeAbsentPokerSeat(roomId, userId);
      setState(result.state);
      if (result.rooms) {
        setRooms(result.rooms);
      }
      if (result.profile) {
        onProfileChange(result.profile);
      }
    } catch (error_) {
      onError(error_ instanceof Error ? error_.message : "Impossible de retirer ce joueur absent.");
    } finally {
      setRemovingAbsentUserId(null);
    }
  }

  function resetTableVisualState() {
    clearQueuedAudio();
    previousCardKeysRef.current = [];
    setDealtCardDelays({});
    setBetTarget(0);
    setTurnDeadlineAt(null);
    setRemovingAbsentUserId(null);
    setShowdownReplayState(null);
    setLastResolvedHand(null);
    if (clearDealAnimationTimeoutRef.current) {
      window.clearTimeout(clearDealAnimationTimeoutRef.current);
      clearDealAnimationTimeoutRef.current = null;
    }
    if (clearShowdownReplayTimeoutRef.current) {
      window.clearTimeout(clearShowdownReplayTimeoutRef.current);
      clearShowdownReplayTimeoutRef.current = null;
    }
  }

  function handleRoomChange(nextRoomId: string) {
    if (roomSwitchLocked || working || removingAbsentUserId || nextRoomId === roomId) return;
    resetTableVisualState();
    setState(null);
    setRoomId(nextRoomId);
    writeSyncedTableSelection("poker", nextRoomId);
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
                  <div className="casino-room-hud__utility-stack">
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
                    <span
                      className={`casino-poker-turn-timer ${turnDeadlineAt ? "is-live" : ""} ${turnCountdownMs <= 10_000 && turnDeadlineAt ? "is-warning" : ""}`}
                      aria-label={turnTimerAriaLabel}
                    >
                      {turnDeadlineAt ? turnCountdownLabel : "Timer --:--"}
                    </span>
                  </div>
                </div>
                <strong>{pokerRoomMeta?.title || "Texas hold'em rapide"}</strong>
                <p>
                  {queuedForNextHand
                    ? "Ta place est reservee sur ce salon. Tu entreras automatiquement sur la prochaine main disponible."
                    : isSpectatingRound
                      ? "Une main est deja en cours sur ce salon. Tu peux reserver la prochaine donne ou rejoindre un autre salon libre."
                      : state?.message || "Table partagee par salon avec etat synchronise et actions gerees cote serveur."}
                  {" "}
                  {activeRoom ? `Canal actif: ${activeChannelMeta.channelLabel} (${activeChannelMeta.title}).` : ""}
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
                    className={`casino-topdeck__info-button ${activeHeaderInfo === "historique" ? "is-active" : ""}`}
                    aria-selected={activeHeaderInfo === "historique"}
                    onClick={() => setActiveHeaderInfo("historique")}
                  >
                    Historique
                  </button>
                </div>
                <div className="casino-topdeck__info-body" role="tabpanel">
                  {activeHeaderInfo === "structure" ? (
                    <div className="casino-rule-list">
                      <p>Texas hold'em 6-max uniquement, avec 5 places adverses visibles autour de toi et aucun bot affiche cote front.</p>
                      <p>Tu rejoins d'abord la table, puis le backend t'ajoute a la prochaine main disponible.</p>
                      <p>Le backend gere les vraies decisions de check, call, bet, raise et fold, tour par tour.</p>
                    </div>
                  ) : null}
                  {activeHeaderInfo === "mises" ? (
                    <div className="casino-metric-list">
                      <div>
                        <span>Blindes</span>
                        <strong>{formatCredits(smallBlind)} / {formatCredits(activeAnte)}</strong>
                      </div>
                      <div>
                        <span>Pas de mise</span>
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
                  {activeHeaderInfo === "historique" ? (
                    <div className="casino-rule-list">
                      <p>Canal en cours: {activeRoom ? `${activeChannelMeta.channelLabel} · ${activeChannelMeta.title}` : "Aucun"}</p>
                      <p>Joueurs presents: {activePlayerCount}</p>
                      <p>Adversaires reels disponibles: {connectedOpponentCount}</p>
                      {lastResolvedHand ? (
                        <div className="casino-last-hand-card">
                          <strong>Derniere main</strong>
                          <p>{lastResolvedWinnersLabel ? `Gagnant${lastResolvedHand.winners.length > 1 ? "s" : ""}: ${lastResolvedWinnersLabel}.` : lastResolvedHand.message}</p>
                          {lastResolvedHand.heroHandLabel ? <span>Ta main: {lastResolvedHand.heroHandLabel}</span> : null}
                        </div>
                      ) : null}
                      {(state?.actionLog || []).length ? (
                        [...(state?.actionLog || [])].slice(-6).reverse().map((entry, index) => (
                          <p key={`header-log-${entry}-${index}`}>{entry}</p>
                        ))
                      ) : lastResolvedHand?.actionLog?.length ? (
                        [...lastResolvedHand.actionLog].reverse().map((entry, index) => (
                          <p key={`header-last-hand-${entry}-${index}`}>{entry}</p>
                        ))
                      ) : (
                        <p>L'historique de la main apparaitra ici des que le coup demarre.</p>
                      )}
                    </div>
                  ) : null}
                </div>
              </article>
            ) : null}

            <div className="casino-salon-strip casino-salon-strip--compact" role="tablist" aria-label="Canaux poker">
              {availableRooms.map((room, index) => {
                const channelMeta = getTableChannelDisplayMeta("poker", room.id, index);
                return (
                  <button
                    key={room.id}
                    type="button"
                    className={`casino-salon-pill ${room.id === roomId ? "is-active" : ""}`}
                    onClick={() => handleRoomChange(room.id)}
                    disabled={roomSwitchLocked || working}
                    role="tab"
                    aria-selected={room.id === roomId}
                    title={channelMeta.blurb}
                  >
                    <div>
                      <strong>{channelMeta.channelLabel}</strong>
                      <span>{channelMeta.title}</span>
                    </div>
                    <b>{room?.playerCount || 0}</b>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="casino-reel-shell casino-room-shell casino-room-shell--cards casino-reel-shell--table-compact casino-reel-shell--poker">
            <PokerTableScene
              state={displayState}
              stage={displayStage}
              currentUserId={profile.user.id}
              playerName={playerName}
              isSpectatingRound={isSpectatingRound}
              queuedForNextHand={queuedForNextHand}
              participants={tableParticipants}
              activeAnte={activeAnte}
              smallBlind={smallBlind}
              heroCommitted={playerCommitted}
              potTotal={state?.pot || 0}
              isDecisionPhase={isDecisionPhase}
              dealtCardDelays={dealtCardDelays}
              presenceWindowMs={presenceWindowMs}
              removingAbsentUserId={removingAbsentUserId}
              lastHandRecap={lastResolvedHand}
              onRemoveAbsent={(userId) => void handleRemoveAbsent(userId)}
            />

            <PokerSidebar
              profile={profile}
              state={state}
              stage={stage}
              working={working || Boolean(removingAbsentUserId)}
              roomId={roomId}
              rooms={rooms}
              infoTab={infoTab}
              isDecisionPhase={isDecisionPhase}
              isSpectatingRound={isSpectatingRound}
              hasPendingSeat={hasPendingSeat}
              queuedForNextHand={queuedForNextHand}
              roomSwitchLocked={roomSwitchLocked}
              ante={activeAnte}
              playerChips={playerChips}
              playerCommitted={playerCommitted}
              playerStreetCommitted={playerStreetCommitted}
              toCall={toCall}
              canFold={canFold}
              canCheck={canCheck}
              canCall={canCall}
              canBet={canBet}
              canRaise={canRaise}
              isLiveMultiplayerReady={isLiveMultiplayerReady}
              isTableFull={isTableFull}
              normalizedBetTarget={normalizedBetTarget}
              aggressionMin={aggressionMin}
              aggressionMax={aggressionMax}
              blindUnit={blindUnit}
              lastHandRecap={lastResolvedHand}
              onInfoTabChange={setInfoTab}
              onRoomChange={handleRoomChange}
              onBetTargetChange={setBetTarget}
              onFold={() => void handleFold()}
              onCheck={() => void handleCheck()}
              onCall={() => void handleCall()}
              onRaise={() => void handleAggression()}
              onJoin={() => void joinHand()}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
