]633;E;for f in lib/calc.js lib/leaderboard.js lib/forecast.js lib/scale.js lib/throughput.js lib/fiscal.js lib/aggregate.js;3eca3fa0-6a07-4e04-b1a7-e43b2982408b]633;C===== lib/calc.js =====
// Calculos portados EXACTO de SHIFT.
// Estas son las mismas formulas del archivo original, sin cambios de logica.

import { WEEKEND } from "./fiscal.js";

// ── EXCLUSIONES (portado de exclReason / isExcludedEmp) ──
// Normaliza "Apellido, Nombre" para comparar sin importar espacios/mayusculas.
function normEmp(name) {
  return String(name || "").toLowerCase().replace(/\s+/g, " ").trim();
}

// excludedList: array de nombres (de la tabla excluded_employees)
export function isExcludedEmp(name, excludedList) {
  const n = normEmp(name);
  return excludedList.some((e) => normEmp(e) === n);
}

// Devuelve la razon de exclusion, o "" si no se excluye.
// jtN = job title normalizado (lowercase, sin asterisco final)
export function exclReason(empName, jtN, excludedList) {
  if (empName && isExcludedEmp(empName, excludedList)) return "Excluded list";
  if (jtN === "nso trainer") return "NSO Trainer";
  if (jtN === "general manager") return "General Manager";
  if (jtN === "event support - la") return "Event Support - LA";
  return "";
}

// Normaliza el job title igual que SHIFT: lowercase, quita "*" final.
export function normJobTitle(jt) {
  return String(jt || "").toLowerCase().replace(/\*$/, "").trim();
}

// ── TARGETS (portado de getTarget / ptdTarget) ──
// store = objeto de la tabla stores { weekday_target, weekend_target, ptd_target, grp }
export function getTarget(store, day) {
  if (!store) return 75;
  return WEEKEND.has(day) ? store.weekend_target : store.weekday_target;
}

export function getPtdTarget(store) {
  if (!store) return 80;
  return store.ptd_target;
}

// ── AGREGACION DE HORAS DESDE PAYROLL (portado de parsePay) ──
// Formula: Hours = Regular Hours + Overtime Hours, excluyendo GM/NSO/lista negra.
// Trainee y Certified Trainer se suman aparte (y tambien cuentan en las horas totales).
// rows: array de registros de payroll con { employee, jobTitle, regularHours, overtimeHours, code }
export function aggregatePayroll(rows, excludedList) {
  const hours = {}, trainee = {}, trainer = {}, audit = [];
  rows.forEach((r) => {
    const code = parseInt(String(r.code).replace(/[^0-9]/g, ""));
    if (!code || isNaN(code)) return;
    const empName = String(r.employee || "").trim();
    const jtN = normJobTitle(r.jobTitle);
    const regH = parseFloat(r.regularHours) || 0;
    const otH = parseFloat(r.overtimeHours) || 0;
    const total = regH + otH;
    if (total <= 0) return;
    const excl = exclReason(empName, jtN, excludedList);
    audit.push({ code, emp: empName, jt: r.jobTitle, h: total, excl });
    if (excl) return;
    hours[code] = (hours[code] || 0) + total;
    if (jtN === "trainee") trainee[code] = (trainee[code] || 0) + total;
    if (jtN === "certified trainer") trainer[code] = (trainer[code] || 0) + total;
  });
  // Total training = trainee + trainer (portado exacto)
  const train = {};
  Object.keys(trainee).forEach((k) => { train[k] = (train[k] || 0) + trainee[k]; });
  Object.keys(trainer).forEach((k) => { train[k] = (train[k] || 0) + trainer[k]; });
  return { hours, train, trainee, trainer, audit };
}

// ── METRICAS POR DIA/TIENDA (portado de la logica del week view / email) ──
// sales, hours son numeros; store el objeto de tienda; day el nombre del dia.
export function dayMetrics(sales, hours, store, day) {
  const t = getTarget(store, day);
  const sp = hours > 0 ? sales / hours : 0;      // SPLH
  const ou = (sales / t) - hours;                 // Hours (Over)/Under
  const ok = sp >= t;                             // verde si cumple target
  return { sales, hours, target: t, splh: sp, overUnder: ou, ok };
}

