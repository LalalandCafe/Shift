// Arma el reporte diario completo (Dia + WTD + PTD) por tienda, leyendo de Supabase.
// Replica la estructura del correo/tabla de SHIFT.

import { supabaseAdmin } from "./supabase.js";
import { getTarget, getPtdTarget, anomalyFlags } from "./calc.js";
import { getWeekStart, getPeriodForDate, getWeekNumber } from "./fiscal.js";
import { GROUPS } from "./ui.js";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

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

// Fecha local (YYYY-MM-DD) de un instante UTC en la zona de la tienda.
// Necesario porque un turno de 5 PM en California es el dia siguiente en UTC.
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

// Horas de un turno. Si sigue abierto, cuenta el tiempo transcurrido,
// porque Toast no reporta horas hasta el clock-out. El tope de 18h evita
// que un turno viejo sin cerrar (error de data) infle el total.
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

// onlyStore es opcional. Sin el, el comportamiento es identico al de antes.
async function readLabor(startIso, endIso, excludedSet, tzByStore, onlyStore) {
  // La ventana UTC se ensancha un dia de cada lado para no perder turnos
  // que pertenecen al rango local pero caen fuera en UTC. El filtro fino
  // se hace despues, por zona horaria de cada tienda.
  const fetchStart = addDays(startIso, -1);
  const fetchEnd = addDays(endIso, 1);

  const rows = await fetchAllRows(
    (from, to) => {
      let q = supabaseAdmin
        .from("toast_labor_shifts")
        .select("store_id, hours, job_title, employee_name, clock_in, clock_out")
        .gte("clock_in", fetchStart + "T00:00:00")
        .lte("clock_in", fetchEnd + "T23:59:59");
      if (onlyStore) q = q.eq("store_id", String(onlyStore));
      return q.order("toast_entry_id", { ascending: true }).range(from, to);
    },
    "labor"
  );

  const hours = {}, trainee = {}, trainer = {};
  const perDay = {};
  let counted = 0, openShifts = 0;

  rows.forEach((r) => {
    if (exclusionReason(r.employee_name, r.job_title, excludedSet)) return;

    const code = parseInt(r.store_id);
    const tz = tzByStore[code] || "America/Chicago";
    const day = localDateInTz(r.clock_in, tz);
    if (day < startIso || day > endIso) return;

    const h = shiftHours(r);
    if (!r.clock_out && h > 0) openShifts++;
    counted++;

    hours[code] = (hours[code] || 0) + h;
    if (!perDay[code]) perDay[code] = {};
    perDay[code][day] = (perDay[code][day] || 0) + h;

    const jt = (r.job_title || "").replace(/\*$/, "").trim().toLowerCase();
    if (jt === "trainee") trainee[code] = (trainee[code] || 0) + h;
    if (jt === "certified trainer") trainer[code] = (trainer[code] || 0) + h;
  });

  return { hours, trainee, trainer, perDay, rowCount: counted, fetched: rows.length, openShifts };
}

// onlyStore es opcional. Sin el, el comportamiento es identico al de antes.
async function sumSalesByStore(startIso, endIso, onlyStore) {
  const rows = await fetchAllRows(
    (from, to) => {
      let q = supabaseAdmin
        .from("daily_sales")
        .select("store_code, gross_sales, business_date")
        .gte("business_date", startIso)
        .lte("business_date", endIso);
      if (onlyStore) q = q.eq("store_code", Number(onlyStore));
      return q
        .order("store_code", { ascending: true })
        .order("business_date", { ascending: true })
        .range(from, to);
    },
    "sales"
  );
  const map = {};
  const perDay = {};
  rows.forEach((r) => {
    map[r.store_code] = (map[r.store_code] || 0) + (r.gross_sales || 0);
    if (!perDay[r.store_code]) perDay[r.store_code] = {};
    perDay[r.store_code][r.business_date] = (perDay[r.store_code][r.business_date] || 0) + (r.gross_sales || 0);
  });
  return { map, perDay };
}

// Ajustes manuales. Viven en tabla aparte porque el sync sobrescribe
// toast_labor_shifts, y un ajuste guardado ahi se borraria en la
// siguiente corrida. Se aplican al leer, no al escribir.
async function readAdjustments(startIso, endIso) {
  const { data, error } = await supabaseAdmin
    .from("manual_adjustments")
    .select("store_code, business_date, field, delta")
    .gte("business_date", startIso)
    .lte("business_date", endIso);
  if (error) throw new Error("adjustments: " + error.message);

  // map[code][date][field] = delta acumulado
  const map = {};
  let count = 0;
  (data || []).forEach((a) => {
    const code = a.store_code;
    const date = a.business_date;
    if (!map[code]) map[code] = {};
    if (!map[code][date]) map[code][date] = {};
    map[code][date][a.field] = (map[code][date][a.field] || 0) + Number(a.delta);
    count++;
  });
  return { map, count };
}

