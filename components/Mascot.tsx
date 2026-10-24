// The Rewise orb: a glossy sphere in the persona's colour with soft light
// swirling slowly inside it. Calm by design - no shaking.
// Confusion only changes how fast the light moves and how vivid the colour
// is; while the AI is thinking the orb gently breathes and swirls faster.
// All motion is CSS and only runs if the user allows motion (see globals.css).

type Props = { color: string; confusion: number; thinking: boolean; size: string };

export default function Mascot({ color, confusion, thinking, size }: Props) {
  const flow = (11 - confusion * 0.05).toFixed(1); // seconds per drift: 11s calm -> 6s confused
  const saturation = (1.1 - confusion * 0.003).toFixed(2); // 1.1 vivid -> 0.8 muted

  return (
    <div
      className="orb"
      data-thinking={thinking}
      role="img"
      aria-label={thinking ? "Thinking" : "Rewise orb"}
      style={{ "--c": color, "--flow": `${flow}s`, "--size": size, filter: `saturate(${saturation})` } as React.CSSProperties}
    >
      <span className="orb-swirl" />
      <span className="orb-light orb-light-1" />
      <span className="orb-light orb-light-2" />
      <span className="orb-light orb-light-3" />
    </div>
  );
}
