import PirateInspector from "../../../PirateInspector";
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

type QuickBetTone = "red" | "black" | "gold" | "cyan";

const ROULETTE_TABLE_ROWS = [
  [3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36],
  [2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35],
  [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34],
] as const;

const ROULETTE_DOZEN_BETS = [
  { betType: "dozen", betValue: "first12", label: "1er 12" },
  { betType: "dozen", betValue: "second12", label: "2e 12" },
  { betType: "dozen", betValue: "third12", label: "3e 12" },
] as const;

const ROULETTE_OUTSIDE_BETS = [
  { betType: "lowhigh", betValue: "low", label: "1-18" },
  { betType: "parity", betValue: "even", label: "Pair" },
  { betType: "color", betValue: "red", label: "Rouge" },
  { betType: "color", betValue: "black", label: "Noir" },
  { betType: "parity", betValue: "odd", label: "Impair" },
  { betType: "lowhigh", betValue: "high", label: "19-36" },
] as const;

function RouletteQuickBetIcon({
  betType,
  betValue,
}: {
  betType: string;
  betValue: string;
}) {
  if (betType === "color" && betValue === "red") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3 20 12 12 21 4 12Z" />
      </svg>
    );
  }

  if (betType === "color" && betValue === "black") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 6h10v12H7Z" />
      </svg>
    );
  }

  if (betType === "parity" && betValue === "even") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 7v10" />
        <path d="M12 7v10" />
        <path d="M17 7v10" />
      </svg>
    );
  }

  if (betType === "parity" && betValue === "odd") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 8.5a2.5 2.5 0 1 1 0 5h2a2.5 2.5 0 1 1 0 5H7" />
        <path d="M15 7.5h2.5a2.5 2.5 0 0 1 0 5H15" />
        <path d="M17.5 12.5H15" />
      </svg>
    );
  }

  if (betType === "lowhigh" && betValue === "low") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 18V6" />
        <path d="M7 11 12 6l5 5" />
      </svg>
    );
  }

  if (betType === "lowhigh" && betValue === "high") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 6v12" />
        <path d="m7 13 5 5 5-5" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 8h12" />
      <path d="M6 12h12" />
      <path d="M6 16h12" />
    </svg>
  );
}

