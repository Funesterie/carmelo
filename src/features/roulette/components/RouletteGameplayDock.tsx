import PirateInspector from "../../../PirateInspector";
import jetonImg from "../../../images/jeton.png";
import tapisImg from "../../../images/tapis.png";
import { formatCredits } from "../../../lib/casinoRoomState";
import type { RouletteRoom } from "../../../lib/casinoApi";
import RouletteResultPreview from "./RouletteResultPreview";
import {
  QUICK_BETS,
  ROULETTE_AMOUNT_PRESETS,
  getBetLabel,
  getNumberColor,
  type RouletteAnimationState,
} from "../model";

type SelectedBet = {
  betType: string;
  betValue: string;
  label: string;
} | null;

type WheelPocket = {
  number: number;
  color: string;
  angle: number;
};

type RouletteGameplayDockProps = {
  room: RouletteRoom | null;
  amount: number;
  selectedBet: SelectedBet;
  working: boolean;
  canSubmitBet: boolean;
  infoTab: "mises" | "participants" | "historique";
  animation: RouletteAnimationState;
  wheelPockets: WheelPocket[];
  onAmountChange: (amount: number) => void;
  onBetChange: (bet: NonNullable<SelectedBet>) => void;
  onInfoTabChange: (tab: "mises" | "participants" | "historique") => void;
  onSubmitBet: () => void;
  wheelImageSrc: string;
  historyPreviewImageSrc: string;
};

