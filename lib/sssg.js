// lib/sssg.js
//
// Same-Store Sales Growth (SSSG), single-month comparison.
//
// getComparableMonths() and computeMonthComparison(month) are the only
// entry points anything else should call. Nothing outside this file
// queries daily_sales for SSSG purposes - the comparable-store rule and
// the paginated-fetch guard both live in exactly one place so a future
// route (or a trend view) can't quietly drift onto a different definition
// of "comparable" than this one.
//
// SQL migration note: this aggregation runs in Node because there is no
// migrations baseline in this repo yet (see BRIEF.md section 11.1) and no
// way to run DDL from this environment. Once a migrations pipeline exists,
// the right long-term move is a parameterized Postgres function - something
// like sssg_month(target date) returns table(store_code int, sales_prior
// numeric, sales_current numeric, days_prior int, days_current int, ...) -
// called via supabaseAdmin.rpc(...) instead of fetchDailySalesRange below.
// The classifyStore() rule should move there unchanged: it's already
// written as one explicit, ordered set of conditions for exactly that
// reason. That migration is its own piece of work, not squeezed in here.

import { supabaseAdmin } from "./supabase.js";
import { monthBounds, monthStoreCount, comparabilityReason, monthLabel, MIN_COMPARABLE_STORES } from "./coverage.js";

const PAGE = 1000;

/**
 * Fetches every daily_sales row in [gte, lte] with no silent truncation.
 * Pages through .range() and cross-checks the total against a count:exact
 * head request - throws instead of returning a partial result if they
 * ever disagree. This is the ONLY place in the app that should query
 * daily_sales for a range wider than a single day; the 1,000-row PostgREST
 * cap already produced a silent undercount once on this exact table
 * (see backfill-report.md).
 */
async function fetchDailySalesRange(gte, lte) {
  const { count, error: countErr } = await supabaseAdmin
    .from("daily_sales")
    .select("*", { count: "exact", head: true })
    .gte("business_date", gte)
    .lte("business_date", lte);
  if (countErr) throw new Error(`daily_sales count failed (${gte}..${lte}): ${countErr.message}`);

  let rows = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabaseAdmin
      .from("daily_sales")
      .select("store_code, business_date, gross_sales")
      .gte("business_date", gte)
      .lte("business_date", lte)
      .order("business_date")
      .order("store_code")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`daily_sales fetch failed (${gte}..${lte}): ${error.message}`);
    rows = rows.concat(data);
    if (data.length < PAGE) break;
    from += PAGE;
  }

  if (rows.length !== count) {
    throw new Error(
      `Pagination mismatch on daily_sales ${gte}..${lte}: count=${count} but fetched=${rows.length}. Refusing to aggregate a possibly-truncated result.`
    );
  }
  return rows;
}

// monthBounds, monthStoreCount, comparabilityReason, monthLabel, and
// MIN_COMPARABLE_STORES now live in lib/coverage.js (Command Center Phase
// 2 extracted them so the coverage banner and this file share exactly one
// definition of "comparable" - see that file's header comment). Imported
// above; logic and wording unchanged from what was here before.

