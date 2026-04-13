import type { PiratePlayingCard, PokerScore } from "./pirateCards";

export type CasinoTransaction = {
  id: string;
  kind: string;
  amount: number;
  balanceAfter: number;
  createdAt: string | null;
  metadata: Record<string, unknown> | null;
};

export type CasinoWin = {
  lineIndex: number;
  symbol: string;
  label: string;
  matchCount: number;
  payout: number;
  indexes: number[];
  lineRows: number[];
};

export type CasinoSpinBonusStage = {
  step: number;
  ratio: number;
  heldIndexes: number[];
  jokerCount: number;
  grid: string[][];
};

export type CasinoSpinBonus = {
  triggered: boolean;
  trigger: string;
  triggerIndexes: number[];
  initialJokerCount: number;
  openingGrid: string[][];
  stages: CasinoSpinBonusStage[];
  finalJokerCount: number;
  crossJoker: boolean;
  fullJoker: boolean;
  feature: "joker_line" | "joker_cross" | "joker_full";
  holdDurationMs: number;
  stageDurationMs: number;
};

export type CasinoSpin = {
  bet: number;
  lineBet: number;
  reelCount: number;
  rowCount: number;
  activeLines: number;
  grid: string[][];
  wins: CasinoWin[];
  totalPayout: number;
  netChange: number;
  bonus: CasinoSpinBonus | null;
  generatedAt: string;
};

export type CasinoWallet = {
  balance: number;
  lifetimeWagered: number;
  lifetimeWon: number;
  gamesPlayed: number;
  lastDailyBonusAt: string | null;
  nextDailyBonusAt: string | null;
  canClaimDailyBonus: boolean;
  dailyBonusAmount: number;
  minBet: number;
  maxBet: number;
  activeLines: number;
};

export type CasinoProfile = {
  ok: true;
  user: {
    id: string;
    username: string;
    email: string | null;
  };
  wallet: CasinoWallet;
  recentTransactions: CasinoTransaction[];
};

type AuthResponse = {
  success?: boolean;
  ok?: boolean;
  token?: string;
  user?: {
    id?: string | number;
    username?: string;
    email?: string;
  };
  error?: string;
};

type DailyBonusResponse = {
  ok: boolean;
  claimedAmount: number;
  profile: CasinoProfile;
  error?: string;
  nextDailyBonusAt?: string;
};

type SpinResponse = {
  ok: boolean;
  spin: CasinoSpin;
  profile: CasinoProfile;
  error?: string;
};

function getDefaultApiBase() {
  if (typeof window !== "undefined") {
    const host = String(window.location.hostname || "").trim().toLowerCase();
    if (

      host === "funesterie.pro"
      || host === "www.funesterie.pro"
      || host === "casino.funesterie.pro"
      || host.endsWith(".funesterie.pro")
    ) {
      return "https://api.funesterie.pro";
    }
    return window.location.origin;
  }

  return "";
}

const API_BASE = String(import.meta.env.VITE_A11_API_BASE_URL || getDefaultApiBase()).trim().replace(/\/$/, "");
const TOKEN_KEY = 'funesterie-casino-token';
const DISPLAY_NAME_KEY = 'funesterie-casino-display-name';
const TAB_ID_KEY = "funesterie-casino-tab-id";
let fallbackCasinoTabId = "";

function getApiUrl(path: string) {
  const normalizedPath = String(path || '').trim();
  if (!normalizedPath) return API_BASE;
  return `${API_BASE}${normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`}`;
}

async function readJsonSafe(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function getErrorMessage(payload: any, fallback: string) {
  const raw = String(payload?.error || payload?.message || '').trim();
  return raw || fallback;
}

function createCasinoTabId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `casino-tab-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getCasinoTabId() {
  if (fallbackCasinoTabId) {
    return fallbackCasinoTabId;
  }

  try {
    const existing = String(sessionStorage.getItem(TAB_ID_KEY) || "").trim();
    if (existing) {
      fallbackCasinoTabId = existing;
      return existing;
    }
    const nextId = createCasinoTabId();
    sessionStorage.setItem(TAB_ID_KEY, nextId);
    fallbackCasinoTabId = nextId;
    return nextId;
  } catch {
    fallbackCasinoTabId = createCasinoTabId();
    return fallbackCasinoTabId;
  }
}

export class CasinoApiError extends Error {
  status: number;
  code: string;