function getQuickBetMeta(betType: string, betValue: string): { hint: string; tone: QuickBetTone } {
  if (betType === "color" && betValue === "red") {
    return { hint: "couleur chaude", tone: "red" };
  }
  if (betType === "color" && betValue === "black") {
    return { hint: "couleur sombre", tone: "black" };
  }
  if (betType === "parity" && betValue === "even") {
    return { hint: "nombres pairs", tone: "gold" };
  }
  if (betType === "parity" && betValue === "odd") {
    return { hint: "nombres impairs", tone: "gold" };
  }
  if (betType === "lowhigh" && betValue === "low") {
    return { hint: "plage basse", tone: "cyan" };
  }
  if (betType === "lowhigh" && betValue === "high") {
    return { hint: "plage haute", tone: "cyan" };
  }
  if (betType === "dozen" && betValue === "first12") {
    return { hint: "premiere douzaine", tone: "gold" };
  }
  if (betType === "dozen" && betValue === "second12") {
    return { hint: "deuxieme douzaine", tone: "gold" };
  }
  return { hint: "troisieme douzaine", tone: "gold" };
}

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
  chipImageSrc: string;
  feltImageSrc: string;
  wheelBaseImageSrc: string;
  wheelTurntableImageSrc: string;
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
  chipImageSrc,
  feltImageSrc,
  wheelBaseImageSrc,
  wheelTurntableImageSrc,
  historyPreviewImageSrc,
}: RouletteGameplayDockProps) {
  const latestResult = room?.recentResults?.[0] || null;

  function isSelectedBet(betType: string, betValue: string) {
    return selectedBet?.betType === betType && selectedBet?.betValue === betValue;
  }

  return (
    <div className="casino-stage-sidebar casino-stage-sidebar--roulette">
      <div className="casino-command-dock casino-command-dock--roulette">
        <div
          className="casino-roulette-console"
          style={{
            ["--roulette-chip-art" as string]: `url("${chipImageSrc}")`,
          }}
        >
          <div className="casino-roulette-console__wheel-shell">
            <img
              className="casino-roulette-console__wheel-base"
              src={wheelBaseImageSrc}
              alt=""
              aria-hidden="true"
            />
            <div
              className="casino-roulette-console__wheel"
              style={{ transform: `translate(-50%, -50%) rotate(${animation.wheelRotation}deg)` }}
            >
              <img
                className="casino-roulette-wheel__plateau casino-roulette-wheel__plateau--turntable"
                src={wheelTurntableImageSrc}
                alt=""
                aria-hidden="true"
              />
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

            <div className="casino-roulette-console__chip-stack" aria-hidden="true">
              <img src={chipImageSrc} alt="" />
              <img src={chipImageSrc} alt="" />
            </div>
          </div>

          <div className="casino-roulette-console__summary">
            <span className="casino-chip">Roulette gameplay</span>
            <strong>{selectedBet ? `Cible: ${selectedBet.label}` : "Choisis une poche ou une mise rapide"}</strong>
            <p>La roue tournante, la bille et les infos critiques restent ici pour une lecture nette sur grand ecran comme sur telephone.</p>
            <div className="casino-roulette-console__stats">
              <span>
                <small>Dernier tir</small>
                <b className={latestResult ? `is-${latestResult.winningColor}` : ""}>
                  {latestResult ? latestResult.winningNumber : "--"}
                </b>
              </span>
              <span>
                <small>Joueurs</small>
                <b>{room?.round.playerCount || 0}</b>
              </span>
            </div>
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
              <img src={chipImageSrc} alt="" aria-hidden="true" />
              <strong>{preset}</strong>
            </button>
          ))}
        </div>

        <div className="casino-roulette-quickbets casino-roulette-quickbets--compact">
          {QUICK_BETS.map((bet) => {
            const meta = getQuickBetMeta(bet.betType, bet.betValue);

            return (
              <button
                key={`${bet.betType}-${bet.betValue}`}
                type="button"
                className={`casino-floor-nav__button casino-floor-nav__button--roulette is-tone-${meta.tone} ${selectedBet?.betType === bet.betType && selectedBet?.betValue === bet.betValue ? "is-active" : ""}`}
                onClick={() => onBetChange({ ...bet })}
              >
                <span className="casino-floor-nav__button-ornament" aria-hidden="true">
                  <RouletteQuickBetIcon betType={bet.betType} betValue={bet.betValue} />
                </span>
                <span className="casino-floor-nav__button-copy">
                  <strong>{bet.label}</strong>
                  <span>{meta.hint}</span>
                </span>
              </button>
            );
          })}
        </div>

        <div
          className="casino-roulette-board casino-roulette-board--compact"
          style={{
            ["--roulette-chip-art" as string]: `url("${chipImageSrc}")`,
          }}
        >
          <div className="casino-roulette-board__header">
            <span className="casino-chip">Tapis premium</span>
            <strong>{selectedBet ? selectedBet.label : "Selectionne un numero droit"}</strong>
          </div>
          <div className="casino-roulette-board__felt-shell">
            <img className="casino-roulette-board__felt" src={feltImageSrc} alt="" aria-hidden="true" />

            <div className="casino-roulette-board__surface">
              <button
                type="button"
                className={`casino-roulette-cell casino-roulette-cell--green casino-roulette-cell--zero ${isSelectedBet("straight", "0") ? "is-active" : ""}`}
                onClick={() => onBetChange({ betType: "straight", betValue: "0", label: "Numero 0" })}
                aria-label="Numero 0"
              >
                <span>0</span>
                <small>Zero</small>
              </button>

              <div className="casino-roulette-board__numbers" role="grid" aria-label="Tapis de roulette">
                {ROULETTE_TABLE_ROWS.map((row, rowIndex) => (
                  <div key={`roulette-row-${rowIndex}`} className="casino-roulette-board__row" role="row">
                    {row.map((value) => (
                      <button
                        key={value}
                        type="button"
                        role="gridcell"
                        className={`casino-roulette-cell casino-roulette-cell--${getNumberColor(value)} ${isSelectedBet("straight", String(value)) ? "is-active" : ""}`}
                        onClick={() => onBetChange({ betType: "straight", betValue: String(value), label: `Numero ${value}` })}
                        aria-label={`Numero ${value}`}
                      >
                        <span>{value}</span>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </div>

            <div className="casino-roulette-board__dozens">
              {ROULETTE_DOZEN_BETS.map((bet) => (
                <button
                  key={`${bet.betType}-${bet.betValue}`}
                  type="button"
                  className={`casino-roulette-cell casino-roulette-cell--outside ${isSelectedBet(bet.betType, bet.betValue) ? "is-active" : ""}`}
                  onClick={() => onBetChange({ ...bet })}
                  aria-label={bet.label}
                >
                  <span>{bet.label}</span>
                </button>
              ))}
            </div>

            <div className="casino-roulette-board__outside">
              {ROULETTE_OUTSIDE_BETS.map((bet) => (
                <button
                  key={`${bet.betType}-${bet.betValue}`}
                  type="button"
                  className={`casino-roulette-cell casino-roulette-cell--outside casino-roulette-cell--outside-${bet.betValue} ${isSelectedBet(bet.betType, bet.betValue) ? "is-active" : ""}`}
                  onClick={() => onBetChange({ ...bet })}
                  aria-label={bet.label}
                >
                  <span>{bet.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="casino-chip-row">
          <span className="casino-chip casino-chip--token"><img src={chipImageSrc} alt="" />Pot {formatCredits(room?.round.totalPot || 0)}</span>
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
                        <strong className="casino-token-inline"><img src={chipImageSrc} alt="" />{formatCredits(bet.amount)}</strong>
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
                      <div className="casino-prize-card__glyph"><img src={chipImageSrc} alt="" /></div>
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
