// Single-source icon set. 24x24 grid, stroke based, inherits currentColor.
// Multiple subpaths are separated by "|" so each icon stays one string.

const PATHS = {
  dashboard: "M4 4h6v6H4z|M14 4h6v4h-6z|M14 12h6v8h-6z|M4 14h6v6H4z",
  table: "M4 5h16v14H4z|M4 10h16|M10 10v9",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14|M16.2 16.2 20 20",
  rank: "M3 20h18|M6 20v-5|M12 20V5|M18 20v-8",
  timer: "M12 6a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15|M12 10v4l2.5 1.6|M9.5 3h5",
  activity: "M3 12h3.5l2.5 7 4-14 2.5 7H21",
  car: "M4.5 16v-3l2-5h11l2 5v3|M2.5 16h19|M7.5 19.5a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2|M16.5 19.5a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2",
  mail: "M3.5 6h17v12h-17z|M3.5 7l8.5 6 8.5-6",
  target:
    "M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17|M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8|M12 11.6a.4.4 0 1 0 0 .8.4.4 0 0 0 0-.8",
  lock: "M5.5 11h13v9.5h-13z|M8.5 11V8a3.5 3.5 0 0 1 7 0v3",
  unlock: "M5.5 11h13v9.5h-13z|M8.5 11V8a3.5 3.5 0 0 1 6.4-2",
  left: "M14 5.5 8 12l6 6.5",
  right: "M10 5.5 16 12l-6 6.5",
  down: "M6 10l6 6 6-6",
  up: "M6 14l6-6 6 6",
  alert: "M12 4.5 20.5 19.5h-17z|M12 10v4|M12 17.2v.4",
  info: "M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17|M12 11v5.5|M12 7.6v.5",
  check: "M5 12.5l4.5 4.5L19 7.5",
  close: "M6.5 6.5l11 11|M17.5 6.5l-11 11",
  download: "M12 4v11|M8 11.5l4 4 4-4|M5 20h14",
  copy: "M9 9h10.5v10.5H9z|M15 9V4.5H4.5V15H9",
  calendar: "M4 6h16v14H4z|M4 10.5h16|M8.5 3v4|M15.5 3v4",
  menu: "M4 7h16|M4 12h16|M4 17h16",
  gauge: "M4.5 18a8.5 8.5 0 1 1 15 0|M12 18l4-5",
};

export default function Icon({ name, size = 16, strokeWidth = 1.6, className = "" }) {
  const raw = PATHS[name];
  if (!raw) return null;

  return (
    <svg
      className={"ic " + className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {raw.split("|").map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}
