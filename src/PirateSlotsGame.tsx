import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import alerteSound from "./audio/alerte.mp3";
import BlackjackRoom from "./BlackjackRoom";
import CarteMiniGame from "./CarteMiniGame";
import MiniTreasureGame from "./MiniTreasureGame";
import PokerRoom from "./PokerRoom";
import RouletteRoom from "./RouletteRoom";
import lingotImg from "./images/lingot.png";
import {
  BET_PRESETS,
  CASINO_DISTRICT_ARTWORK,
  SPIN_ANIMATION_INTERVAL_MS,
  SPIN_ANIMATION_STEPS,
  ROOM_DEFINITIONS,
  SLOT_AMBIENT_MEDIA,
  SLOT_FEATURE_MEDIA,
  SLOT_INTRO_MEDIA,
  SLOT_VIDEO_INTRO_SESSION_KEY,
  SYMBOL_META,
  buildGoldRainDrops,
  buildPlaceholderGrid,
  chooseSlotFeature,
  formatTransactionLabel,
  formatTransactionTime,
  getBonusNarration,
  getJokerIndexes,
  resolveRoomArtwork,
  waitForMs,
  type RoomId,
  type RouletteSoundEvent,
  type SlotFeatureKey,
} from "./features/casino/catalog";
import CasinoFloorShell from "./features/casino/components/CasinoFloorShell";
import SlotsSideRail from "./features/casino/components/SlotsSideRail";
import { formatCredits } from "./lib/casinoRoomState";
import {
  spinCasinoSlots,
  type CasinoProfile,
  type CasinoSpin,
} from "./lib/casinoApi";

type PirateSlotsGameProps = {
  profile: CasinoProfile;
  busy: boolean;
  mediaReady: boolean;
  onProfileChange: (profile: CasinoProfile, message?: string) => void;
  onError: (message: string) => void;
  onRequestMediaPlayback?: () => void;
  onRouletteEvent?: (event: RouletteSoundEvent) => void;
  onRoomChange?: (roomId: RoomId) => void;
};

