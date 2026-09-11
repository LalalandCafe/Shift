// lib/sssg.js
//
// Same-Store Sales Growth (SSSG): monthly and weekly comparisons.
//
// getComparableMonths()/computeMonthComparison(month) (monthly) and
// computeWeekComparison(weekStart, selectedCodes) (weekly - see the
// "Weekly SSSG" section below, added for the weekly filter-bar tab) are
// the only entry points anything else should call. Nothing outside this
// file queries daily_sales or daily_transactions for SSSG purposes - the
// comparable-store rules and the paginated-fetch guards all live in
// exactly one place so a future route can't quietly drift onto a
// different definition of "comparable." Monthly and weekly deliberately
// use DIFFERENT comparable-store rules (a data-presence heuristic vs.
// stores.opened_at) - see classifyStore() and classifyStoreWeekly()
// respectively for why. Everything above the "Weekly SSSG" marker below
// is the original monthly implementation, unmodified by that addition -
// same functions, same behavior, same output, so the already-shipped
// monthly SSSG tab (components/SSSG.js, app/api/sssg/route.js) cannot be
// affected by anything below that line.
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
import { addDays } from "./calendar.js";

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

function daysInMonth(year, month) {
  // month is 1-indexed; day 0 of the next month is the last day of this one.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function monthBounds(yyyyMm) {
  const [year, month] = yyyyMm.split("-").map(Number);
  const days = daysInMonth(year, month);
  return {
    year,
    month,
    gte: `${yyyyMm}-01`,
    lte: `${yyyyMm}-${String(days).padStart(2, "0")}`,
    days,
  };
}

function priorYearMonth(yyyyMm) {
  const [year, month] = yyyyMm.split("-").map(Number);
  return `${year - 1}-${String(month).padStart(2, "0")}`;
}

function monthLabel(yyyyMm) {
  const [year, month] = yyyyMm.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

// Below this many distinct stores, a month's data isn't a real chain-wide
// month - it's a fragment. Without this guard, the 2024-07/08 pilot batch
// (store 10001 only, 1 store) makes August 2025 register as "comparable"
// against August 2024, which is technically true (both months have SOME
// data) but not a real year-over-year comparison. 10 is comfortably above
// any pilot/test batch this app has produced (1 store) and comfortably
// below any real synced month (currently 35 stores), so it kills that
// false positive without being able to exclude a legitimate month.
const MIN_COMPARABLE_STORES = 10;

/**
 * How many distinct stores have a daily_sales row in this month. Fetches
 * only the store_code column, paginated the same way fetchDailySalesRange
 * does, so a month with heavier data still can't silently undercount.
 */
async function monthStoreCount(yyyyMm) {
  const { gte, lte } = monthBounds(yyyyMm);
  const codes = new Set();
  let from = 0;
  while (true) {
    const { data, error } = await supabaseAdmin
      .from("daily_sales")
      .select("store_code")
      .gte("business_date", gte)
      .lte("business_date", lte)
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`monthStoreCount(${yyyyMm}) failed: ${error.message}`);
    data.forEach((r) => codes.add(r.store_code));
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return codes.size;
}

function comparabilityReason(currentCount, priorCount, priorLabel) {
  if (priorCount === 0) return `No ${priorLabel} data`;
  if (priorCount < MIN_COMPARABLE_STORES) {
    return `Only ${priorCount} store${priorCount === 1 ? " has" : "s have"} ${priorLabel} data`;
  }
  if (currentCount < MIN_COMPARABLE_STORES) {
    return `Only ${currentCount} store${currentCount === 1 ? " has" : "s have"} data this month`;
  }
  return null;
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

// ---------------------------------------------------------------------------
// Weekly SSSG
//
// Added for the weekly SSSG filter-bar tab (feat/sssg-filters). Nothing
// above this line was changed to add it: classifyStore(),
// computeMonthComparison(), getComparableMonths(), and
// fetchDailySalesRange() are exactly what they were before this section
// existed, so the monthly tab's output cannot be affected by anything
// below. fetchDailyTransactionsRange() below deliberately duplicates
// fetchDailySalesRange's pagination-with-count-guard pattern instead of
// factoring out a shared helper, so touching the monthly path is never
// even a temptation while building this.
//
// The comparable-store rule here is NOT the monthly one above. Monthly
// infers "open" from whether daily_sales has any nonzero rows, which is
// the only signal available for it. Weekly uses opened_at directly
// (docs/sql/002-store-opened-at.sql) because sales history alone can't be
// trusted for this: live sync only started 2026-07-13, and the prior-year
// backfill only covers 2025-08-01..2025-08-31 as of this writing, so
// MIN(business_date) on a store that opened well before either of those
// dates would understate how long it's actually been open (or overstate
// it, for a pre-backfill gap). opened_at is the real business fact and is
// supplied by hand, not inferred.
//
// The comparable set is recomputed on every call, keyed off the
// weekStart passed in - nothing here caches a set across multiple weeks,
// because a store can cross the 15-month line mid-report and needs to
// enter the comparable set exactly on the week that happens.

/**
 * Same guarantee as fetchDailySalesRange above (paginated, cross-checked
 * against an exact count, throws rather than silently truncating) but for
 * daily_transactions/transaction_count - weekly SSSG's ticket calculation
 * needs transaction counts over the same date windows as gross_sales,
 * from its own table. Never assumed to mirror daily_sales' coverage:
 * app/api/toast/sync-store/route.js writes the two tables in separate
 * try/catch blocks, so daily_transactions can fail to write even when
 * daily_sales succeeds for the same store/day - the two tables' day
 * counts are tracked independently in computeWeekComparison below.
 */
async function fetchDailyTransactionsRange(gte, lte) {
  const { count, error: countErr } = await supabaseAdmin
    .from("daily_transactions")
    .select("*", { count: "exact", head: true })
    .gte("business_date", gte)
    .lte("business_date", lte);
  if (countErr) throw new Error(`daily_transactions count failed (${gte}..${lte}): ${countErr.message}`);

  let rows = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabaseAdmin
      .from("daily_transactions")
      .select("store_code, business_date, transaction_count")
      .gte("business_date", gte)
      .lte("business_date", lte)
      .order("business_date")
      .order("store_code")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`daily_transactions fetch failed (${gte}..${lte}): ${error.message}`);
    rows = rows.concat(data);
    if (data.length < PAGE) break;
    from += PAGE;
  }

  if (rows.length !== count) {
    throw new Error(
      `Pagination mismatch on daily_transactions ${gte}..${lte}: count=${count} but fetched=${rows.length}. Refusing to aggregate a possibly-truncated result.`
    );
  }
  return rows;
}

