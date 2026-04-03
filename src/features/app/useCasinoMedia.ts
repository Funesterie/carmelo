import { useEffect, useMemo, useRef, useState } from "react";
import canonAudio from "../../audio/canon.mp3";
import entryAudio from "../../audio/entrée.mp3";
import fantomeAudio from "../../audio/fantome.mp3";
import funesterieAudio from "../../audio/funesterie.mp3";
import moussaillonAudio from "../../audio/moussaillon.mp3";
import type { RoomId, RouletteSoundEvent } from "../casino/catalog";

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

type UseCasinoMediaOptions = {
  activeCasinoRoom: RoomId;
  profileLoaded: boolean;
};

export function useCasinoMedia({ activeCasinoRoom, profileLoaded }: UseCasinoMediaOptions) {
  const [showImmersion, setShowImmersion] = useState(false);
  const [immersionLine, setImmersionLine] = useState("Ouverture du pont prive...");
  const [ambientVideoAudible, setAmbientVideoAudible] = useState(false);
  const [mediaReady, setMediaReady] = useState(false);

  const introAudioRef = useRef<HTMLAudioElement | null>(null);
  const cueAudioRef = useRef<HTMLAudioElement | null>(null);
  const cannonAudioRef = useRef<HTMLAudioElement | null>(null);
  const ambientVideoRef = useRef<HTMLVideoElement | null>(null);
  const introHideTimeoutRef = useRef<number | null>(null);
  const introStopTimeoutRef = useRef<number | null>(null);
  const mediaUnlockedRef = useRef(false);
  const rouletteQueueRef = useRef(Promise.resolve());
  const lastRouletteJoinCueAtRef = useRef(0);

  const controls = useMemo(() => ({
    showImmersion,
    immersionLine,
    ambientVideoAudible,
    mediaReady,
    ambientVideoRef,
  }), [ambientVideoAudible, immersionLine, mediaReady, showImmersion]);

  useEffect(() => {
    return () => {
      clearImmersionTimers();
      stopMedia(introAudioRef.current);
      stopMedia(cueAudioRef.current);
      stopMedia(cannonAudioRef.current);
      stopMedia(ambientVideoRef.current);
    };
  }, []);

  useEffect(() => {
    if (!profileLoaded) return;
    void syncAmbientVideo(mediaUnlockedRef.current, activeCasinoRoom !== "slots");

    const unlockOnFirstGesture = () => {
      void requestMediaPlayback();
    };

    window.addEventListener("pointerdown", unlockOnFirstGesture, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlockOnFirstGesture);
    };
  }, [activeCasinoRoom, profileLoaded]);

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
    if (introStopTimeoutRef.current) {
      window.clearTimeout(introStopTimeoutRef.current);
      introStopTimeoutRef.current = null;
    }
  }

  async function playAudioClip(
    ref: React.MutableRefObject<HTMLAudioElement | null>,
    src: string,
    volume: number,
    waitUntilEnd = false,
  ) {
    if (!mediaUnlockedRef.current) return;
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
      return;
    }

    if (!waitUntilEnd) return;

    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        audio.removeEventListener("ended", finish);
        audio.removeEventListener("error", finish);
        resolve();
      };

      audio.addEventListener("ended", finish, { once: true });
      audio.addEventListener("error", finish, { once: true });
      window.setTimeout(finish, Math.max(1800, Math.ceil((audio.duration || 0) * 1000) + 300));
    });
  }

  async function syncAmbientVideo(withSound: boolean, shouldPlay = true) {
    const video = ambientVideoRef.current;
    if (!video) return;

    if (!shouldPlay) {
      stopMedia(video);
      setAmbientVideoAudible(false);
      return;
    }

    video.volume = withSound ? 0.14 : 0;
    video.muted = !withSound;

    try {
      await video.play();
      setAmbientVideoAudible(withSound);
    } catch {
      video.muted = true;
      video.volume = 0;
      setAmbientVideoAudible(false);
      try {
        await video.play();
      } catch {
        // ignore autoplay failures
      }
    }
  }

  async function requestMediaPlayback() {
    const intro = getAudio(introAudioRef, funesterieAudio);
    intro.volume = 0.01;
    intro.muted = false;
    try {
      await intro.play();
      intro.pause();
      intro.currentTime = 0;
      mediaUnlockedRef.current = true;
      setMediaReady(true);
    } catch {
      mediaUnlockedRef.current = false;
      setMediaReady(false);
    }

    await syncAmbientVideo(mediaUnlockedRef.current, activeCasinoRoom !== "slots");
  }

  async function startConnectionImmersion(playerName: string) {
    clearImmersionTimers();
    setImmersionLine(`Pont prive en preparation pour ${playerName || "le capitaine"}...`);
    setShowImmersion(true);
    await syncAmbientVideo(mediaUnlockedRef.current, activeCasinoRoom !== "slots");
    if (mediaUnlockedRef.current) {
      void playAudioClip(introAudioRef, funesterieAudio, 0.56);
    }

    introHideTimeoutRef.current = window.setTimeout(() => {
      setShowImmersion(false);
      introHideTimeoutRef.current = null;
    }, 5200);

    introStopTimeoutRef.current = window.setTimeout(() => {
      if (introAudioRef.current) {
        introAudioRef.current.pause();
      }
      introStopTimeoutRef.current = null;
    }, 7600);
  }

  function queueRouletteAudio(task: () => Promise<void>) {
    rouletteQueueRef.current = rouletteQueueRef.current.then(task).catch(() => undefined);
  }

  function handleRouletteEvent(event: RouletteSoundEvent) {
    if (!mediaUnlockedRef.current) return;
    if (event.type === "enter" || event.type === "join") {
      const now = Date.now();
      if (now - lastRouletteJoinCueAtRef.current < 2600) return;
      lastRouletteJoinCueAtRef.current = now;
      queueRouletteAudio(async () => {
        await playAudioClip(cueAudioRef, entryAudio, 0.78, true);
      });
      return;
    }

    queueRouletteAudio(async () => {
      const introVoice = Math.random() > 0.5 ? fantomeAudio : moussaillonAudio;
      stopMedia(cueAudioRef.current);
      stopMedia(cannonAudioRef.current);
      await playAudioClip(cueAudioRef, introVoice, 0.74, false);
      await waitForMs(760);
      await playAudioClip(cannonAudioRef, canonAudio, 0.92, false);
    });
  }

  function resetMediaSession() {
    clearImmersionTimers();
    setShowImmersion(false);
    setAmbientVideoAudible(false);
    setMediaReady(false);
    mediaUnlockedRef.current = false;
    stopMedia(introAudioRef.current);
    stopMedia(cueAudioRef.current);
    stopMedia(cannonAudioRef.current);
    stopMedia(ambientVideoRef.current);
  }

  return {
    ...controls,
    requestMediaPlayback,
    startConnectionImmersion,
    handleRouletteEvent,
    resetMediaSession,
  };
}
