import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
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

type PirateSlotsGameProps = {
  profile: CasinoProfile;
  busy: boolean;
  onProfileChange: (profile: CasinoProfile, message?: string) => void;
  onError: (message: string) => void;
};

function randomSymbolId() {
  const keys = Object.keys(SYMBOL_META);
  return keys[Math.floor(Math.random() * keys.length)] || "COIN";
}

function buildPlaceholderGrid(rows = 3, reels = 5) {
  return Array.from({ length: rows }, () =>
    Array.from({ length: reels }, () => randomSymbolId())
  );
}

function formatCredits(value: number) {
  return new Intl.NumberFormat("fr-FR").format(Number(value || 0));
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

export default function PirateSlotsGame({
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
  const intervalRef = useRef<number | null>(null);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    setBet((current) => {
      if (current < profile.wallet.minBet) return profile.wallet.minBet;
      if (current > profile.wallet.maxBet) return profile.wallet.maxBet;
      return current;
    });
  }, [profile.wallet.maxBet, profile.wallet.minBet]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
      }
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }
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

  const recentTransactions = useMemo(() => {
    return profile.recentTransactions.slice(0, 8);
  }, [profile.recentTransactions]);

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
        setSpinState("idle");
        setLastMessage(
          result.spin.totalPayout > 0
            ? `Table gagnee: +${formatCredits(result.spin.totalPayout)} credits.`
            : "Aucun alignement cette fois. La maison respire encore."
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
            <span>Solde</span>
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

        <div className="casino-reel-shell">
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
                renderCell(symbolId, rowIndex * displayGrid[0].length + columnIndex)
              )
            )}
          </div>

          <div className="casino-controls">
            <div className="casino-bet-controls">
              <button type="button" className="casino-ghost-button" onClick={() => adjustBet(-1)} disabled={spinState === "spinning"}>
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
              <button type="button" className="casino-ghost-button" onClick={() => adjustBet(1)} disabled={spinState === "spinning"}>
                Miser +
              </button>
            </div>

            <button type="button" className="casino-primary-button casino-primary-button--spin" onClick={handleSpin} disabled={!canSpin}>
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
                          <span>Ligne {win.lineIndex + 1} · {win.matchCount} symboles</span>
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
