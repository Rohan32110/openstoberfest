// The Rewise blob: three stacked soft shapes that morph and breathe.
// Colour = persona. Motion = how confused the AI is (jittery and pale when
// confused, slow and vivid when it understands). All movement is CSS and only
// runs when the user hasn't asked for reduced motion (see globals.css).

type Props = { color: string; confusion: number; thinking: boolean };

export default function Mascot({ color, confusion, thinking }: Props) {
  const morph = (9 - confusion * 0.065).toFixed(2); // seconds per cycle: 9s calm -> 2.5s confused
  const saturation = (1.15 - confusion * 0.006).toFixed(2); // 1.15 vivid -> 0.55 washed out

  return (
    <div
      className="mascot-wrap"
      data-jitter={confusion >= 60}
      style={{ filter: `saturate(${saturation})` }}
      role="img"
      aria-label={thinking ? "Thinking" : "Rewise mascot"}
    >
      <div
        className="mascot"
        data-thinking={thinking}
        style={{ "--c": color, "--morph": `${morph}s` } as React.CSSProperties}
      >
        <div className="mascot-layer" />
        <div className="mascot-layer" />
        <div className="mascot-layer" />
      </div>
    </div>
  );
}
