const BLUE = '#3B6FB6';
const AMBER = '#D08A2C';
const EYE = '#F4F7F2';

const LEFT = 'M31 8C20 8 12 16 12 26L8 33l4 2v4c0 4 3 6 6 7l5 3v8h8z';
const RIGHT = 'M33 8c11 0 19 8 19 18l4 7-4 2v4c0 4-3 6-6 7l-5 3v8h-8z';

// Crown, split down the same seam as the faces: a lunate crescent with the
// horns turned up, on a short stem. Left half blue, right half amber.
const CROWN_LEFT = 'M12 -15Q14 -2 31.2 -2L31.2 -7.6Q15.4 -7.6 12 -15Z';
const CROWN_RIGHT = 'M52 -15Q50 -2 32.8 -2L32.8 -7.6Q48.6 -7.6 52 -15Z';
const STEM_LEFT = 'M28.8 -3.4h2.4V7h-2.4z';
const STEM_RIGHT = 'M32.8 -3.4h2.4V7h-2.4z';

const WORDMARK_FONT =
  'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif';

function Faces({ left = BLUE, right = AMBER, eye = EYE, showEyes = true, crown = false }) {
  return (
    <>
      {crown && (
        <g className="shift-crown">
          <path d={CROWN_LEFT} fill={left} />
          <path d={STEM_LEFT} fill={left} />
          <path d={CROWN_RIGHT} fill={right} />
          <path d={STEM_RIGHT} fill={right} />
        </g>
      )}
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
 * size = rendered height in px. Width scales automatically.
 * The wordmark uses currentColor, so it follows your text color in light and dark mode.
 */
export default function ShiftLogo({
  variant = 'lockup',
  size = 32,
  crown = false,
  className = '',
  title = 'SHIFT',
  ...rest
}) {
  const common = {
    className,
    role: 'img',
    'aria-label': title,
    xmlns: 'http://www.w3.org/2000/svg',
    ...rest,
  };

  // With the crown on, the viewBox opens up above the head so the faces keep
  // their exact geometry instead of being squashed to make room.
  const box = crown ? '0 -18 64 82' : '0 0 64 64';
  const ratio = crown ? 64 / 82 : 1;

  if (variant === 'mark' || variant === 'mono') {
    const mono = variant === 'mono';
    return (
      <svg viewBox={box} width={size * ratio} height={size} {...common}>
        {mono ? (
          <>
            {crown && (
              <g className="shift-crown">
                <path d={CROWN_LEFT} fill="currentColor" />
                <path d={STEM_LEFT} fill="currentColor" />
                <path d={CROWN_RIGHT} fill="currentColor" opacity="0.55" />
                <path d={STEM_RIGHT} fill="currentColor" opacity="0.55" />
              </g>
            )}
            <path d={LEFT} fill="currentColor" />
            <path d={RIGHT} fill="currentColor" opacity="0.55" />
          </>
        ) : (
          <Faces crown={crown} />
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
      <svg
        viewBox="0 0 160 108"
        width={(size * 160) / 108}
        height={size}
        {...common}
      >
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