function adjTotal(adjMap, code, field) {
  const byDate = adjMap[code];
  if (!byDate) return 0;
  let sum = 0;
  Object.keys(byDate).forEach((d) => { sum += byDate[d][field] || 0; });
  return sum;
}

function adjForDate(adjMap, code, date, field) {
  const byDate = adjMap[code];
  if (!byDate || !byDate[date]) return 0;
  return byDate[date][field] || 0;
}

function hasAdj(adjMap, code) {
  return !!adjMap[code] && Object.keys(adjMap[code]).length > 0;
}

/**
 * Google and Yelp averages per store for a date range.
 *
 * The automated version of the manual Tattle Report: the pivot that used to
 * be built by hand in Excel, run in Postgres instead. Validated against
 * P4 through P7, where 33 of 34 stores matched to the cent.
 *
 * The parseInt matters. tattle_reviews.store_id is text ("10019") because
 * that is how Tattle sends externalId, while store.code is an integer.
 * Without it the join silently matches nothing and every store reads as
 * having no reviews, with no error to say why.
 */
// Returns { map, failed }. On an RPC failure, map is {} (every store reads as
// having no reviews, same as before) but failed is true, so callers can tell
// "genuinely no reviews" apart from "the rollup is broken and we don't know" -
// those used to look identical outside a server log nobody watches.
async function readReviews(startIso, endIso) {
  const { data, error } = await supabaseAdmin.rpc("tattle_reviews_rollup", {
    p_start: startIso,
    p_end: endIso,
  });

  if (error) {
    console.warn("readReviews failed, continuing without reviews:", error.message);
    return { map: {}, failed: true };
  }

  const map = {};
  (data || []).forEach((r) => {
    const code = parseInt(r.out_store_id, 10);
    if (!Number.isFinite(code)) return;
    const count = Number(r.out_review_count) || 0;
    const answered = count - (Number(r.out_unanswered) || 0);
    map[code] = {
      rating: r.out_avg_rating === null ? null : Number(r.out_avg_rating),
      count,
      google: Number(r.out_google) || 0,
      yelp: Number(r.out_yelp) || 0,
      oneStar: Number(r.out_one_star) || 0,
      fiveStar: Number(r.out_five_star) || 0,
      unanswered: Number(r.out_unanswered) || 0,
      responseRate: count > 0 ? Math.round((answered / count) * 1000) / 10 : null,
      tier: r.out_bonus_tier || null,
    };
  });
  return { map, failed: false };
}

// Momento real del ultimo sync para esta fecha. Distinto de generatedAt,
// que es cuando se armo la respuesta (o sea, cuando cargo la pagina).
async function getLastSyncTime(isoDate) {
  const { data, error } = await supabaseAdmin
    .from("daily_sales")
    .select("synced_at")
    .eq("business_date", isoDate)
    .order("synced_at", { ascending: false })
    .limit(1);
  if (error || !data || !data.length) return null;
  return data[0].synced_at;
}

// Region taxonomy lives once, in lib/ui.js, and is imported here as GROUPS.
// This used to be a second, hand-copied object (GROUP_STRUCTURE) that
// happened to match lib/ui.js's GROUPS but had nothing enforcing that: a new
// store in a new or renamed region could update one and not the other, and
// silently vanish from either the Week View/Leaderboard or the emailed/Excel
// report depending on which copy got missed.
export function groupStoresForEmail(rows) {
  const groups = [];
  for (const grp of Object.keys(GROUPS)) {
    const regions = GROUPS[grp].map((rDef) => ({
      label: rDef.label,
      stores: rows.filter((r) => r.grp === grp && rDef.regions.includes(r.region)),
    })).filter((r) => r.stores.length > 0);
    if (regions.length) groups.push({ group: grp, regions });
  }
  return groups;
}

