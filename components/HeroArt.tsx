/**
 * Illustrated scene for the hero: the house on a green hill under a big
 * terracotta sun, with cypress trees and layered hills. Inline SVG, so it
 * stays sharp at any size; swap for a real photo later.
 *
 * Two crops of the same drawing: "tall" fills the left panel on wide
 * screens (the house sits on the right, clear of the big title on the
 * left); "wide" is a picture strip above the title on tablets and phones.
 */
export default function HeroArt({ variant = "tall" }: { variant?: "tall" | "wide" }) {
  const id = (name: string) => `ha-${variant}-${name}`;
  const tall = variant === "tall";
  return (
    <svg
      className={`hero-art hero-art-${variant}`}
      viewBox={tall ? "0 0 600 900" : "0 150 600 450"}
      preserveAspectRatio={tall ? "xMidYMid slice" : "xMidYMax slice"}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={id("sky")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f7ead3" />
          <stop offset="0.55" stopColor="#f4c99a" />
          <stop offset="1" stopColor="#ec9f6c" />
        </linearGradient>
        <radialGradient id={id("sun")} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#e9693a" />
          <stop offset="1" stopColor="#d4542b" />
        </radialGradient>
        <linearGradient id={id("fade")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.45" stopColor="#173226" stopOpacity="0" />
          <stop offset="1" stopColor="#12281e" stopOpacity="0.92" />
        </linearGradient>
      </defs>

      {/* Sky and sun */}
      <rect width="600" height="900" fill={`url(#${id("sky")})`} />
      <circle cx="190" cy="285" r="150" fill="#f3b27e" opacity="0.45" />
      <circle cx="190" cy="285" r="112" fill={`url(#${id("sun")})`} />

      {/* Birds */}
      <g fill="none" stroke="#5b3a2a" strokeWidth="3" strokeLinecap="round" opacity="0.7">
        <path d="M400 190 q10 -10 20 0 q10 -10 20 0" />
        <path d="M455 235 q7 -7 14 0 q7 -7 14 0" />
        <path d="M375 255 q6 -6 12 0 q6 -6 12 0" />
      </g>

      {/* Far hills */}
      <path d="M0 470 C 90 420, 170 430, 260 455 S 450 400, 600 440 V 900 H 0 Z" fill="#a9b98c" />
      <path d="M0 520 C 120 470, 230 500, 330 505 S 520 470, 600 495 V 900 H 0 Z" fill="#7f9a6c" />

      {/* House hill, rising to the right */}
      <path d="M0 620 C 120 600, 240 565, 360 540 S 540 548, 600 560 V 900 H 0 Z" fill="#4f7a55" />

      {/* House */}
      <g transform="translate(355 430)">
        <rect x="70" y="-6" width="16" height="34" fill="#9b3a22" />
        <path d="M-12 46 L60 -2 L132 46 Z" fill="#c8462a" />
        <path d="M-12 46 L60 -2 L132 46" fill="none" stroke="#9b3a22" strokeWidth="4" strokeLinejoin="round" />
        <rect x="0" y="44" width="120" height="68" fill="#f6efe4" />
        <rect x="0" y="104" width="120" height="8" fill="#e6dccd" />
        <rect x="50" y="68" width="22" height="44" rx="11" fill="#2e211b" />
        <rect x="14" y="62" width="22" height="20" rx="3" fill="#e0a13a" />
        <rect x="86" y="62" width="22" height="20" rx="3" fill="#e0a13a" />
        <path d="M14 72 H36 M25 62 V82 M86 72 H108 M97 62 V82" stroke="#f6efe4" strokeWidth="2" />
        <rect x="-26" y="100" width="172" height="10" rx="5" fill="#3d6647" />
      </g>

      {/* Cypress trees and round trees around the house */}
      <g fill="#1f3a2b">
        <path d="M318 575 C 304 537, 311 478, 324 450 C 337 478, 344 537, 330 575 Z" />
        <path d="M297 582 C 287 553, 292 510, 301 490 C 310 510, 315 553, 306 582 Z" />
        <path d="M523 572 C 510 535, 517 487, 529 461 C 541 487, 548 535, 535 572 Z" />
        <circle cx="565" cy="562" r="24" />
      </g>

      {/* Near hill and foreground */}
      <path d="M0 700 C 140 640, 300 660, 420 680 S 560 690, 600 670 V 900 H 0 Z" fill="#2f5a40" />
      <path d="M0 790 C 160 740, 330 760, 600 735 V 900 H 0 Z" fill="#1f3a2b" />
      <g fill="#e8784a">
        <circle cx="90" cy="760" r="5" />
        <circle cx="130" cy="748" r="4" />
        <circle cx="520" cy="742" r="5" />
        <circle cx="555" cy="755" r="4" />
      </g>

      {tall && <rect width="600" height="900" fill={`url(#${id("fade")})`} />}
    </svg>
  );
}
