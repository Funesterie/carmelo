import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTableAudio } from "./audio/useTableAudio";
import { ROOM_DEFINITIONS } from "./features/casino/catalog";
import BlackjackSidebar from "./features/blackjack/components/BlackjackSidebar";
import BlackjackTableScene from "./features/blackjack/components/BlackjackTableScene";
import blackjackCaptainArt from "./images/blackjack-captain-art.png";
import {
  actBlackjackRound,
  fetchBlackjackRoomState,
  joinBlackjackRoom,
  leaveCasinoTableRoom,
  startBlackjackRound,
  type BlackjackAction,
  type BlackjackHand,
  type BlackjackState,
  type CasinoTableRoom,
  type CasinoTableRoomParticipant,
  type CasinoProfile,
} from "./lib/casinoApi";
import { formatCredits } from "./lib/casinoRoomState";
import { getBlackjackScore } from "./lib/pirateCards";
import {
  readTableChannelSnapshot,
  readSyncedTableSelection,
  subscribeTableChannel,
  subscribeSyncedTableSelection,
  writeTableLobbySnapshot,
  writeSyncedTableSelection,
  writeTableChannelSnapshot,
} from "./lib/tableChannelSync";
import { BLACKJACK_SALONS, getTableChannelDisplayMeta } from "./lib/tableSalons";

const PLAYER_BETS = [10, 20, 50, 200];
const TABLE_DEAL_STEP_MS = 96;
const LIVE_MIN_PLAYERS = 2;
const BLACKJACK_RESULT_FLASH_MS = 8000;
const LIVE_ROOM_POLL_INTERVAL_MS = 4000;
const LIVE_ROOM_LOBBY_SYNC_INTERVAL_MS = 20_000;

function normalizeBlackjackIdentity(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase();
}

function findBlackjackSelfSeat(state: BlackjackState | null, currentUserId: string, playerName: string) {
  const normalizedSelfSeatId = normalizeBlackjackIdentity(state?.selfSeatId);
  const normalizedCurrentUserId = normalizeBlackjackIdentity(currentUserId);
  const normalizedPlayerName = normalizeBlackjackIdentity(playerName);
  const candidates = [...(state?.seats || []), ...(state?.aiSeats || [])];

  return (
    candidates.find((seat) => {
      const seatId = normalizeBlackjackIdentity(seat.id);
      const seatUserId = normalizeBlackjackIdentity(seat.userId);
      const seatName = normalizeBlackjackIdentity(seat.name || seat.username);

      return Boolean(
        seat.isSelf
        || (normalizedSelfSeatId && seatId === normalizedSelfSeatId)
        || (normalizedCurrentUserId && (seatId === normalizedCurrentUserId || seatUserId === normalizedCurrentUserId))
        || (normalizedPlayerName && seatName === normalizedPlayerName),
      );
    }) || null
  );
}

function hasBlackjackHeroRound(state: BlackjackState | null, currentUserId: string, playerName: string) {
  if (!state) return false;
  if (state.playerCards.length || state.playerHands?.some((hand) => Boolean(hand.cards?.length))) {
    return true;
  }
  return Boolean(findBlackjackSelfSeat(state, currentUserId, playerName)?.cards?.length);
}

function isBlackjackSpectatorRound(state: BlackjackState | null, currentUserId: string, playerName: string) {
  if (!state?.token || !state.roomId) return false;
  return !hasBlackjackHeroRound(state, currentUserId, playerName);
}

function hasBlackjackPendingSeat(state: BlackjackState | null, currentUserId: string, playerName: string) {
  const normalizedCurrentUserId = normalizeBlackjackIdentity(currentUserId);
  const normalizedPlayerName = normalizeBlackjackIdentity(playerName);

  return Boolean(
    state?.pendingSeats?.some((seat) => {
      const seatUserId = normalizeBlackjackIdentity(seat.userId);
      const seatName = normalizeBlackjackIdentity(seat.username);
      return Boolean(
        (normalizedCurrentUserId && seatUserId === normalizedCurrentUserId)
        || (normalizedPlayerName && seatName === normalizedPlayerName),
      );
    }),
  );
}