// TPLH: transacciones (checks) por hora de labor. A diferencia de SPLH,
// no se infla con aumentos de precio ni con dias de ticket promedio alto.
// Mide throughput real por persona. transactions viene de daily_sales.transaction_count.
export function tplh(transactions, hours) {
  if (!hours || hours <= 0) return 0;
  return (transactions || 0) / hours;
}

// ── DETECCION DE ANOMALIAS (portado exacto de anomalyFlags) ──
export function anomalyFlags(store, s, h, day) {
  const flags = [];
  const t = getTarget(store, day);
  if (h < 1 && s >= 1) flags.push("No hours (payroll missing?)");
  else if (s < 1 && h >= 1) flags.push("No sales (Location Overview missing?)");
  else if (h < 1 && s < 1) flags.push("No data (closed?)");
  if (h >= 1 && s >= 1) {
    const sp = s / h;
    if (sp >= t * 2.5) flags.push("SPLH very high (" + Math.round(sp) + " vs target " + t + ")");
  }
  if (h > 400) flags.push("Hours very high (" + Math.round(h) + "h in one day)");
  return flags;
}

// Formateo (Over)/Under igual que SHIFT: negativo -> "(N)", sin signo +
export function fmtOverUnder(n) {
  const r = Math.round(n);
  return r < 0 ? "(" + Math.abs(r) + ")" : String(r);
}
===== lib/leaderboard.js =====
/**
 * Leaderboard scoring, in one place.
 *
 * The Dashboard and the Leaderboard both show a ranked top three. If each one
 * carried its own copy of this math they would quietly disagree the first time
 * a weight or a threshold changed, and nobody would know which board was
 * right. Both import from here.
 */

/**
 * Below this a rating is displayed but greyed out and left out of the score.
 * A single week regularly gives a store two or three reviews, and two bad
 * ones would drop it to the bottom on noise rather than performance.
 */
export const MIN_REVIEWS_TO_RANK = 5;

export const WEIGHTS = { efficiency: 0.5, reviews: 0.5 };

/**
 * Efficiency = week to date SPLH divided by the store's own target, as a
 * percentage. 100% means the store produced its sales with exactly the hours
 * the target allowed. Measuring each store against its own number is what lets
 * a $75 target store and a $90 target store compete fairly.
 */
export function efficiencyOf(s) {
  const splh = s.wtd?.splh ?? s.day?.splh ?? null;
  const target = s.day?.target ?? null;
  if (!splh || !target) return null;
  return (splh / target) * 100;
}

/**
 * Percentile rank against the rest of the field, 0 to 100, ties averaged.
 * Nulls stay null.
 *
 * Efficiency and star ratings cannot be averaged directly: 112% and 4.6 are
 * different units on different scales. Converting both to a percentile of the
 * stores currently in view puts them in the same space, so a 50/50 blend
 * actually means half labor and half guest experience.
 */
export function percentiles(values) {
  const out = values.map(() => null);
  const valid = values
    .map((v, i) => ({ v: Number(v), i }))
    .filter((x) => Number.isFinite(x.v));

  if (!valid.length) return out;
  if (valid.length === 1) {
    out[valid[0].i] = 100;
    return out;
  }

  const sorted = [...valid].sort((a, b) => a.v - b.v);
  const last = sorted.length - 1;

  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1].v === sorted[i].v) j++;
    const pct = (((i + j) / 2) / last) * 100;
    for (let k = i; k <= j; k++) out[sorted[k].i] = pct;
    i = j + 1;
  }
  return out;
}

/**
 * Score a set of report rows.
 *
 * Stores are always scored against the other stores passed in, never against
 * the whole chain. That is deliberate: a DFW board should rank within DFW, so
 * changing the scope rescores the field.
 *
 * Returns the rows in input order with eff, rev and score attached, plus the
 * same rows sorted by score and a code to rank lookup.
 */