const COMPARABLE_LOOKBACK_DAYS = 455; // 65 fiscal weeks / 15 months
const PRIOR_YEAR_OFFSET_DAYS = 364; // 52 fiscal weeks - never a calendar year
const WEEK_LENGTH_DAYS = 7;

/**
 * Every fiscal week in this calendar starts on a Monday (see
 * lib/fiscal.js's FISCAL_PERIODS). A non-Monday weekStart almost always
 * means a caller passed a calendar date instead of a fiscal week
 * boundary, which would silently compute the wrong window rather than
 * error - this fails loudly instead, the same philosophy as fiscal.js's
 * own import-time check.
 */
function assertMonday(iso) {
  const d = new Date(iso + "T12:00:00Z");
  if (d.getUTCDay() !== 1) {
    throw new Error(`weekStart must be a Monday, got "${iso}"`);
  }
}

/**
 * The single comparable-store rule for weekly SSSG, applied once here so
 * nothing else can drift onto a different definition. Order matters:
 *
 *   - opened_at missing: can't classify at all. Never defaults to
 *     comparable - an unfilled date is not evidence a store is old
 *     enough, and reports as its own reason rather than being silently
 *     dropped or crashing.
 *   - opened_at inside the 15-month window: too new. The primary rule.
 *   - no rows at all on one side: a data gap, not an age problem - kept
 *     distinct from "too new" so a store that measurably existed 15+
 *     months ago but failed to sync isn't miscounted as a new-store
 *     exclusion (that would hide a real sync bug behind an expected,
 *     ignorable-looking reason).
 *   - some but not all 7 days present on either side: partial week.
 *     Sales and transactions are checked independently, not via one
 *     combined day-count, because daily_transactions can fail to write
 *     even when daily_sales succeeds for the same store/day - the two
 *     tables are never assumed to mirror each other's coverage.
 */
function classifyStoreWeekly({ openedAt, comparabilityCutoff, salesDaysPrior, salesDaysCurrent, txnDaysPrior, txnDaysCurrent }) {
  if (!openedAt) return "opened_at unknown";
  if (openedAt > comparabilityCutoff) return "not open 15 months";
  if (salesDaysPrior === 0 && txnDaysPrior === 0) return "no prior-year data";
  if (salesDaysCurrent === 0 && txnDaysCurrent === 0) return "no current-week data";
  if (salesDaysPrior < WEEK_LENGTH_DAYS || txnDaysPrior < WEEK_LENGTH_DAYS) {
    return `partial prior-year week (sales ${salesDaysPrior}/${WEEK_LENGTH_DAYS}, transactions ${txnDaysPrior}/${WEEK_LENGTH_DAYS})`;
  }
  if (salesDaysCurrent < WEEK_LENGTH_DAYS || txnDaysCurrent < WEEK_LENGTH_DAYS) {
    return `partial current week (sales ${salesDaysCurrent}/${WEEK_LENGTH_DAYS}, transactions ${txnDaysCurrent}/${WEEK_LENGTH_DAYS})`;
  }
  return null;
}

