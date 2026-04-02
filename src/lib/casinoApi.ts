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

const API_BASE = String(import.meta.env.VITE_A11_API_BASE_URL || 'https://api.funesterie.pro').trim().replace(/\/$/, '');
const TOKEN_KEY = 'funesterie-casino-token';
const DISPLAY_NAME_KEY = 'funesterie-casino-display-name';

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
  localStorage.setItem(TOKEN_KEY, String(token || '').trim());
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
    throw new Error(getErrorMessage(payload, 'Connexion impossible'));
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
    throw new Error(getErrorMessage(payload, 'Inscription impossible'));
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
    throw new Error(getErrorMessage(payload, 'Envoi du lien impossible'));
  }
  return payload;
}

export async function fetchCasinoProfile() {
  const response = await fetch(getApiUrl('/api/casino/me'), {
    headers: buildAuthHeaders(),
  });

  const payload = (await readJsonSafe(response)) as CasinoProfile | { error?: string } | null;
  if (!response.ok || !payload || (payload as CasinoProfile).ok !== true) {
    throw new Error(getErrorMessage(payload, 'Profil casino indisponible'));
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
    throw new Error(getErrorMessage(payload, 'Bonus indisponible'));
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
    throw new Error(getErrorMessage(payload, 'Spin impossible'));
  }
  return payload as SpinResponse;
}
