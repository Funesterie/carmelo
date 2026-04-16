// Pirate Slots RNG & Logic
import { randInt } from "./rng";

export type PirateSymbolId =
  | "PIRATE"
  | "CHEST"
  | "COIN"
  | "BAT"
  | "BLUNDERBUSS"
  | "MAP"
  | "PARROT"
  | "SOLDAT"
  | "ELEPHANT"
  | "JOKER";

export const pirateSymbols: { id: PirateSymbolId; weight: number; emoji: string }[] = [
  { id: "PIRATE", weight: 18, emoji: "🏴‍☠️" },
  { id: "CHEST", weight: 15, emoji: "🧰" },
  { id: "COIN", weight: 22, emoji: "🪙" },
  { id: "BAT", weight: 14, emoji: "🦇" },
  { id: "BLUNDERBUSS", weight: 10, emoji: "🔫" },
  { id: "MAP", weight: 12, emoji: "🗺️" },
  { id: "PARROT", weight: 5, emoji: "🦜" },
  { id: "SOLDAT", weight: 9, emoji: "🛡️" },
  { id: "ELEPHANT", weight: 6, emoji: "🐘" },
  { id: "JOKER", weight: 6, emoji: "🃏" },
];

const piratePayouts: Record<PirateSymbolId, { 3: number; 4: number; 5: number }> = {
  PIRATE: { 3: 12, 4: 28, 5: 75 },
  CHEST: { 3: 8, 4: 18, 5: 40 },
  COIN: { 3: 6, 4: 12, 5: 22 },
  BAT: { 3: 5, 4: 10, 5: 18 },
  BLUNDERBUSS: { 3: 7, 4: 14, 5: 26 },
  MAP: { 3: 9, 4: 18, 5: 34 },
  PARROT: { 3: 20, 4: 40, 5: 80 },
  SOLDAT: { 3: 12, 4: 26, 5: 60 },
  ELEPHANT: { 3: 15, 4: 34, 5: 90 },
  JOKER: { 3: 20, 4: 80, 5: 200 },
};

export function pickWeightedPirate(): PirateSymbolId {
  const total = pirateSymbols.reduce((s, x) => s + x.weight, 0);
  let roll = randInt(1, total);
  for (const s of pirateSymbols) {
    roll -= s.weight;
    if (roll <= 0) return s.id;
  }
  return "COIN";
}

export type PirateSpinResult = {
  reels: [PirateSymbolId, PirateSymbolId, PirateSymbolId, PirateSymbolId, PirateSymbolId];
  win: number;
  payout: number;
};

export function spinPirateSlots(bet: number): PirateSpinResult {
  const reels: [PirateSymbolId, PirateSymbolId, PirateSymbolId, PirateSymbolId, PirateSymbolId] = [
    pickWeightedPirate(), pickWeightedPirate(), pickWeightedPirate(), pickWeightedPirate(), pickWeightedPirate()
  ];

  const counts = new Map<PirateSymbolId, number>();
  reels.forEach((symbolId) => {
    counts.set(symbolId, Number(counts.get(symbolId) || 0) + 1);
  });

  const [bestSymbol, bestCount] = [...counts.entries()].sort((left, right) => right[1] - left[1])[0] || ["COIN", 0];
  const payoutMultiplier = bestCount >= 3 ? piratePayouts[bestSymbol]?.[bestCount as 3 | 4 | 5] || 0 : 0;
  const payout = bet * payoutMultiplier;

  const win = payout;
  return { reels, win, payout };
}