function priorYearMonth(yyyyMm) {
  const [year, month] = yyyyMm.split("-").map(Number);
  return `${year - 1}-${String(month).padStart(2, "0")}`;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Enumerates every calendar month between daily_sales' earliest and latest
 * business_date, and marks which ones are eligible for a single-month SSSG
 * comparison: the month itself has data from at least MIN_COMPARABLE_STORES
 * stores, AND the same calendar month one year earlier does too. Nothing
 * here is hardcoded to August - it's whatever the data currently supports,
 * which today is exactly one month.
 */
export async function getComparableMonths() {
  const { data: earliest, error: e1 } = await supabaseAdmin
    .from("daily_sales")
    .select("business_date")
    .order("business_date", { ascending: true })
    .limit(1);
  if (e1) throw new Error(e1.message);

  const { data: latest, error: e2 } = await supabaseAdmin
    .from("daily_sales")
    .select("business_date")
    .order("business_date", { ascending: false })
    .limit(1);
  if (e2) throw new Error(e2.message);

  if (!earliest?.length || !latest?.length) return [];

  const months = [];
  let [y, m] = earliest[0].business_date.slice(0, 7).split("-").map(Number);
  const [yEnd, mEnd] = latest[0].business_date.slice(0, 7).split("-").map(Number);
  while (y < yEnd || (y === yEnd && m <= mEnd)) {
    months.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }

  const storeCounts = new Map();
  for (const mo of months) {
    storeCounts.set(mo, await monthStoreCount(mo));
  }

  return months
    .filter((mo) => storeCounts.get(mo) > 0)
    .map((mo) => {
      const prior = priorYearMonth(mo);
      const currentCount = storeCounts.get(mo) || 0;
      const priorCount = storeCounts.get(prior) || 0;
      const reason = comparabilityReason(currentCount, priorCount, monthLabel(prior));
      return {
        month: mo,
        label: monthLabel(mo),
        priorMonth: prior,
        comparable: reason === null,
        reason,
      };
    })
    .sort((a, b) => (a.month < b.month ? 1 : -1));
}

/**
 * The single comparable-store rule. Applied once, here, so the route and
 * any future consumer see the same exclusions for the same reasons.
 *
 *   - "incomplete data": fewer daily_sales rows than calendar days in
 *     EITHER month. Doesn't fire on fully-backfilled data (every day gets
 *     a row, even a $0 one) but is the real guard for a future partial
 *     sync or backfill gap.
 *   - "not open in prior-year month": every present day in the prior
 *     month is $0/null. Catches stores that hadn't opened yet.
 *   - "not trading in current month": every present day in the current
 *     month is $0/null. The symmetric case - a store that closed between
 *     the two periods. Without this, a closure would enter the comparable
 *     set at -100% and drag the number down instead of being excluded the
 *     same way a not-yet-opened store is. Doesn't fire on today's data
 *     (nothing has closed), same as the incomplete-data rule above, but
 *     belongs here now rather than after it silently bites.
 */
function classifyStore({ daysPrior, daysCurrent, expectedDaysPrior, expectedDaysCurrent, salesPrior, salesCurrent }) {
  if (daysPrior < expectedDaysPrior || daysCurrent < expectedDaysCurrent) {
    return "incomplete data";
  }
  if (salesPrior === 0) return "not open in prior-year month";
  if (salesCurrent === 0) return "not trading in current month";
  return null;
}

/**
 * Full per-store SSSG for one target month against the same calendar month
 * one year earlier. Returns comparable rows, excluded rows (with reasons),
 * chain totals, and the headline/comp gap - never raw daily rows.
 */
export async function computeMonthComparison(month) {
  const current = monthBounds(month);
  const prior = monthBounds(priorYearMonth(month));

  const { data: stores, error: storesErr } = await supabaseAdmin
    .from("stores")
    .select("code, name, region")
    .order("code");
  if (storesErr) throw new Error(storesErr.message);

  const [priorRows, currentRows] = await Promise.all([
    fetchDailySalesRange(prior.gte, prior.lte),
    fetchDailySalesRange(current.gte, current.lte),
  ]);

  const byStore = (rows) => {
    const map = new Map();
    for (const r of rows) {
      if (!map.has(r.store_code)) map.set(r.store_code, []);
      map.get(r.store_code).push(r);
    }
    return map;
  };
  const priorByStore = byStore(priorRows);
  const currentByStore = byStore(currentRows);

  const results = stores.map((s) => {
    const pRows = priorByStore.get(s.code) || [];
    const cRows = currentByStore.get(s.code) || [];
    const salesPrior = round2(pRows.reduce((a, r) => a + Number(r.gross_sales || 0), 0));
    const salesCurrent = round2(cRows.reduce((a, r) => a + Number(r.gross_sales || 0), 0));
    const zeroDaysPrior = pRows.filter((r) => !r.gross_sales).length;
    const zeroDaysCurrent = cRows.filter((r) => !r.gross_sales).length;

    const excludeReason = classifyStore({
      daysPrior: pRows.length,
      daysCurrent: cRows.length,
      expectedDaysPrior: prior.days,
      expectedDaysCurrent: current.days,
      salesPrior,
      salesCurrent,
    });

    return {
      code: s.code,
      name: s.name,
      region: s.region,
      daysPrior: pRows.length,
      daysCurrent: cRows.length,
      expectedDaysPrior: prior.days,
      expectedDaysCurrent: current.days,
      salesPrior,
      salesCurrent,
      dollarChange: round2(salesCurrent - salesPrior),
      pctChange: salesPrior > 0 ? round2((salesCurrent / salesPrior - 1) * 100) : null,
      zeroDaysPrior,
      zeroDaysCurrent,
      excluded: excludeReason !== null,
      excludeReason,
    };
  });

  results.sort((a, b) => a.code - b.code);
  const comparable = results.filter((r) => !r.excluded);
  const excluded = results.filter((r) => r.excluded);

  const headlinePrior = round2(results.reduce((a, r) => a + r.salesPrior, 0));
  const headlineCurrent = round2(results.reduce((a, r) => a + r.salesCurrent, 0));
  const headlinePct = headlinePrior > 0 ? round2((headlineCurrent / headlinePrior - 1) * 100) : null;

  const compPrior = round2(comparable.reduce((a, r) => a + r.salesPrior, 0));
  const compCurrent = round2(comparable.reduce((a, r) => a + r.salesCurrent, 0));
  const compPct = compPrior > 0 ? round2((compCurrent / compPrior - 1) * 100) : null;

  return {
    month: current.gte.slice(0, 7),
    monthLabel: monthLabel(month),
    priorMonth: prior.gte.slice(0, 7),
    priorMonthLabel: monthLabel(priorYearMonth(month)),
    stores: results,
    comparable,
    excluded,
    totals: {
      headline: { prior: headlinePrior, current: headlineCurrent, pctChange: headlinePct },
      comparable: { prior: compPrior, current: compCurrent, pctChange: compPct, storeCount: comparable.length },
      gap: headlinePct !== null && compPct !== null ? round2(headlinePct - compPct) : null,
    },
  };
}