export function scoreStores(reportRows, windowKey = "period") {
  const base = (reportRows || [])
    .map((s) => ({ ...s, eff: efficiencyOf(s), rev: s.reviews?.[windowKey] || null }))
    .filter((s) => s.eff !== null);

  if (!base.length) return { rows: [], byScore: [], rank: {} };

  const effPct = percentiles(base.map((s) => s.eff));
  const revPct = percentiles(
    base.map((s) => (s.rev && s.rev.count >= MIN_REVIEWS_TO_RANK ? s.rev.rating : null))
  );

  const rows = base.map((s, i) => {
    const e = effPct[i];
    const r = revPct[i];
    // A store without enough reviews is ranked on labor alone rather than
    // pushed to the bottom for something it has not had a chance to earn.
    const score =
      e !== null && r !== null
        ? e * WEIGHTS.efficiency + r * WEIGHTS.reviews
        : e !== null
        ? e
        : r;
    return {
      ...s,
      score: score === null ? null : Math.round(score * 10) / 10,
      scoredOnLaborOnly: r === null,
    };
  });

  const byScore = [...rows].sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  const rank = {};
  byScore.forEach((s, i) => (rank[s.code] = i + 1));

  return { rows, byScore, rank };
}

/**
 * Sales weighted rating across a set of stores. A store with four reviews
 * should not move the company number as much as one with sixty, so the
 * average is weighted by review count rather than by store.
 */
export function weightedRating(reportRows, windowKey = "period") {
  let n = 0;
  let sum = 0;
  (reportRows || []).forEach((s) => {
    const rev = s.reviews?.[windowKey];
    if (rev && rev.rating !== null && rev.count > 0) {
      n += rev.count;
      sum += rev.rating * rev.count;
    }
  });
  return n > 0 ? { rating: sum / n, count: n } : { rating: null, count: 0 };
}
===== lib/forecast.js =====
// Pronostico de ventas y planeador de horas.
// Metodo: promedio del mismo dia de la semana en las ultimas N semanas.
// Simple a proposito: un GM puede verificarlo mentalmente y por eso lo cree.

import { supabaseAdmin } from "./supabase.js";
import { getTarget } from "./calc.js";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const SHORT_DAY = {
  Monday: "Mon", Tuesday: "Tue", Wednesday: "Wed", Thursday: "Thu",
  Friday: "Fri", Saturday: "Sat", Sunday: "Sun",
};

function dayNameFromISO(iso) {
  const d = new Date(iso + "T12:00:00Z");
  return DAY_NAMES[d.getUTCDay()];
}

function addDays(iso, n) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function isoRange(startIso, endIso) {
  const out = [];
  let d = new Date(startIso + "T12:00:00Z");
  const end = new Date(endIso + "T12:00:00Z");
  while (d <= end) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

function todayCentral() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

// Lunes de la semana que contiene esta fecha
export function mondayOf(iso) {
  const d = new Date(iso + "T12:00:00Z");
  const dn = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - (dn - 1));
  return d.toISOString().slice(0, 10);
}

// Confianza basada en dispersion. Un GM debe saber cuando el
// pronostico es solido y cuando es una adivinanza.
function confidenceOf(values) {
  if (values.length < 2) return { level: "low", label: "Not enough history" };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (mean <= 0) return { level: "low", label: "No sales history" };
  const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
  const cv = Math.sqrt(variance) / mean;
  if (values.length >= 3 && cv < 0.08) return { level: "high", label: "Consistent week to week" };
  if (cv < 0.16) return { level: "medium", label: "Some week to week swing" };
  return { level: "low", label: "Swings a lot, treat as a rough guide" };
}