export async function buildDailyReport(isoDate) {
  const refDate = new Date(isoDate + "T12:00:00Z");
  const dayName = dayNameFromISO(isoDate);
  const weekStart = getWeekStart(refDate);
  const weekNum = getWeekNumber(refDate);
  const periodInfo = getPeriodForDate(refDate);

  const { data: stores, error: sErr } = await supabaseAdmin
    .from("stores")
    .select("code, name, region, grp, weekday_target, weekend_target, ptd_target, timezone")
    .eq("active", true)
    .order("code");
  if (sErr) throw new Error("stores: " + sErr.message);

  const tzByStore = {};
  stores.forEach((s) => { tzByStore[s.code] = s.timezone || "America/Chicago"; });

  const todayCentral = localDateInTz(new Date().toISOString(), "America/Chicago");
  const isLive = isoDate === todayCentral;
  const lastSyncAt = await getLastSyncTime(isoDate);

  const excludedSet = await getExcludedEmployees();

  const dayLabor = await readLabor(isoDate, isoDate, excludedSet, tzByStore);
  const { map: daySales } = await sumSalesByStore(isoDate, isoDate);
  const dayAdj = await readAdjustments(isoDate, isoDate);

  const wtdLabor = await readLabor(weekStart, isoDate, excludedSet, tzByStore);
  const { map: wtdSales, perDay: wtdSalesPerDay } = await sumSalesByStore(weekStart, isoDate);
  const wtdAdj = await readAdjustments(weekStart, isoDate);

  // Both windows up front so the leaderboard can switch between week and
  // period without another round trip.
  const reviewPeriodStart = periodInfo ? periodInfo.start : weekStart;
  const [weekReviewsResult, periodReviewsResult] = await Promise.all([
    readReviews(weekStart, isoDate),
    readReviews(reviewPeriodStart, isoDate),
  ]);
  const weekReviews = weekReviewsResult.map;
  const periodReviews = periodReviewsResult.map;
  const reviewsUnavailable = weekReviewsResult.failed || periodReviewsResult.failed;

  const dayHours = dayLabor.hours;
  const wtdHours = wtdLabor.hours;
  const weekDays = isoRange(weekStart, isoDate);

  let ptdBase = {};
  if (periodInfo) {
    const { data: ptdRows, error: pErr } = await supabaseAdmin
      .from("ptd_totals")
      .select("store_code, gross_sales, hours, source")
      .eq("period", periodInfo.period);
    if (pErr) throw new Error("ptd: " + pErr.message);
    (ptdRows || []).forEach((r) => {
      ptdBase[r.store_code] = { sales: r.gross_sales || 0, hours: r.hours || 0 };
    });
  }

  const FILE_COVERS_THROUGH = "2026-07-19";
  let extraHours = {}, extraSales = {};
  let extraStartUsed = null;
  let ptdAdj = { map: {}, count: 0 };
  if (periodInfo) {
    const hasSeed = Object.keys(ptdBase).length > 0;
    let extraStart = periodInfo.start;
    if (hasSeed && FILE_COVERS_THROUGH >= periodInfo.start) {
      extraStart = addDays(FILE_COVERS_THROUGH, 1);
    }
    extraStartUsed = extraStart;
    if (extraStart <= isoDate) {
      const extraLabor = await readLabor(extraStart, isoDate, excludedSet, tzByStore);
      extraHours = extraLabor.hours;
      const extraSalesResult = await sumSalesByStore(extraStart, isoDate);
      extraSales = extraSalesResult.map;
      ptdAdj = await readAdjustments(extraStart, isoDate);
    }
  }

  const rows = stores.map((st) => {
    const code = st.code;
    const store = {
      weekday_target: st.weekday_target,
      weekend_target: st.weekend_target,
      ptd_target: st.ptd_target,
      grp: st.grp,
      region: st.region,
    };

    // Dia, con ajustes
    const dH = Math.max(0, (dayHours[code] || 0) + adjTotal(dayAdj.map, code, "hours"));
    const dS = Math.max(0, (daySales[code] || 0) + adjTotal(dayAdj.map, code, "sales"));
    const dTarget = getTarget(store, dayName);
    const dSplh = dH > 0 ? dS / dH : 0;
    const dOverUnder = dTarget > 0 ? (dS / dTarget) - dH : 0;
    const dFlags = anomalyFlags(store, dS, dH, dayName);

    // WTD, con ajustes
    const wH = Math.max(0, (wtdHours[code] || 0) + adjTotal(wtdAdj.map, code, "hours"));
    const wS = Math.max(0, (wtdSales[code] || 0) + adjTotal(wtdAdj.map, code, "sales"));
    const wSplh = wH > 0 ? wS / wH : 0;

    // Over/Under dia por dia, con el target de cada dia y sus ajustes
    let wOverUnder = 0;
    const perDayHours = (wtdLabor.perDay[code]) || {};
    const perDaySales = (wtdSalesPerDay[code]) || {};
    weekDays.forEach((iso) => {
      const t = getTarget(store, dayNameFromISO(iso));
      const h = Math.max(0, (perDayHours[iso] || 0) + adjForDate(wtdAdj.map, code, iso, "hours"));
      const s = Math.max(0, (perDaySales[iso] || 0) + adjForDate(wtdAdj.map, code, iso, "sales"));
      if (t > 0) wOverUnder += (s / t) - h;
    });

    const wTrainee = Math.max(0, (wtdLabor.trainee[code] || 0) + adjTotal(wtdAdj.map, code, "trainee"));
    const wTrainer = Math.max(0, (wtdLabor.trainer[code] || 0) + adjTotal(wtdAdj.map, code, "trainer"));

    // PTD, con ajustes
    const base = ptdBase[code] || { sales: 0, hours: 0 };
    const pH = Math.max(0, base.hours + (extraHours[code] || 0) + adjTotal(ptdAdj.map, code, "hours"));
    const pS = Math.max(0, base.sales + (extraSales[code] || 0) + adjTotal(ptdAdj.map, code, "sales"));
    const pTarget = getPtdTarget(store);
    const pSplh = pH > 0 ? pS / pH : 0;

    return {
      code,
      name: st.name,
      region: st.region,
      grp: st.grp,
      adjusted: {
        day: hasAdj(dayAdj.map, code),
        wtd: hasAdj(wtdAdj.map, code),
      },
      reviews: {
        week: weekReviews[code] || null,
        period: periodReviews[code] || null,
      },
      day: {
        hours: Math.round(dH),
        sales: Math.round(dS * 100) / 100,
        target: dTarget,
        splh: Math.round(dSplh),
        overUnder: Math.round(dOverUnder),
        ok: dSplh >= dTarget,
        flags: dFlags,
      },
      wtd: {
        hours: Math.round(wH),
        sales: Math.round(wS * 100) / 100,
        splh: Math.round(wSplh),
        overUnder: Math.round(wOverUnder),
        trainTotal: Math.round(wTrainee + wTrainer),
        trainee: Math.round(wTrainee),
        trainer: Math.round(wTrainer),
        ok: wSplh >= dTarget,
      },
      ptd: {
        hours: Math.round(pH),
        sales: Math.round(pS * 100) / 100,
        target: pTarget,
        splh: Math.round(pSplh),
        ok: pSplh >= pTarget,
        empty: pH <= 0 && pS <= 0,
      },
    };
  });

  return {
    ok: true,
    date: isoDate,
    dayName,
    weekNum,
    weekStart,
    period: periodInfo ? periodInfo.period : null,
    isLive,
    generatedAt: new Date().toISOString(),
    lastSyncAt,
    reviewsUnavailable,
    rows,
    debug: {
      wtdLaborRows: wtdLabor.rowCount,
      dayLaborRows: dayLabor.rowCount,
      openShiftsToday: dayLabor.openShifts,
      excludedEmployeeCount: excludedSet.size,
      ptdExtraStart: extraStartUsed,
      adjustmentsWtd: wtdAdj.count,
      adjustmentsPtd: ptdAdj.count,
    },
  };
}

