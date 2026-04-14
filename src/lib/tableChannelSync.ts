import type { CasinoTableRoom } from "./casinoApi";

export type SyncedTableGame = "blackjack" | "poker" | "roulette";

export type TableChannelSnapshot<TState> = {
  game: SyncedTableGame;
  roomId: string;
  syncedAt: number;
  turnDeadlineAt: number | null;
  state: TState | null;
};

export type TableLobbySnapshot = {
  game: SyncedTableGame;
  joinedRoomId: string;
  syncedAt: number;
  rooms: CasinoTableRoom[];
};

const TABLE_CHANNEL_STORAGE_PREFIX = "funesterie-casino-table-sync";
const TABLE_CHANNEL_BROADCAST_PREFIX = "funesterie-casino-table-sync";
const TABLE_SELECTION_STORAGE_PREFIX = "funesterie-casino-table-selection";
const TABLE_SELECTION_BROADCAST_PREFIX = "funesterie-casino-table-selection";
const TABLE_LOBBY_STORAGE_PREFIX = "funesterie-casino-table-lobby";
const TABLE_LOBBY_BROADCAST_PREFIX = "funesterie-casino-table-lobby";

function getTableChannelStorageKey(game: SyncedTableGame, roomId: string) {
  return `${TABLE_CHANNEL_STORAGE_PREFIX}:${game}:${String(roomId || "").trim()}`;
}

function getTableChannelBroadcastName(game: SyncedTableGame, roomId: string) {
  return `${TABLE_CHANNEL_BROADCAST_PREFIX}:${game}:${String(roomId || "").trim()}`;
}

function getTableSelectionStorageKey(game: SyncedTableGame) {
  return `${TABLE_SELECTION_STORAGE_PREFIX}:${game}`;
}

function getTableSelectionBroadcastName(game: SyncedTableGame) {
  return `${TABLE_SELECTION_BROADCAST_PREFIX}:${game}`;
}

function getTableLobbyStorageKey(game: SyncedTableGame) {
  return `${TABLE_LOBBY_STORAGE_PREFIX}:${game}`;
}

function getTableLobbyBroadcastName(game: SyncedTableGame) {
  return `${TABLE_LOBBY_BROADCAST_PREFIX}:${game}`;
}

function isTableChannelSnapshot(value: unknown): value is TableChannelSnapshot<unknown> {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Record<string, unknown>;
  return (
    (snapshot.game === "blackjack" || snapshot.game === "poker" || snapshot.game === "roulette")
    && typeof snapshot.roomId === "string"
    && typeof snapshot.syncedAt === "number"
    && ("turnDeadlineAt" in snapshot)
  );
}

function isCasinoTableRoomParticipant(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const participant = value as Record<string, unknown>;
  return (
    typeof participant.userId === "string"
    && typeof participant.username === "string"
    && ("updatedAt" in participant)
  );
}

function isCasinoTableRoom(value: unknown): value is CasinoTableRoom {
  if (!value || typeof value !== "object") return false;
  const room = value as Record<string, unknown>;
  return (
    typeof room.id === "string"
    && typeof room.playerCount === "number"
    && typeof room.isCurrent === "boolean"
    && typeof room.hasSelf === "boolean"
    && Array.isArray(room.participants)
    && room.participants.every((participant) => isCasinoTableRoomParticipant(participant))
  );
}

function isTableLobbySnapshot(value: unknown): value is TableLobbySnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Record<string, unknown>;
  return (
    (snapshot.game === "blackjack" || snapshot.game === "poker" || snapshot.game === "roulette")
    && typeof snapshot.joinedRoomId === "string"
    && typeof snapshot.syncedAt === "number"
    && Array.isArray(snapshot.rooms)
    && snapshot.rooms.every((room) => isCasinoTableRoom(room))
  );
}

