const BLUE = '#3B6FB6';
const AMBER = '#D08A2C';
const EYE = '#F4F7F2';

const LEFT = 'M31 8C20 8 12 16 12 26L8 33l4 2v4c0 4 3 6 6 7l5 3v8h8z';
const RIGHT = 'M33 8c11 0 19 8 19 18l4 7-4 2v4c0 4-3 6-6 7l-5 3v8h-8z';

const WORDMARK_FONT =
  'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif';

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
 * size = rendered height in px. Width scales automatically.
 * The wordmark uses currentColor, so it follows your text color in light and dark mode.
 */
export default function ShiftLogo({
  variant = 'lockup',
  size = 32,
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

  if (variant === 'mark' || variant === 'mono') {
    const mono = variant === 'mono';
    return (
      <svg viewBox="0 0 64 64" width={size} height={size} {...common}>
        {mono ? (
          <>
            <path d={LEFT} fill="currentColor" />
            <path d={RIGHT} fill="currentColor" opacity="0.55" />
          </>
        ) : (
          <Faces />
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

