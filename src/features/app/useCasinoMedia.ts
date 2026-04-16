// Helper centralisé pour play() avec log et retour d'état
export async function safePlayMedia(media: HTMLMediaElement, label: string) {
  const waitForReady = () =>
    new Promise<void>((resolve) => {
      if (media.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        resolve();
        return;
      }

      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        media.removeEventListener("loadeddata", finish);
        media.removeEventListener("canplay", finish);
        media.removeEventListener("error", finish);
        resolve();
      };

      media.addEventListener("loadeddata", finish, { once: true });
      media.addEventListener("canplay", finish, { once: true });
      media.addEventListener("error", finish, { once: true });
      window.setTimeout(finish, 1400);
      media.load();
    });

  const toInfo = (error: any) => ({
    name: error?.name,
    message: error?.message,
    readyState: media.readyState,
    muted: media.muted,
    currentSrc: media.currentSrc || media.src,
    label,
  });

  try {
    await media.play();
    return { ok: true, error: undefined };
  } catch (error: any) {
    const errorName = String(error?.name || "");
    const canRetry = errorName === "AbortError" || errorName === "NotSupportedError" || media.readyState < HTMLMediaElement.HAVE_CURRENT_DATA;
    if (canRetry) {
      await waitForReady();
      try {
        await media.play();
        return { ok: true, error: undefined };
      } catch (retryError: any) {
        const info = toInfo(retryError);
        return { ok: false, error: info };
      }
    }

    const info = toInfo(error);
    return { ok: false, error: info };
  }
}
import { useEffect, useMemo, useRef, useState } from "react";
import canonAudio from "../../audio/canon.mp3";
import checkAudio from "../../audio/check.mp3";
import entryAudio from "../../audio/entrée.mp3";
import fantomeAudio from "../../audio/fantome.mp3";
import moussaillonAudio from "../../audio/moussaillon.mp3";
import sharedAmbientMedia from "../../videos/fresh.mp4";
import type { RoomId, RouletteSoundEvent } from "../casino/catalog";
import {
  ROULETTE_TIRAGE_CANNON_DELAY_MS,
} from "../roulette/model";

function waitForMs(durationMs: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, durationMs);
  });
}

function stopMedia(media: HTMLMediaElement | null) {
  if (!media) return;
  media.pause();
  try {
    media.currentTime = 0;
  } catch {
    // ignore reset errors
  }
}

function pauseMedia(media: HTMLMediaElement | null) {
  if (!media) return;
  media.pause();
}

function normalizeMediaSource(value: string | null | undefined) {
  const normalized = String(value || "").trim();
  if (!normalized) return "";

  try {
    const resolved = typeof window !== "undefined"
      ? new URL(normalized, window.location.origin)
      : new URL(normalized);
    return `${resolved.origin}${resolved.pathname}`;
  } catch {
    return normalized;
  }
}

function isSameMediaSource(currentSrc: string | null | undefined, targetSrc: string | null | undefined) {
  const normalizedCurrent = normalizeMediaSource(currentSrc);
  const normalizedTarget = normalizeMediaSource(targetSrc);
  return Boolean(normalizedCurrent && normalizedTarget && normalizedCurrent === normalizedTarget);
}

type UseCasinoMediaOptions = {
  activeCasinoRoom: RoomId;
  profileLoaded: boolean;
  roomChangeCount: number;
};

const SLOT_ONE_START_DELAY_MS = 1_500;
const INTRO_FALLBACK_HIDE_MS = 45_000;

