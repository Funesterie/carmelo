import PirateInspector from "../../../PirateInspector";
import { formatCredits } from "../../../lib/casinoRoomState";
import { POKER_SALONS } from "../../../lib/tableSalons";
import type { CasinoProfile, CasinoTableRoom, PokerState } from "../../../lib/casinoApi";

const STREET_LABELS = {
  waiting: { title: "Attente" },
  preflop: { title: "Preflop" },
  flop: { title: "Flop" },
  turn: { title: "Turn" },
  river: { title: "River" },
  showdown: { title: "Showdown" },
} as const;

function getStreetTitle(stage: PokerState["stage"] | "idle" | string | null | undefined) {
  const normalizedStage = String(stage || "").trim().toLowerCase();
  const knownStage = STREET_LABELS[normalizedStage as keyof typeof STREET_LABELS];
  if (knownStage?.title) return knownStage.title;
  if (!normalizedStage || normalizedStage === "idle") return "En attente";
  return normalizedStage.charAt(0).toUpperCase() + normalizedStage.slice(1);
}

type PokerSidebarProps = {
  profile: CasinoProfile;
  state: PokerState | null;
  stage: "idle" | PokerState["stage"];
  working: boolean;
  roomId: string;
  rooms: CasinoTableRoom[];
  infoTab: "journal" | "lecture" | "salons" | "joueurs";
  isDecisionPhase: boolean;
  isSpectatingRound: boolean;
  hasPendingSeat: boolean;
  queuedForNextHand: boolean;
  roomSwitchLocked: boolean;
  ante: number;
  playerChips: number;
  playerCommitted: number;
  playerStreetCommitted: number;
  toCall: number;
  canFold: boolean;
  canCheck: boolean;
  canCall: boolean;
  canBet: boolean;
  canRaise: boolean;
  isLiveMultiplayerReady: boolean;
  isTableFull: boolean;
  normalizedBetTarget: number;
  aggressionMin: number;
  aggressionMax: number;
  blindUnit: number;
  onInfoTabChange: (tab: "journal" | "lecture" | "salons" | "joueurs") => void;
  onRoomChange: (roomId: string) => void;
  onBetTargetChange: (value: number) => void;
  onFold: () => void;
  onCheck: () => void;
  onCall: () => void;
  onRaise: () => void;
  onJoin: () => void;
};

function getDecisionHeadline(state: PokerState | null) {
  if (!state) return "Selectionne une structure puis rejoins.";
  if (state.stage === "waiting") return "Table en preparation";
  if (state.playerFolded) return "Main couchee";
  if (state.stage === "showdown") return "Pot resolu";
  if (state.legalActions.includes("call")) return `Defense a ${formatCredits(state.toCall)}`;
  if (state.legalActions.includes("raise")) return "Spot de re-raise ouvert";
  if (state.legalActions.includes("bet")) return "Spot checke, initiative disponible";
  if (state.legalActions.includes("check")) return "Check disponible";
  return "Decision en cours";
}

function getDecisionCaption(state: PokerState | null) {
  if (!state) {
    return "Rejoins la table puis attends la prochaine main pour entrer proprement dans le coup.";
  }
  if (state.stage === "waiting") {
    return state.message || "Le salon prepare la prochaine donne et garde les places deja validees.";
  }
  if (state.stage === "showdown") {
    return state.message;
  }
  if (state.legalActions.includes("call")) {
    return `${state.aggressorName || "La table"} ouvre l'action. Tu peux payer ${formatCredits(state.toCall)}, relancer ou jeter.`;
  }
  if (state.legalActions.includes("bet")) {
    return "La table t'a checke la parole. Tu peux miser avec un sizing libre ou pousser tapis.";
  }
  return state.message;
}

