import React from "react";
import "./AtsRouletteBoard.css";
import { ROULETTE_AMOUNT_PRESETS } from "../model";

export type SelectedBet = {
  betType: string;
  betValue: string;
  label: string;
} | null;

export type PortAction = "http" | "https" | "app" | "ssh";

type AtsRouletteBoardProps = {
  feltImageSrc: string;
  chipImageSrc: string;
  amount: number;
  onAmountChange: (amount: number) => void;
  selectedBet: SelectedBet;
  onBetChange: (bet: NonNullable<SelectedBet>) => void;
  onPortClick?: (port: PortAction) => void;
  disabled?: boolean;
  debug?: boolean;
  className?: string;
};

const ATS_ROWS = [
  [3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36],
  [2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35],
  [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34],
] as const;

const ATS_COLUMN_BETS = [
  { betType: "column", betValue: "col3", label: "2 TO 1" },
  { betType: "column", betValue: "col2", label: "2 TO 1" },
  { betType: "column", betValue: "col1", label: "2 TO 1" },
] as const;

const ATS_DOZENS = [
  { betType: "dozen", betValue: "first12", label: "1ST 12" },
  { betType: "dozen", betValue: "second12", label: "2ND 12" },
  { betType: "dozen", betValue: "third12", label: "3RD 12" },
] as const;

const ATS_OUTSIDE = [
  { betType: "lowhigh", betValue: "low", label: "1 - 18", tone: "neutral" },
  { betType: "parity", betValue: "even", label: "EVEN", tone: "neutral" },
  { betType: "color", betValue: "red", label: "", tone: "red-diamond" },
  { betType: "color", betValue: "black", label: "", tone: "black-skull" },
  { betType: "parity", betValue: "odd", label: "ODD", tone: "neutral" },
  { betType: "lowhigh", betValue: "high", label: "19 - 36", tone: "neutral" },
] as const;

const ATS_PORTS: ReadonlyArray<{
  id: PortAction;
  title: string;
  subtitle: string;
  tone: "red" | "green" | "amber" | "blue";
}> = [
  { id: "http", title: "PORT 80", subtitle: "HTTP", tone: "red" },
  { id: "https", title: "PORT 443", subtitle: "HTTPS", tone: "green" },
  { id: "app", title: "PORT 3000", subtitle: "APP", tone: "amber" },
  { id: "ssh", title: "PORT 22", subtitle: "SSH", tone: "blue" },
];

const RED_NUMBERS = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);

