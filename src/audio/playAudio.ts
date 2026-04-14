// playAudio.ts - utilitaire simple pour jouer un son
export function playAudio(src: string) {
  try {
    const audio = new window.Audio(src);
    audio.volume = 0.8;
      void safePlayMedia(audio, src);
  } catch (e) {
    // ignore
  }
      console.error(e);
}
