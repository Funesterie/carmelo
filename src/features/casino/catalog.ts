import amightImg from "../../images/amight.png";
import batIconImg from "../../images/bat.png";
import blackjackCaptainArt from "../../images/blackjack-captain-art.png";
import cardArtwork from "../../images/Cartes de pirate au crépuscule.png";
import chauveImg from "../../images/chauve.png";
import coffreImg from "../../images/coffre.png";
import districtArtwork from "../../images/ChatGPT Image 2 avr. 2026, 21_17_56.png";
import dragonImg from "../../images/dragon.png";
import dragoncImg from "../../images/dragonc.png";
import drapImg from "../../images/drap.png";
import elephantImg from "../../images/elephant.png";
import flushImg from "../../images/flush.png";
import fondImg from "../../images/fond.png";
import gunImg from "../../images/gun.png";
import lingotImg from "../../images/lingot.png";
import mapImg from "../../images/map.png";
import perroImg from "../../images/perro.png";
import pokerCaptainArt from "../../images/poker-captain-art.png";
import qflushImg from "../../images/qflush.png";
import romeImg from "../../images/rome.png";
import rouletteArtwork from "../../images/casino ats.png";
import soldatImg from "../../images/soldat.png";
import batVideo from "../../videos/bat.mp4";
import boobaVideo from "../../videos/booba.mp4";
import deppVideo from "../../videos/depp.mp4";
import expVideo from "../../videos/exp.mp4";
import jokerVideo from "../../videos/joker.mp4";
import oneVideo from "../../videos/one.mp4";
import powerVideo from "../../videos/power.mp4";
import rangerVideo from "../../videos/ranger.mp4";
import spartaVideo from "../../videos/sparta.mp4";
import type { CasinoSpin } from "../../lib/casinoApi";
import { formatCredits } from "../../lib/casinoRoomState";

export const BET_PRESETS = [20, 50, 100, 200, 500];
export const SPIN_ANIMATION_STEPS = 11;
export const SPIN_ANIMATION_INTERVAL_MS = 95;
export const SLOT_VIDEO_INTRO_SESSION_KEY = "funesterie-slots-intro-played";
export const CASINO_DISTRICT_ARTWORK = districtArtwork;

export const SYMBOL_META: Record<string, { emoji: string; label: string; accent: string; image: string }> = {
  PIRATE: { emoji: "🏴‍☠️", label: "Pavillon noir", accent: "var(--casino-gold)", image: drapImg },
  CHEST: { emoji: "🧰", label: "Coffre", accent: "var(--casino-copper)", image: coffreImg },
  COIN: { emoji: "🪙", label: "Piastres", accent: "var(--casino-sun)", image: lingotImg },
  BAT: { emoji: "🦇", label: "Chauve-souris", accent: "var(--casino-rose)", image: chauveImg },
  BLUNDERBUSS: { emoji: "🔫", label: "Canon court", accent: "var(--casino-fire)", image: gunImg },
  MAP: { emoji: "🗺️", label: "Carte", accent: "var(--casino-sea)", image: mapImg },
  PARROT: { emoji: "🦜", label: "Perroquet", accent: "var(--casino-lime)", image: perroImg },
  SOLDAT: { emoji: "🛡️", label: "Spartiate", accent: "var(--casino-silver)", image: soldatImg },
  ELEPHANT: { emoji: "🐘", label: "Elephant royal", accent: "var(--casino-ice)", image: elephantImg },
  JOKER: { emoji: "🃏", label: "Joker royal", accent: "var(--casino-violet)", image: flushImg },
};

export const PAYOUT_TABLE = [
  { symbol: "PIRATE", three: "x12", four: "x28", five: "x75" },
  { symbol: "ELEPHANT", three: "x15", four: "x34", five: "x90" },
  { symbol: "JOKER", three: "x20", four: "x80", five: "x200" },
  { symbol: "MAP", three: "x9", four: "x18", five: "x34" },
  { symbol: "CHEST", three: "x8", four: "x18", five: "x40" },
] as const;