/**
 * Full per-store weekly SSSG for the fiscal week starting weekStart (an
 * ISO "YYYY-MM-DD" Monday) against the same weekday 52 fiscal weeks (364
 * days) earlier - never the same calendar date, which would misalign
 * weekdays most years. Returns comparable rows, excluded rows (grouped by
 * reason, never silently dropped), and Total Comp / Total System kept
 * strictly separate - never one blended total row, which is what
 * produces a nonsense headline percentage when new-store dollars get
 * divided against a comparable-only baseline.
 *
 * Dollars and transaction counts are summed across every comparable
 * store first, and the percentage is taken once on those sums - never
 * averaged per-store. Ticket SSSG is the sales-growth fraction minus the
 * transaction-growth fraction, computed from the unrounded fractions and
 * rounded only once at the end: rounding sales growth and transaction
 * growth to 2 decimals first and then subtracting can be off by a
 * hundredth from the true figure. Computed here and returned
 * (`totals.comparable.ticketSSSGPct`) but deliberately not surfaced by
 * the weekly SSSG UI yet - it's a distinct metric from "Average Ticket"
 * (which is out of scope for this pass, see
 * docs/plans/SSSG-FILTERS-PROGRESS.md), and this pass only asked for
 * three summary blocks.
 *
 * `selectedCodes` (Set<number> | null) narrows which stores feed
 * `comparable`/`excluded`/`totals` BEFORE aggregation - never after.
 * null (the default) means no filtering: every active store counts. An
 * empty Set is a real, distinct state ("the user ticked zero stores")
 * and correctly produces zero comparable/selected rows and null
 * percentages below, rather than silently falling back to "all stores."
 *
 * The full per-store classification (`stores` in the return value) is
 * always computed for every active store regardless of `selectedCodes` -
 * the filter-bar UI needs every store's comparability for THIS week to
 * render its picker (including greyed-out ticked stores the current
 * market/comp narrowing hides), not just the selected subset.
 */