  constructor(message: string, options: { status?: number; code?: string } = {}) {
    super(message);
    this.name = "CasinoApiError";
    this.status = Number(options.status || 0);
    this.code = String(options.code || "").trim();
  }
}

export function isCasinoSessionError(error: unknown) {
  return error instanceof CasinoApiError && (error.status === 401 || error.status === 403);
}

export function getCasinoToken() {
  try {
    return String(localStorage.getItem(TOKEN_KEY) || '').trim();
  } catch {
    return '';
  }
}

export function hasCasinoToken() {
  return Boolean(getCasinoToken());
}

export function setCasinoToken(token: string) {
  try {
    localStorage.setItem(TOKEN_KEY, String(token || '').trim());
  } catch {
    // ignore storage failures
  }
}

export function clearCasinoSession() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(DISPLAY_NAME_KEY);
  } catch {
    // ignore
  }
}

export function getCasinoDisplayName() {
  try {
    return String(localStorage.getItem(DISPLAY_NAME_KEY) || '').trim();
  } catch {
    return '';
  }
}

function setCasinoDisplayName(value: string) {
  try {
    const normalized = String(value || '').trim();
    if (!normalized) {
      localStorage.removeItem(DISPLAY_NAME_KEY);
      return;
    }
    localStorage.setItem(DISPLAY_NAME_KEY, normalized);
  } catch {
    // ignore
  }
}

function buildAuthHeaders() {
  const token = getCasinoToken();
  if (!token) {
    throw new Error('Session introuvable');
  }
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'X-Casino-Tab-Id': getCasinoTabId(),
  };
}

export async function loginCasino(username: string, password: string) {
  const response = await fetch(getApiUrl('/api/auth/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: String(username || '').trim(),
      password: String(password || ''),
    }),
  });

  const payload = (await readJsonSafe(response)) as AuthResponse | null;
  if (!response.ok || !payload?.success || !payload?.token) {
    throw new CasinoApiError(getErrorMessage(payload, 'Connexion impossible'), { status: response.status });
  }

  setCasinoToken(payload.token);
  setCasinoDisplayName(payload?.user?.username || username);
  return payload;
}

export async function registerCasino(username: string, email: string, password: string) {
  const response = await fetch(getApiUrl('/api/auth/register'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: String(username || '').trim(),
      email: String(email || '').trim(),
      password: String(password || ''),
    }),
  });

  const payload = (await readJsonSafe(response)) as AuthResponse | null;
  if (!response.ok || !payload?.token) {
    throw new CasinoApiError(getErrorMessage(payload, 'Inscription impossible'), { status: response.status });
  }

  setCasinoToken(payload.token);
  setCasinoDisplayName(payload?.user?.username || username);
  return payload;
}

export async function requestCasinoPasswordReset(email: string) {
  const response = await fetch(getApiUrl('/api/auth/forgot-password'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: String(email || '').trim() }),
  });
  const payload = await readJsonSafe(response);
  if (!response.ok) {
    throw new CasinoApiError(getErrorMessage(payload, 'Envoi du lien impossible'), { status: response.status });
  }
  return payload;
}

export async function fetchCasinoProfile() {
  const response = await fetch(getApiUrl('/api/casino/me'), {
    headers: buildAuthHeaders(),
  });

  const payload = (await readJsonSafe(response)) as CasinoProfile | { error?: string } | null;
  if (!response.ok || !payload || (payload as CasinoProfile).ok !== true) {
    throw new CasinoApiError(getErrorMessage(payload, 'Profil casino indisponible'), { status: response.status });
  }

  const profile = payload as CasinoProfile;
  setCasinoDisplayName(profile.user.username);
  return profile;
}

export async function claimCasinoDailyBonus() {
  const response = await fetch(getApiUrl('/api/casino/daily-bonus'), {
    method: 'POST',
    headers: buildAuthHeaders(),
    body: '{}',
  });

  const payload = (await readJsonSafe(response)) as DailyBonusResponse | { error?: string } | null;
  if (!response.ok || !payload || !('ok' in payload) || !payload.ok) {
    throw new CasinoApiError(getErrorMessage(payload, 'Bonus indisponible'), { status: response.status });
  }
  return payload as DailyBonusResponse;
}

