import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import alerteSound from "./audio/alerte.mp3";
import bingoSound from "./audio/bingo.mp3";
import piratesongAudio from "./audio/piratesong.mp3";
import BlackjackRoom from "./BlackjackRoom";
import CarteMiniGame from "./CarteMiniGame";
import MiniTreasureGame from "./MiniTreasureGame";
import PokerRoom from "./PokerRoom";
import RouletteRoom from "./RouletteRoom";
import casinoPoster from "./images/casino.png";
import cardArtwork from "./images/Cartes de pirate au crépuscule.png";
import chauveImg from "./images/chauve.png";
import elephantImg from "./images/elephant.png";
import gunImg from "./images/gun.png";
import mapImg from "./images/map.png";
import perroImg from "./images/perro.png";
import rouletteArtwork from "./images/casino ats.png";
import soldatImg from "./images/soldat.png";
import districtArtwork from "./images/ChatGPT Image 2 avr. 2026, 21_17_56.png";
import flushImg from "./images/flush.png";
import fondImg from "./images/fond.png";
import batVideo from "./videos/bat.mp4";
import boobaVideo from "./videos/booba.mp4";
import expVideo from "./videos/exp.mp4";
import jokerVideo from "./videos/joker.mp4";
import powerVideo from "./videos/power.mp4";
import rangerVideo from "./videos/ranger.mp4";
import spartaVideo from "./videos/sparta.mp4";
import { formatCredits } from "./lib/casinoRoomState";
import {
  spinCasinoSlots,
  type CasinoProfile,
  type CasinoSpin,
  type CasinoTransaction,
} from "./lib/casinoApi";

const BET_PRESETS = [20, 50, 100, 200, 500];
const SPIN_ANIMATION_STEPS = 11;
const SPIN_ANIMATION_INTERVAL_MS = 95;

const SYMBOL_META: Record<string, { emoji: string; label: string; accent: string }> = {
  PIRATE: { emoji: "🏴‍☠️", label: "Pavillon noir", accent: "var(--casino-gold)" },
  CHEST: { emoji: "🧰", label: "Coffre", accent: "var(--casino-copper)" },
  COIN: { emoji: "🪙", label: "Piastres", accent: "var(--casino-sun)" },
  BAT: { emoji: "🦇", label: "Chauve-souris", accent: "var(--casino-rose)" },
  BLUNDERBUSS: { emoji: "🔫", label: "Canon court", accent: "var(--casino-fire)" },
  MAP: { emoji: "🗺️", label: "Carte", accent: "var(--casino-sea)" },
  PARROT: { emoji: "🦜", label: "Perroquet", accent: "var(--casino-lime)" },
  SOLDAT: { emoji: "🛡️", label: "Spartiate", accent: "var(--casino-silver)" },
  ELEPHANT: { emoji: "🐘", label: "Elephant royal", accent: "var(--casino-ice)" },
  JOKER: { emoji: "🃏", label: "Joker royal", accent: "var(--casino-violet)" },
};

const PAYOUT_TABLE = [
  { symbol: "PIRATE", three: "x12", four: "x28", five: "x75" },
  { symbol: "ELEPHANT", three: "x15", four: "x34", five: "x90" },
  { symbol: "JOKER", three: "x20", four: "x80", five: "x200" },
  { symbol: "MAP", three: "x9", four: "x18", five: "x34" },
  { symbol: "CHEST", three: "x8", four: "x18", five: "x40" },
];

