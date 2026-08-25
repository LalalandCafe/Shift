"use client";

import { useId } from "react";

/**
 * The La La Land cup, struck in three finishes, used where a medal used to be.
 *
 * Traced from the brand line drawing: heart finial, domed lid with a rim, and a
 * tapered body with no sleeve. First, second and third are the same silhouette
 * in a different metal, so the podium reads as one object at three levels
 * rather than three unrelated icons. The rank is engraved on the body.
 *
 * Gradient ids come from useId(), so the same place can appear more than once
 * on a page (podium and dashboard) without the fills colliding.
 *
 * Palette note: gold and bronze were already warm and are untouched, and the
 * gold highlight is close enough to the brand cream to leave alone. Silver was
 * the only cool ramp in the app after the rebrand, and a blue grey cup on a
 * cream canvas reads as a rendering mistake rather than as second place. It is
 * cut from the taupe now, and the highlight is a warm white instead of #ffffff.
 * These values are the CupMedal counterpart of the .lb-medal.silver rules in
 * globals.css, so the two silvers agree.
 */

const FINISH = {
  gold: {
    hi: "#fffbe4",
    mid: "#f0d264",
    lo: "#b48c1c",
    rim: "#8f6d0a",
    ink: "#7a5c06",
  },
  silver: {
    hi: "#fffdf8",
    mid: "#cbc1b6",
    lo: "#8b8074",
    rim: "#746a5f",
    ink: "#635a50",
  },
  bronze: {
    hi: "#ffe4c8",
    mid: "#cb8d54",
    lo: "#8a5527",
    rim: "#6d411b",
    ink: "#5d3915",
  },
};

/** Lengthwise sheen: dark edge, light core, dark edge. Reads as struck metal. */
function Sheen({ id, f, shift = 38 }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stopColor={f.lo} />
      <stop offset="15%" stopColor={f.mid} />
      <stop offset={shift + "%"} stopColor={f.hi} />
      <stop offset="60%" stopColor={f.mid} />
      <stop offset="84%" stopColor={f.lo} />
      <stop offset="100%" stopColor={f.rim} />
    </linearGradient>
  );
}

export default function CupMedal({ place = "gold", rank, size = 44, className = "" }) {
  const uid = useId().replace(/:/g, "");
  const f = FINISH[place] || FINISH.gold;

  const body = `cup-${uid}-b`;
  const lid = `cup-${uid}-l`;

  return (
    <svg
      className={"lb-cup " + place + (className ? " " + className : "")}
      width={size}
      height={(size * 82) / 66}
      viewBox="0 0 66 82"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <Sheen id={body} f={f} />
        <Sheen id={lid} f={f} shift={34} />
      </defs>

      <g stroke={f.rim} strokeWidth="1.1" strokeLinejoin="round">
        {/* heart finial */}
        <path
          d="M33 13.4C29.1 9.9 26.6 8 26.6 5.8A2.7 2.7 0 0 1 33 4.7A2.7 2.7 0 0 1 39.4 5.8C39.4 8 36.9 9.9 33 13.4Z"
          fill={`url(#${lid})`}
        />
        {/* stem between the heart and the lid */}
        <rect x="29.4" y="12.2" width="7.2" height="5.4" rx="1.2" fill={`url(#${lid})`} />

        {/* lid dome */}
        <path
          d="M15.4 17.4A2.2 2.2 0 0 1 17.6 15.6H48.4A2.2 2.2 0 0 1 50.6 17.4L52.2 22.2H13.8Z"
          fill={`url(#${lid})`}
        />
        {/* lid rim, with the two side tabs from the drawing */}
        <rect x="9.2" y="21.4" width="47.6" height="5.6" rx="2.6" fill={`url(#${lid})`} />

        {/* body, tapering to a rounded base */}
        <path
          d="M12.8 27.4H53.2L47.4 68.4A6.4 6.4 0 0 1 41.1 73.8H24.9A6.4 6.4 0 0 1 18.6 68.4Z"
          fill={`url(#${body})`}
        />
      </g>

      {/* One specular stripe, left of centre. Warm white rather than #fff, so
          it does not read as a cool highlight sitting on a warm metal. */}
      <rect x="19.6" y="31" width="4" height="34" rx="2" fill="#fffdf6" opacity="0.32" />

      {/* engraved rank */}
      <text
        x="33"
        y="48"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="21"
        fontWeight="800"
        fill={f.ink}
        opacity="0.9"
        style={{ fontFamily: "var(--font)" }}
      >
        {rank}
      </text>
    </svg>
  );
}