export async function buildForecast(storeCode, weekStartIso, lookbackWeeks = 4) {
  const code = Number(storeCode);
  const lookback = Math.max(2, Math.min(12, Number(lookbackWeeks) || 4));

  const { data: storeRows, error: sErr } = await supabaseAdmin
    .from("stores")
    .select("code, name, region, grp, weekday_target, weekend_target")
    .eq("code", code)
    .limit(1);
  if (sErr) throw new Error("stores: " + sErr.message);
  if (!storeRows || !storeRows.length) throw new Error("Tienda " + code + " no encontrada");

  const st = storeRows[0];
  const store = {
    weekday_target: st.weekday_target,
    weekend_target: st.weekend_target,
  };

  const weekStart = mondayOf(weekStartIso);
  const weekEnd = addDays(weekStart, 6);

  // El historial termina AYER. Incluir hoy metería un día a medias como
  // si fuera una semana completa, y jalaría el promedio hacia abajo.
  const today = todayCentral();
  const lastComplete = addDays(today, -1);
  let histEnd = addDays(weekStart, -1);
  if (histEnd > lastComplete) histEnd = lastComplete;
  const histStart = addDays(histEnd, -7 * lookback + 1);

  const { data: salesRows, error: salesErr } = await supabaseAdmin
    .from("daily_sales")
    .select("business_date, gross_sales")
    .eq("store_code", code)
    .gte("business_date", histStart)
    .lte("business_date", histEnd)
    .order("business_date", { ascending: true });
  if (salesErr) throw new Error("sales: " + salesErr.message);

  // Agrupa el historial por dia de la semana
  const byWeekday = {};
  (salesRows || []).forEach((r) => {
    const s = Number(r.gross_sales) || 0;
    if (s <= 0) return;
    if (r.business_date >= today) return;
    const dn = dayNameFromISO(r.business_date);
    if (!byWeekday[dn]) byWeekday[dn] = [];
    byWeekday[dn].push({ date: r.business_date, sales: s });
  });

  // Horas ya planeadas para esta semana
  const { data: plannedRows, error: pErr } = await supabaseAdmin
    .from("planned_hours")
    .select("business_date, planned_hours, updated_at")
    .eq("store_code", code)
    .gte("business_date", weekStart)
    .lte("business_date", weekEnd);
  if (pErr) throw new Error("planned: " + pErr.message);

  const plannedByDate = {};
  let lastPlanUpdate = null;
  (plannedRows || []).forEach((r) => {
    plannedByDate[r.business_date] = Number(r.planned_hours) || 0;
    if (!lastPlanUpdate || r.updated_at > lastPlanUpdate) lastPlanUpdate = r.updated_at;
  });

  const days = isoRange(weekStart, weekEnd).map((iso) => {
    const dayName = dayNameFromISO(iso);
    const target = getTarget(store, dayName);
    const samples = (byWeekday[dayName] || []).slice(-lookback);
    const values = samples.map((s) => s.sales);

    const expected = values.length
      ? values.reduce((a, b) => a + b, 0) / values.length
      : 0;
    const minSales = values.length ? Math.min(...values) : 0;
    const maxSales = values.length ? Math.max(...values) : 0;
    const conf = confidenceOf(values);

    const allowed = target > 0 ? expected / target : 0;
    const allowedLow = target > 0 ? minSales / target : 0;
    const allowedHigh = target > 0 ? maxSales / target : 0;

    const planned = plannedByDate[iso];
    const hasPlan = planned !== undefined;

    return {
      date: iso,
      dayName,
      shortDay: SHORT_DAY[dayName],
      target,
      expectedSales: Math.round(expected),
      minSales: Math.round(minSales),
      maxSales: Math.round(maxSales),
      allowedHours: Math.round(allowed),
      allowedLow: Math.round(allowedLow),
      allowedHigh: Math.round(allowedHigh),
      plannedHours: hasPlan ? planned : null,
      variance: hasPlan ? Math.round(planned - allowed) : null,
      samples: values.length,
      sampleDates: samples.map((s) => s.date),
      confidence: conf.level,
      confidenceLabel: conf.label,
      hasForecast: values.length > 0,
    };
  });

  const withForecast = days.filter((d) => d.hasForecast);
  const totalExpected = withForecast.reduce((a, d) => a + d.expectedSales, 0);
  const totalAllowed = withForecast.reduce((a, d) => a + d.allowedHours, 0);
  const planned = days.filter((d) => d.plannedHours !== null);
  const totalPlanned = planned.reduce((a, d) => a + d.plannedHours, 0);
  const daysPlanned = planned.length;

  let planVerdict = null;
  if (daysPlanned === 0) {
    planVerdict = {
      type: "empty",
      headline: "No schedule entered yet",
      detail: `Expected sales of $${totalExpected.toLocaleString("en-US")} support up to about ${totalAllowed} hours. Enter your plan below to compare.`,
    };
  } else {
    const diff = Math.round(totalPlanned - totalAllowed);
    const pct = totalAllowed > 0 ? Math.abs(diff) / totalAllowed : 0;
    if (diff > 0 && pct > 0.03) {
      planVerdict = {
        type: "over",
        headline: `Your schedule is ${diff} hours over budget`,
        detail: `You planned ${Math.round(totalPlanned)} hours, but expected sales of $${totalExpected.toLocaleString("en-US")} only support about ${totalAllowed}. Cutting ${diff} hours keeps you at target.`,
      };
    } else if (diff < 0 && pct > 0.08) {
      planVerdict = {
        type: "under",
        headline: `Your schedule is ${Math.abs(diff)} hours under the ceiling`,
        detail: `You planned ${Math.round(totalPlanned)} hours against a ceiling of about ${totalAllowed}. Staying under it is how you beat target, so this is only a problem if you are short on coverage.`,
      };
    } else {
      planVerdict = {
        type: "ok",
        headline: "Your schedule lines up with expected sales",
        detail: `${Math.round(totalPlanned)} hours planned against about ${totalAllowed} supported by expected sales of $${totalExpected.toLocaleString("en-US")}.`,
      };
    }
  }

  return {
    ok: true,
    store: { code: st.code, name: st.name, region: st.region, grp: st.grp },
    weekStart,
    weekEnd,
    lookbackWeeks: lookback,
    historyFrom: histStart,
    historyTo: histEnd,
    days,
    totals: {
      expectedSales: totalExpected,
      allowedHours: totalAllowed,
      plannedHours: daysPlanned ? Math.round(totalPlanned) : null,
      variance: daysPlanned ? Math.round(totalPlanned - totalAllowed) : null,
      daysPlanned,
      daysWithForecast: withForecast.length,
    },
    planVerdict,
    lastPlanUpdate,
    generatedAt: new Date().toISOString(),
  };
}
===== lib/scale.js =====
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
// on either side, but review cutoffs are not a target: they are the two lines
// in the Operating Partner Program, and they pay real money.
//
//   4.50 and up  base bonus plus $100
//   4.00 - 4.49  base bonus only
//   below 4.00   no bonus at all, base included
//
// Reverse engineered from the manual Tattle Report and confirmed against
// P4 through P7. The lightRed step at 3.50 exists only so the scale still
// reads in four bands like every other metric; it carries no bonus meaning.