function mergeTableParticipants(
  ...sources: Array<Array<CasinoTableRoomParticipant> | null | undefined>
) {
  const merged = new Map<string, CasinoTableRoomParticipant>();

  sources.forEach((source) => {
    (source || []).forEach((participant) => {
      const userId = String(participant?.userId || "").trim();
      if (!userId) return;

      const username = String(participant?.username || `Joueur ${userId}`).trim() || `Joueur ${userId}`;
      const updatedAt = participant?.updatedAt ? String(participant.updatedAt) : null;
      const existing = merged.get(userId);
      const existingTime = existing?.updatedAt ? Date.parse(existing.updatedAt) : 0;
      const nextTime = updatedAt ? Date.parse(updatedAt) : 0;

      if (!existing || nextTime >= existingTime) {
        merged.set(userId, {
          userId,
          username,
          updatedAt: Number.isFinite(nextTime) && nextTime > 0 ? new Date(nextTime).toISOString() : updatedAt || existing?.updatedAt || null,
        });
      }
    });
  });

  return [...merged.values()];
}

function getNormalizedBlackjackHands(state: BlackjackState | null): BlackjackHand[] {
  if (!state) return [];

  if (state.playerHands?.length) {
    const activeIndex = Math.max(0, Math.min(state.playerHands.length - 1, state.activeHandIndex || 0));
    return state.playerHands.map((hand, index) => ({
      ...hand,
      id: hand.id || `hand-${index}`,
      wager: hand.wager || state.wager,
      score: hand.score || state.playerScore,
      cards: hand.cards || [],
      isActive: hand.isActive ?? index === activeIndex,
    }));
  }

  return [
    {
      id: "hand-0",
      cards: state.playerCards,
      wager: state.wager,
      score: state.playerScore,
      isActive: true,
    },
  ];
}

function getBlackjackLegalActions(state: BlackjackState | null, currentUserId: string, playerName: string) {
  return getBlackjackLegalActionsForBalance(state, Number.POSITIVE_INFINITY, currentUserId, playerName);
}

function isBlackjackSelfTurn(state: BlackjackState | null, currentUserId: string, playerName: string) {
  if (!state || state.stage !== "player-turn" || !state.token) return false;

  const selfSeat = findBlackjackSelfSeat(state, currentUserId, playerName);
  const selfSeatId = normalizeBlackjackIdentity(selfSeat?.id || selfSeat?.userId || state.selfSeatId);
  const activeSeatId = normalizeBlackjackIdentity(state.activeSeatId);
  if (selfSeatId && activeSeatId) {
    return selfSeatId === activeSeatId;
  }

  if (selfSeat?.isActive) {
    return true;
  }

  return Boolean(selfSeat && !activeSeatId && ![...(state.seats || []), ...(state.aiSeats || [])].some((seat) => seat !== selfSeat && seat.isActive));
}

function getBlackjackLegalActionsForBalance(
  state: BlackjackState | null,
  walletBalance: number,
  currentUserId: string,
  playerName: string,
) {
  if (!state || state.stage !== "player-turn" || !isBlackjackSelfTurn(state, currentUserId, playerName)) {
    return [] as BlackjackAction[];
  }

  const actionSet = new Set<BlackjackAction>(state.legalActions?.length ? state.legalActions : ["hit", "stand"]);
  getNormalizedBlackjackHands(state)
    .filter((hand) => hand.isActive)
    .forEach((hand) => {
      const cards = hand.cards || [];
      const [firstCard, secondCard] = cards;
      const handScore = hand.score || getBlackjackScore(cards);
      const handWager = Math.max(0, hand.wager || state.wager || 0);
      const canFundExtraWager = walletBalance >= handWager;
      const isInitialTwoCardHand = cards.length === 2 && !handScore.isBust && !handScore.isBlackjack;
      const isPair = Boolean(firstCard && secondCard && firstCard.rank === secondCard.rank);

      if (hand.canDouble === true || (isInitialTwoCardHand && canFundExtraWager)) {
        actionSet.add("double");
      }

      if (hand.canSplit === true || (isInitialTwoCardHand && isPair && canFundExtraWager)) {
        actionSet.add("split");
      }
    });

  return [...actionSet];
}

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

  const normalizedHands = getNormalizedBlackjackHands(state);
  normalizedHands.forEach((hand, handIndex) => {
    hand.cards.forEach((card, index) => {
      keys.push(`player-${handIndex}-${card.id}-${index}`);
    });
  });

  return keys;
}

