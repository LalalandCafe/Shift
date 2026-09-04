// lib/coverage.js
//
// Single source for "is there enough real daily_sales data to trust a
// comparison over this month" - extracted from lib/sssg.js, which built
// this exact check first for its prior-year SSSG comparison. lib/sssg.js
// now imports from here instead of keeping its own copy, so there is
// exactly one definition of "comparable" in the app, the same reasoning
// lib/sssg.js's own header comment already gave for keeping the rule in
// one place.
//
// This is genuinely new/derived logic (Command Center Phase 2), not a
// metric calculation - it answers "should this comparison be trusted",
// never "what is the number."

import { supabaseAdmin } from "./supabase.js";

const PAGE = 1000;

// Below this many distinct stores, a month's data isn't a real chain-wide
// month - it's a fragment. Without this guard, the 2024-07/08 pilot batch
// (store 10001 only, 1 store) would register as "comparable" against a
// later period, which is technically true (both have SOME data) but not a
// real comparison. 10 is comfortably above any pilot/test batch this app
// has produced (1 store) and comfortably below any real synced month
// (currently 35 stores), so it kills that false positive without being
// able to exclude a legitimate month. Same constant lib/sssg.js used
// before this extraction - value unchanged.
export const MIN_COMPARABLE_STORES = 10;

function daysInMonth(year, month) {
  // month is 1-indexed; day 0 of the next month is the last day of this one.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * "2026-09" -> "September 2026". Pure formatting, shared so a month label
 * reads the same wherever coverage or SSSG display one.
 */
export function monthLabel(yyyyMm) {
  const [year, month] = yyyyMm.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function monthBounds(yyyyMm) {
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

/**
 * How many distinct stores have a daily_sales row in this calendar month.
 * Pages through .range() so a month with heavier data still can't
 * silently undercount - the same 1,000-row PostgREST cap that once
 * inflated a WTD figure elsewhere in this app (see backfill-report.md)
 * would apply here too if this queried unpaged.
 */
export async function monthStoreCount(yyyyMm) {
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

/**
 * Why a comparison between a month with `currentCount` stores and a prior
 * month (`priorLabel`) with `priorCount` stores shouldn't be trusted, or
 * null if it's fine. Same wording lib/sssg.js's route has always returned,
 * unchanged by this extraction.
 */
export function comparabilityReason(currentCount, priorCount, priorLabel) {
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
 * Coverage for an arbitrary list of calendar months ("YYYY-MM"), not tied
 * to any particular prior-year pairing the way lib/sssg.js's comparison is.
 * This is what the Command Center coverage banner calls: hand it every
 * month a comparison touches (current month, prior month, same month last
 * year, whatever a given tab needs), and it flags which ones don't have
 * enough data to trust - independent of what they're being compared
 * against.
 *
 * Returns [{month, storeCount, covered}], in the same order as the input,
 * duplicates included (so a caller can map results back to entries with a
 * label 1:1 without deduping itself).
 */
export async function monthCoverage(months) {
  const unique = [...new Set(months)];
  const counts = await Promise.all(unique.map((m) => monthStoreCount(m)));
  const byMonth = new Map(unique.map((m, i) => [m, counts[i]]));
  return months.map((m) => {
    const storeCount = byMonth.get(m) || 0;
    return { month: m, storeCount, covered: storeCount >= MIN_COMPARABLE_STORES };
  });
}