export async function spinCasinoSlots(bet: number) {
  const response = await fetch(getApiUrl('/api/casino/slots/spin'), {
    method: 'POST',
    headers: buildAuthHeaders(),
    body: JSON.stringify({ bet }),
  });

  const payload = (await readJsonSafe(response)) as SpinResponse | { error?: string } | null;
  if (!response.ok || !payload || !('ok' in payload) || !payload.ok) {
    throw new CasinoApiError(getErrorMessage(payload, 'Spin impossible'), { status: response.status });
  }
  return payload as SpinResponse;
}

export type TreasureMapResult = {
  selectedPoint: string;
  winningPoint: string;
  reward: number;
  cost: number;
  netChange: number;
  playedAt: string;
};

export type TreasureHuntTile = {
  id: number;
  revealed: boolean;
  reward: number | null;
  label: string | null;
};

export type TreasureHuntState = {
  token: string | null;
  phase: "playing" | "resolved";
  shotsLeft: number;
  reward: number;
  cost: number;
  board: TreasureHuntTile[];
  message: string;
};

export type BlackjackSeat = {
  id: string;
  userId?: string;
  name: string;
  username?: string;
  chips: number;
  wager: number;
  cards: PiratePlayingCard[];
  score?: BlackjackScore;
  status?: string;
  mood: string;
  result: string;
  payoutAmount?: number;
  lastDelta?: number;
  position?: number;
  isSelf?: boolean;
  isActive?: boolean;
};

export type BlackjackScore = {
  total: number;
  isSoft: boolean;
  isBlackjack: boolean;
  isBust: boolean;
};

export type BlackjackAction = "hit" | "stand" | "double" | "split";

export type BlackjackHand = {
  id?: string;
  cards: PiratePlayingCard[];
  wager: number;
  score: BlackjackScore;
  result?: string;
  lastDelta?: number;
  isActive?: boolean;
  canDouble?: boolean;
  canSplit?: boolean;
};

export type BlackjackState = {
  token: string | null;
  roomId?: string | null;
  stage: "waiting" | "player-turn" | "resolved";
  waitingForPlayers?: boolean;
  roomActive?: boolean;
  presenceWindowMs?: number;
  roundId?: number;
  bettingClosesAt?: string | null;
  turnDeadlineAt?: string | null;
  bettingWindowMs?: number;
  turnWindowMs?: number;
  wager: number;
  dealerHidden: boolean;
  playerCards: PiratePlayingCard[];
  dealerCards: PiratePlayingCard[];
  seats?: BlackjackSeat[];
  aiSeats: BlackjackSeat[];
  selfSeatId?: string | null;
  activeSeatId?: string | null;
  pendingSeats?: CasinoTableRoomParticipant[];
  playerScore: BlackjackScore;
  dealerScore: BlackjackScore;
  playerHands?: BlackjackHand[];
  activeHandIndex?: number;
  legalActions?: BlackjackAction[];
  lastDelta: number;
  message: string;
  payoutAmount: number;
};

export type PokerSeat = {
  id: string;
  userId?: string;
  name: string;
  username?: string;
  chips: number;
  cards: PiratePlayingCard[];
  hand: PokerScore | null;
  read: string;
  isWinner: boolean;
  folded?: boolean;
  lastAction?: string;
  totalCommitted?: number;
  streetCommitted?: number;
  position?: number;
  payoutAmount?: number;
  lastDelta?: number;
  isSelf?: boolean;
  isActive?: boolean;
  isAbsent?: boolean;
  absentAt?: string | null;
};

export type PokerPendingSeat = {
  userId: string;
  username: string;
  ante: number;
  readyAt: string | null;
};

export type PokerSeatAmount = {
  playerId: string;
  displayName: string;
  amount: number;
  position?: number;
};

export type PokerState = {
  token: string | null;
  roomId?: string | null;
  stage: "waiting" | "preflop" | "flop" | "turn" | "river" | "showdown";
  stageLabel: string;
  waitingForPlayers?: boolean;
  presenceWindowMs?: number;
  handId?: number;
  bettingClosesAt?: string | null;
  turnDeadlineAt?: string | null;
  bettingWindowMs?: number;
  turnWindowMs?: number;
  ante: number;
  pot: number;
  tablePot?: number;
  playerCards: PiratePlayingCard[];
  communityCards: PiratePlayingCard[];
  seats?: PokerSeat[];
  aiSeats: PokerSeat[];
  selfSeatId?: string | null;
  activeSeatId?: string | null;
  playerFolded: boolean;
  playerHand: PokerScore | null;
  playerChips: number;
  playerCommitted: number;
  playerStreetCommitted: number;
  currentBet: number;
  toCall: number;
  minBet: number;
  minRaiseTo: number;
  legalActions: Array<"check" | "call" | "bet" | "raise" | "fold">;
  aggressorId?: string | null;
  aggressorName?: string | null;
  actionLog: string[];
  lastDelta: number;
  payoutAmount: number;
  message: string;
  pendingSeats?: PokerPendingSeat[];
  seatBets?: PokerSeatAmount[];
  seatStacks?: PokerSeatAmount[];
};