// ─────────────────────────────────────────────────────────────
// Tendencia por tienda: N semanas x 7 dias, para ver si el problema
// es un dia especifico o una semana entera.
// Reusa los mismos helpers que buildDailyReport, asi que los numeros
// son identicos a los del Week View.
// ─────────────────────────────────────────────────────────────

const WEEKDAY_ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const SHORT_DAY = {
  Monday: "Mon", Tuesday: "Tue", Wednesday: "Wed", Thursday: "Thu",
  Friday: "Fri", Saturday: "Sat", Sunday: "Sun",
};

// Un dia solo cuenta como problema si falla por un margen material.
// Sin esto, un dia al 99% del target se reporta igual que uno al 70%,
// y el GM deja de confiar en la herramienta.
const MATERIAL_MISS = 0.97;
const TRIVIAL_OVERAGE = 0.02;

function buildVerdict(byWeekday) {
  const withData = byWeekday.filter((d) => d.hasData);
  if (!withData.length) {
    return {
      type: "nodata",
      headline: "Not enough data yet",
      detail: "Once a few weeks are synced, patterns will show up here.",
      days: [],
    };
  }

  const totalHours = withData.reduce((s, d) => s + d.hours, 0);
  const totalOver = withData.reduce((s, d) => s + (d.overUnder < 0 ? -d.overUnder : 0), 0);
  const overShare = totalHours > 0 ? totalOver / totalHours : 0;

  // Si el exceso total es trivial, la tienda esta en target. Punto.
  if (overShare <= TRIVIAL_OVERAGE) {
    return {
      type: "clean",
      headline: "Running at target",
      detail: totalOver >= 1
        ? `Only ${Math.round(totalOver)} hours over budget across ${Math.round(totalHours).toLocaleString("en-US")} hours worked. The staffing pattern is working.`
        : `No meaningful overage across ${Math.round(totalHours).toLocaleString("en-US")} hours worked. The staffing pattern is working.`,
      days: [],
    };
  }

  const material = withData
    .filter((d) => d.ratio !== null && d.ratio < MATERIAL_MISS)
    .sort((a, b) => a.ratio - b.ratio);

  if (!material.length) {
    return {
      type: "clean",
      headline: "No single day stands out",
      detail: `The week runs ${Math.round(totalOver)} hours over budget, but it is spread evenly rather than concentrated on one day.`,
      days: [],
    };
  }

  const materialOver = material.reduce((s, d) => s + (d.overUnder < 0 ? -d.overUnder : 0), 0);
  const share = totalOver > 0 ? Math.round((materialOver / totalOver) * 100) : 0;

  const names = material.slice(0, 3).map((d) => SHORT_DAY[d.dayName]);
  const listed = names.length === 1
    ? names[0]
    : names.slice(0, -1).join(", ") + " and " + names[names.length - 1];

  if (material.length >= withData.length - 1) {
    return {
      type: "all",
      headline: "The whole week is running over budget",
      detail: `This is not a single-day problem. Across the week you are ${Math.round(totalOver)} hours over what the target allows.`,
      days: material.map((d) => d.dayName),
    };
  }

  const worst = material[0];
  return {
    type: "specific",
    headline: `${listed} ${material.length === 1 ? "is" : "are"} costing you the most`,
    detail: `${SHORT_DAY[worst.dayName]} runs at $${worst.splh} against a $${worst.target} target. Together these days account for ${Math.round(materialOver)} of the ${Math.round(totalOver)} hours over budget${share ? ` (${share}%)` : ""}.`,
    days: material.map((d) => d.dayName),
  };
}

