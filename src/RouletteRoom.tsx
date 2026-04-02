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
const ROULETTE_ORDER = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10,
  5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
];
const WHEEL_POCKET_ANGLE = 360 / ROULETTE_ORDER.length;
const BALL_START_ANGLE = 34;
const BALL_TARGET_ANGLE = 270;
const BALL_OUTER_RADIUS = 44;
const BALL_INNER_RADIUS = 33.5;

type RoulettePhase = "idle" | "firing" | "spinning" | "settling" | "done";

type RouletteAnimationState = {
  phase: RoulettePhase;
  wheelRotation: number;
  ballAngle: number;
  ballRadius: number;
  ballX: number;
  ballY: number;
  highlightedNumber: number | null;
  flash: boolean;
  smoke: number;
  recoil: number;
};

type RouletteRoomProps = {
  profile: CasinoProfile;
  onProfileChange: (profile: CasinoProfile, message?: string) => void;
  onError: (message: string) => void;
  onRouletteEvent?: (event: RouletteSoundEvent) => void;
};

function normalizeAngle(value: number) {
  let normalized = value % 360;
  if (normalized < 0) normalized += 360;
  return normalized;
}

function easeOutCubic(value: number) {
  return 1 - Math.pow(1 - value, 3);
}

function easeOutQuart(value: number) {
  return 1 - Math.pow(1 - value, 4);
}

function lerp(start: number, end: number, progress: number) {
  return start + (end - start) * progress;
}

function toBallCoordinates(angle: number, radius: number, bounce = 0) {
  const radians = (angle * Math.PI) / 180;
  return {
    x: 50 + Math.cos(radians) * radius,
    y: 50 + Math.sin(radians) * radius - bounce,
  };
}

function getNumberColor(number: number) {
  if (number === 0) return "green";
  return [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36].includes(number) ? "red" : "black";
}

function getPocketIndex(number: number | null) {
  if (typeof number !== "number") return -1;
  return ROULETTE_ORDER.indexOf(number);
}

