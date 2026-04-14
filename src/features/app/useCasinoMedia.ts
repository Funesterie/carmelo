import { useEffect, useMemo, useRef, useState } from "react";
import canonAudio from "../../audio/canon.mp3";
import entryAudio from "../../audio/entrée.mp3";
import fantomeAudio from "../../audio/fantome.mp3";
import funesterieAudio from "../../audio/funesterie.mp3";
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

const CASINO_IMMERSION_AUDIO_SESSION_KEY = "casino.immersion.funesterie.played";
const SLOT_ONE_START_DELAY_MS = 1_500;

export function useCasinoMedia({ activeCasinoRoom, profileLoaded, roomChangeCount }: UseCasinoMediaOptions) {
  const [showImmersion, setShowImmersion] = useState(false);
  const [immersionLine, setImmersionLine] = useState("Ouverture du pont prive...");
  const [ambientVideoAudible, setAmbientVideoAudible] = useState(false);
  const [mediaReady, setMediaReady] = useState(false);
  const [slotsIntroDelayActive, setSlotsIntroDelayActive] = useState(false);

  const introAudioRef = useRef<HTMLAudioElement | null>(null);
  const cueAudioRef = useRef<HTMLAudioElement | null>(null);
  const cannonAudioRef = useRef<HTMLAudioElement | null>(null);
  const rouletteAmbientAudioRef = useRef<HTMLAudioElement | null>(null);
  const ambientVideoRef = useRef<HTMLVideoElement | null>(null);
  const introHideTimeoutRef = useRef<number | null>(null);
  const slotsIntroDelayTimeoutRef = useRef<number | null>(null);
  const mediaUnlockedRef = useRef(false);
  const rouletteQueueRef = useRef(Promise.resolve());
  const rouletteEntryPlayedRef = useRef(false);
  const activeRoomRef = useRef(activeCasinoRoom);
  const rouletteAudioScopeRef = useRef(0);
  const lastRouletteEntryRoomChangeCountRef = useRef(roomChangeCount);
  const immersionAudioPlayedRef = useRef(
    (() => {
      try {
        return sessionStorage.getItem(CASINO_IMMERSION_AUDIO_SESSION_KEY) === "1";
      } catch {
        return false;
      }
    })(),
  );

  const controls = useMemo(() => ({
    showImmersion,
    immersionLine,
    ambientVideoAudible,
    mediaReady,
    slotsIntroDelayActive,
    ambientVideoRef,
  }), [ambientVideoAudible, immersionLine, mediaReady, showImmersion, slotsIntroDelayActive]);

  const shouldPlayHeaderVideo = profileLoaded && !showImmersion;

  useEffect(() => {
    return () => {
      clearImmersionTimers();
      stopMedia(introAudioRef.current);
      stopMedia(cueAudioRef.current);
      stopMedia(cannonAudioRef.current);
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
    const unlockOnFirstGesture = () => {
      void requestMediaPlayback();
    };

    window.addEventListener("pointerdown", unlockOnFirstGesture, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlockOnFirstGesture);
    };
  }, []);

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

    if (!rouletteEntryPlayedRef.current) {
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

    try {
      await audio.play();
    } catch {
      return false;
    }

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

    try {
      await video.play();
      setAmbientVideoAudible(withSound);
    } catch {
      setAmbientVideoAudible(false);
    }
  }

  async function requestMediaPlayback() {
    if (mediaUnlockedRef.current) {
      setMediaReady(true);
      if (activeCasinoRoom === "slots") {
        pauseMedia(ambientVideoRef.current);
        setAmbientVideoAudible(false);
      } else {
        await syncAmbientVideo(true, shouldPlayHeaderVideo);
      }
      return;
    }

    const unlockAudio = getAudio(cueAudioRef, entryAudio);
    unlockAudio.volume = 0;
    unlockAudio.muted = false;
    try {
      await unlockAudio.play();
      unlockAudio.pause();
      unlockAudio.currentTime = 0;
      mediaUnlockedRef.current = true;
      setMediaReady(true);
    } catch {
      mediaUnlockedRef.current = false;
      setMediaReady(false);
    }

    if (activeCasinoRoom === "slots") {
      pauseMedia(ambientVideoRef.current);
      setAmbientVideoAudible(false);
    } else {
      await syncAmbientVideo(mediaUnlockedRef.current, shouldPlayHeaderVideo);
    }

  }

  async function startConnectionImmersion(playerName: string) {
    clearImmersionTimers();
    setSlotsIntroDelayActive(false);
    setImmersionLine(`Pont prive en preparation pour ${playerName || "le capitaine"}...`);
    setShowImmersion(true);
    await syncAmbientVideo(false, false);
    if (mediaUnlockedRef.current && !immersionAudioPlayedRef.current) {
      const didPlay = await playAudioClip(introAudioRef, funesterieAudio, 0.56);
      if (didPlay) {
        scheduleSlotsIntroDelay();
        immersionAudioPlayedRef.current = true;
        try {
          sessionStorage.setItem(CASINO_IMMERSION_AUDIO_SESSION_KEY, "1");
        } catch {
          // ignore storage failures
        }
      }
    }

    introHideTimeoutRef.current = window.setTimeout(() => {
      setShowImmersion(false);
      introHideTimeoutRef.current = null;
    }, 5200);
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
          void ambient.play().catch(() => undefined);
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
          void ambient.play().catch(() => undefined);
        }
      }
    });
  }

  function resetMediaSession() {
    clearImmersionTimers();
    setShowImmersion(false);
    setAmbientVideoAudible(false);
    setMediaReady(false);
    setSlotsIntroDelayActive(false);
    mediaUnlockedRef.current = false;
    rouletteAudioScopeRef.current += 1;
    rouletteQueueRef.current = Promise.resolve();
    stopMedia(introAudioRef.current);
    stopMedia(cueAudioRef.current);
    stopMedia(cannonAudioRef.current);
    stopMedia(rouletteAmbientAudioRef.current);
    stopMedia(ambientVideoRef.current);
    rouletteEntryPlayedRef.current = false;
    immersionAudioPlayedRef.current = false;
    try {
      sessionStorage.removeItem(CASINO_IMMERSION_AUDIO_SESSION_KEY);
    } catch {
      // ignore storage failures
    }
  }

  return {
    ...controls,
    requestMediaPlayback,
    startConnectionImmersion,
    handleRouletteEvent,
    resetMediaSession,
  };
}
