// lib/scale.js
//
// Single source of truth for performance color across every tab.
// No component defines a threshold and no component writes a hex. If you find
// yourself typing "#c6efce" or "105" inside a component, the answer is here.
//
// Thresholds live in the metric_targets table in Postgres. Colors live in the
// --band-* tokens in globals.css, which are the same values the WeekView table
// has always used, so every report reads like the daily email.
//
// This file only knows how to turn a value plus a config into a band, and what
// a band looks like.

/**
 * The four bands.
 *
 *   fill  solid background for a filled cell, bar or swatch
 *   text  the color that stays legible sitting on that fill
 *   ink   the color to use when the band is expressed as text on a white
 *         surface, because light green as a text color is invisible
 *
 * Amber is deliberately absent. The chain reads red or green, never orange.
 */
export const BANDS = {
  green: {
    fill: "var(--band-green)",
    text: "#fff",
    ink: "var(--band-green)",
    label: "At goal",
  },
  lightGreen: {
    fill: "var(--band-green-soft)",
    text: "var(--band-green)",
    ink: "var(--band-green)",
    label: "Near goal",
  },
  lightRed: {
    fill: "var(--band-red-soft)",
    text: "var(--band-red)",
    ink: "var(--band-red)",
    label: "Over goal",
  },
  red: {
    fill: "var(--band-red)",
    text: "#fff",
    ink: "var(--band-red)",
    label: "Well over",
  },
  none: {
    fill: "transparent",
    text: "var(--text3)",
    ink: "var(--text3)",
    label: "No data",
  },
};

export const BAND_ORDER = ["green", "lightGreen", "lightRed", "red"];

/**
 * The default margin. "Comfortably at goal" means 85% of target or better.
 * Changing this number moves the green / light green line on every metric that
 * does not name its own line, which is the point. It is mirrored in the
 * dt_bands view in Postgres, the only place this number is duplicated.
 */
export const COMFORT = 0.85;

const num = (v) => (v == null || Number.isNaN(Number(v)) ? null : Number(v));

/**
 * Where the solid green band ends.
 *
 * Most metrics let the margin decide, so green is simply 85% of target. Some
 * have a line that operations set by hand and that does not happen to land
 * where the margin would put it. Drive-thru is the case: target 2:40, but the
 * chain calls anything under 2:00 clear, which is 75% rather than 85%.
 *
 * Naming that line per metric is better than retuning COMFORT, because COMFORT
 * is shared and moving it would silently shift Service times too.
 */
function greenLineOf(cfg) {
  const { target, greenLine, lowerIsBetter = true } = cfg;
  const explicit = num(greenLine);
  if (explicit !== null) return explicit;
  return lowerIsBetter ? target * COMFORT : target / COMFORT;
}

/**
 * Four-band classification against a fixed target.
 *
 * @param {number|null} value
 * @param {object} cfg
 * @param {number} cfg.target   the number the store is asked to hit
 * @param {number} cfg.redLine  the number that means this is a real problem
 * @param {number} [cfg.greenLine]  overrides target * COMFORT when set
 * @param {boolean} [cfg.lowerIsBetter=true]  false for metrics like SPLH
 * @returns {"green"|"lightGreen"|"lightRed"|"red"|"none"}
 */