export function useCasinoMedia({ activeCasinoRoom, profileLoaded, roomChangeCount }: UseCasinoMediaOptions) {
  const [showImmersion, setShowImmersion] = useState(false);
  const [immersionLine, setImmersionLine] = useState("Ouverture du pont prive...");
  const [ambientVideoAudible, setAmbientVideoAudible] = useState(false);
  const [mediaReady, setMediaReady] = useState(false);
  const [slotsIntroDelayActive, setSlotsIntroDelayActive] = useState(false);
  const [showImmersionOneVideo, setShowImmersionOneVideo] = useState(false);
  // Nouvel état pour le statut média
  const [mediaStatus, setMediaStatus] = useState<"locked"|"unlocking"|"ready"|"blocked">("locked");

  const cueAudioRef = useRef<HTMLAudioElement | null>(null);
  const cannonAudioRef = useRef<HTMLAudioElement | null>(null);
  const unlockAudioRef = useRef<HTMLAudioElement | null>(null);
  const rouletteAmbientAudioRef = useRef<HTMLAudioElement | null>(null);
  const ambientVideoRef = useRef<HTMLVideoElement | null>(null);
  const introHideTimeoutRef = useRef<number | null>(null);
  const slotsIntroDelayTimeoutRef = useRef<number | null>(null);
  const unlockRequestRef = useRef<Promise<boolean> | null>(null);
  const mediaUnlockedRef = useRef(false);
  const rouletteQueueRef = useRef(Promise.resolve());
  const rouletteEntryPlayedRef = useRef(false);
  const activeRoomRef = useRef(activeCasinoRoom);
  const rouletteAudioScopeRef = useRef(0);
  const lastRouletteEntryRoomChangeCountRef = useRef(roomChangeCount);

  const controls = useMemo(() => ({
    showImmersion,
    immersionLine,
    ambientVideoAudible,
    mediaReady,
    slotsIntroDelayActive,
    showImmersionOneVideo,
    ambientVideoRef,
  }), [ambientVideoAudible, immersionLine, mediaReady, showImmersion, showImmersionOneVideo, slotsIntroDelayActive]);

  const shouldPlayHeaderVideo = profileLoaded && !showImmersion;

  useEffect(() => {
    if (profileLoaded) return;
    resetMediaSession();
  }, [profileLoaded]);

  useEffect(() => {
    return () => {
      clearImmersionTimers();
      stopMedia(cueAudioRef.current);
      stopMedia(cannonAudioRef.current);
      stopMedia(unlockAudioRef.current);
      stopMedia(rouletteAmbientAudioRef.current);
      stopMedia(ambientVideoRef.current);
    };
  }, []);

  useEffect(() => {
    activeRoomRef.current = activeCasinoRoom;
    rouletteAudioScopeRef.current += 1;
    if (activeCasinoRoom !== "roulette") {
      rouletteEntryPlayedRef.current = false;
      rouletteQueueRef.current = Promise.resolve();
      stopMedia(cueAudioRef.current);
      stopMedia(cannonAudioRef.current);
      pauseMedia(rouletteAmbientAudioRef.current);
    }
  }, [activeCasinoRoom]);

  useEffect(() => {
    const video = ambientVideoRef.current;
    if (activeCasinoRoom === "slots") {
      pauseMedia(video);
      setAmbientVideoAudible(false);
      return;
    }

    if (mediaUnlockedRef.current) {
      void syncAmbientVideo(true, shouldPlayHeaderVideo);
    } else {
      if (!shouldPlayHeaderVideo) {
        stopMedia(video);
      } else if (video) {
        video.muted = true;
        video.volume = 0;
      }
      setAmbientVideoAudible(false);
    }
  }, [activeCasinoRoom, profileLoaded, shouldPlayHeaderVideo]);

  useEffect(() => {
    if (!mediaUnlockedRef.current || !profileLoaded) {
      pauseMedia(rouletteAmbientAudioRef.current);
      return;
    }

    if (activeCasinoRoom !== "roulette") {
      pauseMedia(rouletteAmbientAudioRef.current);
      return;
    }

    if (roomChangeCount === lastRouletteEntryRoomChangeCountRef.current) {
      return;
    }

    if (!rouletteEntryPlayedRef.current && !showImmersion) {
      const scope = rouletteAudioScopeRef.current;
      rouletteEntryPlayedRef.current = true;
      lastRouletteEntryRoomChangeCountRef.current = roomChangeCount;
      queueRouletteAudio(scope, async () => {
        if (scope !== rouletteAudioScopeRef.current || activeRoomRef.current !== "roulette") return;
        await playAudioClip(cueAudioRef, entryAudio, 0.84, true);
        if (scope !== rouletteAudioScopeRef.current || activeRoomRef.current !== "roulette") return;
      });
    }
  }, [activeCasinoRoom, profileLoaded, mediaReady, roomChangeCount]);

  function getAudio(ref: React.MutableRefObject<HTMLAudioElement | null>, src: string) {
    if (!ref.current) {
      ref.current = new Audio(src);
      ref.current.preload = "auto";
    }
    if (ref.current.src !== src) {
      ref.current.src = src;
    }
    return ref.current;
  }

  function clearImmersionTimers() {
    if (introHideTimeoutRef.current) {
      window.clearTimeout(introHideTimeoutRef.current);
      introHideTimeoutRef.current = null;
    }
    if (slotsIntroDelayTimeoutRef.current) {
      window.clearTimeout(slotsIntroDelayTimeoutRef.current);
      slotsIntroDelayTimeoutRef.current = null;
    }
  }

  function scheduleSlotsIntroDelay() {
    if (!mediaUnlockedRef.current) {
      setSlotsIntroDelayActive(false);
      return;
    }

    if (slotsIntroDelayTimeoutRef.current) {
      window.clearTimeout(slotsIntroDelayTimeoutRef.current);
      slotsIntroDelayTimeoutRef.current = null;
    }

    setSlotsIntroDelayActive(true);
    slotsIntroDelayTimeoutRef.current = window.setTimeout(() => {
      setSlotsIntroDelayActive(false);
      slotsIntroDelayTimeoutRef.current = null;
    }, SLOT_ONE_START_DELAY_MS);
  }

  async function playAudioClip(
    ref: React.MutableRefObject<HTMLAudioElement | null>,
    src: string,
    volume: number,
    waitUntilEnd = false,
  ) {
    if (!mediaUnlockedRef.current) return false;
    const audio = getAudio(ref, src);
    audio.pause();
    try {
      audio.currentTime = 0;
    } catch {
      // ignore reset errors
    }
    audio.volume = volume;
    audio.muted = false;


    const result = await safePlayMedia(audio, src);
    if (!result.ok) return false;

    if (!waitUntilEnd) return true;

    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        audio.removeEventListener("ended", finish);
        audio.removeEventListener("error", finish);
        audio.removeEventListener("pause", finish);
        resolve();
      };

      audio.addEventListener("ended", finish, { once: true });
      audio.addEventListener("error", finish, { once: true });
      audio.addEventListener("pause", finish, { once: true });
      window.setTimeout(finish, Math.max(1800, Math.ceil((audio.duration || 0) * 1000) + 300));
    });

    return true;
  }

  async function syncAmbientVideo(withSound: boolean, shouldPlay = true) {
    const video = ambientVideoRef.current;
    if (!video) return;

    if (!shouldPlay) {
      stopMedia(video);
      setAmbientVideoAudible(false);
      return;
    }

    if (!isSameMediaSource(video.currentSrc || video.src, sharedAmbientMedia)) {
      video.src = sharedAmbientMedia;
      video.load();
    }

    video.volume = withSound ? 0.14 : 0;
    video.muted = !withSound;

    const result = await safePlayMedia(video, "ambientVideo");
    setAmbientVideoAudible(result.ok && withSound);
  }

  async function unlockMediaSession() {
    const unlockSources = [checkAudio, entryAudio];

    for (const src of unlockSources) {
      const unlockAudio = getAudio(unlockAudioRef, src);
      unlockAudio.loop = false;
      unlockAudio.volume = 0.01;
      unlockAudio.muted = false;
      unlockAudio.preload = "auto";
      unlockAudio.load();

      const result = await safePlayMedia(unlockAudio, `unlock:${src}`);
      unlockAudio.pause();
      try {
        unlockAudio.currentTime = 0;
      } catch {
        // ignore reset errors
      }

      if (result.ok) {
        return true;
      }
    }

    return false;
  }

  async function requestMediaPlayback() {
    let unlocked = mediaUnlockedRef.current;

    if (!unlocked) {
      if (!unlockRequestRef.current) {
        setMediaStatus("unlocking");
        unlockRequestRef.current = (async () => {
          const didUnlock = await unlockMediaSession();
          mediaUnlockedRef.current = didUnlock;
          setMediaReady(didUnlock);
          setMediaStatus(didUnlock ? "ready" : "blocked");
          return didUnlock;
        })().finally(() => {
          unlockRequestRef.current = null;
        });
      }

      unlocked = await unlockRequestRef.current;
    }

    if (!unlocked) {
      return false;
    }

    setMediaReady(true);
    if (activeCasinoRoom === "slots") {
      pauseMedia(ambientVideoRef.current);
      setAmbientVideoAudible(false);
    } else {
      await syncAmbientVideo(true, shouldPlayHeaderVideo);
    }

    return true;
  }

  useEffect(() => {
    if (mediaUnlockedRef.current) return;

    const onUserIntent = () => {
      if (mediaUnlockedRef.current) return;
      void requestMediaPlayback();
    };

    const listenerOptions: AddEventListenerOptions = { capture: true, passive: true };
    window.addEventListener("pointerdown", onUserIntent, listenerOptions);
    window.addEventListener("touchstart", onUserIntent, listenerOptions);
    window.addEventListener("click", onUserIntent, listenerOptions);
    window.addEventListener("keydown", onUserIntent, { capture: true });

    return () => {
      window.removeEventListener("pointerdown", onUserIntent, listenerOptions);
      window.removeEventListener("touchstart", onUserIntent, listenerOptions);
      window.removeEventListener("click", onUserIntent, listenerOptions);
      window.removeEventListener("keydown", onUserIntent, { capture: true });
    };
  }, [mediaStatus]);

  async function startConnectionImmersion(playerName: string) {
    clearImmersionTimers();
    setSlotsIntroDelayActive(false);
    setShowImmersionOneVideo(true);
    setImmersionLine(`Pont prive en preparation pour ${playerName || "le capitaine"}...`);
    setShowImmersion(true);
    await syncAmbientVideo(false, false);
    scheduleSlotsIntroDelay();

    introHideTimeoutRef.current = window.setTimeout(() => {
      setShowImmersion(false);
      setShowImmersionOneVideo(false);
      introHideTimeoutRef.current = null;
    }, INTRO_FALLBACK_HIDE_MS);
  }

  function finishConnectionImmersion() {
    if (introHideTimeoutRef.current) {
      window.clearTimeout(introHideTimeoutRef.current);
      introHideTimeoutRef.current = null;
    }
    setShowImmersion(false);
    setShowImmersionOneVideo(false);
  }

  function queueRouletteAudio(scope: number, task: () => Promise<void>) {
    rouletteQueueRef.current = rouletteQueueRef.current
      .then(async () => {
        if (scope !== rouletteAudioScopeRef.current) return;
        await task();
      })
      .catch(() => undefined);
  }

  function getRouletteAmbientMedia() {
    if (activeRoomRef.current === "roulette") {
      return ambientVideoRef.current || rouletteAmbientAudioRef.current;
    }
    return rouletteAmbientAudioRef.current;
  }

  function handleRouletteEvent(event: RouletteSoundEvent) {
    if (!mediaUnlockedRef.current) return;
    if (event.type !== "spin") {
      return;
    }

    const scope = rouletteAudioScopeRef.current;
    queueRouletteAudio(scope, async () => {
      if (scope !== rouletteAudioScopeRef.current || activeRoomRef.current !== "roulette") return;
      const sequenceStartedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
      const introVoice = Math.random() > 0.5 ? fantomeAudio : moussaillonAudio;
      const cannonDelayMs = event.canonDelayMs || ROULETTE_TIRAGE_CANNON_DELAY_MS;
      const targetCannonAtMs = Math.max(0, Number(event.cannonAtMs || 0));
      const shouldPlayIntroVoice = targetCannonAtMs === 0 || targetCannonAtMs >= 1_200;
      const ambient = getRouletteAmbientMedia();
      const previousAmbientVolume = ambient?.volume ?? 0.14;
      const shouldResumeAmbient = Boolean(ambient && activeRoomRef.current === "roulette");

      stopMedia(cueAudioRef.current);
      stopMedia(cannonAudioRef.current);
      if (ambient) {
        ambient.volume = Math.max(0.03, previousAmbientVolume * 0.28);
        if (ambient.paused) {
          void safePlayMedia(ambient, "rouletteAmbient");
        }
      }

      if (shouldPlayIntroVoice) {
        await playAudioClip(cueAudioRef, introVoice, 0.92, true);
        if (scope !== rouletteAudioScopeRef.current || activeRoomRef.current !== "roulette") return;
      }

      const elapsedSinceStartMs =
        (typeof performance !== "undefined" ? performance.now() : Date.now()) - sequenceStartedAt;
      const remainingBeforeCannonMs = targetCannonAtMs > 0
        ? Math.max(0, targetCannonAtMs - elapsedSinceStartMs)
        : cannonDelayMs;
      const shouldSkipCannon = targetCannonAtMs > 0 && remainingBeforeCannonMs <= 120;
      if (remainingBeforeCannonMs > 0) {
        await waitForMs(remainingBeforeCannonMs);
        if (scope !== rouletteAudioScopeRef.current || activeRoomRef.current !== "roulette") return;
      }
      if (!shouldSkipCannon) {
        await playAudioClip(cannonAudioRef, canonAudio, 1, false);
      }

        if (ambient && shouldResumeAmbient && scope === rouletteAudioScopeRef.current && activeRoomRef.current === "roulette") {
          ambient.volume = previousAmbientVolume;
          if (ambient.paused) {
            void safePlayMedia(ambient, "rouletteAmbient");
          }
        }
    });
  }

  function resetMediaSession() {
    clearImmersionTimers();
    setShowImmersion(false);
    setImmersionLine("Ouverture du pont prive...");
    setAmbientVideoAudible(false);
    setMediaReady(false);
    setMediaStatus("locked");
    setSlotsIntroDelayActive(false);
    setShowImmersionOneVideo(false);
    mediaUnlockedRef.current = false;
    unlockRequestRef.current = null;
    rouletteAudioScopeRef.current += 1;
    rouletteQueueRef.current = Promise.resolve();
    activeRoomRef.current = "slots";
    lastRouletteEntryRoomChangeCountRef.current = roomChangeCount;
    stopMedia(cueAudioRef.current);
    stopMedia(cannonAudioRef.current);
    stopMedia(unlockAudioRef.current);
    stopMedia(rouletteAmbientAudioRef.current);
    stopMedia(ambientVideoRef.current);
    rouletteEntryPlayedRef.current = false;
  }

  return {
    ...controls,
    mediaStatus,
    setMediaStatus,
    requestMediaPlayback,
    startConnectionImmersion,
    finishConnectionImmersion,
    handleRouletteEvent,
    resetMediaSession,
  };
}