function SlotsRoom({
  profile,
  busy,
  mediaReady,
  onProfileChange,
  onError,
  onRequestMediaPlayback,
}: PirateSlotsGameProps) {
  const [bet, setBet] = useState(() => Math.max(profile.wallet.minBet, BET_PRESETS[1]));
  const [displayGrid, setDisplayGrid] = useState<string[][]>(() => buildPlaceholderGrid());
  const [spinState, setSpinState] = useState<"idle" | "spinning" | "bonus">("idle");
  const [lastSpin, setLastSpin] = useState<CasinoSpin | null>(null);
  const [lastMessage, setLastMessage] = useState("Pret a lancer les reels.");
  const [activeFeature, setActiveFeature] = useState<SlotFeatureKey>("idle");
  const [tightReels, setTightReels] = useState(true);
  const [slotIntroPlayed, setSlotIntroPlayed] = useState(() => {
    try {
      return sessionStorage.getItem(SLOT_VIDEO_INTRO_SESSION_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [bonusHeldIndexes, setBonusHeldIndexes] = useState<number[]>([]);
  const [goldRain, setGoldRain] = useState<
    Array<{ id: string; left: string; delay: string; duration: string; scale: string; drift: string }>
  >([]);
  const [autoSpinCount, setAutoSpinCount] = useState(0);
  const [autoSpinPreset, setAutoSpinPreset] = useState(10);
  const intervalRef = useRef<number | null>(null);
  const featureTimeoutRef = useRef<number | null>(null);
  const goldRainTimeoutRef = useRef<number | null>(null);
  const autoSpinTimeoutRef = useRef<number | null>(null);
  const spinRunIdRef = useRef(0);
  const alertAudioRef = useRef<HTMLAudioElement | null>(null);
  const featureVideoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    setBet((current) => {
      if (current < profile.wallet.minBet) return profile.wallet.minBet;
      if (current > profile.wallet.maxBet) return profile.wallet.maxBet;
      return current;
    });
  }, [profile.wallet.maxBet, profile.wallet.minBet]);

  useEffect(() => {
    return () => {
      spinRunIdRef.current += 1;
      if (intervalRef.current) window.clearInterval(intervalRef.current);
      if (featureTimeoutRef.current) window.clearTimeout(featureTimeoutRef.current);
      if (goldRainTimeoutRef.current) window.clearTimeout(goldRainTimeoutRef.current);
      if (autoSpinTimeoutRef.current) window.clearTimeout(autoSpinTimeoutRef.current);
      alertAudioRef.current?.pause();
    };
  }, []);

  const highlightedIndexes = useMemo(() => {
    if (!lastSpin?.wins?.length) return new Set<number>();
    return new Set(lastSpin.wins.flatMap((entry) => entry.indexes));
  }, [lastSpin]);

  const canSpin = spinState === "idle" && !busy && profile.wallet.balance >= bet;

  const netChangeTone = useMemo(() => {
    if (!lastSpin) return "neutral";
    if (lastSpin.netChange > 0) return "positive";
    if (lastSpin.netChange < 0) return "negative";
    return "neutral";
  }, [lastSpin]);

  const recentTransactions = useMemo(() => profile.recentTransactions.slice(0, 8), [profile.recentTransactions]);
  const reelColumns = useMemo(() => {
    const columnCount = displayGrid[0]?.length || 0;
    return Array.from({ length: columnCount }, (_, columnIndex) =>
      displayGrid.map((row) => row[columnIndex]),
    );
  }, [displayGrid]);
  const isAlertFeatureActive = activeFeature !== "idle";
  const featureMedia = isAlertFeatureActive
    ? SLOT_FEATURE_MEDIA[activeFeature]
    : slotIntroPlayed
      ? SLOT_AMBIENT_MEDIA
      : SLOT_INTRO_MEDIA;

  useEffect(() => {
    const video = featureVideoRef.current;
    if (!video || !featureMedia.video) return;
    const shouldUseAudio = mediaReady;
    const volume = isAlertFeatureActive ? 0.5 : slotIntroPlayed ? 0.34 : 0.42;
    video.muted = !shouldUseAudio;
    video.volume = shouldUseAudio ? volume : 0;
    void video.play().catch(() => undefined);
  }, [featureMedia.video, isAlertFeatureActive, mediaReady, slotIntroPlayed]);

  function markSlotsIntroPlayed() {
    setSlotIntroPlayed((current) => {
      if (current) return current;
      try {
        sessionStorage.setItem(SLOT_VIDEO_INTRO_SESSION_KEY, "1");
      } catch {
        // ignore storage failures
      }
      return true;
    });
  }

  function playCue(ref: React.MutableRefObject<HTMLAudioElement | null>, src: string, volume: number) {
    if (!mediaReady) return;
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

  function triggerGoldRain(spin: CasinoSpin) {
    if (goldRainTimeoutRef.current) {
      window.clearTimeout(goldRainTimeoutRef.current);
      goldRainTimeoutRef.current = null;
    }

    const nextDrops = buildGoldRainDrops(spin.totalPayout, spin.bet);
    setGoldRain(nextDrops);
    if (!nextDrops.length) return;

    goldRainTimeoutRef.current = window.setTimeout(() => {
      setGoldRain([]);
      goldRainTimeoutRef.current = null;
    }, 4800);
  }

  function triggerSlotFeedback(spin: CasinoSpin) {
    const nextFeature = chooseSlotFeature(spin);
    if (nextFeature !== "idle") {
      markSlotsIntroPlayed();
    }
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

    if (SLOT_FEATURE_MEDIA[nextFeature].video && nextFeature !== "idle") {
      playCue(alertAudioRef, alerteSound, 0.78);
    }
  }

  async function animateResolvedSpin(result: Awaited<ReturnType<typeof spinCasinoSlots>>, runId: number) {
    const bonus = result.spin.bonus;

    if (bonus?.triggered) {
      setSpinState("bonus");
      setDisplayGrid(bonus.openingGrid);
      setBonusHeldIndexes(getJokerIndexes(bonus.openingGrid));
      setLastMessage(getBonusNarration(result.spin));
      await waitForMs(bonus.holdDurationMs);

      if (spinRunIdRef.current !== runId) return;

      for (const stage of bonus.stages) {
        setDisplayGrid(stage.grid);
        setBonusHeldIndexes(stage.heldIndexes);
        setLastMessage(
          bonus.fullJoker && stage === bonus.stages[bonus.stages.length - 1]
            ? "Full joker en approche. Les jokers tiennent toute la grille."
            : `Phase bonus joker ${stage.step}/${bonus.stages.length} · ${stage.jokerCount} jokers figes.`,
        );
        await waitForMs(bonus.stageDurationMs);
        if (spinRunIdRef.current !== runId) return;
      }
    } else {
      setBonusHeldIndexes([]);
      setDisplayGrid(result.spin.grid);
    }

    if (spinRunIdRef.current !== runId) return;

    setDisplayGrid(result.spin.grid);
    setBonusHeldIndexes(result.spin.bonus ? getJokerIndexes(result.spin.grid) : []);
    setLastSpin(result.spin);
    triggerSlotFeedback(result.spin);
    triggerGoldRain(result.spin);
    setSpinState("idle");
    setLastMessage(getBonusNarration(result.spin));
    onProfileChange(result.profile);
  }

  async function handleSpin() {
    if (!canSpin) return;
    onError("");
    spinRunIdRef.current += 1;
    const runId = spinRunIdRef.current;
    setSpinState("spinning");
    setGoldRain([]);
    setBonusHeldIndexes([]);
    setActiveFeature("idle");
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

      await waitForMs(SPIN_ANIMATION_INTERVAL_MS * (SPIN_ANIMATION_STEPS + 1));
      if (spinRunIdRef.current !== runId) return;
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      await animateResolvedSpin(result, runId);
    } catch (error_) {
      setSpinState("idle");
      onError(error_ instanceof Error ? error_.message : "Le spin a echoue.");
    }
  }

  function startAutoSpin(count: number) {
    if (!canSpin) return;
    setAutoSpinCount(count);
    
    async function doAutoSpin(remaining: number) {
      if (remaining <= 0) {
        setAutoSpinCount(0);
        return;
      }
      
      await handleSpin();
      setAutoSpinCount(remaining - 1);
      
      // Schedule next spin with a small delay
      autoSpinTimeoutRef.current = window.setTimeout(() => {
        doAutoSpin(remaining - 1);
      }, 800);
    }
    
    doAutoSpin(count);
  }

  function stopAutoSpin() {
    setAutoSpinCount(0);
    if (autoSpinTimeoutRef.current) {
      window.clearTimeout(autoSpinTimeoutRef.current);
      autoSpinTimeoutRef.current = null;
    }
  }

  function adjustBet(direction: -1 | 1) {
    const currentIndex = BET_PRESETS.findIndex((preset) => preset >= bet);
    const safeIndex = currentIndex === -1 ? BET_PRESETS.length - 1 : currentIndex;
    const nextIndex = Math.max(0, Math.min(BET_PRESETS.length - 1, safeIndex + direction));
    setBet(Math.max(profile.wallet.minBet, Math.min(profile.wallet.maxBet, BET_PRESETS[nextIndex])));
  }

  function renderCell(symbolId: string, cellIndex: number, key: string) {
    const meta = SYMBOL_META[symbolId] || SYMBOL_META.COIN;
    const isHighlighted = highlightedIndexes.has(cellIndex);
    const isHeldJoker = bonusHeldIndexes.includes(cellIndex) && symbolId === "JOKER";

    return (
      <div
        key={key}
        className={`casino-reel-cell ${isHighlighted ? "is-highlighted" : ""} ${isHeldJoker ? "is-bonus-held" : ""}`}
        style={{ ["--cell-accent" as string]: meta.accent }}
      >
        <img className="casino-reel-cell__art" src={meta.image} alt="" aria-hidden="true" />
        <span className="casino-reel-cell__label">{meta.label}</span>
      </div>
    );
  }

  return (
    <section className="casino-table-layout casino-table-layout--slots">
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

        <div className={`casino-reel-shell casino-room-shell casino-reel-shell--slots ${tightReels ? "is-tight-reels" : ""}`}>
          <div className="casino-reel-shell__header">
            <div>
              <span className="casino-chip">Machine a sous</span>
              <h2>Salon pirate principal</h2>
            </div>
            <p>{lastMessage}</p>
          </div>

          {goldRain.length ? (
            <div className="casino-gold-rain" aria-hidden="true">
              {goldRain.map((drop) => (
                <span
                  key={drop.id}
                  className="casino-gold-rain__bar"
                  style={{
                    left: drop.left,
                    animationDelay: drop.delay,
                    animationDuration: drop.duration,
                    transform: `translateX(${drop.drift}) scale(${drop.scale})`,
                  }}
                >
                  <img src={lingotImg} alt="" />
                </span>
              ))}
            </div>
          ) : null}

          <div className={`casino-reel-grid ${spinState === "spinning" ? "is-spinning" : ""} ${spinState === "bonus" ? "is-bonus" : ""} ${tightReels ? "is-tight" : ""}`}>
            {reelColumns.map((column, columnIndex) => {
              const strip = spinState === "spinning" ? [...column, ...column, ...column] : column;

              return (
                <div
                  key={`reel-${columnIndex}`}
                  className={`casino-reel-column ${spinState === "spinning" ? "is-spinning" : ""}`}
                  style={{ ["--reel-order" as string]: `${columnIndex}` }}
                >
                  <div className="casino-reel-column__viewport">
                    <div className="casino-reel-column__track">
                      {strip.map((symbolId, rowIndex) => {
                        const visibleRowIndex = rowIndex % column.length;
                        const cellIndex = visibleRowIndex * reelColumns.length + columnIndex;
                        return renderCell(symbolId, cellIndex, `${columnIndex}-${rowIndex}-${symbolId}`);
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
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

            <div className="casino-action-row__buttons">
              <button
                type="button"
                className={`casino-ghost-button ${tightReels ? "is-active" : ""}`}
                onClick={() => setTightReels((current) => !current)}
                disabled={spinState === "spinning" || spinState === "bonus"}
              >
                {tightReels ? "Rouleaux serres" : "Rouleaux ouverts"}
              </button>
              
              {autoSpinCount > 0 ? (
                <>
                  <button
                    type="button"
                    className="casino-primary-button casino-primary-button--auto-spin"
                    onClick={() => startAutoSpin(autoSpinPreset)}
                    disabled={!canSpin}
                  >
                    Auto Spin: {autoSpinCount} restants
                  </button>
                  <button
                    type="button"
                    className="casino-ghost-button"
                    onClick={stopAutoSpin}
                  >
                    Arreter
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="casino-primary-button casino-primary-button--spin"
                    onClick={handleSpin}
                    disabled={!canSpin}
                  >
                    {spinState === "spinning" ? "Reels en cours..." : spinState === "bonus" ? "Bonus joker..." : "Lancer le spin"}
                  </button>
                  <button
                    type="button"
                    className="casino-ghost-button"
                    onClick={() => startAutoSpin(autoSpinPreset)}
                    disabled={!canSpin}
                  >
                    Auto Spin x{autoSpinPreset}
                  </button>
                  <select
                    className="casino-auto-spin-select"
                    value={autoSpinPreset}
                    onChange={(e) => setAutoSpinPreset(Number(e.target.value))}
                    disabled={spinState === "spinning" || spinState === "bonus"}
                  >
                    <option value={5}>5 spins</option>
                    <option value={10}>10 spins</option>
                    <option value={25}>25 spins</option>
                    <option value={50}>50 spins</option>
                  </select>
                </>
              )}
            </div>
          </div>

          {profile.wallet.balance < bet ? (
            <div className="casino-low-balance">
              Ton solde est trop bas pour cette mise. Baisse la mise ou recupere ton bonus journalier.
            </div>
          ) : null}
        </div>
      </div>

      <SlotsSideRail
        profile={profile}
        mediaReady={mediaReady}
        featureMedia={featureMedia}
        slotIntroPlayed={slotIntroPlayed}
        isAlertFeatureActive={isAlertFeatureActive}
        featureVideoRef={featureVideoRef}
        recentTransactions={recentTransactions}
        lastSpin={lastSpin}
        onMarkSlotsIntroPlayed={markSlotsIntroPlayed}
        onRequestMediaPlayback={onRequestMediaPlayback}
      />
    </section>
  );
}

export default function PirateSlotsGame(props: PirateSlotsGameProps) {
  const [activeRoom, setActiveRoom] = useState<RoomId>("slots");
  const currentRoom = useMemo(
    () => ROOM_DEFINITIONS.find((room) => room.id === activeRoom) || ROOM_DEFINITIONS[0],
    [activeRoom],
  );
  const currentRoomArtwork = resolveRoomArtwork(activeRoom);

  useEffect(() => {
    props.onRoomChange?.(activeRoom);
  }, [activeRoom, props.onRoomChange]);

  function renderRoom() {
    switch (activeRoom) {
      case "treasure-map":
        return <CarteMiniGame profile={props.profile} mediaReady={props.mediaReady} onProfileChange={props.onProfileChange} onError={props.onError} />;
      case "treasure-hunt":
        return <MiniTreasureGame profile={props.profile} mediaReady={props.mediaReady} onProfileChange={props.onProfileChange} onError={props.onError} />;
      case "blackjack":
        return <BlackjackRoom playerName={props.profile.user.username} profile={props.profile} mediaReady={props.mediaReady} onProfileChange={props.onProfileChange} onError={props.onError} />;
      case "poker":
        return <PokerRoom playerName={props.profile.user.username} profile={props.profile} mediaReady={props.mediaReady} onProfileChange={props.onProfileChange} onError={props.onError} />;
      case "roulette":
        return <RouletteRoom profile={props.profile} onProfileChange={props.onProfileChange} onError={props.onError} onRouletteEvent={props.onRouletteEvent} />;
      default:
        return <SlotsRoom {...props} />;
    }
  }

  return (
    <CasinoFloorShell
      activeRoom={activeRoom}
      currentRoom={currentRoom}
      districtArtwork={CASINO_DISTRICT_ARTWORK}
      currentRoomArtwork={currentRoomArtwork}
      playerName={props.profile.user.username}
      balanceLabel={formatCredits(props.profile.wallet.balance)}
      onRoomChange={setActiveRoom}
    >
      {renderRoom()}
    </CasinoFloorShell>
  );
}