export function bandFor(value, cfg) {
  const v = num(value);
  if (v === null) return "none";
  if (!cfg || cfg.target == null || cfg.redLine == null) return "none";

  const { target, redLine, lowerIsBetter = true } = cfg;
  const green = greenLineOf(cfg);

  if (lowerIsBetter) {
    if (v <= green) return "green";
    if (v <= target) return "lightGreen";
    if (v <= redLine) return "lightRed";
    return "red";
  }

  if (v >= green) return "green";
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

// ---- expressing a band ----

/** Background plus legible text, for a filled cell. */
export function bandStyle(value, cfg) {
  const b = BANDS[bandFor(value, cfg)];
  return { background: b.fill, color: b.text };
}

/** Fill only, for bars, dots and legend swatches. */
export function bandFill(value, cfg) {
  return BANDS[bandFor(value, cfg)].fill;
}

/** Text color for a number printed on a white surface. */
export function bandInk(value, cfg) {
  return BANDS[bandFor(value, cfg)].ink;
}

/** Same three, for when the band name arrived with the data instead. */
export const styleOfBand = (band) => {
  const b = BANDS[band] || BANDS.none;
  return { background: b.fill, color: b.text };
};
export const fillOfBand = (band) => (BANDS[band] || BANDS.none).fill;
export const inkOfBand = (band) => (BANDS[band] || BANDS.none).ink;

/**
 * Legend entries derived from the same config the cells use, so the legend can
 * never describe thresholds that are no longer in force.
 *
 * @param {object} cfg
 * @param {(n:number)=>string} [fmt]
 */
export function bandLegend(cfg, fmt = (n) => String(Math.round(n))) {
  if (!cfg || cfg.target == null || cfg.redLine == null) return [];
  const { target, redLine, lowerIsBetter = true } = cfg;
  const green = greenLineOf(cfg);

  if (lowerIsBetter) {
    return [
      { band: "green", fill: BANDS.green.fill, text: `under ${fmt(green)}` },
      { band: "lightGreen", fill: BANDS.lightGreen.fill, text: `${fmt(green)} to ${fmt(target)}` },
      { band: "lightRed", fill: BANDS.lightRed.fill, text: `${fmt(target)} to ${fmt(redLine)}` },
      { band: "red", fill: BANDS.red.fill, text: `over ${fmt(redLine)}` },
    ];
  }

  return [
    { band: "green", fill: BANDS.green.fill, text: `over ${fmt(green)}` },
    { band: "lightGreen", fill: BANDS.lightGreen.fill, text: `${fmt(target)} to ${fmt(green)}` },
    { band: "lightRed", fill: BANDS.lightRed.fill, text: `${fmt(redLine)} to ${fmt(target)}` },
    { band: "red", fill: BANDS.red.fill, text: `under ${fmt(redLine)}` },
  ];
}

/**
 * Turns a metric_targets row from the API into the cfg shape used above.
 * Kept here so no route or component has to remember the column names.
 *
 * green_value is optional. A null leaves the metric on the COMFORT margin,
 * which is how every metric behaved before the column existed.
 */
export function cfgFromTarget(row) {
  if (!row) return null;
  return {
    metric: row.metric,
    label: row.label,
    target: Number(row.target_value),
    redLine: Number(row.red_value),
    greenLine: row.green_value == null ? null : Number(row.green_value),
    lowerIsBetter: row.lower_is_better !== false,
    unit: row.unit || "seconds",
  };
}

// ---- formatting ----

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

// ---- Google and Yelp reviews ----
//
// Reviews do not use bandFor. The COMFORT margin assumes a target with room
// on either side, but review cutoffs are not a target: they are two fixed
// lines that have been in force since P4, reverse engineered from the manual
// Tattle Report and confirmed against P4 through P7.
//
//   4.50 and up
//   4.00 - 4.49
//   below 4.00
//
// The lightRed step at 3.50 exists only so the scale still reads in four
// bands like every other metric.

export const REVIEW_TIERS = {
  basePlus: 4.5,
  baseOnly: 4.0,
  concern: 3.5,
};

/**
 * The review line a store is graded against.
 *
 * Aliased off REVIEW_TIERS rather than retyped, so the number lives in exactly
 * one place. It is named separately because the grading line and the tier
 * boundaries are different ideas that happen to share a value today, and the
 * next person to move one of them should not silently move both.
 */
export const RATING_TARGET = REVIEW_TIERS.baseOnly;

/** Band for a Google/Yelp average. Higher is better. */
export function bandForRating(value) {
  const v = value == null || Number.isNaN(Number(value)) ? null : Number(value);
  if (v === null) return "none";
  if (v >= REVIEW_TIERS.basePlus) return "green";
  if (v >= REVIEW_TIERS.baseOnly) return "lightGreen";
  if (v >= REVIEW_TIERS.concern) return "lightRed";
  return "red";
}

/** Legend for the reviews column, same shape bandLegend returns. */
export function reviewLegend() {
  return [
    { band: "green", fill: BANDS.green.fill, text: "4.5 and up" },
    { band: "lightGreen", fill: BANDS.lightGreen.fill, text: "4.0 to 4.49" },
    { band: "lightRed", fill: BANDS.lightRed.fill, text: "3.5 to 3.99" },
    { band: "red", fill: BANDS.red.fill, text: "under 3.5" },
  ];
}