export const REVIEW_TIERS = {
  basePlus: 4.5,
  baseOnly: 4.0,
  concern: 3.5,
};

/** Band for a Google/Yelp average. Higher is better. */
export function bandForRating(value) {
  const v = value == null || Number.isNaN(Number(value)) ? null : Number(value);
  if (v === null) return "none";
  if (v >= REVIEW_TIERS.basePlus) return "green";
  if (v >= REVIEW_TIERS.baseOnly) return "lightGreen";
  if (v >= REVIEW_TIERS.concern) return "lightRed";
  return "red";
}

/** What the store earns at this rating. Same cutoffs, stated in money terms. */
export function bonusTierFor(value) {
  const v = value == null || Number.isNaN(Number(value)) ? null : Number(value);
  if (v === null) return null;
  if (v >= REVIEW_TIERS.basePlus) return "base_plus";
  if (v >= REVIEW_TIERS.baseOnly) return "base_only";
  return "none";
}

export const BONUS_TIER_LABEL = {
  base_plus: "Base + $100",
  base_only: "Base only",
  none: "No bonus",
};

/** Legend for the reviews column, same shape bandLegend returns. */
export function reviewLegend() {
  return [
    { band: "green", fill: BANDS.green.fill, text: "4.5 and up" },
    { band: "lightGreen", fill: BANDS.lightGreen.fill, text: "4.0 to 4.49" },
    { band: "lightRed", fill: BANDS.lightRed.fill, text: "3.5 to 3.99" },
    { band: "red", fill: BANDS.red.fill, text: "under 3.5" },
  ];
}
===== lib/throughput.js =====
// TPLH (Transacciones Por Hora de Labor) por tienda, por semana.
//
// A diferencia de SPLH, TPLH no se infla con aumentos de precio ni con dias
// de ticket promedio alto. Mide throughput real por persona, que es una
// comparacion mas justa entre tiendas de distinto ticket promedio.
//
// NOTA IMPORTANTE SOBRE DUPLICACION:
// Los helpers de horas (shiftHours, localDateInTz, exclusionReason, etc.)
// son copia EXACTA de lib/report.js a proposito, para no modificar ese
// archivo. Eso incluye replicar que report.js NO excluye "Event Support - LA"
// (diferencia conocida vs calc.js). Si algun dia cambian las reglas de
// exclusion en report.js, hay que cambiarlas aqui tambien o los numeros
// se van a separar del Week View.

