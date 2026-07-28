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

// Horas de un turno. Si sigue abierto y es de hoy, cuenta el tiempo
// transcurrido, porque Toast no reporta horas hasta el clock-out.
// Sin esto el SPLH en vivo sale inflado (divide ventas completas
// entre horas incompletas).
function shiftHours(row, isToday) {
  if (row.clock_out) return row.hours || 0;
  if (!isToday || !row.clock_in) return 0;
  const inMs = new Date(row.clock_in).getTime();
  const h = (Date.now() - inMs) / 3600000;
  if (!isFinite(h) || h < 0) return 0;
  return Math.min(h, 18);
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

async function readLabor(startIso, endIso, excludedSet, todayIso) {
  const rows = await fetchAllRows(
    (from, to) =>
      supabaseAdmin
        .from("toast_labor_shifts")
        .select("store_id, hours, job_title, employee_name, clock_in, clock_out")
        .gte("clock_in", startIso + "T00:00:00")
        .lte("clock_in", endIso + "T23:59:59")
        .order("toast_entry_id", { ascending: true })
        .range(from, to),
    "labor"
  );

  const hours = {}, trainee = {}, trainer = {};
  const perDay = {};
  let openShifts = 0;

  rows.forEach((r) => {
    const reason = exclusionReason(r.employee_name, r.job_title, excludedSet);
    if (reason) return;

    const code = parseInt(r.store_id);
    const day = (r.clock_in || "").slice(0, 10);
    const isToday = day === todayIso;
    if (!r.clock_out && isToday) openShifts++;
    const h = shiftHours(r, isToday);

    hours[code] = (hours[code] || 0) + h;
    if (!perDay[code]) perDay[code] = {};
    perDay[code][day] = (perDay[code][day] || 0) + h;

    const jt = (r.job_title || "").replace(/\*$/, "").trim().toLowerCase();
    if (jt === "trainee") trainee[code] = (trainee[code] || 0) + h;
    if (jt === "certified trainer") trainer[code] = (trainer[code] || 0) + h;
  });

  return { hours, trainee, trainer, perDay, rowCount: rows.length, openShifts };
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

  const todayIso = new Date().toISOString().slice(0, 10);
  const isLive = isoDate === todayIso;

  const { data: stores, error: sErr } = await supabaseAdmin
    .from("stores")
    .select("code, name, region, grp, weekday_target, weekend_target, ptd_target")
    .eq("active", true)
    .order("code");
  if (sErr) throw new Error("stores: " + sErr.message);

  const excludedSet = await getExcludedEmployees();

  const dayLabor = await readLabor(isoDate, isoDate, excludedSet, todayIso);
  const { map: daySales } = await sumSalesByStore(isoDate, isoDate);

  const wtdLabor = await readLabor(weekStart, isoDate, excludedSet, todayIso);
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

  // El seed de ptd_totals solo cubre parte del periodo 07 (hasta esta fecha).
  // Para periodos nuevos no hay seed y todo sale de la data sincronizada.
  const FILE_COVERS_THROUGH = "2026-07-19";
  let extraHours = {}, extraSales = {};
  let extraStartUsed = null;
  if (periodInfo) {
    const hasSeed = Object.keys(ptdBase).length > 0;
    let extraStart = periodInfo.start;
    if (hasSeed && FILE_COVERS_THROUGH >= periodInfo.start) {
      const d = new Date(FILE_COVERS_THROUGH + "T12:00:00Z");
      d.setUTCDate(d.getUTCDate() + 1);
      extraStart = d.toISOString().slice(0, 10);
    }
    extraStartUsed = extraStart;
    if (extraStart <= isoDate) {
      const extraLabor = await readLabor(extraStart, isoDate, excludedSet, todayIso);
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
      const dn = dayNameFromISO(iso);
      const t = getTarget(store, dn);
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