import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import PirateInspector from "./PirateInspector";
import type { RouletteSoundEvent } from "./features/casino/catalog";
import {
  BALL_INNER_RADIUS,
  BALL_OUTER_RADIUS,
  BALL_START_ANGLE,
  BALL_TARGET_ANGLE,
  HOLD_DURATION_MS,
  QUICK_BETS,
  ROULETTE_AMOUNT_PRESETS,
  ROULETTE_ORDER,
  SPIN_DURATION_MS,
  WHEEL_POCKET_ANGLE,
  buildSettledAnimation,
  buildStaticAnimation,
  easeOutCubic,
  easeOutQuart,
  getBetLabel,
  getNumberColor,
  getPocketIndex,
  lerp,
  normalizeAngle,
  playVideoForward,
  playVideoReverse,
  toBallCoordinates,
  waitForMs,
  type RouletteAnimationState,
  type RouletteSequencePhase,
} from "./features/roulette/model";
import rouletteBackdropArt from "./images/casino ats.png";
import rouletteIdleImg from "./images/roulette.png";
import roulettePlateauPremium from "./images/roulette-plateau-premium.png";
import jetonImg from "./images/jeton.png";
import tapisImg from "./images/tapis.png";
import rouletteCannonIntroVideo from "./videos/roulette-cannon-intro.mp4";
import rouletteReloadVideo from "./videos/roulette-reload.mp4";
import {
  fetchRouletteRoom,
  placeRouletteBet,
  type CasinoProfile,
  type RouletteRoom,
} from "./lib/casinoApi";
import { formatCredits } from "./lib/casinoRoomState";

type RouletteRoomProps = {
  profile: CasinoProfile;
  onProfileChange: (profile: CasinoProfile, message?: string) => void;
  onError: (message: string) => void;
  onRouletteEvent?: (event: RouletteSoundEvent) => void;
};

