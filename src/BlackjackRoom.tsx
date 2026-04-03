import * as React from "react";
import { useEffect, useRef, useState } from "react";
import { useTableAudio } from "./audio/useTableAudio";
import BlackjackSidebar from "./features/blackjack/components/BlackjackSidebar";
import BlackjackTableScene from "./features/blackjack/components/BlackjackTableScene";
import jetonImg from "./images/jeton.png";
import blackjackCaptainArt from "./images/blackjack-captain-art.png";
import {
  actBlackjackRound,
  joinBlackjackRoom,
  startBlackjackRound,
  type BlackjackState,
  type CasinoTableRoom,
  type CasinoProfile,
} from "./lib/casinoApi";
import { formatCredits } from "./lib/casinoRoomState";
import { BLACKJACK_SALONS } from "./lib/tableSalons";

const PLAYER_BETS = [50, 100, 200, 400];
const TABLE_DEAL_STEP_MS = 96;

function getBlackjackCardKeys(state: BlackjackState | null) {
  const keys: string[] = [];

  state?.dealerCards.forEach((card, index) => {
    keys.push(`dealer-${card.id}-${index}`);
  });

  state?.aiSeats.forEach((seat) => {
    seat.cards.forEach((card, index) => {
      keys.push(`${seat.id}-${card.id}-${index}`);
    });
  });

  state?.playerCards.forEach((card, index) => {
    keys.push(`player-${card.id}-${index}`);
  });

  return keys;
}

type BlackjackRoomProps = {
  playerName: string;
  profile: CasinoProfile;
  mediaReady: boolean;
  onProfileChange: (profile: CasinoProfile, message?: string) => void;
  onError: (message: string) => void;
};