function buildStaticAnimation(winningNumber: number | null): RouletteAnimationState {
  if (winningNumber === null || getPocketIndex(winningNumber) === -1) {
    const ball = toBallCoordinates(BALL_START_ANGLE, BALL_OUTER_RADIUS, 0);
    return {
      phase: "idle",
      wheelRotation: 0,
      ballAngle: BALL_START_ANGLE,
      ballRadius: BALL_OUTER_RADIUS,
      ballX: ball.x,
      ballY: ball.y,
      highlightedNumber: null,
      flash: false,
      smoke: 0,
      recoil: 0,
    };
  }

  const pocketIndex = getPocketIndex(winningNumber);
  const ball = toBallCoordinates(BALL_TARGET_ANGLE, BALL_INNER_RADIUS, 0);
  return {
    phase: "done",
    wheelRotation: -(pocketIndex * WHEEL_POCKET_ANGLE),
    ballAngle: BALL_TARGET_ANGLE,
    ballRadius: BALL_INNER_RADIUS,
    ballX: ball.x,
    ballY: ball.y,
    highlightedNumber: winningNumber,
    flash: false,
    smoke: 0,
    recoil: 0,
  };
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
  const [animation, setAnimation] = useState<RouletteAnimationState>(() => buildStaticAnimation(null));

  const onProfileChangeRef = useRef(onProfileChange);
  const onErrorRef = useRef(onError);
  const onRouletteEventRef = useRef(onRouletteEvent);
  const previousParticipantCountRef = useRef<number | null>(null);
  const latestResolvedIdRef = useRef<number | null>(null);
  const announcedRoomEntryRef = useRef(false);
  const animationFrameRef = useRef<number | null>(null);
  const animationRef = useRef<RouletteAnimationState>(buildStaticAnimation(null));
  const mountedRef = useRef(true);

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
    animationRef.current = animation;
  }, [animation]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, []);

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

  const wheelPockets = useMemo(
    () =>
      ROULETTE_ORDER.map((number, index) => ({
        number,
        color: getNumberColor(number),
        angle: index * WHEEL_POCKET_ANGLE - 90,
      })),
    [],
  );

  const phaseLabel = useMemo(() => {
    switch (animation.phase) {
      case "firing":
        return "Canon en charge";
      case "spinning":
        return "Bille en orbite";
      case "settling":
        return "Verrouillage de poche";
      case "done":
        return "Numero capture";
      default:
        return "Canon arme";
    }
  }, [animation.phase]);

  function startSpinAnimation(winningNumber: number) {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    const winningIndex = getPocketIndex(winningNumber);
    if (winningIndex === -1) return;

    const startingState = {
      ...animationRef.current,
      phase: "firing" as RoulettePhase,
      ballAngle: BALL_START_ANGLE,
      ballRadius: BALL_OUTER_RADIUS,
      highlightedNumber: null,
      flash: true,
      smoke: 1,
      recoil: 1,
      ...toBallCoordinates(BALL_START_ANGLE, BALL_OUTER_RADIUS, 0),
    };
    animationRef.current = startingState;
    setAnimation(startingState);

    const currentWheel = animationRef.current.wheelRotation;
    const targetNormalized = normalizeAngle(-(winningIndex * WHEEL_POCKET_ANGLE));
    const currentNormalized = normalizeAngle(currentWheel);
    const counterClockwiseDelta = normalizeAngle(currentNormalized - targetNormalized);
    const wheelTarget = currentWheel - (6 * 360 + counterClockwiseDelta);
    const ballTravel = 8 * 360 + normalizeAngle(BALL_TARGET_ANGLE - BALL_START_ANGLE);
    const startedAt = performance.now();
    const durationMs = 5600;
    const firingEnd = 0.12;
    const settleStart = 0.74;

    const tick = (now: number) => {
      if (!mountedRef.current) return;
      const progress = Math.min(1, (now - startedAt) / durationMs);
      const spinProgress = progress <= firingEnd ? 0 : easeOutQuart((progress - firingEnd) / (1 - firingEnd));
      const settleProgress = progress <= settleStart ? 0 : easeOutCubic((progress - settleStart) / (1 - settleStart));
      const orbitProgress = progress <= firingEnd
        ? progress / firingEnd * 0.08
        : 0.08 + 0.92 * easeOutCubic((progress - firingEnd) / (1 - firingEnd));
      const wheelRotation = lerp(currentWheel, wheelTarget, spinProgress);
      const ballAngle = BALL_START_ANGLE + ballTravel * orbitProgress;
      const ballRadius = lerp(BALL_OUTER_RADIUS, BALL_INNER_RADIUS, settleProgress);
      const bounceAmplitude = progress < settleStart ? 1.85 : 0.65;
      const bounce = Math.sin(orbitProgress * 24) * bounceAmplitude * (1 - settleProgress * 0.72);
      const ball = toBallCoordinates(ballAngle, ballRadius, bounce);
      const recoil = progress < firingEnd ? Math.sin((progress / firingEnd) * Math.PI) : 0;
      const smoke = progress < 0.24 ? 1 - progress / 0.24 : 0;

      const nextState: RouletteAnimationState = {
        phase: progress < firingEnd ? "firing" : progress < settleStart ? "spinning" : progress < 1 ? "settling" : "done",
        wheelRotation,
        ballAngle,
        ballRadius,
        ballX: ball.x,
        ballY: ball.y,
        highlightedNumber: progress > 0.9 ? winningNumber : null,
        flash: progress < firingEnd * 0.56,
        smoke,
        recoil,
      };

      animationRef.current = nextState;
      setAnimation(nextState);

      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(tick);
        return;
      }

      const finalState = buildStaticAnimation(winningNumber);
      animationRef.current = finalState;
      setAnimation(finalState);
      animationFrameRef.current = null;
    };

    animationFrameRef.current = requestAnimationFrame(tick);
  }

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

    const resolved = room.latestResolved;
    const resolvedId = resolved?.id ?? null;
    if (latestResolvedIdRef.current === null) {
      latestResolvedIdRef.current = resolvedId;
      const staticState = buildStaticAnimation(resolved?.winningNumber ?? null);
      animationRef.current = staticState;
      setAnimation(staticState);
      return;
    }

    if (resolvedId && resolvedId !== latestResolvedIdRef.current) {
      latestResolvedIdRef.current = resolvedId;
      onRouletteEventRef.current?.({
        type: "spin",
        roundId: room.round.id,
        resultId: resolvedId,
        winningNumber: resolved?.winningNumber ?? null,
      });
      if (typeof resolved?.winningNumber === "number") {
        startSpinAnimation(resolved.winningNumber);
      }
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
                : "Choisis un numero ou une mise rapide, puis laisse la roue raconter le resultat deja choisi par le serveur."}
            </p>
          </div>

          <div className="casino-roulette-stage">
            <div className={`casino-roulette-visual is-${animation.phase}`}>
              <div className="casino-roulette-backdrop" style={{ ["--roulette-art" as string]: `url("${rouletteArtwork}")` }} />

              <div className="casino-roulette-cannon" style={{ ["--cannon-recoil" as string]: `${animation.recoil}` }}>
                <div className="casino-roulette-cannon__barrel" />
                <div className="casino-roulette-cannon__base" />
                <div className="casino-roulette-cannon__flash" style={{ opacity: animation.flash ? 1 : 0 }} />
                <div className="casino-roulette-cannon__smoke" style={{ opacity: animation.smoke, transform: `scale(${0.8 + animation.smoke * 0.55})` }} />
              </div>

              <div className="casino-roulette-wheel-stack">
                <div className="casino-roulette-crown" />
                <div className="casino-roulette-indicator" />
                <div
                  className="casino-roulette-wheel"
                  style={{ transform: `translate(-50%, -50%) rotate(${animation.wheelRotation}deg)` }}
                >
                  <div className="casino-roulette-wheel__track" />
                  <div className="casino-roulette-wheel__glow" />
                  {wheelPockets.map((pocket) => (
                    <div
                      key={pocket.number}
                      className={`casino-roulette-pocket is-${pocket.color} ${animation.highlightedNumber === pocket.number ? "is-winning" : ""}`}
                      style={{
                        ["--pocket-angle" as string]: `${pocket.angle}deg`,
                      }}
                    >
                      <span>{pocket.number}</span>
                    </div>
                  ))}
                  <div className="casino-roulette-wheel__hub">
                    <strong>{room?.latestResolved?.winningNumber ?? "ATS"}</strong>
                    <span>{phaseLabel}</span>
                  </div>
                </div>
                <div
                  className="casino-roulette-ball"
                  style={{
                    left: `${animation.ballX}%`,
                    top: `${animation.ballY}%`,
                  }}
                />
              </div>

              <div className="casino-roulette-overlay">
                <div className="casino-roulette-phase">
                  <span>Sequence</span>
                  <strong>{phaseLabel}</strong>
                </div>
                {room?.latestResolved ? (
                  <div className={`casino-roulette-result is-${room.latestResolved.winningColor}`}>
                    <span>Dernier tir</span>
                    <strong>{room.latestResolved.winningNumber}</strong>
                  </div>
                ) : null}
              </div>
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
                  <span className="casino-chip">{selectedBet ? selectedBet.label : "Aucune cible"}</span>
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
