// TPLH (Transacciones Por Hora de Labor) por tienda, por semana.
//
// A diferencia de SPLH, TPLH no se infla con aumentos de precio ni con dias
// de ticket promedio alto. Mide throughput real por persona, que es una
// comparacion mas justa entre tiendas de distinto ticket promedio.
//
// NOTA SOBRE DUPLICACION:
// Los helpers de horas (shiftHours, localDateInTz, etc.) siguen siendo copia
// EXACTA de lib/report.js a proposito, para no modificar ese archivo. La
// regla de exclusion (exclusionReason) YA NO esta duplicada aqui: se importa
// de lib/calc.js, que es ahora la unica definicion de "que horas cuentan
// como facturables" en toda la app (antes habia tres copias divergentes -
// esta, report.js, y una version distinta en calc.js que si excluia "Event
// Support - LA"). report.js y throughput.js siguen leyendo el mismo
// resultado, asi que los numeros del Week View no cambian.

import { supabaseAdmin } from "./supabase.js";
import { getTarget, exclusionReason } from "./calc.js";

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

// opts.singleDay (optional, ISO date): restricts the whole computation to
// one calendar day instead of the Mon-Sun week - added for Command
// Center's SPLH/TPLH "today" goal chips, which need a single day's actual
// (never a week-to-date figure - a WTD average would mix weekday and
// weekend days against a target that only applies to one day type, the
// same problem the day/wtd split has for SPLH). Every existing caller
// omits opts and gets the original weekly behavior unchanged; nothing
// about the per-store transactions/hours formula below changes either
// way, only which days feed it.
export async function buildThroughput(weekStartIso, opts = {}) {
  const singleDay = opts.singleDay || null;
  const weekStart = singleDay || mondayOf(weekStartIso);
  const weekEnd = singleDay || addDays(weekStart, 6);
  const days = singleDay ? [singleDay] : isoRange(weekStart, weekEnd);

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