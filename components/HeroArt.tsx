/**
 * Illustrated scene for the hero: the house on the beach at sunset — sun
 * low over the sea with its reflection, palm trees, a beach umbrella and
 * foam along the shore. Inline SVG, so it stays sharp at any size; swap for
 * a real photo later.
 *
 * Two crops of the same drawing: "tall" fills the left panel on wide
 * screens (the house sits on the right, clear of the big title on the
 * left); "wide" is a picture strip above the title on tablets and phones.
 */
export default function HeroArt({ variant = "tall" }: { variant?: "tall" | "wide" }) {
  const id = (name: string) => `ha-${variant}-${name}`;
  const tall = variant === "tall";
  const palm = (x: number, y: number, h: number, lean: number, flip = false) => {
    const top = { x: x + lean, y: y - h };
    const s = flip ? -1 : 1;
    return (
      <g key={`${x}-${y}`}>
        <path
          d={`M${x} ${y} Q ${x + lean * 0.2} ${y - h * 0.55} ${top.x} ${top.y}`}
          fill="none" stroke="#7a4a2a" strokeWidth="9" strokeLinecap="round"
        />
        <g fill="#2f6b4f" transform={`translate(${top.x} ${top.y}) scale(${s} 1)`}>
          <path d="M0 0 C 20 -22, 52 -20, 72 4 C 50 -6, 26 -6, 0 0 Z" />
          <path d="M0 0 C 26 -2, 52 14, 62 40 C 44 22, 24 12, 0 0 Z" />
          <path d="M0 0 C -20 -22, -52 -20, -72 4 C -50 -6, -26 -6, 0 0 Z" />
          <path d="M0 0 C -26 -2, -52 14, -62 40 C -44 22, -24 12, 0 0 Z" />
          <path d="M0 0 C 6 -24, 22 -42, 40 -50 C 26 -36, 14 -20, 0 0 Z" fill="#3f7f5e" />
          <path d="M0 0 C -6 -24, -22 -42, -40 -50 C -26 -36, -14 -20, 0 0 Z" fill="#3f7f5e" />
        </g>
        <circle cx={top.x + 6 * s} cy={top.y + 8} r="5" fill="#5b3a22" />
        <circle cx={top.x - 4 * s} cy={top.y + 10} r="5" fill="#5b3a22" />
      </g>
    );
  };
  return (
    <svg
      className={`hero-art hero-art-${variant}`}
      viewBox={tall ? "0 0 600 900" : "0 260 600 450"}
      preserveAspectRatio={tall ? "xMidYMid slice" : "xMidYMax slice"}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={id("sky")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f7ead3" />
          <stop offset="0.45" stopColor="#f6d2a6" />
          <stop offset="0.52" stopColor="#f2b383" />
          <stop offset="1" stopColor="#f2b383" />
        </linearGradient>
        <radialGradient id={id("sun")} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#ec6f3e" />
          <stop offset="1" stopColor="#d4542b" />
        </radialGradient>
        <linearGradient id={id("sea")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a96a0" />
          <stop offset="1" stopColor="#1f6f78" />
        </linearGradient>
        <linearGradient id={id("fade")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.5" stopColor="#12302f" stopOpacity="0" />
          <stop offset="1" stopColor="#0e2524" stopOpacity="0.93" />
        </linearGradient>
      </defs>

      {/* Sky and setting sun */}
      <rect width="600" height="900" fill={`url(#${id("sky")})`} />
      <circle cx="190" cy="420" r="140" fill="#f4b07c" opacity="0.4" />
      <circle cx="190" cy="420" r="100" fill={`url(#${id("sun")})`} />

      {/* Birds */}
      <g fill="none" stroke="#5b3a2a" strokeWidth="3" strokeLinecap="round" opacity="0.7">
        <path d="M400 230 q10 -10 20 0 q10 -10 20 0" />
        <path d="M455 275 q7 -7 14 0 q7 -7 14 0" />
        <path d="M372 295 q6 -6 12 0 q6 -6 12 0" />
      </g>

      {/* Sea with the sun's reflection and a few wave lines */}
      <rect x="0" y="470" width="600" height="260" fill={`url(#${id("sea")})`} />
      <g fill="#f4a36c" opacity="0.9">
        <rect x="120" y="482" width="140" height="6" rx="3" />
        <rect x="140" y="500" width="100" height="5" rx="2.5" />
        <rect x="158" y="517" width="64" height="5" rx="2.5" />
        <rect x="172" y="534" width="36" height="4" rx="2" />
      </g>
      <g fill="none" stroke="#bfe4e4" strokeWidth="3" strokeLinecap="round" opacity="0.55">
        <path d="M330 520 q12 -8 24 0 q12 8 24 0" />
        <path d="M60 560 q12 -8 24 0 q12 8 24 0" />
        <path d="M420 580 q12 -8 24 0 q12 8 24 0" />
        <path d="M230 600 q12 -8 24 0 q12 8 24 0" />
      </g>

      {/* Shore: foam, wet sand, beach */}
      <path d="M0 640 C 120 615, 240 650, 360 630 S 540 610, 600 625 V 900 H 0 Z" fill="#f6f1e6" opacity="0.9" />
      <path d="M0 652 C 120 628, 240 662, 360 642 S 540 622, 600 637 V 900 H 0 Z" fill="#d8b98a" />
      <path d="M0 668 C 140 640, 300 668, 420 650 S 560 640, 600 648 V 900 H 0 Z" fill="#ecd2a6" />

      {/* House on the dune */}
      <path d="M300 660 C 350 610, 520 600, 600 640 V 700 H 300 Z" fill="#e3c592" />
      <g transform="translate(360 518)">
        <rect x="70" y="-6" width="16" height="34" fill="#9b3a22" />
        <path d="M-12 46 L60 -2 L132 46 Z" fill="#c8462a" />
        <path d="M-12 46 L60 -2 L132 46" fill="none" stroke="#9b3a22" strokeWidth="4" strokeLinejoin="round" />
        <rect x="0" y="44" width="120" height="68" fill="#f6efe4" />
        <rect x="0" y="104" width="120" height="8" fill="#e6dccd" />
        <rect x="50" y="68" width="22" height="44" rx="11" fill="#1f6f78" />
        <rect x="14" y="62" width="22" height="20" rx="3" fill="#e0a13a" />
        <rect x="86" y="62" width="22" height="20" rx="3" fill="#e0a13a" />
        <path d="M14 72 H36 M25 62 V82 M86 72 H108 M97 62 V82" stroke="#f6efe4" strokeWidth="2" />
        <rect x="-18" y="110" width="156" height="8" rx="4" fill="#c9a26c" />
      </g>

      {/* Palm trees */}
      {palm(330, 640, 150, -26)}
      {palm(545, 636, 175, 18, true)}
      {/* The left palm and the umbrella sit where the big title goes on wide
          screens, so they only appear in the strip shown on tablets and phones. */}
      {!tall && palm(60, 700, 120, 14)}

      {/* Beach umbrella and towel */}
      {!tall && (
      <g transform="translate(170 735)">
        <path d="M0 0 L4 -70" stroke="#5b3a22" strokeWidth="4" strokeLinecap="round" />
        <path d="M-46 -64 Q 4 -110 54 -64 Z" fill="#f6efe4" />
        <path d="M-46 -64 Q -26 -100 4 -104 Q -10 -80 -14 -64 Z" fill="#c9502b" />
        <path d="M4 -104 Q 34 -100 54 -64 L 22 -64 Q 18 -82 4 -104 Z" fill="#c9502b" />
        <rect x="16" y="-8" width="62" height="20" rx="3" fill="#2b6b80" transform="rotate(-6 16 -8)" />
      </g>
      )}

      {/* Shells */}
      <g fill="#f6efe4">
        <circle cx="430" cy="760" r="5" />
        <circle cx="470" cy="775" r="4" />
        <circle cx="95" cy="800" r="4" />
      </g>

      {tall && <rect width="600" height="900" fill={`url(#${id("fade")})`} />}
    </svg>
  );
}
