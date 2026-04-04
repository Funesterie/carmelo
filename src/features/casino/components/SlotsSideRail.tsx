import * as React from "react";
import {
  SLOT_AMBIENT_MEDIA,
  SLOT_FEATURE_MEDIA,
  SLOT_INTRO_MEDIA,
  SYMBOL_META,
  getSlotGridSymbolAtIndex,
  type SlotFeatureKey,
} from "../catalog";
import { formatCredits } from "../../../lib/casinoRoomState";
import type { CasinoProfile, CasinoSpin } from "../../../lib/casinoApi";

type SlotsFeatureMedia = (typeof SLOT_INTRO_MEDIA | typeof SLOT_AMBIENT_MEDIA | (typeof SLOT_FEATURE_MEDIA)[SlotFeatureKey]);

type SlotsSideRailProps = {
  profile: CasinoProfile;
  mediaReady: boolean;
  featureMedia: SlotsFeatureMedia;
  slotIntroPlayed: boolean;
  isAlertFeatureActive: boolean;
  featureVideoRef: { current: HTMLVideoElement | null };
  lastSpin: CasinoSpin | null;
  onMarkSlotsIntroPlayed: () => void;
  onRequestMediaPlayback?: () => void;
};

function resolveWinTrail(spin: CasinoSpin, win: CasinoSpin["wins"][number]) {
  return win.indexes.map((index) => {
    const symbolId = getSlotGridSymbolAtIndex(spin.grid, spin.reelCount, index) || win.symbol;
    const meta = SYMBOL_META[symbolId] || SYMBOL_META.COIN;
    return {
      index,
      symbolId,
      meta,
      isWild: symbolId === "JOKER" && win.symbol !== "JOKER",
    };
  });
}

export default function SlotsSideRail({
  profile,
  mediaReady,
  featureMedia,
  slotIntroPlayed,
  isAlertFeatureActive,
  featureVideoRef,
  lastSpin,
  onMarkSlotsIntroPlayed,
  onRequestMediaPlayback,
}: SlotsSideRailProps) {
  void profile;
  void mediaReady;
  void featureMedia;
  void slotIntroPlayed;
  void isAlertFeatureActive;
  void featureVideoRef;
  void onMarkSlotsIntroPlayed;
  void onRequestMediaPlayback;

  return (
    <aside className="casino-side-rail casino-side-rail--slots">
      {lastSpin ? (
        <section className="casino-panel">
          <div className="casino-panel__header">
            <span className="casino-chip">Dernier spin</span>
            <h3>Alignements</h3>
          </div>
          <div className="casino-win-list">
            {lastSpin.wins.length ? (
              lastSpin.wins.map((win) => {
                const meta = SYMBOL_META[win.symbol] || SYMBOL_META.COIN;
                const winTrail = resolveWinTrail(lastSpin, win);
                const wildCount = winTrail.filter((entry) => entry.isWild).length;
                return (
                  <article key={`${win.lineIndex}-${win.symbol}-${win.indexes.join("-")}`} className="casino-win-entry">
                    <div className="casino-win-entry__summary">
                      <img className="casino-paytable__symbol-art" src={meta.image} alt="" aria-hidden="true" />
                      <div className="casino-win-entry__copy">
                        <strong>{win.label}</strong>
                        <span>
                          Ligne {win.lineIndex + 1} · {win.matchCount} symboles
                        </span>
                        {wildCount ? (
                          <span className="casino-win-entry__note">
                            {wildCount} joker{wildCount > 1 ? "s" : ""} wild complete{wildCount > 1 ? "nt" : ""} la ligne
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <b>+{formatCredits(win.payout)}</b>
                    <div className="casino-win-entry__trail" aria-label={`Symboles de la ligne ${win.lineIndex + 1}`}>
                      {winTrail.map((entry, trailIndex) => (
                        <div
                          key={`${win.lineIndex}-${entry.index}-${trailIndex}`}
                          className={`casino-win-entry__tile ${entry.isWild ? "is-wild" : ""}`}
                        >
                          <img className="casino-paytable__symbol-art" src={entry.meta.image} alt="" aria-hidden="true" />
                          <span>{entry.meta.label}</span>
                          {entry.isWild ? <small>Wild</small> : null}
                        </div>
                      ))}
                    </div>
                  </article>
                );
              })
            ) : (
              <p className="casino-history-empty">Le dernier spin n’a valide aucune ligne payante.</p>
            )}
          </div>
        </section>
      ) : null}
    </aside>
  );
}