export async function computeWeekComparison(weekStart, selectedCodes = null) {
  assertMonday(weekStart);

  const weekEnd = addDays(weekStart, WEEK_LENGTH_DAYS - 1);
  const priorWeekStart = addDays(weekStart, -PRIOR_YEAR_OFFSET_DAYS);
  const priorWeekEnd = addDays(weekEnd, -PRIOR_YEAR_OFFSET_DAYS);
  const comparabilityCutoff = addDays(weekStart, -COMPARABLE_LOOKBACK_DAYS);

  // .eq("active", true): Total System is defined as selected OPEN stores'
  // dollars - a permanently-closed location shouldn't be selectable or
  // countable. Same column lib/data.js's getAllStores() already filters
  // on - not a new concept, just applied here for the first time.
  const { data: stores, error: storesErr } = await supabaseAdmin
    .from("stores")
    .select("code, name, region, opened_at, active")
    .eq("active", true)
    .order("code");
  if (storesErr) throw new Error(storesErr.message);

  const [salesCurrentRows, salesPriorRows, txnsCurrentRows, txnsPriorRows] = await Promise.all([
    fetchDailySalesRange(weekStart, weekEnd),
    fetchDailySalesRange(priorWeekStart, priorWeekEnd),
    fetchDailyTransactionsRange(weekStart, weekEnd),
    fetchDailyTransactionsRange(priorWeekStart, priorWeekEnd),
  ]);

  const byStore = (rows, valueKey) => {
    const map = new Map();
    for (const r of rows) {
      if (!map.has(r.store_code)) map.set(r.store_code, { total: 0, days: 0 });
      const s = map.get(r.store_code);
      s.total += Number(r[valueKey] || 0);
      s.days += 1;
    }
    return map;
  };

  const salesCurrentByStore = byStore(salesCurrentRows, "gross_sales");
  const salesPriorByStore = byStore(salesPriorRows, "gross_sales");
  const txnsCurrentByStore = byStore(txnsCurrentRows, "transaction_count");
  const txnsPriorByStore = byStore(txnsPriorRows, "transaction_count");

  const empty = { total: 0, days: 0 };

  const results = stores.map((s) => {
    const salesCurrent = salesCurrentByStore.get(s.code) || empty;
    const salesPrior = salesPriorByStore.get(s.code) || empty;
    const txnsCurrent = txnsCurrentByStore.get(s.code) || empty;
    const txnsPrior = txnsPriorByStore.get(s.code) || empty;

    const excludeReason = classifyStoreWeekly({
      openedAt: s.opened_at,
      comparabilityCutoff,
      salesDaysPrior: salesPrior.days,
      salesDaysCurrent: salesCurrent.days,
      txnDaysPrior: txnsPrior.days,
      txnDaysCurrent: txnsCurrent.days,
    });

    return {
      code: s.code,
      name: s.name,
      region: s.region,
      openedAt: s.opened_at,
      salesCurrent: round2(salesCurrent.total),
      salesPrior: round2(salesPrior.total),
      salesDaysCurrent: salesCurrent.days,
      salesDaysPrior: salesPrior.days,
      txnsCurrent: txnsCurrent.total,
      txnsPrior: txnsPrior.total,
      txnDaysCurrent: txnsCurrent.days,
      txnDaysPrior: txnsPrior.days,
      excluded: excludeReason !== null,
      excludeReason,
    };
  });

  results.sort((a, b) => a.code - b.code);

  // Store-selection filter, applied here - after every store's
  // classification is known, before any sum below runs. `results` itself
  // stays the full active-store universe (returned as `stores` below) so
  // a picker UI can show every store's comparability for this week
  // regardless of the current selection; `selected` is what actually
  // feeds comparable/excluded/totals from this point on.
  const selected = selectedCodes === null ? results : results.filter((r) => selectedCodes.has(r.code));

  const comparable = selected.filter((r) => !r.excluded);
  const excluded = selected.filter((r) => r.excluded);

  // Grouped strictly by the reason strings classifyStoreWeekly() itself
  // generates above - never by matching anything a caller or the
  // database could supply, so this can't silently miscategorize a future
  // reason this function didn't already produce.
  const excludedByReason = {
    notComparable: excluded.filter(
      (r) => r.excludeReason === "opened_at unknown" || r.excludeReason === "not open 15 months"
    ),
    noPriorYearData: excluded.filter((r) => r.excludeReason === "no prior-year data"),
    noCurrentWeekData: excluded.filter((r) => r.excludeReason === "no current-week data"),
    partialWeek: excluded.filter((r) => r.excludeReason.startsWith("partial ")),
  };

  const sum = (rows, key) => round2(rows.reduce((a, r) => a + r[key], 0));
  const sumInt = (rows, key) => rows.reduce((a, r) => a + r[key], 0);

  const compSalesCurrent = sum(comparable, "salesCurrent");
  const compSalesPrior = sum(comparable, "salesPrior");
  const compTxnsCurrent = sumInt(comparable, "txnsCurrent");
  const compTxnsPrior = sumInt(comparable, "txnsPrior");

  const salesGrowthRaw = compSalesPrior > 0 ? compSalesCurrent / compSalesPrior - 1 : null;
  const txnGrowthRaw = compTxnsPrior > 0 ? compTxnsCurrent / compTxnsPrior - 1 : null;
  const ticketSSSGRaw = salesGrowthRaw !== null && txnGrowthRaw !== null ? salesGrowthRaw - txnGrowthRaw : null;

  return {
    weekStart,
    weekEnd,
    priorWeekStart,
    priorWeekEnd,
    comparabilityCutoff,
    stores: results,
    comparable,
    excluded,
    excludedByReason,
    totals: {
      // Total Comp: comparable stores only. This is what SSSG is
      // calculated on.
      comparable: {
        salesCurrent: compSalesCurrent,
        salesPrior: compSalesPrior,
        salesSSSGPct: salesGrowthRaw !== null ? round2(salesGrowthRaw * 100) : null,
        txnsCurrent: compTxnsCurrent,
        txnsPrior: compTxnsPrior,
        txnGrowthPct: txnGrowthRaw !== null ? round2(txnGrowthRaw * 100) : null,
        ticketSSSGPct: ticketSSSGRaw !== null ? round2(ticketSSSGRaw * 100) : null,
        storeCount: comparable.length,
      },
      // Total System: chain-level dollars/transactions for every SELECTED
      // open store (`selected`, not `results`), comparable or not.
      // Deliberately has no pctChange field - dividing this against
      // Total Comp (or anything else) mixes two different store
      // populations. If a headline percentage is ever wanted, it must be
      // computed and labeled separately - never read off this object.
      system: {
        salesCurrent: sum(selected, "salesCurrent"),
        salesPrior: sum(selected, "salesPrior"),
        txnsCurrent: sumInt(selected, "txnsCurrent"),
        txnsPrior: sumInt(selected, "txnsPrior"),
        storeCount: selected.length,
      },
    },
  };
}
