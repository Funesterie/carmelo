import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { RouletteSoundEvent } from "./PirateSlotsGame";
import rouletteArtwork from "./images/casino ats.png";
import {
  fetchRouletteRoom,
  placeRouletteBet,
  type CasinoProfile,
  type RouletteRoom,
} from "./lib/casinoApi";
import { formatCredits } from "./lib/casinoRoomState";

const AMOUNT_PRESETS = [20, 50, 100, 200, 500];
const QUICK_BETS = [
  { betType: "color", betValue: "red", label: "Rouge" },
  { betType: "color", betValue: "black", label: "Noir" },
  { betType: "parity", betValue: "even", label: "Pair" },
  { betType: "parity", betValue: "odd", label: "Impair" },
  { betType: "lowhigh", betValue: "low", label: "1-18" },
  { betType: "lowhigh", betValue: "high", label: "19-36" },
  { betType: "dozen", betValue: "first12", label: "1er 12" },
  { betType: "dozen", betValue: "second12", label: "2e 12" },
  { betType: "dozen", betValue: "third12", label: "3e 12" },
] as const;

type RouletteRoomProps = {
  profile: CasinoProfile;
  onProfileChange: (profile: CasinoProfile, message?: string) => void;
  onError: (message: string) => void;
  onRouletteEvent?: (event: RouletteSoundEvent) => void;
};

function getNumberColor(number: number) {
  if (number === 0) return "green";
  return [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36].includes(number) ? "red" : "black";
}

function getBetLabel(betType: string, betValue: string) {
  if (betType === "straight") return `Numero ${betValue}`;
  return QUICK_BETS.find((entry) => entry.betType === betType && entry.betValue === betValue)?.label || `${betType}:${betValue}`;
}