export async function buildStoreTrend(storeCode, endIso, weeks = 4) {
  const code = Number(storeCode);
  const nWeeks = Math.max(1, Math.min(12, Number(weeks) || 4));

  const { data: storeRows, error: sErr } = await supabaseAdmin
    .from("stores")
    .select("code, name, region, grp, weekday_target, weekend_target, ptd_target, timezone")
    .eq("code", code)
    .limit(1);
  if (sErr) throw new Error("stores: " + sErr.message);
  if (!storeRows || !storeRows.length) throw new Error("Tienda " + code + " no encontrada");

  const st = storeRows[0];
  const store = {
    weekday_target: st.weekday_target,
    weekend_target: st.weekend_target,
    ptd_target: st.ptd_target,
    grp: st.grp,
    region: st.region,
  };
  const tzByStore = { [code]: st.timezone || "America/Chicago" };

  const endWeekStart = getWeekStart(new Date(endIso + "T12:00:00Z"));
  const rangeStart = addDays(endWeekStart, -7 * (nWeeks - 1));
  const rangeEnd = addDays(endWeekStart, 6);

  const excludedSet = await getExcludedEmployees();

  // Una sola lectura para todo el rango, filtrada a esta tienda
  const labor = await readLabor(rangeStart, rangeEnd, excludedSet, tzByStore, code);
  const { perDay: salesPerDay } = await sumSalesByStore(rangeStart, rangeEnd, code);

  const hoursByDate = labor.perDay[code] || {};
  const salesByDate = salesPerDay[code] || {};

  const todayCentral = localDateInTz(new Date().toISOString(), "America/Chicago");

  // Semanas, de la mas vieja a la mas reciente
  const weekList = [];
  for (let w = 0; w < nWeeks; w++) {
    const wStart = addDays(rangeStart, w * 7);
    const wEnd = addDays(wStart, 6);
    const days = isoRange(wStart, wEnd).map((iso) => {
      const dayName = dayNameFromISO(iso);
      const target = getTarget(store, dayName);
      const h = hoursByDate[iso] || 0;
      const s = salesByDate[iso] || 0;
      const hasData = h > 0 || s > 0;
      const splh = h > 0 ? s / h : 0;
      return {
        date: iso,
        dayName,
        shortDay: SHORT_DAY[dayName],
        hours: Math.round(h),
        sales: Math.round(s * 100) / 100,
        target,
        splh: Math.round(splh),
        ratio: target > 0 && hasData ? splh / target : null,
        overUnder: target > 0 ? Math.round(s / target - h) : 0,
        ok: hasData && splh >= target,
        hasData,
        isFuture: iso > todayCentral,
      };
    });

    const tH = days.reduce((a, d) => a + d.hours, 0);
    const tS = days.reduce((a, d) => a + d.sales, 0);
    const tOU = days.reduce((a, d) => a + d.overUnder, 0);
    const daysWithData = days.filter((d) => d.hasData).length;

    weekList.push({
      weekNum: getWeekNumber(new Date(wStart + "T12:00:00Z")),
      weekStart: wStart,
      weekEnd: wEnd,
      days,
      daysWithData,
      partial: daysWithData > 0 && daysWithData < 4,
      totals: {
        hours: tH,
        sales: Math.round(tS * 100) / 100,
        splh: tH > 0 ? Math.round(tS / tH) : 0,
        overUnder: tOU,
      },
    });
  }

  // Agregado por dia de la semana, que es donde se ve el patron
  const byWeekday = WEEKDAY_ORDER.map((dayName) => {
    let h = 0, s = 0, ou = 0, n = 0;
    let best = null;
    weekList.forEach((w) => {
      const d = w.days.find((x) => x.dayName === dayName);
      if (!d || !d.hasData) return;
      h += d.hours;
      s += d.sales;
      ou += d.overUnder;
      n++;
      if (!best || d.splh > best.splh) best = { date: d.date, splh: d.splh, weekNum: w.weekNum };
    });
    const target = getTarget(store, dayName);
    const splh = h > 0 ? s / h : 0;
    return {
      dayName,
      shortDay: SHORT_DAY[dayName],
      hours: h,
      sales: Math.round(s * 100) / 100,
      splh: Math.round(splh),
      target,
      ratio: h > 0 ? splh / target : null,
      overUnder: Math.round(ou),
      ok: h > 0 && splh >= target,
      hasData: n > 0,
      weeksWithData: n,
      best,
    };
  });

  const verdict = buildVerdict(byWeekday);

  const allH = weekList.reduce((a, w) => a + w.totals.hours, 0);
  const allS = weekList.reduce((a, w) => a + w.totals.sales, 0);

  return {
    ok: true,
    store: {
      code: st.code,
      name: st.name,
      region: st.region,
      grp: st.grp,
      weekdayTarget: st.weekday_target,
      weekendTarget: st.weekend_target,
    },
    endDate: endIso,
    weeks: nWeeks,
    rangeStart,
    rangeEnd,
    weekList,
    byWeekday,
    verdict,
    overall: {
      hours: allH,
      sales: Math.round(allS * 100) / 100,
      splh: allH > 0 ? Math.round(allS / allH) : 0,
      weeksWithData: weekList.filter((w) => w.daysWithData > 0).length,
    },
    generatedAt: new Date().toISOString(),
  };
}
// ─────────────────────────────────────────────────────────────
// Tiempo de ticket por tienda: mismo esquema que buildStoreTrend
// pero con datos de kitchen_metrics en vez de labor/ventas.
// ─────────────────────────────────────────────────────────────