import { supabaseAdmin } from "./supabase.js";
import { getTarget } from "./calc.js";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function addDays(iso, n) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function isoRange(startIso, endIso) {
  const out = [];
  let d = new Date(startIso + "T12:00:00Z");
  const end = new Date(endIso + "T12:00:00Z");
  while (d <= end) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

function dayNameFromISO(iso) {
  const d = new Date(iso + "T12:00:00Z");
  return DAY_NAMES[d.getUTCDay()];
}

export function mondayOf(iso) {
  const d = new Date(iso + "T12:00:00Z");
  const dn = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - (dn - 1));
  return d.toISOString().slice(0, 10);
}

// --- copias exactas de report.js ---

function localDateInTz(utcIso, tz) {
  if (!utcIso) return "";
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date(utcIso));
  } catch (e) {
    return utcIso.slice(0, 10);
  }
}

async function fetchAllRows(buildQuery, label) {
  const PAGE = 1000;
  const all = [];
  let from = 0;
  for (let guard = 0; guard < 200; guard++) {
    const { data, error } = await buildQuery(from, from + PAGE - 1);
    if (error) throw new Error(label + ": " + error.message);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

function normName(name) {
  return (name || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function shiftHours(row) {
  if (row.clock_out) return row.hours || 0;
  if (!row.clock_in) return 0;
  const h = (Date.now() - new Date(row.clock_in).getTime()) / 3600000;
  if (!isFinite(h) || h < 0 || h > 18) return 0;
  return h;
}

async function getExcludedEmployees() {
  const { data, error } = await supabaseAdmin
    .from("excluded_employees")
    .select("name");
  if (error) throw new Error("excluded_employees: " + error.message);
  return new Set((data || []).map((r) => normName(r.name)));
}

function exclusionReason(empName, jobTitle, excludedSet) {
  if (empName && excludedSet.has(normName(empName))) return "Excluded list";
  const jtN = (jobTitle || "").toLowerCase().replace(/\*$/, "").trim();
  if (jtN === "nso trainer") return "NSO Trainer";
  if (jtN === "general manager") return "General Manager";
  return "";
}

async function readLaborHours(startIso, endIso, excludedSet, tzByStore) {
  const fetchStart = addDays(startIso, -1);
  const fetchEnd = addDays(endIso, 1);

  const rows = await fetchAllRows(
    (from, to) =>
      supabaseAdmin
        .from("toast_labor_shifts")
        .select("store_id, hours, job_title, employee_name, clock_in, clock_out")
        .gte("clock_in", fetchStart + "T00:00:00")
        .lte("clock_in", fetchEnd + "T23:59:59")
        .order("toast_entry_id", { ascending: true })
        .range(from, to),
    "labor"
  );

  const hours = {};
  rows.forEach((r) => {
    if (exclusionReason(r.employee_name, r.job_title, excludedSet)) return;
    const code = parseInt(r.store_id);
    const tz = tzByStore[code] || "America/Chicago";
    const day = localDateInTz(r.clock_in, tz);
    if (day < startIso || day > endIso) return;
    hours[code] = (hours[code] || 0) + shiftHours(r);
  });

  return hours;
}

// --- fin de copias ---

export async function buildThroughput(weekStartIso) {
  const weekStart = mondayOf(weekStartIso);
  const weekEnd = addDays(weekStart, 6);
  const days = isoRange(weekStart, weekEnd);

  const { data: storeRows, error: sErr } = await supabaseAdmin
    .from("stores")
    .select("code, name, region, grp, weekday_target, weekend_target, timezone, active")
    .eq("active", true)
    .order("code", { ascending: true });
  if (sErr) throw new Error("stores: " + sErr.message);

  const stores = storeRows || [];
  const tzByStore = {};
  stores.forEach((s) => { tzByStore[s.code] = s.timezone || "America/Chicago"; });

  const excludedSet = await getExcludedEmployees();

  const [hoursByStore, txnRows, salesRows] = await Promise.all([
    readLaborHours(weekStart, weekEnd, excludedSet, tzByStore),
    supabaseAdmin
      .from("daily_transactions")
      .select("store_code, business_date, transaction_count")
      .gte("business_date", weekStart)
      .lte("business_date", weekEnd)
      .then((r) => {
        if (r.error) throw new Error("daily_transactions: " + r.error.message);
        return r.data || [];
      }),
    supabaseAdmin
      .from("daily_sales")
      .select("store_code, business_date, gross_sales")
      .gte("business_date", weekStart)
      .lte("business_date", weekEnd)
      .then((r) => {
        if (r.error) throw new Error("daily_sales: " + r.error.message);
        return r.data || [];
      }),
  ]);

  const txnByStore = {};
  const txnDaysByStore = {};
  txnRows.forEach((r) => {
    if (r.transaction_count === null || r.transaction_count === undefined) return;
    txnByStore[r.store_code] = (txnByStore[r.store_code] || 0) + r.transaction_count;
    if (!txnDaysByStore[r.store_code]) txnDaysByStore[r.store_code] = new Set();
    txnDaysByStore[r.store_code].add(r.business_date);
  });

  const salesByStore = {};
  salesRows.forEach((r) => {
    salesByStore[r.store_code] = (salesByStore[r.store_code] || 0) + (r.gross_sales || 0);
  });

  // Target promedio de la semana, ponderado por dia (5 entre semana, 2 fin).
  function avgTarget(store) {
    let sum = 0;
    days.forEach((d) => { sum += getTarget(store, dayNameFromISO(d)); });
    return sum / days.length;
  }

  const rows = stores.map((st) => {
    const hours = hoursByStore[st.code] || 0;
    const transactions = txnByStore[st.code] || 0;
    const sales = salesByStore[st.code] || 0;
    const daysWithTxn = txnDaysByStore[st.code] ? txnDaysByStore[st.code].size : 0;
    const hasTxnData = daysWithTxn > 0;

    return {
      code: st.code,
      name: st.name,
      region: st.region,
      grp: st.grp,
      hours: Math.round(hours * 10) / 10,
      transactions,
      sales: Math.round(sales),
      tplh: hours > 0 && hasTxnData ? Math.round((transactions / hours) * 100) / 100 : null,
      splh: hours > 0 ? Math.round((sales / hours) * 100) / 100 : null,
      avgTicket: transactions > 0 && hasTxnData ? Math.round((sales / transactions) * 100) / 100 : null,
      target: Math.round(avgTarget(st)),
      daysWithTxn,
      daysInWeek: days.length,
      hasTxnData,
    };
  });

  // Promedio de la empresa solo sobre tiendas con data completa de transacciones.
  const complete = rows.filter((r) => r.hasTxnData && r.tplh !== null);
  const companyTplh = complete.length
    ? Math.round(
        (complete.reduce((a, r) => a + r.transactions, 0) /
          complete.reduce((a, r) => a + r.hours, 0)) * 100
      ) / 100
    : null;

  rows.forEach((r) => {
    r.vsCompanyPct =
      r.tplh !== null && companyTplh
        ? Math.round(((r.tplh - companyTplh) / companyTplh) * 1000) / 10
        : null;
  });

  rows.sort((a, b) => {
    if (a.tplh === null && b.tplh === null) return a.code - b.code;
    if (a.tplh === null) return 1;
    if (b.tplh === null) return -1;
    return b.tplh - a.tplh;
  });

  return {
    ok: true,
    weekStart,
    weekEnd,
    rows,
    companyTplh,
    storesTotal: stores.length,
    storesReporting: complete.length,
    generatedAt: new Date().toISOString(),
  };
}
===== lib/fiscal.js =====
// Calendario fiscal 4-4-5 — portado exacto de SHIFT (ALL_LOC / FISCAL_PERIODS)

// Period 05 used to end on 2026-05-03, which left the three weeks from
// May 4 to May 24 belonging to no period at all. getPeriodForDate returned
// null for any date in that gap, which silently broke PTD totals and the
// review rollup. The end date now meets the start of period 06, and every
// period is a whole number of weeks: 28 days for a 4-week period, 35 for a
// 5-week one.
export const FISCAL_PERIODS = {
  "01": { weeks: [1, 2, 3, 4], start: "2025-12-29", end: "2026-01-25" },
  "02": { weeks: [5, 6, 7, 8], start: "2026-01-26", end: "2026-02-22" },
  "03": { weeks: [9, 10, 11, 12, 13], start: "2026-02-23", end: "2026-03-29" },
  "04": { weeks: [14, 15, 16, 17], start: "2026-03-30", end: "2026-04-26" },
  "05": { weeks: [18, 19, 20, 21], start: "2026-04-27", end: "2026-05-24" },
  "06": { weeks: [22, 23, 24, 25, 26], start: "2026-05-25", end: "2026-06-28" },
  "07": { weeks: [27, 28, 29, 30], start: "2026-06-29", end: "2026-07-26" },
  "08": { weeks: [31, 32, 33, 34], start: "2026-07-27", end: "2026-08-23" },
  "09": { weeks: [35, 36, 37, 38, 39], start: "2026-08-24", end: "2026-09-27" },
  "10": { weeks: [40, 41, 42, 43], start: "2026-09-28", end: "2026-10-25" },
  "11": { weeks: [44, 45, 46, 47], start: "2026-10-26", end: "2026-11-22" },
  "12": { weeks: [48, 49, 50, 51, 52], start: "2026-11-23", end: "2026-12-27" },
};

export function getPeriodForWeek(wk) {
  wk = parseInt(wk);
  for (const p in FISCAL_PERIODS) {
    if (FISCAL_PERIODS[p].weeks.indexOf(wk) >= 0) return p;
  }
  return null;
}

// Numero de semana ISO — portado de getWN() en SHIFT
export function getWeekNumber(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dn = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dn);
  const y1 = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - y1) / 86400000) + 1) / 7);
}