export default function RouletteRoom({
  profile,
  onProfileChange,
  onError,
  onRouletteEvent,
}: RouletteRoomProps) {
  const [room, setRoom] = useState<RouletteRoom | null>(null);
  const [amount, setAmount] = useState(AMOUNT_PRESETS[2]);
  const [selectedBet, setSelectedBet] = useState<{ betType: string; betValue: string; label: string } | null>(null);
  const [working, setWorking] = useState(false);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const onProfileChangeRef = useRef(onProfileChange);
  const onErrorRef = useRef(onError);
  const onRouletteEventRef = useRef(onRouletteEvent);
  const previousParticipantCountRef = useRef<number | null>(null);
  const latestResolvedIdRef = useRef<number | null>(null);
  const announcedRoomEntryRef = useRef(false);

  useEffect(() => {
    onProfileChangeRef.current = onProfileChange;
  }, [onProfileChange]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    onRouletteEventRef.current = onRouletteEvent;
  }, [onRouletteEvent]);

  useEffect(() => {
    let mounted = true;
    let pollId = 0;
    let tickId = 0;

    async function syncRoom() {
      try {
        const result = await fetchRouletteRoom();
        if (!mounted) return;
        setRoom(result.room);
        onProfileChangeRef.current(result.profile);
      } catch (error_) {
        if (!mounted) return;
        onErrorRef.current(error_ instanceof Error ? error_.message : "La salle roulette est indisponible.");
      }
    }

    void syncRoom();
    pollId = window.setInterval(() => void syncRoom(), 3000);
    tickId = window.setInterval(() => setNowTick(Date.now()), 1000);

    return () => {
      mounted = false;
      window.clearInterval(pollId);
      window.clearInterval(tickId);
    };
  }, []);

  const remainingMs = useMemo(() => {
    const closesAt = room?.round.closesAt ? new Date(room.round.closesAt).getTime() : 0;
    if (!closesAt) return 0;
    return Math.max(0, closesAt - nowTick);
  }, [nowTick, room?.round.closesAt]);

  useEffect(() => {
    if (!room) return;

    const participantCount = Number(room.round.playerCount || 0);
    if (!announcedRoomEntryRef.current) {
      announcedRoomEntryRef.current = true;
      onRouletteEventRef.current?.({
        type: "enter",
        roundId: room.round.id,
        participants: participantCount,
      });
    } else if (
      previousParticipantCountRef.current !== null
      && participantCount > previousParticipantCountRef.current
    ) {
      onRouletteEventRef.current?.({
        type: "join",
        roundId: room.round.id,
        participants: participantCount,
      });
    }
    previousParticipantCountRef.current = participantCount;

    const resolvedId = room.latestResolved?.id ?? null;
    if (latestResolvedIdRef.current === null) {
      latestResolvedIdRef.current = resolvedId;
      return;
    }

    if (resolvedId && resolvedId !== latestResolvedIdRef.current) {
      latestResolvedIdRef.current = resolvedId;
      onRouletteEventRef.current?.({
        type: "spin",
        roundId: room.round.id,
        resultId: resolvedId,
        winningNumber: room.latestResolved?.winningNumber ?? null,
      });
    }
  }, [room]);

  async function submitBet() {
    if (!selectedBet || working) return;
    onError("");
    setWorking(true);
    try {
      const result = await placeRouletteBet(selectedBet.betType, selectedBet.betValue, amount);
      setRoom(result.room);
      onProfileChange(result.profile, `Mise placee sur ${selectedBet.label}.`);
    } catch (error_) {
      onError(error_ instanceof Error ? error_.message : "La mise roulette a echoue.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <section className="casino-table-layout">
      <div className="casino-stage">
        <div className="casino-status-strip">
          <article>
            <span>Solde serveur</span>
            <strong>{formatCredits(profile.wallet.balance)}</strong>
          </article>
          <article>
            <span>Mise selectionnee</span>
            <strong>{formatCredits(amount)}</strong>
          </article>
          <article className={remainingMs > 6000 ? "tone-positive" : ""}>
            <span>Cloture du tour</span>
            <strong>{Math.ceil(remainingMs / 1000)}s</strong>
          </article>
        </div>

        <div
          className="casino-reel-shell casino-room-shell casino-room-shell--roulette"
          style={{ ["--room-art" as string]: `url("${rouletteArtwork}")` }}
        >
          <div className="casino-reel-shell__header">
            <div>
              <span className="casino-chip">Roulette ATS</span>
              <h2>Funesterie Roulette</h2>
            </div>
            <p>
              {selectedBet
                ? `Tu vises ${selectedBet.label} pour ${formatCredits(amount)} credits.`
                : "Choisis un numero ou une mise rapide, puis attends le prochain tir commun."}
            </p>
          </div>

          <div className="casino-roulette-stage">
            <div className="casino-roulette-visual">
              <img src={rouletteArtwork} alt="Table de roulette pirate ATS" />
              {room?.latestResolved ? (
                <div className={`casino-roulette-result is-${room.latestResolved.winningColor}`}>
                  <span>Dernier tir</span>
                  <strong>{room.latestResolved.winningNumber}</strong>
                </div>
              ) : null}
            </div>

            <div className="casino-roulette-controls">
              <div className="casino-bet-pills">
                {AMOUNT_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className={`casino-bet-pill ${amount === preset ? "is-active" : ""}`}
                    onClick={() => setAmount(preset)}
                    disabled={working}
                  >
                    {preset}
                  </button>
                ))}
              </div>

              <div className="casino-roulette-quickbets">
                {QUICK_BETS.map((bet) => (
                  <button
                    key={`${bet.betType}-${bet.betValue}`}
                    type="button"
                    className={`casino-floor-nav__button ${selectedBet?.betType === bet.betType && selectedBet?.betValue === bet.betValue ? "is-active" : ""}`}
                    onClick={() => setSelectedBet({ ...bet })}
                  >
                    <strong>{bet.label}</strong>
                    <span>Mise rapide</span>
                  </button>
                ))}
              </div>

              <div className="casino-roulette-board">
                <button
                  type="button"
                  className={`casino-roulette-cell casino-roulette-cell--green ${selectedBet?.betType === "straight" && selectedBet?.betValue === "0" ? "is-active" : ""}`}
                  onClick={() => setSelectedBet({ betType: "straight", betValue: "0", label: "Numero 0" })}
                >
                  0
                </button>
                <div className="casino-roulette-board__numbers">
                  {Array.from({ length: 36 }, (_, index) => index + 1).map((value) => (
                    <button
                      key={value}
                      type="button"
                      className={`casino-roulette-cell casino-roulette-cell--${getNumberColor(value)} ${selectedBet?.betType === "straight" && selectedBet?.betValue === String(value) ? "is-active" : ""}`}
                      onClick={() => setSelectedBet({ betType: "straight", betValue: String(value), label: `Numero ${value}` })}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </div>

              <div className="casino-action-row">
                <div className="casino-chip-row">
                  <span className="casino-chip">Pot de tour: {formatCredits(room?.round.totalPot || 0)}</span>
                  <span className="casino-chip">Joueurs: {room?.round.playerCount || 0}</span>
                </div>
                <button
                  type="button"
                  className="casino-primary-button"
                  onClick={() => void submitBet()}
                  disabled={!selectedBet || working || profile.wallet.balance < amount}
                >
                  Miser {selectedBet ? `sur ${selectedBet.label}` : ""}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <aside className="casino-side-rail">
        <section className="casino-panel">
          <div className="casino-panel__header">
            <span className="casino-chip">Participants</span>
            <h3>Table live</h3>
          </div>
          <div className="casino-prize-stack">
            {(room?.round.participants || []).length ? (
              room?.round.participants.map((entry) => (
                <article key={entry.userId} className="casino-prize-card">
                  <div className="casino-prize-card__glyph">◉</div>
                  <div>
                    <strong>{entry.username}</strong>
                    <span>{formatCredits(entry.totalAmount)} sur {entry.betCount} mise{entry.betCount > 1 ? "s" : ""}</span>
                  </div>
                </article>
              ))
            ) : (
              <p className="casino-history-empty">Aucun joueur n'a encore verrouille de mise sur ce tour.</p>
            )}
          </div>
        </section>

        <section className="casino-panel">
          <div className="casino-panel__header">
            <span className="casino-chip">Tes mises</span>
            <h3>Tour courant</h3>
          </div>
          <div className="casino-history-list">
            {(room?.round.myBets || []).length ? (
              room?.round.myBets.map((bet) => (
                <article key={bet.id} className="casino-history-entry">
                  <div>
                    <span>{getBetLabel(bet.betType, bet.betValue)}</span>
                    <strong>{formatCredits(bet.amount)}</strong>
                  </div>
                  <div className={bet.payout > 0 ? "is-positive" : ""}>
                    {bet.payout > 0 ? `+${formatCredits(bet.payout)}` : "en attente"}
                  </div>
                </article>
              ))
            ) : (
              <p className="casino-history-empty">Aucune mise active sur le tour courant.</p>
            )}
          </div>
        </section>

        <section className="casino-panel">
          <div className="casino-panel__header">
            <span className="casino-chip">Historique</span>
            <h3>Derniers numeros</h3>
          </div>
          <div className="casino-chip-row">
            {(room?.recentResults || []).map((entry) => (
              <span key={entry.id} className={`casino-roulette-history-chip is-${entry.winningColor}`}>
                {entry.winningNumber}
              </span>
            ))}
          </div>
        </section>
      </aside>
    </section>
  );
}