export type RouletteRoundBet = {
  id: number;
  betType: string;
  betValue: string;
  amount: number;
  payout: number;
  createdAt: string | null;
};

export type RouletteParticipant = {
  userId: string;
  username: string;
  totalAmount: number;
  betCount: number;
};

export type RouletteVisibleSpotPlayer = {
  playerId: string;
  displayName: string;
  amount: number;
};

export type RouletteVisibleBetSpot = {
  betType: string;
  betValue: string;
  totalAmount: number;
  playerCount: number;
  players: RouletteVisibleSpotPlayer[];
};

export type RouletteVisiblePlayerBets = {
  playerId: string;
  displayName: string;
  totalAmount: number;
  bets: Array<{
    betType: string;
    betValue: string;
    amount: number;
  }>;
};

export type RouletteResult = {
  id: number;
  winningNumber: number;
  winningColor: string;
  resolvedAt: string | null;
};

export type RouletteRoom = {
  id: string;
  roomActive?: boolean;
  nextClosesAt?: string | null;
  round: {
    id: number;
    opensAt: string | null;
    closesAt: string | null;
    remainingMs: number;
    totalPot: number;
    playerCount: number;
    participants: RouletteParticipant[];
    myBets: RouletteRoundBet[];
    activeParticipants?: CasinoTableRoomParticipant[];
    visibleBetsBySpot?: RouletteVisibleBetSpot[];
    visibleBetsByPlayer?: RouletteVisiblePlayerBets[];
  };
  latestResolved: RouletteResult | null;
  recentResults: RouletteResult[];
};

export type CasinoTableRoomParticipant = {
  userId: string;
  username: string;
  updatedAt: string | null;
};

export type CasinoTableRoom = {
  id: string;
  playerCount: number;
  participants: CasinoTableRoomParticipant[];
  isCurrent: boolean;
  hasSelf: boolean;
};

export type CasinoTableLobby = {
  game: "blackjack" | "poker";
  joinedRoomId: string;
  rooms: CasinoTableRoom[];
};

type TreasureMapResponse = {
  ok: boolean;
  result: TreasureMapResult;
  profile: CasinoProfile;
  error?: string;
};

type TreasureHuntResponse = {
  ok: boolean;
  state: TreasureHuntState;
  profile?: CasinoProfile | null;
  error?: string;
};

type BlackjackResponse = {
  ok: boolean;
  state: BlackjackState;
  profile?: CasinoProfile | null;
  error?: string;
};

type PokerResponse = {
  ok: boolean;
  state: PokerState;
  profile?: CasinoProfile | null;
  error?: string;
};

type PokerTableMutationResponse = PokerResponse & {
  rooms?: CasinoTableRoom[];
};

type RouletteResponse = {
  ok: boolean;
  room: RouletteRoom;
  profile?: CasinoProfile;
  error?: string;
};

type TableLobbyResponse = {
  ok: boolean;
  game: "blackjack" | "poker";
  joinedRoomId: string;
  rooms: CasinoTableRoom[];
  error?: string;
};

async function postCasinoAuthed<T>(path: string, body: unknown) {
  const response = await fetch(getApiUrl(path), {
    method: "POST",
    headers: buildAuthHeaders(),
    body: JSON.stringify(body),
  });
  const payload = (await readJsonSafe(response)) as T | { error?: string } | null;
  if (!response.ok || !payload || ("ok" in (payload as any) && (payload as any).ok === false)) {
    throw new CasinoApiError(getErrorMessage(payload, "Operation casino impossible"), { status: response.status });
  }
  return payload as T;
}