const ROOM_DEFINITIONS = [
  {
    id: "slots",
    label: "Slots",
    chip: "Machine a sous",
    title: "Salon principal",
    body: "Le coeur du casino, avec la machine a sous branchee sur le vrai backend A11 et le solde persistant.",
  },
  {
    id: "treasure-map",
    label: "Carte",
    chip: "Carte au tresor",
    title: "Archiviste des criques",
    body: "Une seule croix, une seule chance, mais un positionnement enfin propre et lisible jusque sur telephone.",
  },
  {
    id: "treasure-hunt",
    label: "Chasse",
    chip: "Chasse navale",
    title: "Baie aux epaves",
    body: "Trois tirs, trois navires caches, et une lecture de plateau robuste au lieu des vieux overlays fragiles.",
  },
  {
    id: "blackjack",
    label: "Blackjack",
    chip: "Table des lanternes",
    title: "Blackjack pirate",
    body: "Une vraie table avec croupier, quatre IA autour de toi et des mises qui debitent le wallet A11 en direct.",
  },
  {
    id: "poker",
    label: "Poker",
    chip: "Salon hold'em",
    title: "Texas hold'em rapide",
    body: "Cinq joueurs a table, quatre IA, un showdown net et des paiements serves par le backend A11.",
  },
  {
    id: "roulette",
    label: "Roulette",
    chip: "ATS live",
    title: "Roulette multijoueur",
    body: "Une salle commune, un compte a rebours partage, des mises visibles par plusieurs comptes et un tir serveur unique pour toute la table.",
  },
] as const;

const DISTRICT_CARDS = [
  { id: "freeland", title: "Freeland Archive", subtitle: "Cartes & butins", roomId: "treasure-map", col: 0, row: 0 },
  { id: "nezlephant", title: "Nezlephant Vault", subtitle: "Salles denses", roomId: "treasure-hunt", col: 1, row: 0 },
  { id: "rome", title: "Rome Table", subtitle: "Coupes rapides", roomId: "roulette", col: 2, row: 0 },
  { id: "dragon", title: "Dragon High Rollers", subtitle: "Blackjack live", roomId: "blackjack", col: 0, row: 1 },
  { id: "qflush", title: "Qflush Arcade", subtitle: "Slots A11", roomId: "slots", col: 1, row: 1 },
  { id: "morphing", title: "Morphing Vault", subtitle: "Butins caches", roomId: "treasure-hunt", col: 2, row: 1 },
  { id: "scream", title: "Scream Whisper Room", subtitle: "Tables noires", roomId: "blackjack", col: 0, row: 2 },
  { id: "bat", title: "Bat Lantern Club", subtitle: "Croupier & cartes", roomId: "blackjack", col: 1, row: 2 },
  { id: "allmight", title: "Allmight Showdown", subtitle: "Poker propre", roomId: "poker", col: 2, row: 2 },
  { id: "contracts", title: "Dragon Contracts", subtitle: "Port prive", roomId: "roulette", col: 0, row: 3 },
  { id: "upstream-a", title: "Upstream Forge", subtitle: "Jeux serveurs", roomId: "slots", col: 1, row: 3 },
  { id: "upstream-b", title: "Upstream Duel", subtitle: "Tables actives", roomId: "poker", col: 2, row: 3 },
] as const;

type RoomId = (typeof ROOM_DEFINITIONS)[number]["id"];

type SlotFeatureKey =
  | "idle"
  | "joker"
  | "elephant"
  | "soldat"
  | "bat"
  | "gun"
  | "parrot"
  | "map"
  | "pirate"
  | "bigwin";

const SLOT_FEATURE_MEDIA: Record<
  SlotFeatureKey,
  {
    title: string;
    body: string;
    image: string;
    video?: string;
  }