export default function PokerSidebar({
  profile,
  state,
  stage,
  working,
  roomId,
  rooms,
  infoTab,
  isDecisionPhase,
  isSpectatingRound,
  hasPendingSeat,
  queuedForNextHand,
  roomSwitchLocked,
  ante,
  playerChips,
  playerCommitted,
  playerStreetCommitted,
  toCall,
  canFold,
  canCheck,
  canCall,
  canBet,
  canRaise,
  isLiveMultiplayerReady,
  isTableFull,
  normalizedBetTarget,
  aggressionMin,
  aggressionMax,
  blindUnit,
  onInfoTabChange,
  onRoomChange,
  onBetTargetChange,
  onFold,
  onCheck,
  onCall,
  onRaise,
  onJoin,
}: PokerSidebarProps) {
  const activeRoom = rooms.find((entry) => entry.id === roomId) || null;
  void hasPendingSeat;
  const canJoin = !queuedForNextHand && (isSpectatingRound || stage === "idle" || stage === "waiting" || stage === "showdown");
  const showJoinPanel = canJoin || queuedForNextHand;
  const waitingForTurn = !showJoinPanel && !isDecisionPhase && !state?.playerFolded;
  const smallBlind = Math.max(10, Math.round(ante / 2));
  const actionHeadline = queuedForNextHand
    ? "Prochaine main"
    : isSpectatingRound
      ? "Main externe en cours"
      : waitingForTurn
      ? "Tour adverse"
      : getDecisionHeadline(state);
  const actionCaption = queuedForNextHand
    ? "Ta place est reservee. Le backend t'ajoutera a la prochaine main de cette table."
    : isSpectatingRound
      ? "Ce salon diffuse une main deja lancee. Tu peux deja reserver ta place pour la prochaine donne."
      : waitingForTurn
      ? (state?.message || "La main continue. Les actions se debloquent des que le tour revient sur toi.")
      : getDecisionCaption(state);

  return (
    <div className="casino-stage-sidebar">
      <div className={`casino-command-dock casino-command-dock--poker ${isDecisionPhase ? "is-attention" : ""}`}>
          <div className="casino-command-dock__copy">
            <span className="casino-chip">{isDecisionPhase ? "Decision" : "Table live"}</span>
            <strong>{actionHeadline}</strong>
            <p>{actionCaption}</p>
          </div>

          {showJoinPanel ? (
            <>
              <div className="casino-command-dock__betline-meta casino-command-dock__betline-meta--poker">
                <span>Blindes {formatCredits(smallBlind)} / {formatCredits(ante)}</span>
                <span>
                  {isTableFull
                    ? "Table pleine"
                    : queuedForNextHand
                      ? "Inscrit"
                      : stage === "waiting"
                        ? "Table ouverte"
                      : isLiveMultiplayerReady
                        ? "Table prete"
                        : "1 joueur en attente"}
                </span>
              </div>
              <div className="casino-command-dock__actions casino-command-dock__actions--poker-join">
                <button
                  type="button"
                  className="casino-primary-button"
                  onClick={onJoin}
                  disabled={working || profile.wallet.balance < ante || isTableFull || queuedForNextHand}
                >
                  {queuedForNextHand ? "Inscrit" : isSpectatingRound ? "Prochaine main" : "Rejoindre la table"}
                </button>
              </div>
            </>
          ) : null}

          {!showJoinPanel && isDecisionPhase && (canBet || canRaise) ? (
            <div className="casino-poker-betbox casino-poker-betbox--dock">
              <div className="casino-poker-betbox__header">
                <div>
                  <span className="casino-chip">{canRaise ? "Raise" : "Mise"}</span>
                  <strong>{canRaise ? "Curseur de raise" : "Curseur de mise"}</strong>
                </div>
                <b>{formatCredits(normalizedBetTarget)}</b>
              </div>
              <input
                className="casino-poker-betbox__slider"
                type="range"
                min={aggressionMin}
                max={aggressionMax}
                step={blindUnit}
                value={normalizedBetTarget}
                onChange={(event) => onBetTargetChange(Number(event.target.value))}
                disabled={working || !isDecisionPhase || !(canBet || canRaise)}
              />
            </div>
          ) : null}

          {!showJoinPanel ? (
            <div className="casino-command-dock__actions casino-command-dock__actions--poker-decision-row">
              <button
                type="button"
                className="casino-ghost-button casino-ghost-button--danger casino-poker-action-button casino-poker-action-button--fold"
                onClick={onFold}
                disabled={working || !isDecisionPhase || !canFold}
              >
                Fold
              </button>
              <button
                type="button"
                className="casino-ghost-button casino-poker-action-button casino-poker-action-button--check"
                onClick={onCheck}
                disabled={working || !isDecisionPhase || !canCheck}
              >
                Check
              </button>
              <button
                type="button"
                className="casino-ghost-button casino-poker-action-button casino-poker-action-button--call"
                onClick={onCall}
                disabled={working || !isDecisionPhase || !canCall}
              >
                Call
              </button>
              <button
                type="button"
                className="casino-primary-button casino-primary-button--cyan casino-poker-action-button casino-poker-action-button--raise"
                onClick={onRaise}
                disabled={working || !isDecisionPhase || (!(canBet || canRaise)) || !normalizedBetTarget}
              >
                {canRaise ? "Raise" : "Bet"}
              </button>
            </div>
          ) : null}
        </div>

      <PirateInspector
          title="Capitaine de table"
          eyebrow="Intel"
          activeTab={infoTab}
          onChange={(tabId) => onInfoTabChange(tabId as typeof infoTab)}
          tabs={[
          {
            id: "journal",
            label: "Journal",
            badge: (state?.actionLog || []).length,
            caption: "Historique compact des derniers mouvements.",
            content: (
              <div className="casino-rule-list">
                {(state?.actionLog || []).length ? (
                  [...(state?.actionLog || [])].slice(-6).reverse().map((entry, index) => (
                    <p key={`${entry}-${index}`}>{entry}</p>
                  ))
                ) : (
                  <p>Les actions de la main s'afficheront ici des que le coup demarre.</p>
                )}
              </div>
            ),
          },
          {
            id: "lecture",
            label: "Lecture",
            caption: "Infos critiques sans surcharger la table.",
            content: (
              <div className="casino-metric-list">
                <div>
                  <span>Street</span>
                  <strong>{getStreetTitle(stage === "idle" ? "idle" : state?.stage)}</strong>
                </div>
                <div>
                  <span>Pot courant</span>
                  <strong>{formatCredits(state?.pot || 0)}</strong>
                </div>
                <div>
                  <span>A payer</span>
                  <strong>{formatCredits(toCall)}</strong>
                </div>
                <div>
                  <span>Tapis hero</span>
                  <strong>{formatCredits(playerChips)}</strong>
                </div>
              </div>
            ),
          },
          {
            id: "salons",
            label: "Salons",
            badge: rooms.find((entry) => entry.id === roomId)?.playerCount || 0,
            caption: "Switch de table en gardant le layout compact.",
            content: (
              <div className="casino-salon-roster">
                {POKER_SALONS.map((salon) => {
                  const room = rooms.find((entry) => entry.id === salon.id);
                  return (
                    <button
                      key={salon.id}
                      type="button"
                      className={`casino-salon-card ${salon.id === roomId ? "is-active" : ""} ${roomSwitchLocked ? "is-locked" : ""}`}
                      onClick={() => onRoomChange(salon.id)}
                      disabled={roomSwitchLocked || working}
                    >
                      <div>
                        <strong>{salon.title}</strong>
                        <span>{salon.blurb}</span>
                      </div>
                      <b>{room?.playerCount || 0} joueur{(room?.playerCount || 0) > 1 ? "s" : ""}</b>
                    </button>
                  );
                })}
              </div>
            ),
          },
          {
            id: "joueurs",
            label: "Joueurs",
            badge: (activeRoom?.participants || []).length,
            caption: "Presence du salon actif.",
            content: (
              <div className="casino-prize-stack">
                {(activeRoom?.participants || []).length ? (
                  activeRoom.participants.map((participant) => (
                    <article key={participant.userId} className="casino-prize-card">
                      <div className="casino-prize-card__glyph">♠</div>
                      <div>
                        <strong>{participant.username}</strong>
                        <span>{participant.userId === profile.user.id ? "toi" : "connecte sur le salon"}</span>
                      </div>
                    </article>
                  ))
                ) : (
                  <p className="casino-history-empty">Tu es seul sur ce salon pour le moment.</p>
                )}
              </div>
            ),
          },
          ]}
      />
    </div>
  );
}
