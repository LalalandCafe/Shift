// lib/scale.js
//
// Single source of truth for performance color across every tab.
// No component defines a threshold and no component writes a hex. If you find
// yourself typing "#0f6e3e" or "45" inside a component, the answer is here.
//
// Thresholds live in the metric_targets table in Postgres, not in this file.
// This file only knows how to turn a value plus a config into a band, and what
// a band looks like.

/**
 * The four bands, mapped onto design tokens that already exist in globals.css.
 * Solid fills are for filled cells, paired with the text color that stays
 * legible on them. Nothing new is introduced into the palette, and amber is
 * deliberately absent: the chain reads red or green, never orange.
 */
export const BANDS = {
  green: { fill: "var(--pos)", text: "#fff", label: "At goal" },
  lightGreen: { fill: "var(--pos-line)", text: "var(--text)", label: "Near goal" },
  lightRed: { fill: "var(--neg-line)", text: "var(--text)", label: "Over goal" },
  red: { fill: "var(--neg)", text: "#fff", label: "Well over" },
  none: { fill: "transparent", text: "var(--text3)", label: "No data" },
};

export const BAND_ORDER = ["green", "lightGreen", "lightRed", "red"];

/**
 * The one tuning constant in the system. "Comfortably at goal" means 85% of
 * target or better. Changing this number moves the green / light green line on
 * every metric at once, which is the point. It is mirrored in the dt_bands
 * view in Postgres, the only place this number is duplicated.
 */
export const COMFORT = 0.85;

const num = (v) => (v == null || Number.isNaN(Number(v)) ? null : Number(v));

/**
 * Four-band classification against a fixed target.
 *
 * @param {number|null} value
 * @param {object} cfg
 * @param {number} cfg.target   the number the store is asked to hit
 * @param {number} cfg.redLine  the number that means this is a real problem
 * @param {boolean} [cfg.lowerIsBetter=true]  false for metrics like SPLH
 * @returns {"green"|"lightGreen"|"lightRed"|"red"|"none"}
 */
export function bandFor(value, cfg) {
  const v = num(value);
  if (v === null) return "none";
  if (!cfg || cfg.target == null || cfg.redLine == null) return "none";

  const { target, redLine, lowerIsBetter = true } = cfg;

  if (lowerIsBetter) {
    if (v <= target * COMFORT) return "green";
    if (v <= target) return "lightGreen";
    if (v <= redLine) return "lightRed";
    return "red";
  }

  if (v >= target / COMFORT) return "green";
  if (v >= target) return "lightGreen";
  if (v >= redLine) return "lightRed";
  return "red";
}

/**
 * Four-band classification for metrics that have no target, scored against the
 * rest of the chain instead. Used by TPLH, where a goal has never been set, so
 * that a target-less screen still speaks the same color language as one with a
 * target. Top quarter is green, bottom quarter is red.
 *
 * @param {number|null} value
 * @param {object} q  { p25, median, p75 }
 * @param {boolean} [higherIsBetter=true]
 */
export function bandByQuantile(value, q, higherIsBetter = true) {
  const v = num(value);
  if (v === null || !q || q.p25 == null || q.p75 == null || q.median == null) return "none";

  if (higherIsBetter) {
    if (v >= q.p75) return "green";
    if (v >= q.median) return "lightGreen";
    if (v > q.p25) return "lightRed";
    return "red";
  }
  if (v <= q.p25) return "green";
  if (v <= q.median) return "lightGreen";
  if (v < q.p75) return "lightRed";
  return "red";
}

/** Inline style for a filled cell. */
export function bandStyle(value, cfg) {
  const b = BANDS[bandFor(value, cfg)];
  return { background: b.fill, color: b.text };
}

/** Just the fill, for chart bars, dots and legend swatches. */
export function bandFill(value, cfg) {
  return BANDS[bandFor(value, cfg)].fill;
}

/** Look up a fill from a band name that arrived with the data. */
export function fillOfBand(band) {
  return (BANDS[band] || BANDS.none).fill;
}

/** Look up a full style from a band name that arrived with the data. */
export function styleOfBand(band) {
  const b = BANDS[band] || BANDS.none;
  return { background: b.fill, color: b.text };
}

/**
 * Legend entries derived from the config, so the legend can never drift from
 * the thresholds it describes.
 *
 * @param {object} cfg
 * @param {(n:number)=>string} [fmt]
 */
export function bandLegend(cfg, fmt = (n) => String(Math.round(n))) {
  if (!cfg || cfg.target == null || cfg.redLine == null) return [];
  const { target, redLine, lowerIsBetter = true } = cfg;

  if (lowerIsBetter) {
    const comfort = target * COMFORT;
    return [
      { band: "green", fill: BANDS.green.fill, text: `under ${fmt(comfort)}` },
      { band: "lightGreen", fill: BANDS.lightGreen.fill, text: `${fmt(comfort)} to ${fmt(target)}` },
      { band: "lightRed", fill: BANDS.lightRed.fill, text: `${fmt(target)} to ${fmt(redLine)}` },
      { band: "red", fill: BANDS.red.fill, text: `over ${fmt(redLine)}` },
    ];
  }

  const stretch = target / COMFORT;
  return [
    { band: "green", fill: BANDS.green.fill, text: `over ${fmt(stretch)}` },
    { band: "lightGreen", fill: BANDS.lightGreen.fill, text: `${fmt(target)} to ${fmt(stretch)}` },
    { band: "lightRed", fill: BANDS.lightRed.fill, text: `${fmt(redLine)} to ${fmt(target)}` },
    { band: "red", fill: BANDS.red.fill, text: `under ${fmt(redLine)}` },
  ];
}

/**
 * Turns a metric_targets row from the API into the cfg shape used above.
 * Kept here so no route or component has to remember the column names.
 */
export function cfgFromTarget(row) {
  if (!row) return null;
  return {
    metric: row.metric,
    label: row.label,
    target: Number(row.target_value),
    redLine: Number(row.red_value),
    lowerIsBetter: row.lower_is_better !== false,
    unit: row.unit || "seconds",
  };
}

/** mm:ss for anything measured in seconds. Shared so every tab reads alike. */
export function fmtSeconds(s) {
  const n = num(s);
  if (n === null) return "--";
  const r = Math.round(n);
  const m = Math.floor(r / 60);
  const rem = r % 60;
  return m > 0 ? `${m}:${String(rem).padStart(2, "0")}` : `${rem}s`;
}

/** Formatter matched to the unit on a metric_targets row. */
export function fmtForUnit(unit) {
  if (unit === "minutes") return (n) => `${Number(n).toFixed(1)} min`;
  return fmtSeconds;
}