export default function BlackjackRoom({
  playerName,
  profile,
  mediaReady,
  onProfileChange,
  onError,
}: BlackjackRoomProps) {
  const [bet, setBet] = useState(PLAYER_BETS[1]);
  const [state, setState] = useState<BlackjackState | null>(null);
  const [working, setWorking] = useState(false);
  const [roomId, setRoomId] = useState(BLACKJACK_SALONS[0].id);
  const [rooms, setRooms] = useState<CasinoTableRoom[]>([]);
  const [infoTab, setInfoTab] = useState<"salons" | "regles" | "joueurs">("salons");
  const [dealtCardDelays, setDealtCardDelays] = useState<Record<string, number>>({});
  const previousCardKeysRef = useRef<string[]>([]);
  const clearDealAnimationTimeoutRef = useRef<number | null>(null);
  const { clearQueuedAudio, playCardBurst, playCheck } = useTableAudio(mediaReady);

  const stage = state?.stage || "idle";
  const lastDelta = state?.lastDelta || 0;
  const roomSwitchLocked = stage === "player-turn";
  const activeRoom = rooms.find((entry) => entry.id === roomId) || null;
  const isDecisionPhase = stage === "player-turn";

  useEffect(() => {
    let cancelled = false;

    async function syncRoom() {
      try {
        const result = await joinBlackjackRoom(roomId);
        if (cancelled) return;
        setRooms(result.rooms);
      } catch (error_) {
        if (cancelled) return;
        onError(error_ instanceof Error ? error_.message : "Le salon blackjack ne repond pas.");
      }
    }

    void syncRoom();
    const intervalId = window.setInterval(() => void syncRoom(), 15000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [onError, roomId]);

  useEffect(() => {
    return () => {
      if (clearDealAnimationTimeoutRef.current) {
        window.clearTimeout(clearDealAnimationTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const currentCardKeys = getBlackjackCardKeys(state);
    const previousCardKeys = new Set(previousCardKeysRef.current);
    const nextFreshKeys = currentCardKeys.filter((key) => !previousCardKeys.has(key));
    previousCardKeysRef.current = currentCardKeys;

    if (!nextFreshKeys.length) return;

    const nextDelays = nextFreshKeys.reduce<Record<string, number>>((accumulator, key, index) => {
      accumulator[key] = index * TABLE_DEAL_STEP_MS;
      return accumulator;
    }, {});

    setDealtCardDelays((current) => ({ ...current, ...nextDelays }));
    playCardBurst(nextFreshKeys.length, { stepMs: TABLE_DEAL_STEP_MS, volume: 0.7 });

    if (clearDealAnimationTimeoutRef.current) {
      window.clearTimeout(clearDealAnimationTimeoutRef.current);
    }

    clearDealAnimationTimeoutRef.current = window.setTimeout(() => {
      setDealtCardDelays((current) => {
        const remaining = { ...current };
        nextFreshKeys.forEach((key) => {
          delete remaining[key];
        });
        return remaining;
      });
      clearDealAnimationTimeoutRef.current = null;
    }, 1100 + nextFreshKeys.length * TABLE_DEAL_STEP_MS);
  }, [state]);

  async function startRound() {
    onError("");
    clearQueuedAudio();
    previousCardKeysRef.current = [];
    setDealtCardDelays({});
    if (clearDealAnimationTimeoutRef.current) {
      window.clearTimeout(clearDealAnimationTimeoutRef.current);
      clearDealAnimationTimeoutRef.current = null;
    }
    setWorking(true);
    try {
      const result = await startBlackjackRound(bet, roomId);
      setState(result.state);
      if (result.profile) {
        onProfileChange(result.profile);
      }
    } catch (error_) {
      onError(error_ instanceof Error ? error_.message : "La donne n'a pas pu commencer.");
    } finally {
      setWorking(false);
    }
  }

  async function act(action: "hit" | "stand") {
    if (!state?.token || stage !== "player-turn" || working) return;
    onError("");
    if (action === "hit") {
      playCheck();
    }
    setWorking(true);
    try {
      const result = await actBlackjackRound(state.token, action);
      setState(result.state);
      if (result.profile) {
        onProfileChange(result.profile);
      }
    } catch (error_) {
      onError(error_ instanceof Error ? error_.message : "La table n'a pas accepte cette action.");
    } finally {
      setWorking(false);
    }
  }

  function resetTableVisualState() {
    clearQueuedAudio();
    previousCardKeysRef.current = [];
    setDealtCardDelays({});
    if (clearDealAnimationTimeoutRef.current) {
      window.clearTimeout(clearDealAnimationTimeoutRef.current);
      clearDealAnimationTimeoutRef.current = null;
    }
  }

  return (
    <section className="casino-table-layout casino-table-layout--compact casino-table-layout--cards">
      <div className="casino-stage casino-stage--cards">
        <div className="casino-room-hud casino-room-hud--blackjack">
          <div className="casino-room-hud__lead">
            <img className="casino-room-hud__portrait" src={blackjackCaptainArt} alt="" aria-hidden="true" />
            <div className="casino-room-hud__identity">
              <span className="casino-chip">Blackjack ATS</span>
              <strong>Table des lanternes</strong>
              <p>
                {state?.message || "Table pirate premium, croupier en face, pression nette sur la prise de decision."}
                {activeRoom ? ` Salon actif: ${BLACKJACK_SALONS.find((entry) => entry.id === activeRoom.id)?.title || activeRoom.id}.` : ""}
              </p>
            </div>
          </div>

          <div className="casino-status-strip casino-status-strip--compact">
            <article>
              <span>Solde serveur</span>
              <strong className="casino-token-inline"><img src={jetonImg} alt="" />{formatCredits(profile.wallet.balance)}</strong>
            </article>
            <article>
              <span>Mise en cours</span>
              <strong className="casino-token-inline"><img src={jetonImg} alt="" />{formatCredits(state?.wager || bet)}</strong>
            </article>
            <article className={lastDelta >= 0 ? "tone-positive" : "tone-negative"}>
              <span>Derniere variation</span>
              <strong className="casino-token-inline"><img src={jetonImg} alt="" />{`${lastDelta >= 0 ? "+" : ""}${formatCredits(lastDelta)}`}</strong>
            </article>
          </div>

          <div className="casino-salon-strip casino-salon-strip--compact" role="tablist" aria-label="Salons blackjack">
            {BLACKJACK_SALONS.map((salon) => {
              const room = rooms.find((entry) => entry.id === salon.id);
              return (
                <button
                  key={salon.id}
                  type="button"
                  className={`casino-salon-pill ${salon.id === roomId ? "is-active" : ""}`}
                  onClick={() => {
                    if (roomSwitchLocked || working) return;
                    resetTableVisualState();
                    setState(null);
                    setRoomId(salon.id);
                  }}
                  disabled={roomSwitchLocked || working}
                  role="tab"
                  aria-selected={salon.id === roomId}
                >
                  <div>
                    <strong>{salon.title}</strong>
                    <span>{salon.chip}</span>
                  </div>
                  <b>{room?.playerCount || 0}</b>
                </button>
              );
            })}
          </div>
        </div>

        <div
          className="casino-reel-shell casino-room-shell casino-room-shell--cards casino-reel-shell--table-compact casino-reel-shell--blackjack"
          style={{ ["--room-art" as string]: `url("${blackjackCaptainArt}")` }}
        >
          <BlackjackTableScene
            state={state}
            playerName={playerName}
            bet={bet}
            isDecisionPhase={isDecisionPhase}
            dealtCardDelays={dealtCardDelays}
          />

          <BlackjackSidebar
            profile={profile}
            state={state}
            bet={bet}
            working={working}
            roomId={roomId}
            rooms={rooms}
            infoTab={infoTab}
            isDecisionPhase={isDecisionPhase}
            roomSwitchLocked={roomSwitchLocked}
            onBetChange={setBet}
            onInfoTabChange={setInfoTab}
            onHit={() => void act("hit")}
            onStand={() => void act("stand")}
            onDeal={() => void startRound()}
            onResetVisualState={resetTableVisualState}
          />
        </div>
      </div>
    </section>
  );
}
