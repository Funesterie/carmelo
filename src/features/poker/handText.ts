import type { PokerScore } from "../../lib/pirateCards";

type PokerWinnerLike = {
  name: string;
  handLabel: string;
};

const RANK_LABELS: Record<number, { singular: string; plural: string }> = {
  2: { singular: "2", plural: "2" },
  3: { singular: "3", plural: "3" },
  4: { singular: "4", plural: "4" },
  5: { singular: "5", plural: "5" },
  6: { singular: "6", plural: "6" },
  7: { singular: "7", plural: "7" },
  8: { singular: "8", plural: "8" },
  9: { singular: "9", plural: "9" },
  10: { singular: "10", plural: "10" },
  11: { singular: "Valet", plural: "Valets" },
  12: { singular: "Dame", plural: "Dames" },
  13: { singular: "Roi", plural: "Rois" },
  14: { singular: "As", plural: "As" },
};

function getRankLabel(rank: number) {
  return RANK_LABELS[Number(rank) || 0]?.singular || String(Number(rank) || "");
}

function getRankPlural(rank: number) {
  return RANK_LABELS[Number(rank) || 0]?.plural || String(Number(rank) || "");
}

function getHighRankLabel(rank: number) {
  const label = getRankLabel(rank);
  if (!label) return "";
  return Number(rank) === 14 ? `a l'${label}` : `au ${label}`;
}

function normalizeLabel(value: string | null | undefined) {
  return String(value || "").trim();
}

export function formatPokerHandLabel(hand: PokerScore | null | undefined) {
  if (!hand) return "";

  const [primaryRank, secondaryRank] = hand.tiebreakers || [];
  switch (Number(hand.category || 0)) {
    case 8:
      return Number(primaryRank || 0) >= 14 ? "Quinte flush royale" : `Quinte flush ${getHighRankLabel(primaryRank)}`;
    case 7:
      return primaryRank ? `Carre de ${getRankPlural(primaryRank)}` : normalizeLabel(hand.label);
    case 6:
      return primaryRank && secondaryRank
        ? `Full de ${getRankPlural(primaryRank)} par les ${getRankPlural(secondaryRank)}`
        : normalizeLabel(hand.label);
    case 5:
      return primaryRank ? `Couleur hauteur ${getRankLabel(primaryRank)}` : normalizeLabel(hand.label);
    case 4:
      return primaryRank ? `Suite ${getHighRankLabel(primaryRank)}` : normalizeLabel(hand.label);
    case 3:
      return primaryRank ? `Brelan de ${getRankPlural(primaryRank)}` : normalizeLabel(hand.label);
    case 2:
      return primaryRank && secondaryRank
        ? `Deux paires ${getRankPlural(primaryRank)} et ${getRankPlural(secondaryRank)}`
        : normalizeLabel(hand.label);
    case 1:
      return primaryRank ? `Paire de ${getRankPlural(primaryRank)}` : normalizeLabel(hand.label);
    case 0:
      return primaryRank ? `Carte haute ${getRankLabel(primaryRank)}` : normalizeLabel(hand.label);
    default:
      return normalizeLabel(hand.label);
  }
}

export function buildPokerWinningHeadline(winners: PokerWinnerLike[] | null | undefined) {
  const labels = [...new Set((winners || []).map((winner) => normalizeLabel(winner.handLabel)).filter(Boolean))];
  if (!labels.length) return "Main gagnante";
  return `${labels.length > 1 ? "Mains gagnantes" : "Main gagnante"}: ${labels.join(" / ")}`;
}

export function buildPokerWinnerSummary(winners: PokerWinnerLike[] | null | undefined) {
  const cleanWinners = (winners || []).map((winner) => ({
    name: normalizeLabel(winner.name) || "Joueur",
    handLabel: normalizeLabel(winner.handLabel),
  }));
  if (!cleanWinners.length) return "";

  if (cleanWinners.length === 1) {
    return cleanWinners[0].handLabel
      ? `Main gagnante: ${cleanWinners[0].name} avec ${cleanWinners[0].handLabel}.`
      : `Main gagnante: ${cleanWinners[0].name}.`;
  }

  const firstHandLabel = cleanWinners[0].handLabel;
  const allSameHand = Boolean(firstHandLabel) && cleanWinners.every((winner) => winner.handLabel === firstHandLabel);
  if (allSameHand) {
    return `Mains gagnantes: ${cleanWinners.map((winner) => winner.name).join(", ")} avec ${firstHandLabel}.`;
  }

  return `Mains gagnantes: ${cleanWinners.map((winner) => (
    winner.handLabel ? `${winner.name} (${winner.handLabel})` : winner.name
  )).join(", ")}.`;
}