export const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
export const WEEKEND = new Set(["Friday", "Saturday", "Sunday"]);

export function getWeekStart(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dn = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - (dn - 1));
  return d.toISOString().slice(0, 10);
}

export function getPeriodForDate(date = new Date()) {
  const iso = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
    .toISOString().slice(0, 10);
  for (const p in FISCAL_PERIODS) {
    const fp = FISCAL_PERIODS[p];
    if (iso >= fp.start && iso <= fp.end) {
      return { period: p, start: fp.start, end: fp.end };
    }
  }
  return null;
}

/**
 * Every period, oldest first. Used by any view that needs to lay periods out
 * side by side, the way the manual Tattle Report did with P4 through P7.
 */
export function listPeriods() {
  return Object.keys(FISCAL_PERIODS)
    .sort()
    .map((p) => ({ period: p, ...FISCAL_PERIODS[p] }));
}
===== lib/aggregate.js =====
// Agregacion WTD y PTD — portado de la logica en genEmailHTML / renderWeek de SHIFT.

import { getTarget, getPtdTarget } from "./calc.js";

// ── WTD: suma horas/ventas/training de todos los dias cargados de la semana ──
// dailyData: { [dayName]: { [code]: { hours, sales, trainee, trainer } } }
// loadedDays: array de nombres de dia ya cargados, ej ["Monday","Tuesday",...]
export function aggregateWTD(dailyData, loadedDays, store) {
  let wHours = 0, wSales = 0, wOverUnder = 0, wTrain = 0, wTrainee = 0, wTrainer = 0;
  loadedDays.forEach((day) => {
    const d = dailyData[day];
    if (!d) return;
    wHours += d.hours || 0;
    wSales += d.sales || 0;
    const t = getTarget(store, day);
    wOverUnder += (d.sales / t) - d.hours;
    wTrain += (d.train || 0);
    wTrainee += (d.trainee || 0);
    wTrainer += (d.trainer || 0);
  });
  const wSPLH = wHours > 0 ? wSales / wHours : 0;
  const target = loadedDays.length ? getTarget(store, loadedDays[loadedDays.length - 1]) : 0;
  return {
    hours: wHours,
    sales: wSales,
    splh: wSPLH,
    overUnder: wOverUnder,
    ok: wSPLH >= target,
    trainTotal: wTrain,
    trainee: wTrainee,
    trainer: wTrainer,
  };
}

// ── PTD: totales de periodo a la fecha (viene ya agregado de la tabla, o se suma dia a dia) ──
// ptdRaw: { hours, sales } acumulado del periodo fiscal actual para esa tienda
export function ptdMetrics(ptdRaw, store) {
  if (!ptdRaw || (ptdRaw.hours <= 0 && ptdRaw.sales <= 0)) {
    return { hours: 0, sales: 0, splh: 0, ok: null, empty: true };
  }
  const target = getPtdTarget(store);
  const splh = ptdRaw.hours > 0 ? ptdRaw.sales / ptdRaw.hours : 0;
  return { hours: ptdRaw.hours, sales: ptdRaw.sales, splh, ok: splh >= target, empty: false };
}

