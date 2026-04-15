import { safePlayMedia } from "../features/app/useCasinoMedia";

// Utilitaire simple pour jouer un son ponctuel.
export function playAudio(src: string) {
  try {
    const audio = new window.Audio(src);
    audio.volume = 0.8;
    void safePlayMedia(audio, src);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[casino-audio] playAudio failed", error);
  }
}