async function getCasinoAuthed<T>(path: string) {
  const response = await fetch(getApiUrl(path), {
    headers: buildAuthHeaders(),
  });
  const payload = (await readJsonSafe(response)) as T | { error?: string } | null;
  if (!response.ok || !payload || ("ok" in (payload as any) && (payload as any).ok === false)) {
    throw new CasinoApiError(getErrorMessage(payload, "Lecture casino impossible"), { status: response.status });
  }
  return payload as T;
}

async function getCasinoAuthedOptionalState<T>(path: string) {
  const response = await fetch(getApiUrl(path), {
    headers: buildAuthHeaders(),
  });

  if (response.status === 404 || response.status === 405) {
    return null;
  }

  const payload = (await readJsonSafe(response)) as
    | { ok?: boolean; state?: T | null; error?: string }
    | null;

  if (!response.ok || !payload || ("ok" in payload && payload.ok === false)) {
    throw new CasinoApiError(getErrorMessage(payload, "Lecture casino impossible"), { status: response.status });
  }

  return payload.state ?? null;
}

export async function playTreasureMap(pointId: string) {
  return postCasinoAuthed<TreasureMapResponse>("/api/casino/treasure-map/play", { pointId });
}

export async function startTreasureHunt() {
  return postCasinoAuthed<TreasureHuntResponse>("/api/casino/treasure-hunt/start", {});
}

export async function revealTreasureHuntTile(token: string, tileId: number) {
  return postCasinoAuthed<TreasureHuntResponse>("/api/casino/treasure-hunt/reveal", { token, tileId });
}

export async function startBlackjackRound(bet: number, roomId?: string) {
  return postCasinoAuthed<BlackjackResponse>("/api/casino/blackjack/start", { bet, roomId });
}

export async function actBlackjackRound(token: string, action: BlackjackAction) {
  return postCasinoAuthed<BlackjackResponse>("/api/casino/blackjack/action", { token, action });
}

export async function fetchBlackjackRoomState(roomId: string) {
  const query = new URLSearchParams({ roomId: String(roomId || "").trim() }).toString();
  return getCasinoAuthedOptionalState<BlackjackState>(`/api/casino/blackjack/state?${query}`);
}

export async function startPokerRound(ante: number, roomId?: string) {
  return postCasinoAuthed<PokerResponse>("/api/casino/poker/start", { ante, roomId });
}

export async function removeAbsentPokerSeat(roomId: string, userId: string) {
  return postCasinoAuthed<PokerTableMutationResponse>("/api/casino/poker/remove-absent", { roomId, userId });
}

export async function actPokerRound(
  token: string,
  action: "reveal" | "showdown" | "check" | "call" | "bet" | "raise" | "fold",
  amount?: number
) {
  return postCasinoAuthed<PokerResponse>("/api/casino/poker/action", {
    token,
    action,
    ...(typeof amount === "number" ? { amount } : {}),
  });
}

export async function fetchPokerRoomState(roomId: string) {
  const query = new URLSearchParams({ roomId: String(roomId || "").trim() }).toString();
  return getCasinoAuthedOptionalState<PokerState>(`/api/casino/poker/state?${query}`);
}

export async function fetchRouletteRoom() {
  return getCasinoAuthed<RouletteResponse>("/api/casino/roulette/state?includeProfile=0");
}

export async function placeRouletteBet(betType: string, betValue: string, amount: number) {
  return postCasinoAuthed<RouletteResponse>("/api/casino/roulette/bet?includeProfile=1", { betType, betValue, amount });
}

export async function joinBlackjackRoom(roomId: string) {
  return postCasinoAuthed<TableLobbyResponse>("/api/casino/blackjack/rooms/join", { roomId });
}

export async function joinPokerRoom(roomId: string) {
  return postCasinoAuthed<TableLobbyResponse>("/api/casino/poker/rooms/join", { roomId });
}

export async function leaveCasinoTableRoom(
  game: "blackjack" | "poker",
  roomId: string,
  options: { keepalive?: boolean } = {},
) {
  const response = await fetch(getApiUrl("/api/casino/table-presence/leave"), {
    method: "POST",
    headers: buildAuthHeaders(),
    body: JSON.stringify({
      game,
      roomId,
    }),
    keepalive: options.keepalive === true,
  });
  const payload = (await readJsonSafe(response)) as { ok?: boolean; error?: string } | null;
  if (!response.ok || !payload?.ok) {
    throw new CasinoApiError(getErrorMessage(payload, "Sortie de table impossible"), { status: response.status });
  }
  return payload;
}
