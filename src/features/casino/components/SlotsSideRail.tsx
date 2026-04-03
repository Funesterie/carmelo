import type { MutableRefObject } from "react";
import {
  PAYOUT_TABLE,
  SLOT_AMBIENT_MEDIA,
  SLOT_FEATURE_MEDIA,
  SLOT_INTRO_MEDIA,
  SYMBOL_META,
  formatTransactionLabel,
  formatTransactionTime,
  type SlotFeatureKey,
} from "../catalog";
import { formatCredits } from "../../../lib/casinoRoomState";
import type { CasinoProfile, CasinoSpin, CasinoTransaction } from "../../../lib/casinoApi";

type SlotsFeatureMedia = (typeof SLOT_INTRO_MEDIA | typeof SLOT_AMBIENT_MEDIA | (typeof SLOT_FEATURE_MEDIA)[SlotFeatureKey]);

type SlotsSideRailProps = {
  profile: CasinoProfile;
  mediaReady: boolean;
  featureMedia: SlotsFeatureMedia;
  slotIntroPlayed: boolean;
  isAlertFeatureActive: boolean;
  featureVideoRef: MutableRefObject<HTMLVideoElement | null>;
  recentTransactions: CasinoTransaction[];
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
  recentTransactions,
  lastSpin,
  onMarkSlotsIntroPlayed,
  onRequestMediaPlayback,
}: SlotsSideRailProps) {
  return (
    <aside className="casino-side-rail casino-side-rail--slots">
      <section className="casino-panel casino-panel--projector">
        <div className="casino-panel__header">
          <span className="casino-chip">Projecteur</span>
          <h3>Coup du tour</h3>
        </div>

        <div className={`casino-slot-feature ${featureMedia.video ? "has-video" : ""}`}>
          <div className="casino-slot-feature__media">
            {featureMedia.video ? (
              <video
                ref={featureVideoRef}
                key={featureMedia.video}
                className="casino-slot-feature__video"
                src={featureMedia.video}
                autoPlay
                loop={slotIntroPlayed || isAlertFeatureActive}
                muted={!mediaReady}
                playsInline
                preload="metadata"
                poster={featureMedia.image}
                controls={false}
                onEnded={() => {
                  if (!slotIntroPlayed && !isAlertFeatureActive) {
                    onMarkSlotsIntroPlayed();
                  }
                }}
                onClick={() => {
                  onRequestMediaPlayback?.();
                }}
              />
            ) : (
              <img src={featureMedia.image} alt={featureMedia.title} className="casino-slot-feature__poster" />
            )}
          </div>

          <div className="casino-slot-feature__copy">
            <strong>{featureMedia.title}</strong>
            <p>{featureMedia.body}</p>
            <span className="casino-chip">
              {isAlertFeatureActive
                ? "Alerte video prioritaire"
                : slotIntroPlayed
                  ? "Ambiance machine a sous active"
                  : "Intro unique avant ambiance"}
            </span>
          </div>
        </div>
      </section>

      <section className="casino-panel">
        <div className="casino-panel__header">
          <span className="casino-chip">Session</span>
          <h3>Tableau de bord</h3>
        </div>
        <div className="casino-metric-list">
          <div>
            <span>Spins joues</span>
            <strong>{formatCredits(profile.wallet.gamesPlayed)}</strong>
          </div>
          <div>
            <span>Total mise</span>
            <strong>{formatCredits(profile.wallet.lifetimeWagered)}</strong>
          </div>
          <div>
            <span>Total gains</span>
            <strong>{formatCredits(profile.wallet.lifetimeWon)}</strong>
          </div>
          <div>
            <span>Bonus journalier</span>
            <strong>{profile.wallet.canClaimDailyBonus ? `Disponible (+${profile.wallet.dailyBonusAmount})` : "Deja reclame"}</strong>
          </div>
        </div>
      </section>

      <section className="casino-panel">
        <div className="casino-panel__header">
          <span className="casino-chip">Paiements</span>
          <h3>Table rapide</h3>
        </div>
        <div className="casino-paytable">
          {PAYOUT_TABLE.map((entry) => {
            const meta = SYMBOL_META[entry.symbol];
            return (
              <div key={entry.symbol} className="casino-paytable__row">
                <div className="casino-paytable__symbol">
                  <img className="casino-paytable__symbol-art" src={meta.image} alt="" aria-hidden="true" />
                  <strong>{meta.label}</strong>
                </div>
                <span>{entry.three}</span>
                <span>{entry.four}</span>
                <span>{entry.five}</span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="casino-panel">
        <div className="casino-panel__header">
          <span className="casino-chip">Historique</span>
          <h3>Dernieres operations</h3>
        </div>

        <div className="casino-history-list">
          {recentTransactions.length ? (
            recentTransactions.map((entry) => (
              <article key={entry.id} className="casino-history-entry">
                <div>
                  <span>{formatTransactionLabel(entry.kind)}</span>
                  <strong>{formatTransactionTime(entry.createdAt)}</strong>
                </div>
                <div className={entry.amount >= 0 ? "is-positive" : "is-negative"}>
                  {entry.amount >= 0 ? "+" : ""}
                  {formatCredits(entry.amount)}
                </div>
              </article>
            ))
          ) : (
            <p className="casino-history-empty">Aucune operation enregistree pour le moment.</p>
          )}
        </div>
      </section>

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