export const ROOM_DEFINITIONS = [
  {
    id: "slots",
    label: "Slots",
    chip: "Machine a sous",
    title: "Salon principal",
    body: "Le coeur du casino, avec la machine a sous branchee sur le vrai backend A11 et le solde persistant.",
    icon: qflushImg,
  },
  {
    id: "treasure-map",
    label: "Carte",
    chip: "Carte au tresor",
    title: "Archiviste des criques",
    body: "Une seule croix, une seule chance, mais un positionnement enfin propre et lisible jusque sur telephone.",
    icon: dragoncImg,
  },
  {
    id: "treasure-hunt",
    label: "Chasse",
    chip: "Chasse navale",
    title: "Baie aux epaves",
    body: "Trois tirs, trois navires caches, et une lecture de plateau robuste au lieu des vieux overlays fragiles.",
    icon: dragonImg,
  },
  {
    id: "blackjack",
    label: "Blackjack",
    chip: "Table des lanternes",
    title: "Blackjack pirate",
    body: "Une vraie table avec croupier, quatre IA autour de toi et des mises qui debitent le wallet A11 en direct.",
    icon: amightImg,
  },
  {
    id: "poker",
    label: "Poker",
    chip: "Salon hold'em",
    title: "Texas hold'em rapide",
    body: "Cinq joueurs a table, quatre IA, un showdown net et des paiements serves par le backend A11.",
    icon: romeImg,
  },
  {
    id: "roulette",
    label: "Roulette",
    chip: "ATS live",
    title: "Roulette multijoueur",
    body: "Une salle commune, un compte a rebours partage, des mises visibles par plusieurs comptes et un tir serveur unique pour toute la table.",
    icon: batIconImg,
  },
] as const;

export type RoomId = (typeof ROOM_DEFINITIONS)[number]["id"];

export type SlotFeatureKey =
  | "idle"
  | "elephant"
  | "soldat"
  | "bat"
  | "gun"
  | "joker-line"
  | "joker-cross"
  | "joker-full";

export type RouletteSoundEvent =
  | { type: "enter" | "join"; roundId: number; participants: number }
  | { type: "spin"; roundId: number; resultId: number; winningNumber: number | null; canonDelayMs?: number };

export const SLOT_INTRO_MEDIA = {
  title: "Introduction du salon",
  body: "L'introduction passe une seule fois, puis la machine a sous bascule sur son ambiance video continue.",
  image: fondImg,
  video: oneVideo,
} as const;

export const SLOT_AMBIENT_MEDIA = {
  title: "Ambiance machine a sous",
  body: "La video d'ambiance Depp prend ensuite le relai tant qu'aucune alerte de gain ne lui coupe la route.",
  image: fondImg,
  video: deppVideo,
} as const;

export const SLOT_FEATURE_MEDIA: Record<
  SlotFeatureKey,
  {
    title: string;
    body: string;
    image: string;
    video?: string;
  }
> = {
  idle: {
    title: "Ouverture du salon",
    body: "Le relais d'entree de la machine a sous tourne en boucle pendant que la cale se charge.",
    image: fondImg,
    video: oneVideo,
  },
  "joker-line": {
    title: "Alignement joker",
    body: "Le drapeau joker ouvre la phase bonus et garde chaque symbole royal a sa place.",
    image: drapImg,
    video: jokerVideo,
  },
  elephant: {
    title: "Charge des elephants",
    body: "Un alignement royal qui ouvre le grand show de la salle.",
    image: elephantImg,
    video: boobaVideo,
  },
  soldat: {
    title: "Escouade spartiate",
    body: "Les soldats prennent le plateau et declenchent la parade.",
    image: soldatImg,
    video: spartaVideo,
  },
  bat: {
    title: "Nuee de chauves-souris",
    body: "Le ciel du casino se ferme quand les BAT se mettent d'accord.",
    image: chauveImg,
    video: batVideo,
  },
  gun: {
    title: "Canon court en feu",
    body: "Les blunderbuss chargent un clip d'impact a chaque serie lourde.",
    image: gunImg,
    video: expVideo,
  },
  "joker-cross": {
    title: "Croix joker",
    body: "Les jokers forment une croix complete sur les diagonales et passent en phase power.",
    image: drapImg,
    video: powerVideo,
  },
  "joker-full": {
    title: "Full joker",
    body: "La grille entiere se transforme en jokers. Le ranger prend le pont pour la pluie de lingots.",
    image: drapImg,
    video: rangerVideo,
  },
};

