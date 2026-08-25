'use client';

/**
 * Palette note.
 *
 * The shell went white, so the mark went with it. It used to be cream and gold
 * because it sat on a brown rail. On white those two are invisible, so the two
 * faces are brown and gold now: one carries the weight, the other carries the
 * brand, and both hold up against a white sidebar and a white topbar.
 *
 * Which means the mark no longer needs a chip behind it. .mobile-logo in
 * globals.css is transparent again.
 *
 * variant="icon" is the exception. That one is an app icon with its own dark
 * tile, so it keeps the cream and gold pair.
 */
const FACE_L = '#5A4432';
const FACE_R = '#C9A83F';
const EYE = '#FFFFFF';

const ICON_BG = '#533F2E';
const ICON_L = '#FFF7D2';
const ICON_R = '#F8E27E';

const LEFT = 'M31 8C20 8 12 16 12 26L8 33l4 2v4c0 4 3 6 6 7l5 3v8h8z';
const RIGHT = 'M33 8c11 0 19 8 19 18l4 7-4 2v4c0 4-3 6-6 7l-5 3v8h-8z';

// Fillet, modelled on the Janus bust: a straight braided band across both
// skulls, a double strip down the seam and a knot on top. Drawn OVER the faces
// in the opposite color of the half it crosses, gold across the brown face and
// brown across the gold one, so it reads as one piece worn by both heads and
// never needs an outline. The notches are painted in the face color underneath,
// which is what gives the band its braided texture for free.
const BAND_Y = 18.5;
const BAND_H = 5;
const BAND_X = 13.2;
const NOTCHES = 5;

function notchRects(x0, x1, color) {
  const step = (x1 - x0) / NOTCHES;
  return Array.from({ length: NOTCHES - 1 }, (_, i) => (
    <rect
      key={i}
      x={(x0 + step * (i + 1) - 0.45).toFixed(2)}
      y={BAND_Y - 0.2}
      width="0.9"
      height={BAND_H + 0.4}
      fill={color}
    />
  ));
}

const WORDMARK_FONT =
  'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif';

function Crown({ on, left = FACE_R, right = FACE_L, faceLeft = FACE_L, faceRight = FACE_R }) {
  return (
    <g className={'shift-crown' + (on ? ' on' : '')}>
      <rect x={BAND_X} y={BAND_Y} width={31.7 - BAND_X} height={BAND_H} fill={left} />
      <rect x="32.3" y={BAND_Y} width={64 - BAND_X - 32.3} height={BAND_H} fill={right} />
      {notchRects(BAND_X, 31.7, faceLeft)}
      {notchRects(32.3, 64 - BAND_X, faceRight)}
      <rect x="28.7" y="3.4" width="3" height="21.6" fill={left} />
      <rect x="32.3" y="3.4" width="3" height="21.6" fill={right} />
      <rect x="23.6" y="0" width="8.1" height="3.4" rx="1.5" fill={left} />
      <rect x="32.3" y="0" width="8.1" height="3.4" rx="1.5" fill={right} />
    </g>
  );
}

function Faces({ left = FACE_L, right = FACE_R, eye = EYE, showEyes = true }) {
  return (
    <>
      <path d={LEFT} fill={left} />
      <path d={RIGHT} fill={right} />
      {showEyes && (
        <>
          <circle cx="17" cy="27" r="2.4" fill={eye} />
          <circle cx="47" cy="27" r="2.4" fill={eye} />
        </>
      )}
    </>
  );
}

/**
 * SHIFT logo.
 *
 * variant:
 *   'lockup'  mark + wordmark, horizontal (default)
 *   'stacked' mark above wordmark, centered
 *   'mark'    Janus mark only, brand colors, expects a light ground
 *   'mono'    Janus mark only, single color (inherits currentColor)
 *   'icon'    rounded square app icon, brown tile, cream and gold faces
 *
 * crown:
 *   omitted   no crown, original tight viewBox
 *   true      crown visible
 *   false     crown hidden but still mounted, so it can animate in and out
 *
 * size = rendered height in px. Width scales automatically.
 */
export default function ShiftLogo({
  variant = 'lockup',
  size = 32,
  crown,
  className = '',
  title = 'SHIFT',
  ...rest
}) {
  const hasCrown = crown !== undefined;

  const common = {
    className,
    role: 'img',
    'aria-label': title,
    xmlns: 'http://www.w3.org/2000/svg',
    ...rest,
  };

  // With a crown the viewBox opens upward so the faces keep their exact
  // geometry, and the head never shifts when the crown toggles.
  const box = hasCrown ? '0 -3 64 67' : '0 0 64 64';
  const ratio = hasCrown ? 64 / 67 : 1;

  if (variant === 'mark' || variant === 'mono') {
    const mono = variant === 'mono';
    return (
      <svg viewBox={box} width={size * ratio} height={size} {...common}>
        {mono ? (
          <>
            <path d={LEFT} fill="currentColor" />
            <path d={RIGHT} fill="currentColor" opacity="0.55" />
          </>
        ) : (
          <Faces />
        )}
        {hasCrown && (
          <Crown
            on={crown}
            left={mono ? 'currentColor' : FACE_R}
            right={mono ? 'currentColor' : FACE_L}
            faceLeft={mono ? 'transparent' : FACE_L}
            faceRight={mono ? 'transparent' : FACE_R}
          />
        )}
      </svg>
    );
  }

  if (variant === 'icon') {
    return (
      <svg viewBox="0 0 64 64" width={size} height={size} {...common}>
        <rect width="64" height="64" rx="14" fill={ICON_BG} />
        <Faces left={ICON_L} right={ICON_R} eye={ICON_BG} />
      </svg>
    );
  }

  if (variant === 'stacked') {
    return (
      <svg viewBox="0 0 160 108" width={(size * 160) / 108} height={size} {...common}>
        <g transform="translate(48 0)">
          <Faces />
        </g>
        <text
          x="80"
          y="98"
          textAnchor="middle"
          fontFamily={WORDMARK_FONT}
          fontSize="28"
          fontWeight="500"
          letterSpacing="5"
          fill="currentColor"
        >
          SHIFT
        </text>
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 232 64" width={(size * 232) / 64} height={size} {...common}>
      <Faces />
      <text
        x="82"
        y="44"
        fontFamily={WORDMARK_FONT}
        fontSize="34"
        fontWeight="500"
        letterSpacing="6"
        fill="currentColor"
      >
        SHIFT
      </text>
    </svg>
  );
}