function buildBlackjackSyncSignature(state: BlackjackState | null, currentUserId: string, playerName: string) {
  if (!state?.token) return "";
  const normalizedHands = getNormalizedBlackjackHands(state);
  return JSON.stringify({
    token: state.token,
    roomId: state.roomId || null,
    stage: state.stage,
    selfSeatId: state.selfSeatId || null,
    activeSeatId: state.activeSeatId || null,
    dealerHidden: state.dealerHidden,
    playerCards: state.playerCards.map((card) => card.id),
    dealerCards: state.dealerCards.map((card) => card.id),
    aiSeats: state.aiSeats.map((seat) => ({
      id: seat.id,
      cards: seat.cards.map((card) => card.id),
      wager: seat.wager,
      result: seat.result,
    })),
    playerHands: normalizedHands.map((hand) => ({
      id: hand.id || "",
      cards: hand.cards.map((card) => card.id),
      wager: hand.wager,
      total: hand.score.total,
      active: Boolean(hand.isActive),
    })),
    legalActions: getBlackjackLegalActions(state, currentUserId, playerName),
    playerTotal: state.playerScore.total,
    dealerTotal: state.dealerScore.total,
    payoutAmount: state.payoutAmount,
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

function getBlackjackPhaseDeadlineAt(state: BlackjackState | null) {
  if (!state) return null;
  if (state.stage === "waiting") {
    return parseTableDeadline(state.bettingClosesAt);
  }
  return parseTableDeadline(state.turnDeadlineAt);
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
  const blackjackRoomMeta = ROOM_DEFINITIONS.find((roomEntry) => roomEntry.id === "blackjack");
  const [betChips, setBetChips] = useState<number[]>([PLAYER_BETS[1]]);
  const [state, setState] = useState<BlackjackState | null>(null);
  const [working, setWorking] = useState(false);
  const [roomId, setRoomId] = useState(() => readSyncedTableSelection("blackjack") || BLACKJACK_SALONS[0].id);
  const [rooms, setRooms] = useState<CasinoTableRoom[]>([]);
  const [infoTab, setInfoTab] = useState<"salons" | "regles" | "joueurs">("salons");
  const [showRoomInfo, setShowRoomInfo] = useState(false);
  const [activeHeaderInfo, setActiveHeaderInfo] = useState<"table" | "mise" | "live">("table");
  const [dealtCardDelays, setDealtCardDelays] = useState<Record<string, number>>({});
  const [resultFlash, setResultFlash] = useState<{ label: string; detail?: string; tone: "win" | "lose" } | null>(null);
  const [turnDeadlineAt, setTurnDeadlineAt] = useState<number | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [isDocumentVisible, setIsDocumentVisible] = useState(() => {
    if (typeof document === "undefined") return true;
    return document.visibilityState !== "hidden";
  });
  const previousCardKeysRef = useRef<string[]>([]);
  const previousStageRef = useRef<string>("idle");
  const clearDealAnimationTimeoutRef = useRef<number | null>(null);
  const clearResultFlashTimeoutRef = useRef<number | null>(null);
  const latestAppliedSyncAtRef = useRef(0);
  const latestStateRef = useRef<BlackjackState | null>(state);
  const latestRoomsRef = useRef<CasinoTableRoom[]>(rooms);
  const lastLobbySyncAtRef = useRef(0);
  const skipNextSyncPublishRef = useRef(false);
  const lastTurnSignatureRef = useRef("");
  const lastTimedOutSignatureRef = useRef("");
  const lastExpiredSyncSignatureRef = useRef("");
  const onErrorRef = useRef(onError);
  const { clearQueuedAudio, playCardBurst, playCheck } = useTableAudio(mediaReady);
  const bet = useMemo(() => betChips.reduce((total, chip) => total + chip, 0), [betChips]);

  const stage = state?.stage || "idle";
  const lastDelta = state?.lastDelta || 0;
  const hasHeroRound = hasBlackjackHeroRound(state, profile.user.id, playerName);
  const isSpectatingRound = isBlackjackSpectatorRound(state, profile.user.id, playerName);
  const hasPendingSeat = hasBlackjackPendingSeat(state, profile.user.id, playerName);
  const isBettingPhase = stage === "waiting" || Boolean(state?.waitingForPlayers);
  const roomSwitchLocked = stage === "player-turn" && hasHeroRound;
  const betLocked = roomSwitchLocked || working;
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
  const activeChannelMeta = getTableChannelDisplayMeta("blackjack", activeRoom?.id || roomId, activeRoomIndex);
  const tableParticipants = useMemo(
    () => mergeTableParticipants(
      activeRoom?.participants,
      state?.roomParticipants,
      (state?.pendingSeats || []).map((seat) => ({
        userId: seat.userId,
        username: seat.username,
        updatedAt: seat.updatedAt || null,
      })),
      [...(state?.seats || []), ...(state?.aiSeats || [])].map((seat) => ({
        userId: String(seat.userId || seat.id || "").trim(),
        username: String(seat.username || seat.name || "Joueur").trim(),
        updatedAt: null,
      })),
    ),
    [activeRoom?.participants, state?.aiSeats, state?.pendingSeats, state?.roomParticipants, state?.seats],
  );
  const activePlayerCount = Math.max(activeRoom?.playerCount || 0, tableParticipants.length);
  const autoLiveMode = activePlayerCount >= LIVE_MIN_PLAYERS;
  const currentRoundIsLive = Boolean(state?.roomId);
  const shouldSyncLiveRoom = currentRoundIsLive || (stage !== "player-turn" && autoLiveMode);
  const isDecisionPhase = isBlackjackSelfTurn(state, profile.user.id, playerName);
  const legalActions = useMemo(
    () => getBlackjackLegalActionsForBalance(state, profile.wallet.balance, profile.user.id, playerName),
    [playerName, profile.user.id, profile.wallet.balance, state],
  );
  const turnCountdownMs = turnDeadlineAt ? Math.max(0, turnDeadlineAt - nowTick) : 0;
  const isTurnClockExpired = Boolean(turnDeadlineAt && turnDeadlineAt <= nowTick);
  const turnCountdownLabel = turnDeadlineAt ? (isTurnClockExpired ? "Attente" : formatTurnClock(turnCountdownMs)) : "--:--";
  const blackjackStatusMessage = isSpectatingRound
    ? "Une manche est deja en cours sur ce salon."
    : hasPendingSeat && isBettingPhase
      ? "Mise validee. La table attend les autres reponses ou la fin du chrono pour lancer la prochaine donne."
      : isBettingPhase
        ? state?.message || "Phase de mise ouverte: valide ta place avant la prochaine donne."
        : state?.message || "Table synchronisee par salon avec mise et resultat geres cote serveur.";

  useEffect(() => {
    latestStateRef.current = state;
  }, [state]);

  useEffect(() => {
    latestRoomsRef.current = rooms;
  }, [rooms]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  async function refreshBlackjackLobby(targetRoomId: string) {
    const result = await joinBlackjackRoom(targetRoomId);
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

  function applySyncedState(nextState: BlackjackState | null, syncedAt: number, nextDeadlineAt: number | null) {
    if (!nextState?.roomId) return;
    if (syncedAt <= latestAppliedSyncAtRef.current) return;
    latestAppliedSyncAtRef.current = syncedAt;
    skipNextSyncPublishRef.current = true;
    setState(nextState);
    setTurnDeadlineAt(nextDeadlineAt);
  }

  async function refreshSharedBlackjackState(silent = false) {
    try {
      const sharedState = await fetchBlackjackRoomState(roomId);
      if (!sharedState) return null;
      applySyncedState(sharedState, Date.now(), getBlackjackPhaseDeadlineAt(sharedState));
      return sharedState;
    } catch (error_) {
      if (!silent) {
        onError(error_ instanceof Error ? error_.message : "La table blackjack ne repond pas.");
      }
      return null;
    }
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
        await leaveCasinoTableRoom("blackjack", roomId, { keepalive });
      } catch {
        // Best effort: losing presence on tab hide/unmount should not block the UI.
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
    setTurnDeadlineAt(null);
  }, [roomId]);

  useEffect(() => {
    if (!turnDeadlineAt || turnDeadlineAt > nowTick) {
      lastExpiredSyncSignatureRef.current = "";
    }
  }, [nowTick, roomId, turnDeadlineAt]);

  useEffect(() => {
    writeSyncedTableSelection("blackjack", roomId);
  }, [roomId]);

  useEffect(() => {
    if (!rooms.length) return;

    writeTableLobbySnapshot({
      game: "blackjack",
      joinedRoomId: roomId,
      syncedAt: Date.now(),
      rooms,
    });
  }, [roomId, rooms]);

  useEffect(() => {
    return subscribeSyncedTableSelection("blackjack", (nextRoomId) => {
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
        const shouldRefreshLobby = forceLobbySync
          || !latestRoomsRef.current.length
          || (Date.now() - lastLobbySyncAtRef.current) >= LIVE_ROOM_LOBBY_SYNC_INTERVAL_MS;

        if (shouldRefreshLobby) {
          try {
            const result = await refreshBlackjackLobby(roomId);
            if (cancelled) return;
            joinedRoomId = result.joinedRoomId;
            if (joinedRoomId && joinedRoomId !== roomId) {
              setRoomId(joinedRoomId);
            }
          } catch (error_) {
            if (error_ instanceof Error) {
              lobbyError = error_;
            } else {
              lobbyError = new Error("Le salon blackjack ne repond pas.");
            }
          }
        }

        try {
          const sharedState = await fetchBlackjackRoomState(joinedRoomId);
          if (cancelled || !sharedState) return;
          applySyncedState(sharedState, Date.now(), getBlackjackPhaseDeadlineAt(sharedState));
          return;
        } catch (syncError) {
          if (cancelled) return;
          if (!lobbyError && syncError instanceof Error) {
            lobbyError = syncError;
          }
        }

        const snapshot = readTableChannelSnapshot<BlackjackState>("blackjack", joinedRoomId);
        if (!cancelled && snapshot?.state) {
          applySyncedState(snapshot.state, snapshot.syncedAt, snapshot.turnDeadlineAt);
          return;
        }

        if (!cancelled && lobbyError) {
          onErrorRef.current(lobbyError.message);
        }
      } catch (error_) {
        if (cancelled) return;
        onErrorRef.current(error_ instanceof Error ? error_.message : "Le salon blackjack ne repond pas.");
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
    const existingSnapshot = readTableChannelSnapshot<BlackjackState>("blackjack", roomId);
    if (existingSnapshot?.state) {
      applySyncedState(existingSnapshot.state, existingSnapshot.syncedAt, existingSnapshot.turnDeadlineAt);
    }

    return subscribeTableChannel<BlackjackState>("blackjack", roomId, (snapshot) => {
      if (snapshot.roomId !== roomId) return;
      applySyncedState(snapshot.state, snapshot.syncedAt, snapshot.turnDeadlineAt);
    });
  }, [roomId]);

  useEffect(() => {
    if (!state || !state.roomId) return;

    if (skipNextSyncPublishRef.current) {
      skipNextSyncPublishRef.current = false;
      return;
    }

    const signature = buildBlackjackSyncSignature(state, profile.user.id, playerName);
    if (signature !== lastTurnSignatureRef.current) {
      lastTimedOutSignatureRef.current = "";
    }
    lastTurnSignatureRef.current = signature;

    const nextDeadlineAt = getBlackjackPhaseDeadlineAt(state);
    if (nextDeadlineAt !== turnDeadlineAt) {
      setTurnDeadlineAt(nextDeadlineAt);
    }

    const syncedAt = Date.now();
    latestAppliedSyncAtRef.current = syncedAt;
    writeTableChannelSnapshot<BlackjackState>({
      game: "blackjack",
      roomId,
      syncedAt,
      turnDeadlineAt: nextDeadlineAt,
      state,
    });
  }, [playerName, profile.user.id, roomId, state, turnDeadlineAt]);

  useEffect(() => {
    if (
      !currentRoundIsLive
      || stage !== "player-turn"
      || !state?.token
      || !turnDeadlineAt
      || turnDeadlineAt > nowTick
      || working
      || !isDocumentVisible
    ) {
      return;
    }

    const signature = buildBlackjackSyncSignature(state, profile.user.id, playerName);
    if (!signature || lastExpiredSyncSignatureRef.current === signature) return;

    lastExpiredSyncSignatureRef.current = signature;
    let cancelled = false;
    const timeoutId = window.setTimeout(async () => {
      try {
        const sharedState = await fetchBlackjackRoomState(roomId);
        if (cancelled || !sharedState) return;
        if (
          hasBlackjackHeroRound(state, profile.user.id, playerName)
          && !hasBlackjackHeroRound(sharedState, profile.user.id, playerName)
        ) {
          return;
        }
        applySyncedState(sharedState, Date.now(), getBlackjackPhaseDeadlineAt(sharedState));
      } catch {
        // The standard poll will keep retrying; this just speeds up recovery after an expired timer.
      }
    }, 900);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [currentRoundIsLive, isDocumentVisible, nowTick, playerName, profile.user.id, roomId, stage, state, turnDeadlineAt, working]);

  useEffect(() => {
    if (
      !currentRoundIsLive
      || !state?.token
      || stage !== "player-turn"
      || !turnDeadlineAt
      || working
      || !isDocumentVisible
      || !isBlackjackSelfTurn(state, profile.user.id, playerName)
    ) {
      return;
    }

    const signature = buildBlackjackSyncSignature(state, profile.user.id, playerName);
    if (!signature || turnDeadlineAt > nowTick || lastTimedOutSignatureRef.current === signature) return;

    lastTimedOutSignatureRef.current = signature;
    onError("Temps ecoule: la table se resynchronise.");
  }, [currentRoundIsLive, isDocumentVisible, nowTick, onError, playerName, profile.user.id, stage, state, turnDeadlineAt, working]);

  useEffect(() => {
    return () => {
      if (clearDealAnimationTimeoutRef.current) {
        window.clearTimeout(clearDealAnimationTimeoutRef.current);
      }
      if (clearResultFlashTimeoutRef.current) {
        window.clearTimeout(clearResultFlashTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const previousStage = previousStageRef.current;
    previousStageRef.current = stage;

    if (stage !== "resolved" || previousStage === "resolved") {
      return;
    }

    const nextFlash =
      lastDelta > 0
        ? { label: "WIN", detail: `+${formatCredits(lastDelta)}`, tone: "win" as const }
        : lastDelta < 0
          ? { label: "LOSE", detail: `-${formatCredits(Math.abs(lastDelta))}`, tone: "lose" as const }
          : null;

    if (!nextFlash) {
      setResultFlash(null);
      return;
    }

    setResultFlash(nextFlash);
    if (clearResultFlashTimeoutRef.current) {
      window.clearTimeout(clearResultFlashTimeoutRef.current);
    }
    clearResultFlashTimeoutRef.current = window.setTimeout(() => {
      setResultFlash(null);
      clearResultFlashTimeoutRef.current = null;
    }, BLACKJACK_RESULT_FLASH_MS);
  }, [lastDelta, stage]);

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
    if (!bet) {
      onError("Pose au moins un jeton avant de lancer la donne.");
      return;
    }
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
      let joinedRoomId = roomId;
      try {
        const lobby = await refreshBlackjackLobby(roomId);
        joinedRoomId = lobby.joinedRoomId;
      } catch (error_) {
        onError(error_ instanceof Error ? error_.message : "Le salon blackjack ne repond pas.");
        return;
      }

      try {
        const sharedState = await fetchBlackjackRoomState(joinedRoomId);
        if (sharedState) {
          applySyncedState(sharedState, Date.now(), getBlackjackPhaseDeadlineAt(sharedState));
          if (isBlackjackSpectatorRound(sharedState, profile.user.id, playerName)) {
            onError("Une manche est deja en cours sur ce salon. Attends la prochaine phase de mise pour entrer dans cette table.");
            return;
          }
          if (hasBlackjackPendingSeat(sharedState, profile.user.id, playerName)) {
            onError("Ta mise est deja validee sur cette table. La donne partira quand tous les joueurs presents auront repondu ou a la fin du chrono.");
            return;
          }
        }
      } catch {
        // If the live room state is temporarily unavailable, keep going with the start call.
      }

      const result = await startBlackjackRound(bet, joinedRoomId);
      let nextState = result.state;
      if (result.state.roomId && result.state.token) {
        try {
          const sharedState = await fetchBlackjackRoomState(result.state.roomId);
          if (sharedState?.token === result.state.token) {
            nextState = sharedState;
          }
        } catch {
          // Keep the local response if the immediate room sync is temporarily unavailable.
        }
      }
      setState(nextState);
      if (result.profile) {
        onProfileChange(result.profile);
      }
      if (isBlackjackSpectatorRound(nextState, profile.user.id, playerName)) {
        onError("Une manche est deja en cours sur ce salon. Attends la prochaine phase de mise pour entrer dans cette table.");
        return;
      }
    } catch (error_) {
      if (error_ instanceof Error && error_.message.trim().toLowerCase() === "table_full") {
        onError("Cette table blackjack est deja complete. Maximum 3 joueurs en plus du croupier.");
      } else {
        onError(error_ instanceof Error ? error_.message : "La donne n'a pas pu commencer.");
      }
    } finally {
      setWorking(false);
    }
  }

  async function act(action: BlackjackAction) {
    if (!state?.token || stage !== "player-turn" || working) return;
    if (turnDeadlineAt && turnDeadlineAt <= Date.now()) {
      onError("Le chrono vient d'expirer. Synchronisation de la table...");
      setWorking(true);
      try {
        const syncedState = await refreshSharedBlackjackState(true);
        if (syncedState && syncedState.stage !== "player-turn") {
          onError("");
        }
      } finally {
        setWorking(false);
      }
      return;
    }
    onError("");
    if (action === "hit" || action === "double" || action === "split") {
      playCheck();
    }
    setWorking(true);
    try {
      const result = await actBlackjackRound(state.token, action);
      let nextState = result.state;
      if (result.state.roomId && result.state.token) {
        try {
          const sharedState = await fetchBlackjackRoomState(result.state.roomId);
          if (sharedState?.token === result.state.token) {
            nextState = sharedState;
          }
        } catch {
          // The normal polling loop will recover if the immediate sync fails.
        }
      }
      if (isBlackjackSpectatorRound(nextState, profile.user.id, playerName)) {
        onError("Le serveur a renvoye une manche qui ne t'appartient pas. La table reste verrouillee jusqu'a la prochaine donne.");
        return;
      }
      setState(nextState);
      if (result.profile) {
        onProfileChange(result.profile);
      }
    } catch (error_) {
      const normalizedError = error_ instanceof Error ? error_.message.trim().toLowerCase() : "";
      if (normalizedError === "invalid_action") {
        onError("Cette action n'est pas autorisee pour la main active. Verifie les regles de double ou de split sur ce tour.");
      } else if (normalizedError === "not_your_turn" || normalizedError === "invalid_round_token") {
        onError(
          normalizedError === "not_your_turn"
            ? "Le tour a deja avance. La table se resynchronise."
            : "La manche a deja evolue. Synchronisation en cours.",
        );
        const syncedState = await refreshSharedBlackjackState(true);
        if (syncedState && syncedState.stage !== "player-turn") {
          onError("");
        }
      } else {
        onError(error_ instanceof Error ? error_.message : "La table n'a pas accepte cette action.");
      }
    } finally {
      setWorking(false);
    }
  }

  function resetTableVisualState() {
    clearQueuedAudio();
    previousCardKeysRef.current = [];
    setDealtCardDelays({});
    setResultFlash(null);
    setTurnDeadlineAt(null);
    if (clearDealAnimationTimeoutRef.current) {
      window.clearTimeout(clearDealAnimationTimeoutRef.current);
      clearDealAnimationTimeoutRef.current = null;
    }
    if (clearResultFlashTimeoutRef.current) {
      window.clearTimeout(clearResultFlashTimeoutRef.current);
      clearResultFlashTimeoutRef.current = null;
    }
  }

  function handleRoomChange(nextRoomId: string) {
    if (roomSwitchLocked || working || nextRoomId === roomId) return;
    resetTableVisualState();
    setState(null);
    setRoomId(nextRoomId);
    writeSyncedTableSelection("blackjack", nextRoomId);
  }

  function handleBetChipAdd(chipValue: number) {
    if (betLocked) return;
    setBetChips((current) => {
      const currentTotal = current.reduce((total, chip) => total + chip, 0);
      if (currentTotal + chipValue > profile.wallet.balance) {
        onError("Le total des jetons depasse ton solde disponible.");
        return current;
      }
      return [...current, chipValue];
    });
  }

  function handleBetChipRemove() {
    if (betLocked) return;
    setBetChips((current) => current.slice(0, -1));
  }

  return (
    <section className="casino-table-layout casino-table-layout--compact casino-table-layout--cards">
      <div className="casino-stage casino-stage--cards casino-stage--cards--blackjack">
        <div
          className="casino-card-fused-stage casino-card-fused-stage--blackjack"
          style={{ ["--room-art" as string]: `url("${blackjackCaptainArt}")` }}
        >
          <div className="casino-room-hud casino-room-hud--blackjack">
            <div className="casino-room-hud__lead">
              <img className="casino-room-hud__portrait" src={blackjackCaptainArt} alt="" aria-hidden="true" />
              <div className="casino-room-hud__identity">
                <div className="casino-topdeck__chip-row">
                  <span className="casino-chip">{blackjackRoomMeta?.chip || "Table des lanternes"}</span>
                  <div className="casino-room-hud__utility-stack">
                    <button
                      type="button"
                      className={`casino-ghost-button casino-topdeck__info-toggle ${showRoomInfo ? "is-open" : ""}`}
                      onClick={() => setShowRoomInfo((value) => !value)}
                      aria-label="Informations blackjack"
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
                      className={`casino-card-turn-timer ${turnDeadlineAt ? "is-live" : ""} ${turnCountdownMs <= 10_000 && turnDeadlineAt ? "is-warning" : ""}`}
                      aria-label={turnDeadlineAt ? `${stage === "waiting" ? "Fin de mise" : "Temps restant"} ${turnCountdownLabel}` : "Timer de table en attente"}
                    >
                      {turnDeadlineAt ? turnCountdownLabel : "Timer --:--"}
                    </span>
                  </div>
                </div>
                <strong>{blackjackRoomMeta?.title || "Blackjack pirate"}</strong>
                <p>
                  {blackjackStatusMessage}
                  {activeRoom ? ` Canal actif: ${activeChannelMeta.channelLabel} (${activeChannelMeta.title}).` : ""}
                </p>
              </div>
            </div>

            {showRoomInfo ? (
              <article className="casino-topdeck__info-panel" aria-label="Informations blackjack">
                <div className="casino-topdeck__info-buttons" role="tablist" aria-label="Sections blackjack">
                  <button
                    type="button"
                    role="tab"
                    className={`casino-topdeck__info-button ${activeHeaderInfo === "table" ? "is-active" : ""}`}
                    aria-selected={activeHeaderInfo === "table"}
                    onClick={() => setActiveHeaderInfo("table")}
                  >
                    Table
                  </button>
                  <button
                    type="button"
                    role="tab"
                    className={`casino-topdeck__info-button ${activeHeaderInfo === "mise" ? "is-active" : ""}`}
                    aria-selected={activeHeaderInfo === "mise"}
                    onClick={() => setActiveHeaderInfo("mise")}
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
                  {activeHeaderInfo === "table" ? (
                    <div className="casino-rule-list">
                      <p>{autoLiveMode ? "La table reste partagee avec les joueurs presents sur ce salon et lance la prochaine donne depuis la phase de mise." : "Le salon reste ouvert et attend les autres joueurs avant de lancer la prochaine donne."}</p>
                      <p>Le blackjack naturel paie plus fort et le reglement passe par le wallet A11.</p>
                      <p>La phase de mise reste visible sur le front, avec places en attente et timer serveur.</p>
                    </div>
                  ) : null}
                  {activeHeaderInfo === "mise" ? (
                    <div className="casino-metric-list">
                      <div>
                        <span>Presets</span>
                        <strong>50 / 100 / 200 / 400</strong>
                      </div>
                      <div>
                        <span>Mise active</span>
                        <strong>{formatCredits(state?.wager || bet)}</strong>
                      </div>
                      <div>
                        <span>Payout</span>
                        <strong>{formatCredits(state?.payoutAmount || 0)}</strong>
                      </div>
                      <div>
                        <span>Mode</span>
                        <strong>{currentRoundIsLive || autoLiveMode ? "Multijoueur" : "Solo"}</strong>
                      </div>
                    </div>
                  ) : null}
                  {activeHeaderInfo === "live" ? (
                    <div className="casino-rule-list">
                      <p>Le salon confirme les joueurs presents pendant la phase de mise avant d'envoyer la donne.</p>
                      <p>Le tour actif reste synchronise entre les joueurs du meme salon.</p>
                      <p>Canal en cours: {activeRoom ? `${activeChannelMeta.channelLabel} · ${activeChannelMeta.title}` : "Aucun"}</p>
                      <p>Joueurs presents: {Math.max(1, activePlayerCount)}</p>
                      <p>Places deja validees: {state?.pendingSeats?.length || 0}</p>
                    </div>
                  ) : null}
                </div>
              </article>
            ) : null}

            <div className="casino-salon-strip casino-salon-strip--compact" role="tablist" aria-label="Canaux blackjack">
              {availableRooms.map((room, index) => {
                const channelMeta = getTableChannelDisplayMeta("blackjack", room.id, index);
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

          <div className="casino-reel-shell casino-room-shell casino-room-shell--cards casino-reel-shell--table-compact casino-reel-shell--blackjack">
            <BlackjackTableScene
              state={state}
              participants={tableParticipants}
              currentUserId={profile.user.id}
              playerName={playerName}
              bet={bet}
              betChips={betChips}
              betLocked={betLocked}
              isDecisionPhase={isDecisionPhase}
              dealtCardDelays={dealtCardDelays}
              resultFlash={resultFlash}
              onBetChipRemove={handleBetChipRemove}
            />

            <BlackjackSidebar
              profile={profile}
              state={state}
              bet={bet}
              betChips={betChips}
              working={working}
              roomId={roomId}
              rooms={rooms}
              activeParticipants={tableParticipants}
              infoTab={infoTab}
              isDecisionPhase={isDecisionPhase}
              isBettingPhase={isBettingPhase}
              isSpectatingRound={isSpectatingRound}
              hasPendingSeat={hasPendingSeat}
              roomSwitchLocked={roomSwitchLocked}
              legalActions={legalActions}
              actionsLocked={isTurnClockExpired}
              onBetChipAdd={handleBetChipAdd}
              onInfoTabChange={setInfoTab}
              onRoomChange={handleRoomChange}
              onHit={() => void act("hit")}
              onStand={() => void act("stand")}
              onDouble={() => void act("double")}
              onSplit={() => void act("split")}
              onDeal={() => void startRound()}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
