// Arma el reporte diario completo (Dia + WTD + PTD) por tienda, leyendo de Supabase.
// Replica la estructura del correo/tabla de SHIFT.

import { supabaseAdmin } from "./supabase.js";
import { getTarget, getPtdTarget, anomalyFlags } from "./calc.js";
import { getWeekStart, getPeriodForDate, getWeekNumber } from "./fiscal.js";

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

async function readLabor(startIso, endIso, excludedSet, tzByStore) {
  // La ventana UTC se ensancha un dia de cada lado para no perder turnos
  // que pertenecen al rango local pero caen fuera en UTC. El filtro fino
  // se hace despues, por zona horaria de cada tienda.
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

async function sumSalesByStore(startIso, endIso) {
  const rows = await fetchAllRows(
    (from, to) =>
      supabaseAdmin
        .from("daily_sales")
        .select("store_code, gross_sales, business_date")
        .gte("business_date", startIso)
        .lte("business_date", endIso)
        .order("store_code", { ascending: true })
        .order("business_date", { ascending: true })
        .range(from, to),
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

const GROUP_STRUCTURE = {
  "TX-TN": [
    { label: "DFW", regions: ["DFW"] },
    { label: "HTX", regions: ["HTX"] },
    { label: "ATX & NSH & SATX", regions: ["ATX", "NSH", "SATX"] },
  ],
  "CA-AZ": [
    { label: "AZ", regions: ["AZ"] },
    { label: "CA", regions: ["CA"] },
  ],
};

export function groupStoresForEmail(rows) {
  const groups = [];
  for (const grp of Object.keys(GROUP_STRUCTURE)) {
    const regions = GROUP_STRUCTURE[grp].map((rDef) => ({
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

  const wtdLabor = await readLabor(weekStart, isoDate, excludedSet, tzByStore);
  const { map: wtdSales, perDay: wtdSalesPerDay } = await sumSalesByStore(weekStart, isoDate);

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

    const dH = dayHours[code] || 0;
    const dS = daySales[code] || 0;
    const dTarget = getTarget(store, dayName);
    const dSplh = dH > 0 ? dS / dH : 0;
    const dOverUnder = dTarget > 0 ? (dS / dTarget) - dH : 0;
    const dFlags = anomalyFlags(store, dS, dH, dayName);

    const wH = wtdHours[code] || 0;
    const wS = wtdSales[code] || 0;
    const wSplh = wH > 0 ? wS / wH : 0;

    let wOverUnder = 0;
    const perDayHours = (wtdLabor.perDay[code]) || {};
    const perDaySales = (wtdSalesPerDay[code]) || {};
    weekDays.forEach((iso) => {
      const t = getTarget(store, dayNameFromISO(iso));
      const h = perDayHours[iso] || 0;
      const s = perDaySales[iso] || 0;
      if (t > 0) wOverUnder += (s / t) - h;
    });

    const wTrainee = (wtdLabor.trainee[code] || 0);
    const wTrainer = (wtdLabor.trainer[code] || 0);

    const base = ptdBase[code] || { sales: 0, hours: 0 };
    const pH = base.hours + (extraHours[code] || 0);
    const pS = base.sales + (extraSales[code] || 0);
    const pTarget = getPtdTarget(store);
    const pSplh = pH > 0 ? pS / pH : 0;

    return {
      code,
      name: st.name,
      region: st.region,
      grp: st.grp,
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
    rows,
    debug: {
      wtdLaborRows: wtdLabor.rowCount,
      dayLaborRows: dayLabor.rowCount,
      openShiftsToday: dayLabor.openShifts,
      excludedEmployeeCount: excludedSet.size,
      ptdExtraStart: extraStartUsed,
    },
  };
}