export default function RouletteRoom({
  profile,
  onProfileChange,
  onError,
  onRouletteEvent,
}: RouletteRoomProps) {
  const [room, setRoom] = useState<RouletteRoom | null>(null);
  const [amount, setAmount] = useState(ROULETTE_AMOUNT_PRESETS[2]);
  const [selectedBet, setSelectedBet] = useState<{ betType: string; betValue: string; label: string } | null>(null);
  const [working, setWorking] = useState(false);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [infoTab, setInfoTab] = useState<"mises" | "participants" | "historique">("mises");
  const [sequencePhase, setSequencePhase] = useState<RouletteSequencePhase>("idle");
  const [animation, setAnimation] = useState<RouletteAnimationState>(() => buildStaticAnimation());

  const onProfileChangeRef = useRef(onProfileChange);
  const onErrorRef = useRef(onError);
  const onRouletteEventRef = useRef(onRouletteEvent);
  const previousParticipantCountRef = useRef<number | null>(null);
  const latestResolvedIdRef = useRef<number | null>(null);
  const announcedRoomEntryRef = useRef(false);
  const animationFrameRef = useRef<number | null>(null);
  const animationRef = useRef<RouletteAnimationState>(buildStaticAnimation());
  const mountedRef = useRef(true);
  const sequenceTokenRef = useRef(0);
  const introVideoRef = useRef<HTMLVideoElement | null>(null);
  const reloadVideoRef = useRef<HTMLVideoElement | null>(null);

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
      sequenceTokenRef.current += 1;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      if (introVideoRef.current) {
        introVideoRef.current.pause();
      }
      if (reloadVideoRef.current) {
        reloadVideoRef.current.pause();
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
    switch (sequencePhase) {
      case "intro":
        return "Canon arme";
      case "spin":
        return "Plateau lance";
      case "hold":
        return "Numero verrouille";
      case "reload":
        return "Rechargement";
      default:
        return "Veille";
    }
  }, [sequencePhase]);

  function cancelSpinAnimation() {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }

  async function playWheelAnimation(winningNumber: number, token: number) {
    cancelSpinAnimation();
    const currentWheel = animationRef.current.wheelRotation;
    const winningIndex = getPocketIndex(winningNumber);
    if (winningIndex === -1) return;

    const targetNormalized = normalizeAngle(-(winningIndex * WHEEL_POCKET_ANGLE));
    const currentNormalized = normalizeAngle(currentWheel);
    const counterClockwiseDelta = normalizeAngle(currentNormalized - targetNormalized);
    const wheelTarget = currentWheel - (7 * 360 + counterClockwiseDelta);
    const ballTravel = 8 * 360 + normalizeAngle(BALL_TARGET_ANGLE - BALL_START_ANGLE);
    const startedAt = performance.now();

    await new Promise<void>((resolve) => {
      const tick = (now: number) => {
        if (!mountedRef.current || token !== sequenceTokenRef.current) {
          cancelSpinAnimation();
          resolve();
          return;
        }

        const progress = Math.min(1, (now - startedAt) / SPIN_DURATION_MS);
        const wheelProgress = easeOutQuart(progress);
        const settleProgress = progress <= 0.65 ? 0 : easeOutCubic((progress - 0.65) / 0.35);
        const wheelRotation = lerp(currentWheel, wheelTarget, wheelProgress);
        const ballAngle = BALL_START_ANGLE + ballTravel * easeOutCubic(progress);
        const ballRadius = lerp(BALL_OUTER_RADIUS, BALL_INNER_RADIUS, settleProgress);
        const bounce = Math.sin(progress * 28) * (1.8 - settleProgress);
        const ball = toBallCoordinates(ballAngle, ballRadius, bounce);

        const nextState: RouletteAnimationState = {
          wheelRotation,
          ballAngle,
          ballRadius,
          ballX: ball.x,
          ballY: ball.y,
          highlightedNumber: progress > 0.88 ? winningNumber : null,
          fireRotation: progress * 900,
          fireScale: 1 + Math.sin(progress * Math.PI * 4) * 0.08,
        };

        animationRef.current = nextState;
        setAnimation(nextState);

        if (progress < 1) {
          animationFrameRef.current = requestAnimationFrame(tick);
          return;
        }

        const settled = buildSettledAnimation(winningNumber);
        animationRef.current = settled;
        setAnimation(settled);
        animationFrameRef.current = null;
        resolve();
      };

      animationFrameRef.current = requestAnimationFrame(tick);
    });
  }

  async function runSpinSequence(winningNumber: number) {
    const token = ++sequenceTokenRef.current;
    const introVideo = introVideoRef.current;
    const reloadVideo = reloadVideoRef.current;

    if (introVideo) {
      setSequencePhase("intro");
      await playVideoForward(introVideo, 2200);
      if (!mountedRef.current || token !== sequenceTokenRef.current) return;
    }

    setSequencePhase("spin");
    await playWheelAnimation(winningNumber, token);
    if (!mountedRef.current || token !== sequenceTokenRef.current) return;

    setSequencePhase("hold");
    await waitForMs(HOLD_DURATION_MS);
    if (!mountedRef.current || token !== sequenceTokenRef.current) return;

    if (reloadVideo) {
      setSequencePhase("reload");
      await playVideoReverse(reloadVideo, token, () => mountedRef.current && token === sequenceTokenRef.current);
      if (!mountedRef.current || token !== sequenceTokenRef.current) return;
    }

    animationRef.current = buildStaticAnimation();
    setAnimation(buildStaticAnimation());
    setSequencePhase("idle");
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
        void runSpinSequence(resolved.winningNumber);
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
    <section className="casino-table-layout casino-table-layout--compact casino-table-layout--cards">
      <div className="casino-stage casino-stage--cards">
        <div className="casino-room-hud casino-room-hud--roulette">
          <div className="casino-room-hud__lead">
            <span className="casino-chip">Roulette ATS</span>
            <div>
              <strong>Funesterie Roulette</strong>
              <p>
                Sequence cinematographique compacte: voix, canon, plateau pirate, bille laiton, verrouillage 5 secondes puis recharge.
              </p>
            </div>
          </div>

          <div className="casino-status-strip casino-status-strip--compact">
            <article>
              <span>Solde serveur</span>
              <strong className="casino-token-inline"><img src={jetonImg} alt="" />{formatCredits(profile.wallet.balance)}</strong>
            </article>
            <article>
              <span>Mise selectionnee</span>
              <strong className="casino-token-inline"><img src={jetonImg} alt="" />{formatCredits(amount)}</strong>
            </article>
            <article>
              <span>Cloture du tour</span>
              <strong>{Math.ceil(remainingMs / 1000)}s</strong>
            </article>
          </div>
        </div>

        <div
          className="casino-reel-shell casino-room-shell casino-room-shell--roulette casino-reel-shell--table-compact"
          style={{
            ["--room-art" as string]: `url("${rouletteBackdropArt}")`,
          }}
        >
          <div className="casino-roulette-stage-view">
            <div className={`casino-roulette-visual casino-roulette-visual--cinematic is-${sequencePhase}`}>
              <video
                ref={introVideoRef}
                className={`casino-roulette-cinematic ${sequencePhase === "intro" ? "is-visible" : ""}`}
                src={rouletteCannonIntroVideo}
                playsInline
                muted
                preload="auto"
              />

              <div className={`casino-roulette-hero-layer ${(sequencePhase === "idle" || sequencePhase === "spin" || sequencePhase === "hold") ? "is-visible" : ""}`}>
                <div className={`casino-roulette-hero-fx is-${sequencePhase}`}>
                  <div className="casino-roulette-hero-fx__aura" />
                  <div className="casino-roulette-hero-fx__trace" />
                </div>
              </div>

              <video
                ref={reloadVideoRef}
                className={`casino-roulette-cinematic ${sequencePhase === "reload" ? "is-visible" : ""}`}
                src={rouletteReloadVideo}
                playsInline
                muted
                preload="auto"
              />

              <div className={`casino-roulette-static ${(sequencePhase === "idle" || sequencePhase === "spin" || sequencePhase === "hold") ? "is-visible" : ""}`}>
                <img src={rouletteIdleImg} alt="Roulette Funesterie" />
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

              <div className="casino-roulette-hero-copy">
                <span className="casino-chip">Scene pirate</span>
                <strong>{sequencePhase === "spin" ? "Le canon tonne, la roue de jeu travaille a droite." : "Hero visuel separé du plateau de jeu."}</strong>
                <p>La scene garde l'ambiance et les videos. La lecture de la roue, des mises et du resultat passe par la console de jeu.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="casino-stage-sidebar casino-stage-sidebar--roulette">
          <div className="casino-command-dock casino-command-dock--roulette">
            <div className="casino-roulette-console">
              <div className="casino-roulette-console__wheel-shell">
                <div
                  className="casino-roulette-console__wheel"
                  style={{ transform: `translate(-50%, -50%) rotate(${animation.wheelRotation}deg)` }}
                >
                  <img className="casino-roulette-wheel__plateau" src={roulettePlateauPremium} alt="" aria-hidden="true" />
                  {wheelPockets.map((pocket) => (
                    <div
                      key={`console-${pocket.number}`}
                      className={`casino-roulette-pocket is-${pocket.color} ${animation.highlightedNumber === pocket.number ? "is-winning" : ""}`}
                      style={{ ["--pocket-angle" as string]: `${pocket.angle}deg` }}
                    >
                      <span>{pocket.number}</span>
                    </div>
                  ))}
                </div>

                <div
                  className="casino-roulette-orb casino-roulette-orb--console"
                  style={{
                    left: `${animation.ballX}%`,
                    top: `${animation.ballY}%`,
                    transform: `translate(-50%, -50%) scale(${0.94 + (animation.fireScale - 1) * 0.4})`,
                  }}
                >
                  <span
                    className="casino-roulette-orb__trail"
                    style={{ transform: `translate(-50%, -50%) rotate(${animation.fireRotation}deg)` }}
                  />
                </div>
              </div>

              <div className="casino-roulette-console__summary">
                <span className="casino-chip">Roulette gameplay</span>
                <strong>{selectedBet ? `Cible: ${selectedBet.label}` : "Choisis une poche ou une mise rapide"}</strong>
                <p>Le decor reste a gauche. La roue lisible, la bille, les mises et le resultat vivent ici.</p>
              </div>
            </div>

            <div className="casino-bet-pills casino-bet-pills--roulette">
              {ROULETTE_AMOUNT_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className={`casino-bet-pill casino-bet-pill--dubloon casino-bet-pill--roulette ${amount === preset ? "is-active" : ""}`}
                  onClick={() => setAmount(preset)}
                  disabled={working}
                >
                  <img src={tapisImg} alt="" aria-hidden="true" />
                  <strong>{preset}</strong>
                </button>
              ))}
            </div>

            <div className="casino-roulette-quickbets casino-roulette-quickbets--compact">
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

            <div className="casino-roulette-board casino-roulette-board--compact">
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

            <div className="casino-chip-row">
              <span className="casino-chip casino-chip--token"><img src={jetonImg} alt="" />Pot {formatCredits(room?.round.totalPot || 0)}</span>
              <span className="casino-chip">Joueurs {room?.round.playerCount || 0}</span>
              <span className="casino-chip">{selectedBet ? selectedBet.label : "Aucune cible"}</span>
            </div>

            <div className="casino-command-dock__actions casino-command-dock__actions--roulette">
              <button
                type="button"
                className="casino-primary-button casino-primary-button--cyan"
                onClick={() => void submitBet()}
                disabled={!selectedBet || working || profile.wallet.balance < amount}
              >
                Miser {selectedBet ? `sur ${selectedBet.label}` : ""}
              </button>
            </div>
          </div>

          <PirateInspector
            title="Carnet de tir"
            eyebrow="Roulette"
            activeTab={infoTab}
            onChange={(tabId) => setInfoTab(tabId as typeof infoTab)}
            tabs={[
              {
                id: "mises",
                label: "Mes mises",
                badge: room?.round.myBets?.length || 0,
                caption: "Lecture compacte du tour courant.",
                content: (
                  <div className="casino-history-list">
                    {(room?.round.myBets || []).length ? (
                      room?.round.myBets.map((bet) => (
                        <article key={bet.id} className="casino-history-entry">
                          <div>
                            <span>{getBetLabel(bet.betType, bet.betValue)}</span>
                            <strong className="casino-token-inline"><img src={jetonImg} alt="" />{formatCredits(bet.amount)}</strong>
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
                ),
              },
              {
                id: "participants",
                label: "Participants",
                badge: room?.round.participants?.length || 0,
                caption: "Marins presents sur le tir.",
                content: (
                  <div className="casino-prize-stack">
                    {(room?.round.participants || []).length ? (
                      room?.round.participants.map((entry) => (
                        <article key={entry.userId} className="casino-prize-card">
                          <div className="casino-prize-card__glyph"><img src={jetonImg} alt="" /></div>
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
                ),
              },
              {
                id: "historique",
                label: "Historique",
                badge: room?.recentResults?.length || 0,
                caption: "Derniers numeros tombes.",
                content: (
                  <div className="casino-chip-row">
                    {(room?.recentResults || []).map((entry) => (
                      <span key={entry.id} className={`casino-roulette-history-chip is-${entry.winningColor}`}>
                        {entry.winningNumber}
                      </span>
                    ))}
                  </div>
                ),
              },
            ]}
          />
        </div>
      </div>
    </section>
  );
}
