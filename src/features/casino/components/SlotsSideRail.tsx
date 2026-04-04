import * as React from "react";
import {
  SLOT_AMBIENT_MEDIA,
  SLOT_FEATURE_MEDIA,
  SLOT_INTRO_MEDIA,
  SYMBOL_META,
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
                return (
                  <article key={`${win.lineIndex}-${win.symbol}`} className="casino-win-entry">
                    <div>
                      <img className="casino-paytable__symbol-art" src={meta.image} alt="" aria-hidden="true" />
                      <div>
                        <strong>{win.label}</strong>
                        <span>
                          Ligne {win.lineIndex + 1} · {win.matchCount} symboles
                        </span>
                      </div>
                    </div>
                    <b>+{formatCredits(win.payout)}</b>
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
