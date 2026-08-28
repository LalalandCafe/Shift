/**
 * La La Land wordmark.
 *
 * PASTE YOUR SVG BELOW, between the two markers.
 *
 *   1. Keep the `viewBox` and DELETE any hardcoded `width`/`height`.
 *      The parent (.auth-foot-mark) controls the size.
 *   2. Replace every `fill="#xxxxxx"` with `fill="currentColor"` so the mark
 *      picks up the coffee brown from CSS. If the logo must stay multicolor,
 *      leave the fills alone.
 *
 * In JSX, camelCase SVG attributes: stroke-width -> strokeWidth,
 * fill-rule -> fillRule, clip-path -> clipPath.
 */
export default function LalalandLogo({ title = 'La La Land' }) {
  return (
    /* BEGIN LA LA LAND SVG */
    <svg
      viewBox="0 0 240 32"
      role="img"
      aria-label={title}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Placeholder. Delete this <text> when you paste the real SVG. */}
      <text
        x="120"
        y="23"
        textAnchor="middle"
        fill="currentColor"
        fontFamily="Poppins, system-ui, sans-serif"
        fontSize="20"
        fontWeight="600"
        letterSpacing="1.5"
      >
        LA LA LAND
      </text>
    </svg>
    /* END LA LA LAND SVG */
  );
}