export function resolveRoomArtwork(activeRoom: RoomId) {
  switch (activeRoom) {
    case "roulette":
      return rouletteArtwork;
    case "slots":
      return fondImg;
    case "blackjack":
      return blackjackCaptainArt;
    case "poker":
      return pokerCaptainArt;
    case "treasure-map":
    case "treasure-hunt":
      return districtArtwork;
    default:
      return cardArtwork;
  }
}

export function randomSymbolId() {
  const keys = Object.keys(SYMBOL_META);
  return keys[Math.floor(Math.random() * keys.length)] || "COIN";
}

export function buildPlaceholderGrid(rows = 3, reels = 5) {
  return Array.from({ length: rows }, () =>
    Array.from({ length: reels }, () => randomSymbolId()),
  );
}

export function waitForMs(durationMs: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, durationMs);
  });
}

export function formatTransactionLabel(kind: string) {
  switch (kind) {
    case "daily_bonus":
      return "Bonus journalier";
    case "slots_spin":
      return "Spin";
    default:
      return kind;
  }
}

export function formatTransactionTime(value: string | null) {
  if (!value) return "maintenant";
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Paris",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export function getJokerIndexes(grid: string[][]) {
  return grid.flatMap((row, rowIndex) =>
    row.flatMap((symbolId, columnIndex) => (symbolId === "JOKER" ? [rowIndex * row.length + columnIndex] : [])),
  );
}

export function buildGoldRainDrops(totalPayout: number, bet: number) {
  const ratio = totalPayout / Math.max(1, bet);
  const count = Math.max(0, Math.min(40, Math.round(ratio * 4)));
  return Array.from({ length: count }, (_, index) => ({
    id: `gold-${Date.now()}-${index}`,
    left: `${4 + ((index * 11) % 88)}%`,
    delay: `${(index % 8) * 0.12}s`,
    duration: `${1.8 + (index % 5) * 0.22}s`,
    scale: `${0.68 + (index % 4) * 0.15}`,
    drift: `${-18 + (index % 7) * 6}px`,
  }));
}

export function chooseSlotFeature(spin: CasinoSpin | null): SlotFeatureKey {
  if (!spin) return "idle";

  if (spin.bonus?.feature === "joker_full") return "joker-full";
  if (spin.bonus?.feature === "joker_cross") return "joker-cross";
  if (spin.bonus?.feature === "joker_line") return "joker-line";

  const strongestWin = [...spin.wins].sort((left, right) => right.payout - left.payout)[0];
  if (strongestWin?.symbol === "ELEPHANT") return "elephant";
  if (strongestWin?.symbol === "SOLDAT") return "soldat";
  if (strongestWin?.symbol === "BAT") return "bat";
  if (strongestWin?.symbol === "BLUNDERBUSS") return "gun";
  return "idle";
}

export function getBonusNarration(spin: CasinoSpin) {
  if (spin.bonus?.feature === "joker_full") {
    return "Full joker verrouille. Toute la grille bascule sous le ranger.";
  }
  if (spin.bonus?.feature === "joker_cross") {
    return "Croix joker detectee. Les diagonales sont tenues.";
  }
  if (spin.bonus?.triggered) {
    return spin.bonus.trigger === "joker_count"
      ? "Cinq jokers disperses ouvrent la phase bonus."
      : "Alignement joker detecte. Les symboles royaux restent figes.";
  }
  return spin.totalPayout > 0
    ? `Table gagnee: +${formatCredits(spin.totalPayout)} credits.`
    : "Aucun alignement cette fois. La maison respire encore.";
}
