import { buildSettledAnimation } from "../model";
import rouletteTurntableImg from "../../../images/roulette-tournante.png";

type RouletteResultPreviewProps = {
  winningNumber: number;
  winningColor: string;
  previewImageSrc: string;
};

export default function RouletteResultPreview({
  winningNumber,
  winningColor,
  previewImageSrc,
}: RouletteResultPreviewProps) {
  const settled = buildSettledAnimation(winningNumber);

  return (
    <div className={`casino-roulette-history-preview is-${winningColor}`}>
      <div className="casino-roulette-history-preview__wheel-shell" aria-hidden="true">
        <img
          className="casino-roulette-history-preview__base"
          src={previewImageSrc}
          alt=""
        />
        <div
          className="casino-roulette-history-preview__wheel"
          style={{ transform: `translate(-50%, -50%) rotate(${settled.wheelRotation}deg)` }}
        >
          <img
            className="casino-roulette-history-preview__plateau casino-roulette-history-preview__plateau--turntable"
            src={rouletteTurntableImg}
            alt=""
          />
        </div>

        <div
          className="casino-roulette-orb casino-roulette-orb--history"
          style={{
            left: `${settled.ballX}%`,
            top: `${settled.ballY}%`,
          }}
        >
          <span
            className="casino-roulette-orb__trail"
            style={{ transform: "translate(-50%, -50%) rotate(22deg)" }}
          />
        </div>
      </div>

      <div className="casino-roulette-history-preview__copy">
        <span>Dernier coup</span>
        <strong className={`is-${winningColor}`}>Numero {winningNumber}</strong>
        <p>Le plateau premium verrouille la bille directement sur le numero tombe.</p>
      </div>
    </div>
  );
}