export function readTableChannelSnapshot<TState>(game: SyncedTableGame, roomId: string) {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(getTableChannelStorageKey(game, roomId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return isTableChannelSnapshot(parsed) ? (parsed as TableChannelSnapshot<TState>) : null;
  } catch {
    return null;
  }
}

export function writeTableChannelSnapshot<TState>(snapshot: TableChannelSnapshot<TState>) {
  if (typeof window === "undefined") return;

  const storageKey = getTableChannelStorageKey(snapshot.game, snapshot.roomId);
  const broadcastName = getTableChannelBroadcastName(snapshot.game, snapshot.roomId);

  try {
    window.localStorage.setItem(storageKey, JSON.stringify(snapshot));
  } catch {
    // Ignore storage failures to keep multiplayer tables usable in restrictive browsers.
  }

  if (typeof BroadcastChannel === "undefined") {
    return;
  }

  const channel = new BroadcastChannel(broadcastName);
  channel.postMessage(snapshot);
  channel.close();
}

export function readTableLobbySnapshot(game: SyncedTableGame) {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(getTableLobbyStorageKey(game));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return isTableLobbySnapshot(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeTableLobbySnapshot(snapshot: TableLobbySnapshot) {
  if (typeof window === "undefined") return;

  const storageKey = getTableLobbyStorageKey(snapshot.game);
  const broadcastName = getTableLobbyBroadcastName(snapshot.game);

  try {
    window.localStorage.setItem(storageKey, JSON.stringify(snapshot));
  } catch {
    // Ignore storage failures to keep the channel selector non-blocking.
  }

  if (typeof BroadcastChannel === "undefined") {
    return;
  }

  const channel = new BroadcastChannel(broadcastName);
  channel.postMessage(snapshot);
  channel.close();
}

export function subscribeTableChannel<TState>(
  game: SyncedTableGame,
  roomId: string,
  listener: (snapshot: TableChannelSnapshot<TState>) => void,
) {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const storageKey = getTableChannelStorageKey(game, roomId);
  const broadcastName = getTableChannelBroadcastName(game, roomId);

  function notify(rawValue: string | null) {
    if (!rawValue) return;

    try {
      const parsed = JSON.parse(rawValue);
      if (isTableChannelSnapshot(parsed)) {
        listener(parsed as TableChannelSnapshot<TState>);
      }
    } catch {
      // Ignore malformed payloads from older clients.
    }
  }

  function handleStorage(event: StorageEvent) {
    if (event.key !== storageKey) return;
    notify(event.newValue);
  }

  window.addEventListener("storage", handleStorage);

  const channel =
    typeof BroadcastChannel !== "undefined"
      ? new BroadcastChannel(broadcastName)
      : null;

  if (channel) {
    channel.addEventListener("message", (event) => {
      const parsed = event.data;
      if (isTableChannelSnapshot(parsed)) {
        listener(parsed as TableChannelSnapshot<TState>);
      }
    });
  }

  return () => {
    window.removeEventListener("storage", handleStorage);
    channel?.close();
  };
}

export function subscribeTableLobbySnapshot(
  game: SyncedTableGame,
  listener: (snapshot: TableLobbySnapshot) => void,
) {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const storageKey = getTableLobbyStorageKey(game);
  const broadcastName = getTableLobbyBroadcastName(game);

  function notify(rawValue: string | null) {
    if (!rawValue) return;

    try {
      const parsed = JSON.parse(rawValue);
      if (isTableLobbySnapshot(parsed)) {
        listener(parsed);
      }
    } catch {
      // Ignore malformed payloads from older clients.
    }
  }

  function handleStorage(event: StorageEvent) {
    if (event.key !== storageKey) return;
    notify(event.newValue);
  }

  window.addEventListener("storage", handleStorage);

  const channel =
    typeof BroadcastChannel !== "undefined"
      ? new BroadcastChannel(broadcastName)
      : null;

  if (channel) {
    channel.addEventListener("message", (event) => {
      const parsed = event.data;
      if (isTableLobbySnapshot(parsed)) {
        listener(parsed);
      }
    });
  }

  return () => {
    window.removeEventListener("storage", handleStorage);
    channel?.close();
  };
}

export function readSyncedTableSelection(game: SyncedTableGame) {
  if (typeof window === "undefined") return "";

  try {
    return String(window.localStorage.getItem(getTableSelectionStorageKey(game)) || "").trim();
  } catch {
    return "";
  }
}

export function writeSyncedTableSelection(game: SyncedTableGame, roomId: string) {
  if (typeof window === "undefined") return;

  const normalizedRoomId = String(roomId || "").trim();
  if (!normalizedRoomId) return;

  try {
    window.localStorage.setItem(getTableSelectionStorageKey(game), normalizedRoomId);
  } catch {
    // Ignore storage failures to preserve table switching.
  }

  if (typeof BroadcastChannel === "undefined") {
    return;
  }

  const channel = new BroadcastChannel(getTableSelectionBroadcastName(game));
  channel.postMessage(normalizedRoomId);
  channel.close();
}

export function subscribeSyncedTableSelection(
  game: SyncedTableGame,
  listener: (roomId: string) => void,
) {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const storageKey = getTableSelectionStorageKey(game);
  const broadcastName = getTableSelectionBroadcastName(game);

  function notify(rawValue: string | null) {
    const normalizedRoomId = String(rawValue || "").trim();
    if (!normalizedRoomId) return;
    listener(normalizedRoomId);
  }

  function handleStorage(event: StorageEvent) {
    if (event.key !== storageKey) return;
    notify(event.newValue);
  }

  window.addEventListener("storage", handleStorage);

  const channel =
    typeof BroadcastChannel !== "undefined"
      ? new BroadcastChannel(broadcastName)
      : null;

  if (channel) {
    channel.addEventListener("message", (event) => {
      notify(typeof event.data === "string" ? event.data : null);
    });
  }

  return () => {
    window.removeEventListener("storage", handleStorage);
    channel?.close();
  };
}
