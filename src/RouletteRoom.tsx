import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import PirateInspector from "./PirateInspector";
import { ROOM_DEFINITIONS } from "./features/casino/catalog";
import type { RouletteSoundEvent } from "./features/casino/catalog";
import AtsRouletteBoard from "./features/roulette/components/AtsRouletteBoard";
import RouletteCinematicStage from "./features/roulette/components/RouletteCinematicStage";
import RouletteResultPreview from "./features/roulette/components/RouletteResultPreview";
import {
  BALL_INNER_RADIUS,
  BALL_OUTER_RADIUS,
  BALL_START_ANGLE,
  BALL_TARGET_ANGLE,
  HOLD_DURATION_MS,
  ROULETTE_ANNOUNCE_LEAD_IN_MS,
  ROULETTE_AMOUNT_PRESETS,
  ROULETTE_ORDER,
  ROULETTE_TIRAGE_CANNON_DELAY_MS,
  SPIN_DURATION_MS,
  WHEEL_POCKET_ANGLE,
  buildSettledAnimation,
  buildStaticAnimation,
  easeOutCubic,
  easeOutQuart,
  getNumberColor,
  getBetLabel,
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
import tapisImg from "./images/tapis.png";
import rouletteReloadVideo from "./videos/roulette-reload.mp4";
import rouletteTirageVideo from "./videos/roulette-tirage.mp4";
import { formatCredits } from "./lib/casinoRoomState";
import {
  isCasinoSessionError,
  fetchRouletteRoom,
  placeRouletteBet,
  type CasinoProfile,
  type RouletteRoom,
} from "./lib/casinoApi";

type RouletteRoomProps = {
  profile: CasinoProfile;
  onProfileChange: (profile: CasinoProfile, message?: string) => void;
  onError: (message: string) => void;
  onRouletteEvent?: (event: RouletteSoundEvent) => void;
  onAmbientPanelChange?: (panel: React.ReactNode | null) => void;
};

type RouletteInfoSection = {
  id: string;
  label: string;
  content: React.ReactNode;
};

type ActiveRouletteBet = {
  betType: string;
  betValue: string;
  label: string;
  amount: number;
};

const ROULETTE_POLL_INTERVAL_MS = 1200;
const DEFAULT_ROULETTE_DRAW_INTERVAL_MS = 120_000;
const ROULETTE_DRAW_INTERVAL_STORAGE_KEY = "casino.roulette.drawIntervalMs";
const ROULETTE_DRAW_INTERVAL_OPTIONS = [
  { label: "1 min 30", value: 90_000 },
  { label: "2 min", value: 120_000 },
] as const;

export default function RouletteRoom({
  profile,
  onProfileChange,
  onError,
  onRouletteEvent,
  onAmbientPanelChange,
}: RouletteRoomProps) {
  const rouletteRoomMeta = ROOM_DEFINITIONS.find((roomEntry) => roomEntry.id === "roulette");
  const [room, setRoom] = useState<RouletteRoom | null>(null);
  const [amount, setAmount] = useState(ROULETTE_AMOUNT_PRESETS[2]);
  const [selectedBet, setSelectedBet] = useState<{ betType: string; betValue: string; label: string } | null>(null);
  const [working, setWorking] = useState(false);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [infoTab, setInfoTab] = useState<"mises" | "participants" | "historique">("mises");
  const [sequencePhase, setSequencePhase] = useState<RouletteSequencePhase>("idle");
  const [animation, setAnimation] = useState<RouletteAnimationState>(() => buildStaticAnimation());
  const [showRoomInfo, setShowRoomInfo] = useState(false);
  const [drawIntervalMs, setDrawIntervalMs] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_ROULETTE_DRAW_INTERVAL_MS;
    const stored = Number(window.localStorage.getItem(ROULETTE_DRAW_INTERVAL_STORAGE_KEY));
    return ROULETTE_DRAW_INTERVAL_OPTIONS.some((option) => option.value === stored)
      ? stored
      : DEFAULT_ROULETTE_DRAW_INTERVAL_MS;
  });

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
  const profileSignatureRef = useRef<string>("");
  const pollTimeoutRef = useRef<number | null>(null);
  const syncInFlightRef = useRef(false);
  const drawTimeoutRef = useRef<number | null>(null);
  const lastDrawStartedAtRef = useRef(0);
  const pendingDrawRef = useRef<{
    winningNumber: number;
    roundId: number;
    resultId: number;
  } | null>(null);

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
      if (pollTimeoutRef.current) {
        window.clearTimeout(pollTimeoutRef.current);
        pollTimeoutRef.current = null;
      }
      if (drawTimeoutRef.current) {
        window.clearTimeout(drawTimeoutRef.current);
        drawTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    let tickId = 0;

    function buildProfileSignature(nextProfile: CasinoProfile) {
      return JSON.stringify({
        balance: nextProfile.wallet.balance,
        canClaimDailyBonus: nextProfile.wallet.canClaimDailyBonus,
        nextDailyBonusAt: nextProfile.wallet.nextDailyBonusAt,
        gamesPlayed: nextProfile.wallet.gamesPlayed,
        lifetimeWon: nextProfile.wallet.lifetimeWon,
        lifetimeWagered: nextProfile.wallet.lifetimeWagered,
        transactionIds: nextProfile.recentTransactions.slice(0, 5).map((entry) => entry.id),
      });
    }

    function syncProfileIfChanged(nextProfile: CasinoProfile) {
      const nextSignature = buildProfileSignature(nextProfile);
      if (nextSignature === profileSignatureRef.current) return;
      profileSignatureRef.current = nextSignature;
      onProfileChangeRef.current(nextProfile);
    }

    async function syncRoom() {
      if (syncInFlightRef.current) return;
      syncInFlightRef.current = true;
      try {
        const result = await fetchRouletteRoom();
        if (!mounted) return;
        setRoom(result.room);
        syncProfileIfChanged(result.profile);
      } catch (error_) {
        if (!mounted) return;
        onErrorRef.current(
          isCasinoSessionError(error_)
            ? "La session roulette a expire. Recharge le salon pour te reconnecter."
            : error_ instanceof Error
              ? error_.message
              : "La salle roulette est indisponible.",
        );
      } finally {
        syncInFlightRef.current = false;
        if (mounted) {
          pollTimeoutRef.current = window.setTimeout(() => {
            void syncRoom();
          }, ROULETTE_POLL_INTERVAL_MS);
        }
      }
    }

    void syncRoom();
    tickId = window.setInterval(() => setNowTick(Date.now()), 1000);

    return () => {
      mounted = false;
      window.clearInterval(tickId);
      if (pollTimeoutRef.current) {
        window.clearTimeout(pollTimeoutRef.current);
        pollTimeoutRef.current = null;
      }
    };
  }, []);

  const remainingMs = useMemo(() => {
    const closesAt = room?.round.closesAt ? new Date(room.round.closesAt).getTime() : 0;
    if (!closesAt) return 0;
    return Math.max(0, closesAt - nowTick);
  }, [nowTick, room?.round.closesAt]);
  const countdownLabel = useMemo(() => {
    if (remainingMs <= 0) return "Fermee";
    const totalSeconds = Math.ceil(remainingMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  }, [remainingMs]);

  const wheelPockets = useMemo(
    () =>
      ROULETTE_ORDER.map((number, index) => ({
        number,
        color: getNumberColor(number),
        angle: index * WHEEL_POCKET_ANGLE - 90,
      })),
    [],
  );

  const rouletteVisualAssets = useMemo(
    () => ({
      chip: jetonImg,
      felt: tapisImg,
      wheelBase: roulettePreviewImg,
      turntable: rouletteTurntableImg,
    }),
    [],
  );

  const joinedSalon = useMemo(() => {
    const pirateChannels = [
      "Mouillage du Kraken",
      "Crique des Sabres",
      "Pont des Corsaires",
      "Passe du Crabe Noir",
      "Baie des Flibustiers",
      "Anse du Gouvernail",
      "Rade des Galions",
      "Brume du Pavillon Noir",
    ] as const;

    const roundId = Number(room?.round.id || 0);
    if (!roundId) {
      return {
        eyebrow: "Canal pirate",
        title: "Mouillage des Deniers Noirs",
      };
    }

    const channelNumber = ((roundId - 1) % pirateChannels.length) + 1;
    return {
      eyebrow: `Canal ${channelNumber}`,
      title: pirateChannels[channelNumber - 1],
    };
  }, [room?.round.id]);
  const activeBets = useMemo<ActiveRouletteBet[]>(() => {
    const nextActiveBets: ActiveRouletteBet[] = [];
    const activeBetAmounts = new Map<string, number>();

    for (const bet of room?.round.myBets || []) {
      const key = `${bet.betType}::${bet.betValue}`;
      activeBetAmounts.set(key, (activeBetAmounts.get(key) || 0) + bet.amount);
    }

    for (const [key, totalAmount] of activeBetAmounts.entries()) {
      const [betType, betValue] = key.split("::");
      nextActiveBets.push({
        betType,
        betValue,
        label: getBetLabel(betType, betValue),
        amount: totalAmount,
      });
    }

    return nextActiveBets;
  }, [room?.round.myBets]);
  const activeTotal = activeBets.reduce((sum, bet) => sum + bet.amount, 0);
  const latestResult = room?.recentResults?.[0] || null;
  const latestResolvedResult = room?.latestResolved || latestResult;

  const rouletteInfoSections = useMemo<RouletteInfoSection[]>(
    () => [
      {
        id: "salle",
        label: "Apercu",
        content: (
          <div className="casino-topdeck__info-stack">
            <div className="casino-topdeck__info-meta">
              <span>{rouletteRoomMeta?.label || "Roulette"}</span>
              <span>Mode: table partagee</span>
              <span>Wallet: backend A11</span>
            </div>
            <p className="casino-topdeck__info-copy">
              Une salle commune, un compte a rebours partage et un tir serveur unique pour toute la table.
            </p>
          </div>
        ),
      },
      {
        id: "canal",
        label: "Canal",
        content: (
          <div className="casino-metric-list">
            <div>
              <span>Canal</span>
              <strong>{joinedSalon.title}</strong>
            </div>
            <div>
              <span>Joueurs</span>
              <strong>{room?.round.playerCount || 0}</strong>
            </div>
            <div>
              <span>Pot</span>
              <strong>{room?.round.totalPot || 0}</strong>
            </div>
            <div>
              <span>Cloture</span>
              <strong>{remainingMs > 0 ? `${Math.ceil(remainingMs / 1000)}s` : "Fermee"}</strong>
            </div>
          </div>
        ),
      },
      {
        id: "cadence",
        label: "Cadence",
        content: (
          <div className="casino-topdeck__info-stack">
            <div className="casino-topdeck__info-meta">
              <span>Tirage roulette</span>
              <span>Cadence locale d'affichage</span>
            </div>
            <p className="casino-topdeck__info-copy">
              Regle l'intervalle entre deux sequences de tirage pour cette table sur cet appareil.
            </p>
            <div className="casino-topdeck__info-buttons" role="group" aria-label="Cadence des tirages">
              {ROULETTE_DRAW_INTERVAL_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`casino-topdeck__info-button ${drawIntervalMs === option.value ? "is-active" : ""}`}
                  aria-pressed={drawIntervalMs === option.value}
                  onClick={() => setDrawIntervalMs(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        ),
      },
      {
        id: "historique",
        label: "Historique",
        content: (
          <div className="casino-chip-row">
            {(room?.recentResults || []).length ? (
              room?.recentResults.map((entry) => (
                <span key={entry.id} className={`casino-roulette-history-chip is-${entry.winningColor}`}>
                  {entry.winningNumber}
                </span>
              ))
            ) : (
              <p className="casino-history-empty">Aucun numero resolu pour le moment.</p>
            )}
          </div>
        ),
      },
      {
        id: "carnet",
        label: "Carnet de tir",
        content: (
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
                            <strong className="casino-token-inline"><img src={rouletteVisualAssets.chip} alt="" />{formatCredits(bet.amount)}</strong>
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
                          <div className="casino-prize-card__glyph"><img src={rouletteVisualAssets.chip} alt="" /></div>
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
                  <div className="casino-roulette-history-panel">
                    {latestResult ? (
                      <RouletteResultPreview
                        winningNumber={latestResult.winningNumber}
                        winningColor={latestResult.winningColor}
                        previewImageSrc={rouletteVisualAssets.wheelBase}
                      />
                    ) : null}

                    <div className="casino-chip-row">
                      {(room?.recentResults || []).map((entry) => (
                        <span key={entry.id} className={`casino-roulette-history-chip is-${entry.winningColor}`}>
                          {entry.winningNumber}
                        </span>
                      ))}
                    </div>
                  </div>
                ),
              },
            ]}
          />
        ),
      },
    ],
    [
      infoTab,
      drawIntervalMs,
      joinedSalon.title,
      latestResult,
      remainingMs,
      room?.recentResults,
      room?.round.myBets,
      room?.round.participants,
      room?.round.playerCount,
      room?.round.totalPot,
      rouletteRoomMeta?.label,
      rouletteVisualAssets.chip,
      rouletteVisualAssets.wheelBase,
    ],
  );
  const [activeRouletteInfoSectionId, setActiveRouletteInfoSectionId] = useState(rouletteInfoSections[0]?.id ?? "salle");
  const activeRouletteInfoSection =
    rouletteInfoSections.find((section) => section.id === activeRouletteInfoSectionId) ?? rouletteInfoSections[0];
  const ambientRoulettePanel = useMemo(
    () => (
      <RouletteCinematicStage
        sequencePhase={sequencePhase}
        latestResolved={latestResolvedResult || null}
        introVideoRef={introVideoRef}
        reloadVideoRef={reloadVideoRef}
        introVideoSrc={rouletteTirageVideo}
        reloadVideoSrc={rouletteReloadVideo}
        idleImageSrc={rouletteIdleImg}
      />
    ),
    [latestResolvedResult, sequencePhase],
  );

  useEffect(() => {
    setActiveRouletteInfoSectionId((currentId) =>
      rouletteInfoSections.some((section) => section.id === currentId)
        ? currentId
        : (rouletteInfoSections[0]?.id ?? "salle"));
  }, [rouletteInfoSections]);

  useEffect(() => {
    onAmbientPanelChange?.(ambientRoulettePanel);
    return () => {
      onAmbientPanelChange?.(null);
    };
  }, [ambientRoulettePanel, onAmbientPanelChange]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(ROULETTE_DRAW_INTERVAL_STORAGE_KEY, String(drawIntervalMs));
  }, [drawIntervalMs]);

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

  async function runSpinSequence(
    winningNumber: number,
    context: { roundId: number; resultId: number },
  ) {
    const token = ++sequenceTokenRef.current;
    const introVideo = introVideoRef.current;
    const reloadVideo = reloadVideoRef.current;

    onRouletteEventRef.current?.({
      type: "spin",
      roundId: context.roundId,
      resultId: context.resultId,
      winningNumber,
      canonDelayMs: ROULETTE_TIRAGE_CANNON_DELAY_MS,
    });

    await waitForMs(ROULETTE_ANNOUNCE_LEAD_IN_MS);
    if (!mountedRef.current || token !== sequenceTokenRef.current) return;

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

  function flushPendingDraw() {
    if (!mountedRef.current) return;
    const nextDraw = pendingDrawRef.current;
    if (!nextDraw) return;
    pendingDrawRef.current = null;
    lastDrawStartedAtRef.current = Date.now();
    void runSpinSequence(nextDraw.winningNumber, {
      roundId: nextDraw.roundId,
      resultId: nextDraw.resultId,
    });
  }

  function scheduleDraw(payload: { winningNumber: number; roundId: number; resultId: number }) {
    pendingDrawRef.current = payload;
    if (drawTimeoutRef.current) return;

    const elapsedMs = lastDrawStartedAtRef.current ? Date.now() - lastDrawStartedAtRef.current : drawIntervalMs;
    const waitMs = Math.max(0, drawIntervalMs - elapsedMs);

    if (waitMs === 0) {
      flushPendingDraw();
      return;
    }

    drawTimeoutRef.current = window.setTimeout(() => {
      drawTimeoutRef.current = null;
      flushPendingDraw();
    }, waitMs);
  }

  useEffect(() => {
    if (!pendingDrawRef.current) return;
    if (drawTimeoutRef.current) {
      window.clearTimeout(drawTimeoutRef.current);
      drawTimeoutRef.current = null;
    }
    scheduleDraw(pendingDrawRef.current);
  }, [drawIntervalMs]);

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

    const resolved = room.latestResolved || room.recentResults?.[0] || null;
    const resolvedId = resolved?.id ?? null;
    if (latestResolvedIdRef.current === null) {
      latestResolvedIdRef.current = resolvedId;
      return;
    }

    if (resolvedId && resolvedId !== latestResolvedIdRef.current) {
      latestResolvedIdRef.current = resolvedId;
      if (typeof resolved?.winningNumber === "number") {
        scheduleDraw({
          winningNumber: resolved.winningNumber,
          roundId: room.round.id,
          resultId: resolvedId,
        });
      }
    }
  }, [room]);

  async function submitBet() {
    if (!selectedBet || working || profile.wallet.balance < amount) return;
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

  function clearPendingBets() {
    if (working) return;
    setSelectedBet(null);
  }

  return (
    <section className="casino-table-layout casino-table-layout--roulette casino-table-layout--roulette-ats">
      <div className="casino-stage casino-stage--cards casino-stage--roulette-ats">
        <div
          className="casino-roulette-fused-stage"
          style={{
            ["--roulette-chip-art" as string]: `url("${rouletteVisualAssets.chip}")`,
            ["--room-art" as string]: `url("${rouletteBackdropArt}")`,
          }}
        >
          <div className="casino-roulette-fused-stage__header">
            <div className="casino-topdeck__chip-row">
              <span className="casino-chip">{rouletteRoomMeta?.chip || "ATS live"}</span>
              <div className="casino-roulette-topdeck__actions">
                <span
                  className={`casino-roulette-topdeck__timer ${remainingMs <= 0 ? "is-closed" : ""}`}
                  aria-label={remainingMs > 0 ? `Cloture des mises dans ${countdownLabel}` : "Mises fermees"}
                >
                  {countdownLabel}
                </span>
                <button
                  type="button"
                  className={`casino-ghost-button casino-topdeck__info-toggle ${showRoomInfo ? "is-open" : ""}`}
                  onClick={() => setShowRoomInfo((value) => !value)}
                  aria-label="Informations roulette"
                  aria-expanded={showRoomInfo}
                >
                  <span className="casino-button-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24">
                      <path d="M4 7h16" />
                      <path d="M4 12h16" />
                      <path d="M4 17h16" />
                    </svg>
                  </span>
                </button>
              </div>
            </div>

            <strong>{rouletteRoomMeta?.title || "Roulette multijoueur"}</strong>

            {showRoomInfo ? (
              <article className="casino-topdeck__info-panel" aria-label="Informations roulette">
                <div className="casino-topdeck__info-buttons" role="tablist" aria-label="Sections roulette">
                  {rouletteInfoSections.map((section) => (
                    <button
                      key={section.id}
                      type="button"
                      role="tab"
                      className={`casino-topdeck__info-button ${activeRouletteInfoSection?.id === section.id ? "is-active" : ""}`}
                      aria-selected={activeRouletteInfoSection?.id === section.id}
                      onClick={() => setActiveRouletteInfoSectionId(section.id)}
                    >
                      {section.label}
                    </button>
                  ))}
                </div>

                <div className="casino-topdeck__info-body" role="tabpanel">
                  {activeRouletteInfoSection?.content}
                </div>
              </article>
              ) : null}
            </div>

          <div className="casino-roulette-fused-stage__body">
            <div className="casino-roulette-fused-stage__left">
              <div className="casino-roulette-main-board casino-roulette-board casino-roulette-board--compact casino-roulette-board--ats">
                <AtsRouletteBoard
                  feltImageSrc={rouletteVisualAssets.felt}
                  chipImageSrc={rouletteVisualAssets.chip}
                  amount={amount}
                  onAmountChange={setAmount}
                  selectedBet={selectedBet}
                  onBetChange={setSelectedBet}
                  onPortClick={(port) => {
                    void port;
                  }}
                  disabled={working}
                />
              </div>

              <div className="casino-bet-pills casino-bet-pills--roulette casino-bet-pills--roulette-embedded">
                {ROULETTE_AMOUNT_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className={`casino-bet-pill casino-bet-pill--dubloon casino-bet-pill--roulette ${amount === preset ? "is-active" : ""}`}
                    onClick={() => setAmount(preset)}
                    disabled={working}
                  >
                    <img src={rouletteVisualAssets.chip} alt="" aria-hidden="true" />
                    <span className="casino-bet-pill__content">
                      <small>Mise</small>
                      <strong>{preset}</strong>
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="casino-roulette-fused-stage__right">
              <div
                className="casino-roulette-console"
                style={{
                  ["--roulette-chip-art" as string]: `url("${rouletteVisualAssets.chip}")`,
                }}
              >
                <div className="casino-roulette-console__wheel-shell">
                  <img
                    className="casino-roulette-console__wheel-base"
                    src={rouletteVisualAssets.wheelBase}
                    alt=""
                    aria-hidden="true"
                  />
                  <div
                    className="casino-roulette-console__wheel"
                    style={{ transform: `translate(-50%, -50%) rotate(${animation.wheelRotation}deg)` }}
                  >
                    <img
                      className="casino-roulette-wheel__plateau casino-roulette-wheel__plateau--turntable"
                      src={rouletteVisualAssets.turntable}
                      alt=""
                      aria-hidden="true"
                    />
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

                  <div className="casino-roulette-console__chip-stack" aria-hidden="true">
                    <img src={rouletteVisualAssets.chip} alt="" />
                    <img src={rouletteVisualAssets.chip} alt="" />
                  </div>
                </div>

                <div className="casino-roulette-console__summary">
                  <span className="casino-chip">{joinedSalon.eyebrow}</span>
                  <strong>{selectedBet ? `Cible: ${selectedBet.label}` : joinedSalon.title}</strong>
                  <div className="casino-roulette-console__stats">
                    <span>
                      <small>Dernier tir</small>
                      <b className={latestResult ? `is-${latestResult.winningColor}` : ""}>
                        {latestResult ? latestResult.winningNumber : "--"}
                      </b>
                    </span>
                    <span>
                      <small>Joueurs</small>
                      <b>{room?.round.playerCount || 0}</b>
                    </span>
                  </div>
                </div>
              </div>

              <div
                className="casino-roulette-actions-felt"
                style={{ ["--roulette-actions-felt" as string]: `url("${rouletteVisualAssets.felt}")` }}
              >
                <div className="casino-command-dock__actions casino-command-dock__actions--roulette">
                  <button
                    type="button"
                    className="casino-primary-button"
                    onClick={() => void submitBet()}
                    disabled={!Boolean(selectedBet) || working || profile.wallet.balance < amount}
                  >
                    Miser {selectedBet ? `sur ${selectedBet.label}` : ""}
                  </button>
                  <button
                    type="button"
                    className="casino-ghost-button"
                    onClick={clearPendingBets}
                    disabled={working || !selectedBet}
                  >
                    Effacer les mises
                  </button>
                </div>

                <div className="casino-chip-row">
                  <span className="casino-chip casino-chip--token"><img src={rouletteVisualAssets.chip} alt="" />Pot {formatCredits(room?.round.totalPot || 0)}</span>
                  <span className="casino-chip">Joueurs {room?.round.playerCount || 0}</span>
                  <span className="casino-chip">{selectedBet ? selectedBet.label : "Aucune cible"}</span>
                </div>
              </div>

              <div className="casino-roulette-bet-recap" aria-live="polite">
                <div className="casino-roulette-bet-recap__header">
                  <span className="casino-chip">Mises actives</span>
                  <strong>{activeBets.length ? `${activeBets.length} position(s)` : "Aucune mise"}</strong>
                </div>
                <div className="casino-roulette-bet-recap__list">
                  {activeBets.length ? (
                    activeBets.map((bet) => (
                      <article key={`${bet.betType}-${bet.betValue}`} className="casino-roulette-bet-recap__entry">
                        <span>{bet.label}</span>
                        <strong>{formatCredits(bet.amount)}</strong>
                      </article>
                    ))
                  ) : (
                    <p className="casino-history-empty">Ajoute des mises depuis le tapis.</p>
                  )}
                </div>
                <div className="casino-roulette-bet-recap__footer">
                  <span>Total</span>
                  <strong>{formatCredits(activeTotal)}</strong>
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