export async function buildKitchenTrend(storeCode, endIso, weeks = 4) {
  const code = Number(storeCode);
  const nWeeks = Math.max(1, Math.min(12, Number(weeks) || 4));

  const { data: storeRows, error: sErr } = await supabaseAdmin
    .from("stores")
    .select("code, name, region, grp")
    .eq("code", code)
    .limit(1);
  if (sErr) throw new Error("stores: " + sErr.message);
  if (!storeRows || !storeRows.length) throw new Error("Tienda " + code + " no encontrada");
  const st = storeRows[0];

  const endWeekStart = getWeekStart(new Date(endIso + "T12:00:00Z"));
  const rangeStart = addDays(endWeekStart, -7 * (nWeeks - 1));
  const rangeEnd = addDays(endWeekStart, 6);

  const { data: rows, error: kErr } = await supabaseAdmin
    .from("kitchen_metrics")
    .select("business_date, item_count, median_minutes, avg_minutes, p90_minutes, stuck_count")
    .eq("store_code", code)
    .gte("business_date", rangeStart)
    .lte("business_date", rangeEnd);
  if (kErr) throw new Error("kitchen_metrics: " + kErr.message);

  const byDate = {};
  (rows || []).forEach((r) => { byDate[r.business_date] = r; });

  const todayCentral = localDateInTz(new Date().toISOString(), "America/Chicago");

  const weekList = [];
  for (let w = 0; w < nWeeks; w++) {
    const wStart = addDays(rangeStart, w * 7);
    const wEnd = addDays(wStart, 6);
    const days = isoRange(wStart, wEnd).map((iso) => {
      const r = byDate[iso];
      const hasData = !!(r && r.item_count > 0);
      return {
        date: iso,
        dayName: dayNameFromISO(iso),
        shortDay: SHORT_DAY[dayNameFromISO(iso)],
        hasData,
        isFuture: iso > todayCentral,
        itemCount: hasData ? r.item_count : 0,
        medianMin: hasData ? r.median_minutes : null,
        avgMin: hasData ? r.avg_minutes : null,
        p90Min: hasData ? r.p90_minutes : null,
        stuckCount: hasData ? r.stuck_count : 0,
      };
    });

    const withData = days.filter((d) => d.hasData);
    const wItems = withData.reduce((a, d) => a + d.itemCount, 0);
    const wStuck = withData.reduce((a, d) => a + d.stuckCount, 0);
    const weightedMedian = withData.length
      ? withData.reduce((a, d) => a + d.medianMin * d.itemCount, 0) / (wItems || 1)
      : null;

    weekList.push({
      weekNum: getWeekNumber(new Date(wStart + "T12:00:00Z")),
      weekStart: wStart,
      weekEnd: wEnd,
      days,
      daysWithData: withData.length,
      partial: withData.length > 0 && withData.length < 4,
      totals: {
        itemCount: wItems,
        medianMin: weightedMedian !== null ? Math.round(weightedMedian * 10) / 10 : null,
        stuckCount: wStuck,
      },
    });
  }

  // Promedio por dia de la semana (mismo patron que el heatmap de SPLH)
  const byWeekday = WEEKDAY_ORDER.map((dayName) => {
    let items = 0, stuck = 0, weightedSum = 0, n = 0;
    weekList.forEach((w) => {
      const d = w.days.find((x) => x.dayName === dayName);
      if (!d || !d.hasData) return;
      items += d.itemCount;
      stuck += d.stuckCount;
      weightedSum += d.medianMin * d.itemCount;
      n++;
    });
    const median = items > 0 ? weightedSum / items : null;
    return {
      dayName,
      shortDay: SHORT_DAY[dayName],
      hasData: n > 0,
      weeksWithData: n,
      itemCount: items,
      medianMin: median !== null ? Math.round(median * 10) / 10 : null,
      stuckCount: stuck,
    };
  });

  const allWithData = byWeekday.filter((d) => d.hasData);
  const overallMedian = allWithData.length
    ? allWithData.reduce((a, d) => a + (d.medianMin || 0) * d.itemCount, 0) /
      (allWithData.reduce((a, d) => a + d.itemCount, 0) || 1)
    : null;

  return {
    ok: true,
    store: { code: st.code, name: st.name, region: st.region, grp: st.grp },
    endDate: endIso,
    weeks: nWeeks,
    rangeStart,
    rangeEnd,
    weekList,
    byWeekday,
    overall: {
      medianMin: overallMedian !== null ? Math.round(overallMedian * 10) / 10 : null,
      itemCount: allWithData.reduce((a, d) => a + d.itemCount, 0),
      stuckCount: allWithData.reduce((a, d) => a + d.stuckCount, 0),
      weeksWithData: weekList.filter((w) => w.daysWithData > 0).length,
    },
    generatedAt: new Date().toISOString(),
  };
}
// ─────────────────────────────────────────────────────────────
// Tiempo de ticket de TODAS las tiendas para un periodo, con la
// evaluacion de servicio. Se usa en el leaderboard y el dashboard.
// ─────────────────────────────────────────────────────────────

