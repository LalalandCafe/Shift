"use client";

import { useId } from "react";

/**
 * The La La Land cup, struck in three finishes, used where a medal used to be.
 *
 * First, second and third are the same silhouette with a different metal, so
 * the podium reads as one object at three levels rather than three unrelated
 * icons. The rank is engraved on the sleeve, which is where the wordmark sits
 * on the real cup, so the number carries the information instead of a badge
 * bolted on beside it.
 *
 * Gradient ids come from useId(), so the same place can be rendered more than
 * once on a page (podium and dashboard) without the fills colliding.
 */

const FINISH = {
  gold: {
    hi: "#fff4c9",
    mid: "#e3bc4a",
    lo: "#9a6f0d",
    rim: "#7d5804",
    ink: "#6b4a03",
  },
  silver: {
    hi: "#ffffff",
    mid: "#c6cdd4",
    lo: "#808a94",
    rim: "#69737d",
    ink: "#59626b",
  },
  bronze: {
    hi: "#ffe3c6",
    mid: "#cd8f56",
    lo: "#8a5527",
    rim: "#70441d",
    ink: "#5f3a17",
  },
};

/** Lengthwise sheen: dark edge, light core, dark edge. Reads as metal. */
function Sheen({ id, f, flip = false }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stopColor={f.lo} />
      <stop offset="16%" stopColor={f.mid} />
      <stop offset={flip ? "34%" : "38%"} stopColor={f.hi} />
      <stop offset="58%" stopColor={f.mid} />
      <stop offset="82%" stopColor={f.lo} />
      <stop offset="100%" stopColor={f.rim} />
    </linearGradient>
  );
}

export default function CupMedal({ place = "gold", rank, size = 46, className = "" }) {
  const uid = useId().replace(/:/g, "");
  const f = FINISH[place] || FINISH.gold;

  const body = `cup-${uid}-body`;
  const sleeve = `cup-${uid}-sleeve`;
  const lid = `cup-${uid}-lid`;

  return (
    <svg
      className={"lb-cup " + place + (className ? " " + className : "")}
      width={size}
      height={(size * 60) / 48}
      viewBox="0 0 48 60"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <Sheen id={body} f={f} />
        <Sheen id={sleeve} f={f} flip />
        <Sheen id={lid} f={f} />
      </defs>

      {/* lid cap and the flange it sits on */}
      <rect x="16" y="3" width="16" height="4.6" rx="2.2" fill={`url(#${lid})`} />
      <rect x="11" y="6.8" width="26" height="6.4" rx="3.2" fill={`url(#${lid})`} />

      {/* upper body, tapering in toward the sleeve */}
      <path d="M13.2 13.2 H34.8 L33.9 19.4 H14.1 Z" fill={`url(#${body})`} />

      {/* lower body, tapering to the base */}
      <path
        d="M13.6 34 H34.4 L31.3 52.6 A3 3 0 0 1 28.3 55.2 H19.7 A3 3 0 0 1 16.7 52.6 Z"
        fill={`url(#${body})`}
      />

      {/* sleeve, the widest band and the one carrying the rank */}
      <rect x="9.6" y="19" width="28.8" height="15.6" rx="3.4" fill={`url(#${sleeve})`} />

      {/* specular highlight, one stripe only, left of centre */}
      <rect x="15.2" y="20.6" width="3.4" height="12.4" rx="1.7" fill="#fff" opacity="0.34" />
      <rect x="16.4" y="36.2" width="2.6" height="14" rx="1.3" fill="#fff" opacity="0.22" />

      {/* engraved rank */}
      <text
        x="24"
        y="27.4"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="12.5"
        fontWeight="800"
        fill={f.ink}
        style={{ fontFamily: "var(--font)" }}
      >
        {rank}
      </text>
    </svg>
  );
}