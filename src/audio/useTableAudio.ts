import type { MutableRefObject } from "react";
import { useEffect, useRef } from "react";
import cardSound from "./carte.mp3";
import checkSound from "./check.mp3";

function resetAndPlay(audio: HTMLAudioElement, volume: number) {
  audio.pause();
  try {
    audio.currentTime = 0;
  } catch {
    // ignore reset errors
  }
  audio.volume = volume;
  void audio.play().catch(() => undefined);
}

export function useTableAudio(enabled = true) {
  const cardAudioRef = useRef<HTMLAudioElement | null>(null);
  const checkAudioRef = useRef<HTMLAudioElement | null>(null);
  const timeoutIdsRef = useRef<number[]>([]);
  const enabledRef = useRef(enabled);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  useEffect(() => {
    return () => {
      timeoutIdsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
      timeoutIdsRef.current = [];
      cardAudioRef.current?.pause();
      checkAudioRef.current?.pause();
    };
  }, []);

  function getAudio(ref: MutableRefObject<HTMLAudioElement | null>, src: string) {
    if (!ref.current) {
      ref.current = new Audio(src);
      ref.current.preload = "auto";
    }
    if (ref.current.src !== src) {
      ref.current.src = src;
    }
    return ref.current;
  }

  function trackTimeout(timeoutId: number) {
    timeoutIdsRef.current.push(timeoutId);
    return timeoutId;
  }

  function clearTrackedTimeout(timeoutId: number) {
    timeoutIdsRef.current = timeoutIdsRef.current.filter((entry) => entry !== timeoutId);
  }

  function clearQueuedAudio() {
    timeoutIdsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
    timeoutIdsRef.current = [];
  }

  function playCard(volume = 0.72, delayMs = 0) {
    if (!enabledRef.current) return;
    const audio = getAudio(cardAudioRef, cardSound);
    if (delayMs <= 0) {
      resetAndPlay(audio, volume);
      return;
    }

    const timeoutId = trackTimeout(window.setTimeout(() => {
      clearTrackedTimeout(timeoutId);
      resetAndPlay(audio, volume);
    }, delayMs));
  }

  function playCardBurst(
    count: number,
    options?: {
      startDelayMs?: number;
      stepMs?: number;
      volume?: number;
    },
  ) {
    if (!enabledRef.current) return;
    const burstCount = Math.max(0, Math.floor(count));
    const startDelayMs = options?.startDelayMs ?? 0;
    const stepMs = options?.stepMs ?? 110;
    const volume = options?.volume ?? 0.7;

    for (let index = 0; index < burstCount; index += 1) {
      playCard(volume, startDelayMs + index * stepMs);
    }
  }

  function playCheck(volume = 0.68) {
    if (!enabledRef.current) return;
    const audio = getAudio(checkAudioRef, checkSound);
    resetAndPlay(audio, volume);
  }

  return {
    clearQueuedAudio,
    playCard,
    playCardBurst,
    playCheck,
  };
}