export default function RouletteGameplayDock({
  room,
  amount,
  selectedBet,
  working,
  canSubmitBet,
  infoTab,
  animation,
  wheelPockets,
  onAmountChange,
  onBetChange,
  onInfoTabChange,
  onSubmitBet,
  wheelImageSrc,
  historyPreviewImageSrc,
}: RouletteGameplayDockProps) {
  const latestResult = room?.recentResults?.[0] || null;

  return (
    <div className="casino-stage-sidebar casino-stage-sidebar--roulette">
      <div className="casino-command-dock casino-command-dock--roulette">
        <div className="casino-roulette-console">
          <div className="casino-roulette-console__wheel-shell">
            <div
              className="casino-roulette-console__wheel"
              style={{ transform: `translate(-50%, -50%) rotate(${animation.wheelRotation}deg)` }}
            >
              <img className="casino-roulette-wheel__plateau" src={wheelImageSrc} alt="" aria-hidden="true" />
              {wheelPockets.map((pocket) => (
                <div
                  key={`console-${pocket.number}`}
                  className={`casino-roulette-pocket is-${pocket.color} ${animation.highlightedNumber === pocket.number ? "is-winning" : ""}`}
                  style={{ ["--pocket-angle" as string]: `${pocket.angle}deg` }}
                >
                  <span>{pocket.number}</span>
                </div>
              ))}
            </div>

            <div
              className="casino-roulette-orb casino-roulette-orb--console"
              style={{
                left: `${animation.ballX}%`,
                top: `${animation.ballY}%`,
                transform: `translate(-50%, -50%) scale(${0.94 + (animation.fireScale - 1) * 0.4})`,
              }}
            >
              <span
                className="casino-roulette-orb__trail"
                style={{ transform: `translate(-50%, -50%) rotate(${animation.fireRotation}deg)` }}
              />
            </div>
          </div>

          <div className="casino-roulette-console__summary">
            <span className="casino-chip">Roulette gameplay</span>
            <strong>{selectedBet ? `Cible: ${selectedBet.label}` : "Choisis une poche ou une mise rapide"}</strong>
            <p>Le decor reste a gauche. La roue lisible, la bille, les mises et le resultat vivent ici.</p>
          </div>
        </div>

        <div className="casino-bet-pills casino-bet-pills--roulette">
          {ROULETTE_AMOUNT_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              className={`casino-bet-pill casino-bet-pill--dubloon casino-bet-pill--roulette ${amount === preset ? "is-active" : ""}`}
              onClick={() => onAmountChange(preset)}
              disabled={working}
            >
              <img src={jetonImg} alt="" aria-hidden="true" />
              <strong>{preset}</strong>
            </button>
          ))}
        </div>

        <div className="casino-roulette-quickbets casino-roulette-quickbets--compact">
          {QUICK_BETS.map((bet) => (
            <button
              key={`${bet.betType}-${bet.betValue}`}
              type="button"
              className={`casino-floor-nav__button ${selectedBet?.betType === bet.betType && selectedBet?.betValue === bet.betValue ? "is-active" : ""}`}
              onClick={() => onBetChange({ ...bet })}
            >
              <strong>{bet.label}</strong>
              <span>Mise rapide</span>
            </button>
          ))}
        </div>

        <div
          className="casino-roulette-board casino-roulette-board--compact"
          style={{
            ["--roulette-art" as string]: `url("${tapisImg}")`,
          }}
        >
          <button
            type="button"
            className={`casino-roulette-cell casino-roulette-cell--green ${selectedBet?.betType === "straight" && selectedBet?.betValue === "0" ? "is-active" : ""}`}
            onClick={() => onBetChange({ betType: "straight", betValue: "0", label: "Numero 0" })}
          >
            0
          </button>
          <div className="casino-roulette-board__numbers">
            {Array.from({ length: 36 }, (_, index) => index + 1).map((value) => (
              <button
                key={value}
                type="button"
                className={`casino-roulette-cell casino-roulette-cell--${getNumberColor(value)} ${selectedBet?.betType === "straight" && selectedBet?.betValue === String(value) ? "is-active" : ""}`}
                onClick={() => onBetChange({ betType: "straight", betValue: String(value), label: `Numero ${value}` })}
              >
                {value}
              </button>
            ))}
          </div>
        </div>

        <div className="casino-chip-row">
          <span className="casino-chip casino-chip--token"><img src={jetonImg} alt="" />Pot {formatCredits(room?.round.totalPot || 0)}</span>
          <span className="casino-chip">Joueurs {room?.round.playerCount || 0}</span>
          <span className="casino-chip">{selectedBet ? selectedBet.label : "Aucune cible"}</span>
        </div>

        <div className="casino-command-dock__actions casino-command-dock__actions--roulette">
          <button
            type="button"
            className="casino-primary-button casino-primary-button--cyan"
            onClick={onSubmitBet}
            disabled={!canSubmitBet}
          >
            Miser {selectedBet ? `sur ${selectedBet.label}` : ""}
          </button>
        </div>
      </div>

      <PirateInspector
        title="Carnet de tir"
        eyebrow="Roulette"
        activeTab={infoTab}
        onChange={(tabId) => onInfoTabChange(tabId as typeof infoTab)}
        tabs={[
          {
            id: "mises",
            label: "Mes mises",
            badge: room?.round.myBets?.length || 0,
            caption: "Lecture compacte du tour courant.",
            content: (
              <div className="casino-history-list">
                {(room?.round.myBets || []).length ? (
                  room?.round.myBets.map((bet) => (
                    <article key={bet.id} className="casino-history-entry">
                      <div>
                        <span>{getBetLabel(bet.betType, bet.betValue)}</span>
                        <strong className="casino-token-inline"><img src={jetonImg} alt="" />{formatCredits(bet.amount)}</strong>
                      </div>
                      <div className={bet.payout > 0 ? "is-positive" : ""}>
                        {bet.payout > 0 ? `+${formatCredits(bet.payout)}` : "en attente"}
                      </div>
                    </article>
                  ))
                ) : (
                  <p className="casino-history-empty">Aucune mise active sur le tour courant.</p>
                )}
              </div>
            ),
          },
          {
            id: "participants",
            label: "Participants",
            badge: room?.round.participants?.length || 0,
            caption: "Marins presents sur le tir.",
            content: (
              <div className="casino-prize-stack">
                {(room?.round.participants || []).length ? (
                  room?.round.participants.map((entry) => (
                    <article key={entry.userId} className="casino-prize-card">
                      <div className="casino-prize-card__glyph"><img src={jetonImg} alt="" /></div>
                      <div>
                        <strong>{entry.username}</strong>
                        <span>{formatCredits(entry.totalAmount)} sur {entry.betCount} mise{entry.betCount > 1 ? "s" : ""}</span>
                      </div>
                    </article>
                  ))
                ) : (
                  <p className="casino-history-empty">Aucun joueur n'a encore verrouille de mise sur ce tour.</p>
                )}
              </div>
            ),
          },
          {
            id: "historique",
            label: "Historique",
            badge: room?.recentResults?.length || 0,
            caption: "Derniers numeros tombes.",
            content: (
              <div className="casino-roulette-history-panel">
                {latestResult ? (
                  <RouletteResultPreview
                    winningNumber={latestResult.winningNumber}
                    winningColor={latestResult.winningColor}
                    previewImageSrc={historyPreviewImageSrc}
                  />
                ) : null}

                <div className="casino-chip-row">
                  {(room?.recentResults || []).map((entry) => (
                    <span key={entry.id} className={`casino-roulette-history-chip is-${entry.winningColor}`}>
                      {entry.winningNumber}
                    </span>
                  ))}
                </div>
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
