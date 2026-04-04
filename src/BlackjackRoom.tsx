import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTableAudio } from "./audio/useTableAudio";
import { ROOM_DEFINITIONS } from "./features/casino/catalog";
import BlackjackSidebar from "./features/blackjack/components/BlackjackSidebar";
import BlackjackTableScene from "./features/blackjack/components/BlackjackTableScene";
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
const LIVE_MIN_PLAYERS = 2;
type BlackjackPlayMode = "solo" | "live";

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
  const blackjackRoomMeta = ROOM_DEFINITIONS.find((roomEntry) => roomEntry.id === "blackjack");
  const [bet, setBet] = useState(PLAYER_BETS[1]);
  const [state, setState] = useState<BlackjackState | null>(null);
  const [working, setWorking] = useState(false);
  const [playMode, setPlayMode] = useState<BlackjackPlayMode>("solo");
  const [roomId, setRoomId] = useState(BLACKJACK_SALONS[0].id);
  const [rooms, setRooms] = useState<CasinoTableRoom[]>([]);
  const [infoTab, setInfoTab] = useState<"salons" | "regles" | "joueurs">("salons");
  const [showRoomInfo, setShowRoomInfo] = useState(false);
  const [activeHeaderInfo, setActiveHeaderInfo] = useState<"table" | "mise" | "live">("table");
  const [dealtCardDelays, setDealtCardDelays] = useState<Record<string, number>>({});
  const previousCardKeysRef = useRef<string[]>([]);
  const clearDealAnimationTimeoutRef = useRef<number | null>(null);
  const { clearQueuedAudio, playCardBurst, playCheck } = useTableAudio(mediaReady);

  const displayState = useMemo<BlackjackState | null>(() => {
    if (!state) return null;
    return {
      ...state,
      aiSeats: [],
    };
  }, [state]);

  const stage = state?.stage || "idle";
  const lastDelta = state?.lastDelta || 0;
  const roomSwitchLocked = stage === "player-turn";
  const activeRoom = rooms.find((entry) => entry.id === roomId) || null;
  const activePlayerCount = activeRoom?.playerCount || 0;
  const isLiveMultiplayerReady = activePlayerCount >= LIVE_MIN_PLAYERS;
  const isDecisionPhase = stage === "player-turn";

  useEffect(() => {
    if (playMode !== "live") {
      setRooms([]);
      return;
    }

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
  }, [onError, playMode, roomId]);

  useEffect(() => {
    return () => {
      if (clearDealAnimationTimeoutRef.current) {
        window.clearTimeout(clearDealAnimationTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const currentCardKeys = getBlackjackCardKeys(displayState);
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
  }, [displayState]);

  async function startRound() {
    if (playMode === "live" && !isLiveMultiplayerReady) {
      onError("Mode multijoueur: en attente d'au moins un autre joueur sur ce salon.");
      return;
    }
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
      const result = await startBlackjackRound(bet, playMode === "live" ? roomId : undefined);
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

  function handleRoomChange(nextRoomId: string) {
    if (playMode !== "live") return;
    if (roomSwitchLocked || working || nextRoomId === roomId) return;
    resetTableVisualState();
    setState(null);
    setRoomId(nextRoomId);
  }

  function handlePlayModeChange(nextMode: BlackjackPlayMode) {
    if (nextMode === playMode || working || roomSwitchLocked) return;
    onError("");
    resetTableVisualState();
    setState(null);
    setPlayMode(nextMode);
  }

  return (
    <section className="casino-table-layout casino-table-layout--compact casino-table-layout--cards">
      <div className="casino-stage casino-stage--cards casino-stage--cards--blackjack">
        <div
          className="casino-card-fused-stage casino-card-fused-stage--blackjack"
          style={{ ["--room-art" as string]: `url("${blackjackCaptainArt}")` }}
        >
          <div className="casino-room-hud casino-room-hud--blackjack">
            <div className="casino-room-hud__lead">
              <img className="casino-room-hud__portrait" src={blackjackCaptainArt} alt="" aria-hidden="true" />
              <div className="casino-room-hud__identity">
                <div className="casino-topdeck__chip-row">
                  <span className="casino-chip">{blackjackRoomMeta?.chip || "Table des lanternes"}</span>
                  <button
                    type="button"
                    className={`casino-ghost-button casino-topdeck__info-toggle ${showRoomInfo ? "is-open" : ""}`}
                    onClick={() => setShowRoomInfo((value) => !value)}
                    aria-label="Informations blackjack"
                    aria-expanded={showRoomInfo}
                  >
                    <span className="casino-button-icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24">
                        <path d="M4 7h16" />
                        <path d="M4 12h16" />
                        <path d="M4 17h16" />
                      </svg>
                    </span>
                  </button>
                </div>
                <strong>{blackjackRoomMeta?.title || "Blackjack pirate"}</strong>
                <p>
                  {state?.message || (playMode === "solo"
                    ? "Mode solo face au croupier, sans bots ajoutes sur la table."
                    : "Salon live humain avec croupier en face et lecture compacte de la table.")}
                  {playMode === "live" && activeRoom ? ` Salon actif: ${BLACKJACK_SALONS.find((entry) => entry.id === activeRoom.id)?.title || activeRoom.id}.` : ""}
                </p>
              </div>
            </div>

            {showRoomInfo ? (
              <article className="casino-topdeck__info-panel" aria-label="Informations blackjack">
                <div className="casino-topdeck__info-buttons" role="tablist" aria-label="Sections blackjack">
                  <button
                    type="button"
                    role="tab"
                    className={`casino-topdeck__info-button ${activeHeaderInfo === "table" ? "is-active" : ""}`}
                    aria-selected={activeHeaderInfo === "table"}
                    onClick={() => setActiveHeaderInfo("table")}
                  >
                    Table
                  </button>
                  <button
                    type="button"
                    role="tab"
                    className={`casino-topdeck__info-button ${activeHeaderInfo === "mise" ? "is-active" : ""}`}
                    aria-selected={activeHeaderInfo === "mise"}
                    onClick={() => setActiveHeaderInfo("mise")}
                  >
                    Mises
                  </button>
                  <button
                    type="button"
                    role="tab"
                    className={`casino-topdeck__info-button ${activeHeaderInfo === "live" ? "is-active" : ""}`}
                    aria-selected={activeHeaderInfo === "live"}
                    onClick={() => setActiveHeaderInfo("live")}
                  >
                    Live
                  </button>
                </div>
                <div className="casino-topdeck__info-body" role="tabpanel">
                  {activeHeaderInfo === "table" ? (
                    <div className="casino-rule-list">
                      <p>{playMode === "solo" ? "Mode solo face au croupier, sans bots visibles sur le tapis." : "Mode live lie a un salon humain avec croupier partage."}</p>
                      <p>Le blackjack naturel paie plus fort et le reglement passe par le wallet A11.</p>
                      <p>Les reglages de mode et les infos de salon restent accessibles dans le dock de droite.</p>
                    </div>
                  ) : null}
                  {activeHeaderInfo === "mise" ? (
                    <div className="casino-metric-list">
                      <div>
                        <span>Presets</span>
                        <strong>50 / 100 / 200 / 400</strong>
                      </div>
                      <div>
                        <span>Mise active</span>
                        <strong>{formatCredits(state?.wager || bet)}</strong>
                      </div>
                      <div>
                        <span>Payout</span>
                        <strong>{formatCredits(state?.payoutAmount || 0)}</strong>
                      </div>
                      <div>
                        <span>Mode</span>
                        <strong>{playMode === "solo" ? "Solo croupier" : "Salon live"}</strong>
                      </div>
                    </div>
                  ) : null}
                  {activeHeaderInfo === "live" ? (
                    <div className="casino-rule-list">
                      <p>{playMode === "solo" ? "Le mode solo distribue immediatement face au croupier, sans remplir la table avec des bots." : "Le salon doit compter au moins 2 joueurs humains pour lancer une distribution live."}</p>
                      <p>Table en cours: {playMode === "live" ? (activeRoom ? BLACKJACK_SALONS.find((entry) => entry.id === activeRoom.id)?.title || activeRoom.id : "Aucune") : "Solo croupier"}</p>
                      <p>Joueurs presents: {playMode === "live" ? activePlayerCount : 1}</p>
                    </div>
                  ) : null}
                </div>
              </article>
            ) : null}

            {playMode === "live" ? (
              <div className="casino-salon-strip casino-salon-strip--compact" role="tablist" aria-label="Salons blackjack">
                {BLACKJACK_SALONS.map((salon) => {
                  const room = rooms.find((entry) => entry.id === salon.id);
                  return (
                    <button
                      key={salon.id}
                      type="button"
                      className={`casino-salon-pill ${salon.id === roomId ? "is-active" : ""}`}
                      onClick={() => handleRoomChange(salon.id)}
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
            ) : null}
          </div>

          <div className="casino-reel-shell casino-room-shell casino-room-shell--cards casino-reel-shell--table-compact casino-reel-shell--blackjack">
            <BlackjackTableScene
              state={displayState}
              playerName={playerName}
              bet={bet}
              isDecisionPhase={isDecisionPhase}
              dealtCardDelays={dealtCardDelays}
            />

            <BlackjackSidebar
              profile={profile}
              state={displayState}
              bet={bet}
              working={working}
              playMode={playMode}
              roomId={roomId}
              rooms={rooms}
              infoTab={infoTab}
              isDecisionPhase={isDecisionPhase}
              roomSwitchLocked={roomSwitchLocked}
              onBetChange={setBet}
              onPlayModeChange={handlePlayModeChange}
              onInfoTabChange={setInfoTab}
              onRoomChange={handleRoomChange}
              onHit={() => void act("hit")}
              onStand={() => void act("stand")}
              onDeal={() => void startRound()}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
