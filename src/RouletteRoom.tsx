import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { RouletteSoundEvent } from "./features/casino/catalog";
import RouletteCinematicStage from "./features/roulette/components/RouletteCinematicStage";
import RouletteGameplayDock from "./features/roulette/components/RouletteGameplayDock";
import {
  BALL_INNER_RADIUS,
  BALL_OUTER_RADIUS,
  BALL_START_ANGLE,
  BALL_TARGET_ANGLE,
  HOLD_DURATION_MS,
  QUICK_BETS,
  ROULETTE_AMOUNT_PRESETS,
  ROULETTE_ORDER,
  ROULETTE_TIRAGE_CANNON_DELAY_MS,
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
import roulettePreviewImg from "./images/roulette-plateau-premium.png";
import rouletteTurntableImg from "./images/roulette-tournante.png";
import jetonImg from "./images/jeton.png";
import rouletteReloadVideo from "./videos/roulette-reload.mp4";
import rouletteTirageVideo from "./videos/roulette-tirage.mp4";
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
        canonDelayMs: ROULETTE_TIRAGE_CANNON_DELAY_MS,
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
    <section className="casino-table-layout casino-table-layout--compact casino-table-layout--cards casino-table-layout--roulette">
      <div className="casino-stage casino-stage--cards">
        <div className="casino-room-hud casino-room-hud--roulette">
          <div className="casino-room-hud__lead">
            <span className="casino-chip">Roulette ATS</span>
            <div>
              <strong>Funesterie Roulette</strong>
              <p>
                Sequence cinematographique compacte: voix aleatoire, tir de canon synchronise, plateau pirate, bille laiton, verrouillage 5 secondes puis recharge.
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
          <RouletteCinematicStage
            sequencePhase={sequencePhase}
            phaseLabel={phaseLabel}
            latestResolved={room?.latestResolved || null}
            introVideoRef={introVideoRef}
            reloadVideoRef={reloadVideoRef}
            introVideoSrc={rouletteTirageVideo}
            reloadVideoSrc={rouletteReloadVideo}
            idleImageSrc={rouletteIdleImg}
          />
        </div>

        <RouletteGameplayDock
          room={room}
          amount={amount}
          selectedBet={selectedBet}
          working={working}
          canSubmitBet={Boolean(selectedBet) && !working && profile.wallet.balance >= amount}
          infoTab={infoTab}
          animation={animation}
          wheelPockets={wheelPockets}
          onAmountChange={setAmount}
          onBetChange={setSelectedBet}
          onInfoTabChange={setInfoTab}
          onSubmitBet={() => void submitBet()}
          wheelImageSrc={rouletteTurntableImg}
          historyPreviewImageSrc={roulettePreviewImg}
        />
      </div>
    </section>
  );
}
