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