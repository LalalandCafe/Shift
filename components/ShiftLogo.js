'use client';

const BLUE = '#3B6FB6';
const AMBER = '#D08A2C';
const EYE = '#F4F7F2';

const LEFT = 'M31 8C20 8 12 16 12 26L8 33l4 2v4c0 4 3 6 6 7l5 3v8h8z';
const RIGHT = 'M33 8c11 0 19 8 19 18l4 7-4 2v4c0 4-3 6-6 7l-5 3v8h-8z';

// Diadem, modelled on the Janus bust: a fillet hugging the skull, a pair of
// vertical strips down the seam, and the horizontal knot on top. It is drawn
// OVER the faces in the opposite color of the half it crosses, amber across the
// blue face and blue across the amber one, so it reads as one piece worn by
// both heads and never needs an outline to separate it from the hair.
const CROWN = {
  bandL: 'M11 24 Q17 11 31.4 10.5',
  bandR: 'M53 24 Q47 11 32.6 10.5',
  stemL: 'M30.3 -1 L30.3 11',
  stemR: 'M33.7 -1 L33.7 11',
  knotL: 'M24 -1 L31.4 -1',
  knotR: 'M40 -1 L32.6 -1',
};

const WORDMARK_FONT =
  'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif';

function Crown({ on, left = AMBER, right = BLUE }) {
  const band = { fill: 'none', strokeWidth: 4, strokeLinecap: 'round' };
  const stem = { strokeWidth: 2.6, strokeLinecap: 'round' };
  const knot = { strokeWidth: 4.6, strokeLinecap: 'round' };
  return (
    <g className={'shift-crown' + (on ? ' on' : '')}>
      <path d={CROWN.bandL} stroke={left} {...band} />
      <path d={CROWN.bandR} stroke={right} {...band} />
      <path d={CROWN.stemL} stroke={left} {...stem} />
      <path d={CROWN.stemR} stroke={right} {...stem} />
      <path d={CROWN.knotL} stroke={left} {...knot} />
      <path d={CROWN.knotR} stroke={right} {...knot} />
    </g>
  );
}

function Faces({ left = BLUE, right = AMBER, eye = EYE, showEyes = true }) {
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
 *   'mark'    Janus mark only, in brand colors
 *   'mono'    Janus mark only, single color (inherits currentColor)
 *   'icon'    rounded square app icon, dark background
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
  const box = hasCrown ? '0 -6 64 70' : '0 0 64 64';
  const ratio = hasCrown ? 64 / 70 : 1;

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
            left={mono ? 'currentColor' : AMBER}
            right={mono ? 'currentColor' : BLUE}
          />
        )}
      </svg>
    );
  }

  if (variant === 'icon') {
    return (
      <svg viewBox="0 0 64 64" width={size} height={size} {...common}>
        <rect width="64" height="64" rx="14" fill="#132235" />
        <Faces left="#5B93DA" right="#E5A03F" eye="#132235" />
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