// Abajo de este tiempo un cliente no percibe diferencia, asi que
// nunca se marca por lento aunque el ratio sea alto.
const NOTICEABLE_FLOOR_MIN = 4.0;
// Multiplos de la mediana de la empresa
const WATCH_RATIO = 1.5;
const FLAG_RATIO = 2.0;
// Sin este volumen el dato no es representativo
const MIN_ITEMS_TO_JUDGE = 200;
// Arriba de esto, el equipo no esta cerrando tickets y la mediana no sirve
const STUCK_RATE_UNRELIABLE = 0.05;

export async function buildKitchenWeek(isoDate) {
  const weekStart = getWeekStart(new Date(isoDate + "T12:00:00Z"));

  const { data: stores, error: sErr } = await supabaseAdmin
    .from("stores")
    .select("code, name, region, grp")
    .eq("active", true)
    .order("code");
  if (sErr) throw new Error("stores: " + sErr.message);

  const rows = await fetchAllRows(
    (from, to) =>
      supabaseAdmin
        .from("kitchen_metrics")
        .select("store_code, business_date, item_count, median_minutes, stuck_count")
        .gte("business_date", weekStart)
        .lte("business_date", isoDate)
        .order("store_code", { ascending: true })
        .range(from, to),
    "kitchen_week"
  );

  // Agrega por tienda, ponderando la mediana por volumen de items
  const agg = {};
  (rows || []).forEach((r) => {
    const c = r.store_code;
    if (!agg[c]) agg[c] = { items: 0, weighted: 0, stuck: 0, days: 0 };
    if (r.item_count > 0 && r.median_minutes !== null) {
      agg[c].items += r.item_count;
      agg[c].weighted += r.median_minutes * r.item_count;
      agg[c].days++;
    }
    agg[c].stuck += r.stuck_count || 0;
  });

  const withMedian = [];
  const byStore = {};
  stores.forEach((st) => {
    const a = agg[st.code];
    const items = a ? a.items : 0;
    const median = items > 0 ? a.weighted / items : null;
    const stuck = a ? a.stuck : 0;
    const stuckRate = items > 0 ? stuck / (items + stuck) : 0;

    const entry = {
      code: st.code,
      name: st.name,
      region: st.region,
      grp: st.grp,
      itemCount: items,
      medianMin: median !== null ? Math.round(median * 10) / 10 : null,
      stuckCount: stuck,
      stuckRate: Math.round(stuckRate * 1000) / 10,
      daysWithData: a ? a.days : 0,
    };
    byStore[st.code] = entry;
    if (median !== null && items >= MIN_ITEMS_TO_JUDGE) withMedian.push(median);
  });

  // Mediana de la empresa como referencia
  withMedian.sort((a, b) => a - b);
  const companyMedian = withMedian.length
    ? withMedian[Math.floor(withMedian.length / 2)]
    : null;

  // Evalua cada tienda contra la referencia
  Object.values(byStore).forEach((s) => {
    s.ratio = null;
    s.service = "unknown";
    s.serviceNote = null;

    if (s.medianMin === null || s.itemCount < MIN_ITEMS_TO_JUDGE) {
      s.serviceNote = s.medianMin === null ? "No ticket data" : "Not enough volume to judge";
      return;
    }

    if (s.stuckRate / 100 > STUCK_RATE_UNRELIABLE) {
      s.service = "unreliable";
      s.serviceNote = `${s.stuckRate}% of tickets never closed on the KDS, so this time is not reliable`;
      return;
    }

    if (companyMedian === null || companyMedian <= 0) {
      s.service = "ok";
      return;
    }

    s.ratio = Math.round((s.medianMin / companyMedian) * 100) / 100;

    // El piso manda: abajo de esto no se marca por mas alto que sea el ratio
    if (s.medianMin < NOTICEABLE_FLOOR_MIN) {
      s.service = "ok";
      return;
    }

    if (s.ratio >= FLAG_RATIO) {
      s.service = "flagged";
      s.serviceNote = `${s.medianMin} min median, ${s.ratio}x the company median of ${Math.round(companyMedian * 10) / 10} min`;
    } else if (s.ratio >= WATCH_RATIO) {
      s.service = "watch";
      s.serviceNote = `${s.medianMin} min median, ${s.ratio}x the company median`;
    } else {
      s.service = "ok";
    }
  });

  return {
    ok: true,
    date: isoDate,
    weekStart,
    companyMedianMin: companyMedian !== null ? Math.round(companyMedian * 10) / 10 : null,
    storesJudged: withMedian.length,
    thresholds: {
      noticeableFloorMin: NOTICEABLE_FLOOR_MIN,
      watchRatio: WATCH_RATIO,
      flagRatio: FLAG_RATIO,
      minItems: MIN_ITEMS_TO_JUDGE,
    },
    stores: Object.values(byStore).sort((a, b) => a.code - b.code),
    generatedAt: new Date().toISOString(),
  };
}