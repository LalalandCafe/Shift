import { supabaseAdmin } from "./supabase.js";
import { getTarget, getPtdTarget } from "./calc.js";
import { getWeekStart, getPeriodForDate, getWeekNumber } from "./fiscal.js";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function dayNameFromISO(iso) {
  const d = new Date(iso + "T12:00:00Z");
  return DAY_NAMES[d.getUTCDay()];
}

async function sumHoursByStore(startIso, endIso) {
  const { data, error } = await supabaseAdmin
    .from("toast_labor_shifts")
    .select("store_id, hours, clock_in")
    .gte("clock_in", startIso + "T00:00:00")
    .lte("clock_in", endIso + "T23:59:59");
  if (error) throw new Error("sumHours: " + error.message);
  const map = {};
  (data || []).forEach((r) => {
    const code = parseInt(r.store_id);
    map[code] = (map[code] || 0) + (r.hours || 0);
  });
  return map;
}

async function sumSalesByStore(startIso, endIso) {
  const { data, error } = await supabaseAdmin
    .from("daily_sales")
    .select("store_code, gross_sales, business_date")
    .gte("business_date", startIso)
    .lte("business_date", endIso);
  if (error) throw new Error("sumSales: " + error.message);
  const map = {};
  (data || []).forEach((r) => {
    map[r.store_code] = (map[r.store_code] || 0) + (r.gross_sales || 0);
  });
  return map;
}

export async function buildDailyReport(isoDate) {
  const refDate = new Date(isoDate + "T12:00:00Z");
  const dayName = dayNameFromISO(isoDate);
  const weekStart = getWeekStart(refDate);
  const weekNum = getWeekNumber(refDate);
  const periodInfo = getPeriodForDate(refDate);

  const { data: stores, error: sErr } = await supabaseAdmin
    .from("stores")
    .select("code, name, region, grp, weekday_target, weekend_target, ptd_target")
    .eq("active", true)
    .order("code");
  if (sErr) throw new Error("stores: " + sErr.message);

  const dayHours = await sumHoursByStore(isoDate, isoDate);
  const daySales = await sumSalesByStore(isoDate, isoDate);
  const wtdHours = await sumHoursByStore(weekStart, isoDate);
  const wtdSales = await sumSalesByStore(weekStart, isoDate);

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
  if (periodInfo && isoDate > FILE_COVERS_THROUGH) {
    const extraStart = "2026-07-20";
    extraHours = await sumHoursByStore(extraStart, isoDate);
    extraSales = await sumSalesByStore(extraStart, isoDate);
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

    const wH = wtdHours[code] || 0;
    const wS = wtdSales[code] || 0;
    const wSplh = wH > 0 ? wS / wH : 0;

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
      },
      wtd: {
        hours: Math.round(wH),
        sales: Math.round(wS * 100) / 100,
        splh: Math.round(wSplh),
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
    rows,
  };
}