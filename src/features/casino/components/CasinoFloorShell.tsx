import type { ReactNode } from "react";
import type { RoomId } from "../catalog";
import { ROOM_DEFINITIONS, resolveRoomArtwork } from "../catalog";

type CasinoFloorShellProps = {
  activeRoom: RoomId;
  currentRoom: (typeof ROOM_DEFINITIONS)[number];
  districtArtwork: string;
  currentRoomArtwork: string;
  playerName: string;
  balanceLabel: string;
  onRoomChange: (roomId: RoomId) => void;
  children: ReactNode;
};

export default function CasinoFloorShell({
  activeRoom,
  currentRoom,
  districtArtwork,
  currentRoomArtwork,
  playerName,
  balanceLabel,
  onRoomChange,
  children,
}: CasinoFloorShellProps) {
  return (
    <section className="casino-floor">
      <section
        className="casino-topdeck"
        style={{
          ["--district-art" as string]: `url("${districtArtwork}")`,
          ["--room-art" as string]: `url("${currentRoomArtwork}")`,
        }}
      >
        <div className="casino-topdeck__summary">
          <div className="casino-topdeck__lead">
            <div className="casino-topdeck__icon-wrap" aria-hidden="true">
              <img className="casino-topdeck__icon" src={currentRoom.icon} alt="" />
            </div>
            <div className="casino-topdeck__copy">
              <span className="casino-chip">Pont central ATS</span>
              <strong>{currentRoom.title}</strong>
              <p>{currentRoom.body}</p>
            </div>
          </div>

          <div className="casino-topdeck__meta">
            <span>{playerName}</span>
            <span>{balanceLabel} credits</span>
            <span>{currentRoom.chip}</span>
          </div>
        </div>

        <div className="casino-topdeck__tabs" role="tablist" aria-label="Salles de jeu">
          {ROOM_DEFINITIONS.map((room) => (
            <button
              key={room.id}
              type="button"
              className={`casino-topdeck__tab ${room.id === activeRoom ? "is-active" : ""}`}
              data-room-id={room.id}
              onClick={() => onRoomChange(room.id)}
              role="tab"
              aria-selected={room.id === activeRoom}
              style={{
                ["--tab-art" as string]: `url("${resolveRoomArtwork(room.id)}")`,
              }}
            >
              <span className="casino-topdeck__tab-badge" aria-hidden="true">
                <img className="casino-topdeck__tab-icon" src={room.icon} alt="" />
              </span>
              <div className="casino-topdeck__tab-copy">
                <strong>{room.label}</strong>
                <span>{room.chip}</span>
              </div>
            </button>
          ))}
        </div>
      </section>

      <div className="casino-floor__room">{children}</div>
    </section>
  );
}
