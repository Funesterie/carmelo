export type TableSalonMeta = {
  id: string;
  title: string;
  chip: string;
  blurb: string;
};

export type TableSalonGame = "blackjack" | "poker";

export type TableChannelDisplayMeta = TableSalonMeta & {
  channelIndex: number;
  channelLabel: string;
  shortLabel: string;
};

export const BLACKJACK_SALONS: TableSalonMeta[] = [
  {
    id: "lantern-quay",
    title: "Lantern Quay",
    chip: "Salon principal",
    blurb: "Table lisible, croupier en vue et flux calme pour jouer vite.",
  },
  {
    id: "bat-parlor",
    title: "Bat Parlor",
    chip: "Canal rapide",
    blurb: "Cadence plus nerveuse, ambiance feutree et jetons qui tournent vite.",
  },
  {
    id: "scream-lounge",
    title: "Scream Lounge",
    chip: "Table noire",
    blurb: "Salon nocturne pour suivre les autres joueurs sans perdre la lecture.",
  },
];

export const POKER_SALONS: TableSalonMeta[] = [
  {
    id: "allmight-ring",
    title: "Allmight Ring",
    chip: "Table phare",
    blurb: "Le grand ovale hold'em, propre et lisible, pour voir le ring au complet.",
  },
  {
    id: "upstream-port",
    title: "Upstream Port",
    chip: "Canal cash",
    blurb: "Une table plus directe, pensée pour enchaîner les mains rapidement.",
  },
  {
    id: "captains-table",
    title: "Captain's Table",
    chip: "Salon prive",
    blurb: "Un coin plus calme pour voir qui rejoint et garder le board bien lisible.",
  },
];

const TABLE_SALONS: Record<TableSalonGame, TableSalonMeta[]> = {
  blackjack: BLACKJACK_SALONS,
  poker: POKER_SALONS,
};

function buildFallbackTableSalonMeta(game: TableSalonGame, roomId: string, index: number) {
  const channelIndex = Math.max(1, index + 1);
  const channelLabel = `Canal ${channelIndex}`;

  if (game === "blackjack") {
    return {
      id: roomId,
      title: channelLabel,
      chip: "Table auto",
      blurb: "Canal cree automatiquement selon l'affluence pour garder la phase de mise en commun.",
    } satisfies TableSalonMeta;
  }

  return {
    id: roomId,
    title: channelLabel,
    chip: "Table auto",
    blurb: "Canal cree automatiquement selon l'affluence pour partager la prochaine main avec tes amis.",
  } satisfies TableSalonMeta;
}

export function getTableSalonMeta(game: TableSalonGame, roomId: string, index = 0) {
  const normalizedRoomId = String(roomId || "").trim();
  const knownMeta =
    TABLE_SALONS[game].find((entry) => entry.id === normalizedRoomId)
    || null;

  return knownMeta || buildFallbackTableSalonMeta(game, normalizedRoomId, index);
}

export function getTableChannelDisplayMeta(game: TableSalonGame, roomId: string, index = 0): TableChannelDisplayMeta {
  const baseMeta = getTableSalonMeta(game, roomId, index);
  const channelIndex = Math.max(1, index + 1);

  return {
    ...baseMeta,
    channelIndex,
    channelLabel: `Canal ${channelIndex}`,
    shortLabel: `C${channelIndex}`,
  };
}