function getNumberColor(value: number): "red" | "black" | "green" {
  if (value === 0) return "green";
  return RED_NUMBERS.has(value) ? "red" : "black";
}

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export default function AtsRouletteBoard({
  feltImageSrc,
  chipImageSrc,
  amount,
  onAmountChange,
  selectedBet,
  onBetChange,
  onPortClick,
  disabled = false,
  debug = false,
  className = "",
}: AtsRouletteBoardProps) {
  function isSelectedBet(betType: string, betValue: string) {
    return selectedBet?.betType === betType && selectedBet?.betValue === betValue;
  }

  return (
    <div className={cx("ats-roulette-board", debug && "is-debug", className)}>
      <img className="ats-roulette-board__felt" src={feltImageSrc} alt="" aria-hidden="true" />

      <div className="casino-roulette-board__stake-overlay" role="group" aria-label="Montant de mise">
        {ROULETTE_AMOUNT_PRESETS.map((preset) => (
          <button
            key={`overlay-${preset}`}
            type="button"
            className={cx("casino-roulette-stake-chip", amount === preset && "is-active")}
            onClick={() => onAmountChange(preset)}
            disabled={disabled}
            aria-pressed={amount === preset}
          >
            <img src={chipImageSrc} alt="" aria-hidden="true" />
            <strong>{preset}</strong>
          </button>
        ))}
      </div>

      <div className="ats-roulette-board__surface">
        <button
          type="button"
          className={cx(
            "ats-roulette-cell",
            "ats-roulette-cell--zero",
            "ats-roulette-cell--green",
            isSelectedBet("straight", "0") && "is-active",
          )}
          onClick={() =>
            onBetChange({ betType: "straight", betValue: "0", label: "Numero 0" })
          }
          aria-label="Numero 0"
          aria-pressed={isSelectedBet("straight", "0")}
          disabled={disabled}
        >
          <span>0</span>
        </button>

        <div className="ats-roulette-board__numbers" role="grid" aria-label="Tapis ATS">
          {ATS_ROWS.map((row, rowIndex) => (
            <div key={`ats-row-${rowIndex}`} className="ats-roulette-board__row" role="row">
              {row.map((value) => (
                <button
                  key={value}
                  type="button"
                  role="gridcell"
                  className={cx(
                    "ats-roulette-cell",
                    `ats-roulette-cell--${getNumberColor(value)}`,
                    isSelectedBet("straight", String(value)) && "is-active",
                  )}
                  onClick={() =>
                    onBetChange({
                      betType: "straight",
                      betValue: String(value),
                      label: `Numero ${value}`,
                    })
                  }
                  aria-label={`Numero ${value}`}
                  aria-pressed={isSelectedBet("straight", String(value))}
                  disabled={disabled}
                >
                  <span>{value}</span>
                </button>
              ))}
            </div>
          ))}
        </div>

        <div className="ats-roulette-board__columns">
          {ATS_COLUMN_BETS.map((bet) => (
            <button
              key={`${bet.betType}-${bet.betValue}`}
              type="button"
              className={cx(
                "ats-roulette-cell",
                "ats-roulette-cell--column",
                isSelectedBet(bet.betType, bet.betValue) && "is-active",
              )}
              onClick={() => onBetChange({ ...bet })}
              aria-label={bet.label}
              aria-pressed={isSelectedBet(bet.betType, bet.betValue)}
              disabled={disabled}
            >
              <span>{bet.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="ats-roulette-board__dozens">
        {ATS_DOZENS.map((bet) => (
          <button
            key={`${bet.betType}-${bet.betValue}`}
            type="button"
            className={cx(
              "ats-roulette-cell",
              "ats-roulette-cell--outside",
              "ats-roulette-cell--dozen",
              isSelectedBet(bet.betType, bet.betValue) && "is-active",
            )}
            onClick={() => onBetChange({ ...bet })}
            aria-label={bet.label}
            aria-pressed={isSelectedBet(bet.betType, bet.betValue)}
            disabled={disabled}
          >
            <span>{bet.label}</span>
          </button>
        ))}
      </div>

      <div className="ats-roulette-board__outside">
        {ATS_OUTSIDE.map((bet) => {
          const isActive = isSelectedBet(bet.betType, bet.betValue);
          const computedLabel =
            bet.betType === "color" && bet.betValue === "red"
              ? "Rouge"
              : bet.betType === "color" && bet.betValue === "black"
                ? "Noir"
                : bet.label;

          return (
            <button
              key={`${bet.betType}-${bet.betValue}`}
              type="button"
              className={cx(
                "ats-roulette-cell",
                "ats-roulette-cell--outside",
                `ats-roulette-cell--outside-${bet.tone}`,
                isActive && "is-active",
              )}
              onClick={() =>
                onBetChange({
                  betType: bet.betType,
                  betValue: bet.betValue,
                  label: computedLabel,
                })
              }
              aria-label={computedLabel}
              aria-pressed={isActive}
              disabled={disabled}
            >
              {bet.tone === "red-diamond" ? <span className="ats-shape ats-shape--diamond" /> : null}
              {bet.tone === "black-skull" ? <span className="ats-shape ats-shape--skull">☠</span> : null}
              {bet.label ? <span>{bet.label}</span> : null}
            </button>
          );
        })}
      </div>

      <div className="ats-roulette-board__ports">
        {ATS_PORTS.map((port) => (
          <button
            key={port.id}
            type="button"
            className={cx("ats-port-button", `ats-port-button--${port.tone}`)}
            onClick={() => onPortClick?.(port.id)}
            aria-label={`${port.title} ${port.subtitle}`}
            disabled={disabled}
          >
            <strong>{port.title}</strong>
            <span>{port.subtitle}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