> = {
  idle: {
    title: "Pont principal",
    body: "Le salon pirate diffuse ses relais visuels entre deux spins.",
    image: casinoPoster,
  },
  joker: {
    title: "Flush Joker",
    body: "Le joker allume l'alerte et verrouille la table visuelle.",
    image: flushImg,
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
    title: "Nuée de chauves-souris",
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
  parrot: {
    title: "Perroquet veilleur",
    body: "Le perroquet prend l'affiche quand le plateau s'emballe sans jackpot.",
    image: perroImg,
  },
  map: {
    title: "Cartographie du butin",
    body: "Une série de cartes au tresor illumine la cale des gains.",
    image: mapImg,
  },
  pirate: {
    title: "Pavillon noir",
    body: "Le drapeau pirate s'impose quand les reels se mettent au diapason.",
    image: fondImg,
    video: rangerVideo,
  },
  bigwin: {
    title: "Big Win",
    body: "Le power clip prend le relai pour les gros paiements machine a sous.",
    image: cardArtwork,
    video: powerVideo,
  },
};

export type RouletteSoundEvent =
  | { type: "enter" | "join"; roundId: number; participants: number }
  | { type: "spin"; roundId: number; resultId: number; winningNumber: number | null };

type PirateSlotsGameProps = {
  profile: CasinoProfile;
  busy: boolean;
  onProfileChange: (profile: CasinoProfile, message?: string) => void;
  onError: (message: string) => void;
  onRouletteEvent?: (event: RouletteSoundEvent) => void;
};

function randomSymbolId() {
  const keys = Object.keys(SYMBOL_META);
  return keys[Math.floor(Math.random() * keys.length)] || "COIN";
}

function buildPlaceholderGrid(rows = 3, reels = 5) {
  return Array.from({ length: rows }, () =>
    Array.from({ length: reels }, () => randomSymbolId()),
  );
}

function formatTransactionLabel(kind: string) {
  switch (kind) {
    case "daily_bonus":
      return "Bonus journalier";
    case "slots_spin":
      return "Spin";
    default:
      return kind;
  }
}

function formatTransactionTime(value: string | null) {
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

function chooseSlotFeature(spin: CasinoSpin | null): SlotFeatureKey {
  if (!spin) return "idle";

  const flattened = spin.grid.flat();
  const hasJoker = flattened.includes("JOKER");
  if (hasJoker) return "joker";

  const strongestWin = [...spin.wins].sort((left, right) => right.payout - left.payout)[0];
  if (strongestWin?.symbol === "ELEPHANT" && strongestWin.matchCount >= 4) return "elephant";
  if (strongestWin?.symbol === "SOLDAT" && strongestWin.matchCount >= 4) return "soldat";
  if (strongestWin?.symbol === "BAT" && strongestWin.matchCount >= 4) return "bat";
  if (strongestWin?.symbol === "BLUNDERBUSS" && strongestWin.matchCount >= 4) return "gun";
  if (strongestWin?.symbol === "PARROT" && strongestWin.matchCount >= 3) return "parrot";
  if (strongestWin?.symbol === "MAP" && strongestWin.matchCount >= 3) return "map";
  if (strongestWin?.symbol === "PIRATE" && strongestWin.matchCount >= 4) return "pirate";
  if (spin.totalPayout >= spin.bet * 5) return "bigwin";
  return "idle";
}

function SlotsRoom({
  profile,
  busy,
  onProfileChange,
  onError,
}: PirateSlotsGameProps) {
  const [bet, setBet] = useState(() => Math.max(profile.wallet.minBet, BET_PRESETS[1]));
  const [displayGrid, setDisplayGrid] = useState<string[][]>(() => buildPlaceholderGrid());
  const [spinState, setSpinState] = useState<"idle" | "spinning">("idle");
  const [lastSpin, setLastSpin] = useState<CasinoSpin | null>(null);
  const [lastMessage, setLastMessage] = useState("Pret a lancer les reels.");
  const [activeFeature, setActiveFeature] = useState<SlotFeatureKey>("idle");
  const intervalRef = useRef<number | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const featureTimeoutRef = useRef<number | null>(null);
  const ambienceAudioRef = useRef<HTMLAudioElement | null>(null);
  const alertAudioRef = useRef<HTMLAudioElement | null>(null);
  const bingoAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    setBet((current) => {
      if (current < profile.wallet.minBet) return profile.wallet.minBet;
      if (current > profile.wallet.maxBet) return profile.wallet.maxBet;
      return current;
    });
  }, [profile.wallet.maxBet, profile.wallet.minBet]);

  useEffect(() => {
    let pointerCleanup: (() => void) | null = null;
    if (!ambienceAudioRef.current) {
      ambienceAudioRef.current = new Audio(piratesongAudio);
      ambienceAudioRef.current.loop = true;
      ambienceAudioRef.current.volume = 0.08;
      ambienceAudioRef.current.preload = "metadata";
    }

    const startAmbience = () => {
      if (!ambienceAudioRef.current) return;
      ambienceAudioRef.current.volume = 0.08;
      void ambienceAudioRef.current.play().catch(() => undefined);
    };

    startAmbience();

    const unlockOnPointer = () => {
      startAmbience();
    };

    window.addEventListener("pointerdown", unlockOnPointer, { once: true });
    pointerCleanup = () => window.removeEventListener("pointerdown", unlockOnPointer);

    return () => {
      pointerCleanup?.();
      if (ambienceAudioRef.current) {
        ambienceAudioRef.current.pause();
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
      if (featureTimeoutRef.current) window.clearTimeout(featureTimeoutRef.current);
      ambienceAudioRef.current?.pause();
      alertAudioRef.current?.pause();
      bingoAudioRef.current?.pause();
    };
  }, []);

  const highlightedIndexes = useMemo(() => {
    if (!lastSpin?.wins?.length) return new Set<number>();
    return new Set(lastSpin.wins.flatMap((entry) => entry.indexes));
  }, [lastSpin]);

  const canSpin = spinState !== "spinning" && !busy && profile.wallet.balance >= bet;

  const netChangeTone = useMemo(() => {
    if (!lastSpin) return "neutral";
    if (lastSpin.netChange > 0) return "positive";
    if (lastSpin.netChange < 0) return "negative";
    return "neutral";
  }, [lastSpin]);

  const recentTransactions = useMemo(() => profile.recentTransactions.slice(0, 8), [profile.recentTransactions]);
  const featureMedia = SLOT_FEATURE_MEDIA[activeFeature];

  function playCue(ref: React.MutableRefObject<HTMLAudioElement | null>, src: string, volume: number) {
    if (!ref.current) {
      ref.current = new Audio(src);
      ref.current.preload = "auto";
    }
    ref.current.pause();
    try {
      ref.current.currentTime = 0;
    } catch {
      // ignore
    }
    ref.current.volume = volume;
    void ref.current.play().catch(() => undefined);
  }

  function triggerSlotFeedback(spin: CasinoSpin) {
    const nextFeature = chooseSlotFeature(spin);
    setActiveFeature(nextFeature);

    if (featureTimeoutRef.current) {
      window.clearTimeout(featureTimeoutRef.current);
      featureTimeoutRef.current = null;
    }

    if (nextFeature !== "idle") {
      featureTimeoutRef.current = window.setTimeout(() => {
        setActiveFeature("idle");
      }, 9000);
    }

    if (spin.grid.flat().includes("JOKER")) {
      playCue(alertAudioRef, alerteSound, 0.78);
    }

    if (spin.totalPayout >= spin.bet * 5) {
      playCue(bingoAudioRef, bingoSound, 0.26);
    }
  }

  async function handleSpin() {
    if (!canSpin) return;
    onError("");
    setSpinState("spinning");
    setLastMessage("Les tambours roulent...");

    try {
      const result = await spinCasinoSlots(bet);
      let step = 0;
      intervalRef.current = window.setInterval(() => {
        step += 1;
        setDisplayGrid(buildPlaceholderGrid(result.spin.rowCount, result.spin.reelCount));
        if (step >= SPIN_ANIMATION_STEPS && intervalRef.current) {
          window.clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      }, SPIN_ANIMATION_INTERVAL_MS);

      timeoutRef.current = window.setTimeout(() => {
        setDisplayGrid(result.spin.grid);
        setLastSpin(result.spin);
        triggerSlotFeedback(result.spin);
        setSpinState("idle");
        setLastMessage(
          result.spin.totalPayout > 0
            ? `Table gagnee: +${formatCredits(result.spin.totalPayout)} credits.`
            : "Aucun alignement cette fois. La maison respire encore.",
        );
        onProfileChange(result.profile);
      }, SPIN_ANIMATION_INTERVAL_MS * (SPIN_ANIMATION_STEPS + 1));
    } catch (error_) {
      setSpinState("idle");
      onError(error_ instanceof Error ? error_.message : "Le spin a echoue.");
    }
  }

  function adjustBet(direction: -1 | 1) {
    const currentIndex = BET_PRESETS.findIndex((preset) => preset >= bet);
    const safeIndex = currentIndex === -1 ? BET_PRESETS.length - 1 : currentIndex;
    const nextIndex = Math.max(0, Math.min(BET_PRESETS.length - 1, safeIndex + direction));
    setBet(Math.max(profile.wallet.minBet, Math.min(profile.wallet.maxBet, BET_PRESETS[nextIndex])));
  }

  function renderCell(symbolId: string, cellIndex: number) {
    const meta = SYMBOL_META[symbolId] || SYMBOL_META.COIN;
    const isHighlighted = highlightedIndexes.has(cellIndex);

    return (
      <div
        key={`${symbolId}-${cellIndex}`}
        className={`casino-reel-cell ${isHighlighted ? "is-highlighted" : ""}`}
        style={{ ["--cell-accent" as string]: meta.accent }}
      >
        <span className="casino-reel-cell__emoji" aria-hidden="true">
          {meta.emoji}
        </span>
        <span className="casino-reel-cell__label">{meta.label}</span>
      </div>
    );
  }

  return (
    <section className="casino-table-layout">
      <div className="casino-stage">
        <div className="casino-status-strip">
          <article>
            <span>Solde serveur</span>
            <strong>{formatCredits(profile.wallet.balance)} credits</strong>
          </article>
          <article>
            <span>Mise actuelle</span>
            <strong>{formatCredits(bet)} credits</strong>
          </article>
          <article className={`tone-${netChangeTone}`}>
            <span>Dernier resultat</span>
            <strong>
              {lastSpin ? `${lastSpin.netChange >= 0 ? "+" : ""}${formatCredits(lastSpin.netChange)}` : "Aucun spin"}
            </strong>
          </article>
        </div>

        <div className="casino-reel-shell casino-room-shell">
          <div className="casino-reel-shell__header">
            <div>
              <span className="casino-chip">Machine a sous</span>
              <h2>Salon pirate principal</h2>
            </div>
            <p>{lastMessage}</p>
          </div>

          <div className={`casino-reel-grid ${spinState === "spinning" ? "is-spinning" : ""}`}>
            {displayGrid.flatMap((row, rowIndex) =>
              row.map((symbolId, columnIndex) =>
                renderCell(symbolId, rowIndex * displayGrid[0].length + columnIndex),
              ),
            )}
          </div>

          <div className="casino-controls">
            <div className="casino-bet-controls">
              <button
                type="button"
                className="casino-ghost-button"
                onClick={() => adjustBet(-1)}
                disabled={spinState === "spinning"}
              >
                - Miser
              </button>
              <div className="casino-bet-pills">
                {BET_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className={`casino-bet-pill ${bet === preset ? "is-active" : ""}`}
                    disabled={spinState === "spinning" || preset < profile.wallet.minBet || preset > profile.wallet.maxBet}
                    onClick={() => setBet(preset)}
                  >
                    {preset}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="casino-ghost-button"
                onClick={() => adjustBet(1)}
                disabled={spinState === "spinning"}
              >
                Miser +
              </button>
            </div>

            <button
              type="button"
              className="casino-primary-button casino-primary-button--spin"
              onClick={handleSpin}
              disabled={!canSpin}
            >
              {spinState === "spinning" ? "Reels en cours..." : "Lancer le spin"}
            </button>
          </div>

          {profile.wallet.balance < bet ? (
            <div className="casino-low-balance">
              Ton solde est trop bas pour cette mise. Baisse la mise ou recupere ton bonus journalier.
            </div>
          ) : null}
        </div>
      </div>

      <aside className="casino-side-rail">
        <section className="casino-panel">
          <div className="casino-panel__header">
            <span className="casino-chip">Projecteur</span>
            <h3>Coup du tour</h3>
          </div>

          <div className={`casino-slot-feature ${featureMedia.video ? "has-video" : ""}`}>
            <div className="casino-slot-feature__media">
              {featureMedia.video ? (
                <video
                  key={featureMedia.video}
                  className="casino-slot-feature__video"
                  src={featureMedia.video}
                  autoPlay
                  loop
                  muted
                  playsInline
                  poster={featureMedia.image}
                />
              ) : (
                <img src={featureMedia.image} alt={featureMedia.title} className="casino-slot-feature__poster" />
              )}
            </div>

            <div className="casino-slot-feature__copy">
              <strong>{featureMedia.title}</strong>
              <p>{featureMedia.body}</p>
              <span className="casino-chip">
                {activeFeature === "idle" ? "Ambiance du salon" : "Declencheur media actif"}
              </span>
            </div>
          </div>
        </section>

        <section className="casino-panel">
          <div className="casino-panel__header">
            <span className="casino-chip">Session</span>
            <h3>Tableau de bord</h3>
          </div>
          <div className="casino-metric-list">
            <div>
              <span>Spins joues</span>
              <strong>{formatCredits(profile.wallet.gamesPlayed)}</strong>
            </div>
            <div>
              <span>Total mise</span>
              <strong>{formatCredits(profile.wallet.lifetimeWagered)}</strong>
            </div>
            <div>
              <span>Total gains</span>
              <strong>{formatCredits(profile.wallet.lifetimeWon)}</strong>
            </div>
            <div>
              <span>Bonus journalier</span>
              <strong>{profile.wallet.canClaimDailyBonus ? `Disponible (+${profile.wallet.dailyBonusAmount})` : "Deja reclame"}</strong>
            </div>
          </div>
        </section>

        <section className="casino-panel">
          <div className="casino-panel__header">
            <span className="casino-chip">Paiements</span>
            <h3>Table rapide</h3>
          </div>
          <div className="casino-paytable">
            {PAYOUT_TABLE.map((entry) => {
              const meta = SYMBOL_META[entry.symbol];
              return (
                <div key={entry.symbol} className="casino-paytable__row">
                  <div className="casino-paytable__symbol">
                    <span aria-hidden="true">{meta.emoji}</span>
                    <strong>{meta.label}</strong>
                  </div>
                  <span>{entry.three}</span>
                  <span>{entry.four}</span>
                  <span>{entry.five}</span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="casino-panel">
          <div className="casino-panel__header">
            <span className="casino-chip">Historique</span>
            <h3>Dernieres operations</h3>
          </div>

          <div className="casino-history-list">
            {recentTransactions.length ? (
              recentTransactions.map((entry: CasinoTransaction) => (
                <article key={entry.id} className="casino-history-entry">
                  <div>
                    <span>{formatTransactionLabel(entry.kind)}</span>
                    <strong>{formatTransactionTime(entry.createdAt)}</strong>
                  </div>
                  <div className={entry.amount >= 0 ? "is-positive" : "is-negative"}>
                    {entry.amount >= 0 ? "+" : ""}
                    {formatCredits(entry.amount)}
                  </div>
                </article>
              ))
            ) : (
              <p className="casino-history-empty">Aucune operation enregistree pour le moment.</p>
            )}
          </div>
        </section>

        {lastSpin ? (
          <section className="casino-panel">
            <div className="casino-panel__header">
              <span className="casino-chip">Dernier spin</span>
              <h3>Alignements</h3>
            </div>
            <div className="casino-win-list">
              {lastSpin.wins.length ? (
                lastSpin.wins.map((win) => {
                  const meta = SYMBOL_META[win.symbol] || SYMBOL_META.COIN;
                  return (
                    <article key={`${win.lineIndex}-${win.symbol}`} className="casino-win-entry">
                      <div>
                        <span aria-hidden="true">{meta.emoji}</span>
                        <div>
                          <strong>{win.label}</strong>
                          <span>
                            Ligne {win.lineIndex + 1} · {win.matchCount} symboles
                          </span>
                        </div>
                      </div>
                      <b>+{formatCredits(win.payout)}</b>
                    </article>
                  );
                })
              ) : (
                <p className="casino-history-empty">Le dernier spin n’a valide aucune ligne payante.</p>
              )}
            </div>
          </section>
        ) : null}
      </aside>
    </section>
  );
}

export default function PirateSlotsGame(props: PirateSlotsGameProps) {
  const [activeRoom, setActiveRoom] = useState<RoomId>("slots");
  const currentRoom = ROOM_DEFINITIONS.find((room) => room.id === activeRoom) || ROOM_DEFINITIONS[0];
  const currentRoomArtwork =
    activeRoom === "roulette"
      ? rouletteArtwork
      : activeRoom === "treasure-map" || activeRoom === "treasure-hunt"
        ? districtArtwork
        : cardArtwork;

  function renderRoom() {
    switch (activeRoom) {
      case "treasure-map":
        return <CarteMiniGame profile={props.profile} onProfileChange={props.onProfileChange} onError={props.onError} />;
      case "treasure-hunt":
        return <MiniTreasureGame profile={props.profile} onProfileChange={props.onProfileChange} onError={props.onError} />;
      case "blackjack":
        return <BlackjackRoom playerName={props.profile.user.username} profile={props.profile} onProfileChange={props.onProfileChange} onError={props.onError} />;
      case "poker":
        return <PokerRoom playerName={props.profile.user.username} profile={props.profile} onProfileChange={props.onProfileChange} onError={props.onError} />;
      case "roulette":
        return <RouletteRoom profile={props.profile} onProfileChange={props.onProfileChange} onError={props.onError} onRouletteEvent={props.onRouletteEvent} />;
      default:
        return <SlotsRoom {...props} />;
    }
  }

  return (
    <section className="casino-floor">
      <div className="casino-district-grid">
        {DISTRICT_CARDS.map((district) => {
          const isActive = district.roomId === activeRoom;
          return (
            <button
              key={district.id}
              type="button"
              className={`casino-district-card ${isActive ? "is-active" : ""}`}
              onClick={() => setActiveRoom(district.roomId)}
              style={{
                ["--district-art" as string]: `url("${districtArtwork}")`,
                ["--district-x" as string]: `${district.col * 50}%`,
                ["--district-y" as string]: `${district.row * 33.3333}%`,
              }}
            >
              <div className="casino-district-card__art" />
              <div className="casino-district-card__copy">
                <strong>{district.title}</strong>
                <span>{district.subtitle}</span>
              </div>
            </button>
          );
        })}
      </div>

      <div
        className="casino-room-hero"
        style={{ ["--room-art" as string]: `url("${currentRoomArtwork}")` }}
      >
        <div className="casino-room-hero__copy">
          <span className="casino-chip">{currentRoom.chip}</span>
          <h2>{currentRoom.title}</h2>
          <p>{currentRoom.body}</p>
        </div>

        <div className="casino-floor-nav" role="tablist" aria-label="Salles de jeu">
          {ROOM_DEFINITIONS.map((room) => (
            <button
              key={room.id}
              type="button"
              className={`casino-floor-nav__button ${room.id === activeRoom ? "is-active" : ""}`}
              onClick={() => setActiveRoom(room.id)}
              role="tab"
              aria-selected={room.id === activeRoom}
            >
              <strong>{room.label}</strong>
              <span>{room.chip}</span>
            </button>
          ))}
        </div>
      </div>

      {renderRoom()}
    </section>
  );
}
