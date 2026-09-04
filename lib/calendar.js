// lib/calendar.js
//
// Generic day/week arithmetic - addDays and weekday-aligned comparisons.
// Before this file existed, addDays was reimplemented near-identically in
// at least five places (lib/report.js, lib/throughput.js,
// components/Forecast.js, app/api/dashboard/route.js,
// app/api/export/route.js), and the "same weekday N weeks back" idea was
// hand-built independently in three shapes: app/api/dashboard/route.js's
// single prior-week compare, lib/report.js's/lib/throughput.js's weekly
// trend loops, and components/Forecast.js's lookback average. See
// docs/plans/FEATURE-PLAN-2026-09-04.md, feature 1, for the full survey.
//
// Deliberately kept separate from lib/fiscal.js: fiscal.js throws at
// import time if today falls outside its hardcoded FISCAL_PERIODS table
// (see the accompanying audit, finding DATA-1). Nothing in this file has
// any reason to inherit that crash mode just to get date arithmetic, so
// this module has zero dependencies and zero side effects.
//
// Nothing in the app imports this file yet. Per the Command Center plan,
// Phase 1 ships this standalone - retrofitting calc.js/report.js/
// throughput.js/lib/sssg.js (or components/Forecast.js/the dashboard/export
// routes) onto it is separate, later work, done one file at a time with a
// before/after diff of real output, not a forced migration.

/**
 * iso + n days, both ISO "YYYY-MM-DD" strings. n may be negative.
 */
export function addDays(iso, n) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * The same weekday, n whole weeks back. n=1 is "last week, same day" - the
 * comparison app/api/dashboard/route.js already does by hand (addDays(date,
 * -7)) with a comment explaining why a raw calendar week-over-week would be
 * wrong for a partial WTD.
 */
export function sameWeekdayNWeeksAgo(iso, n) {
  return addDays(iso, -7 * n);
}

/**
 * The ISO dates for the same weekday as `iso`, across the previous `count`
 * weeks - most recent first, NOT including `iso` itself. Use this when a
 * caller needs to fetch/aggregate specific same-weekday dates rather than a
 * continuous range - the shape components/Forecast.js's lookback average
 * needs (it currently hand-builds this via histStart = addDays(histEnd,
 * -7*lookback+1) plus a continuous range, which works for a contiguous
 * fetch but isn't the same operation as "give me exactly these N dates").
 *
 * priorNSameWeekdays("2026-09-11", 3) with a Friday input returns
 * ["2026-09-04", "2026-08-28", "2026-08-21"].
 */
export function priorNSameWeekdays(iso, count) {
  const out = [];
  for (let n = 1; n <= count; n++) {
    out.push(sameWeekdayNWeeksAgo(iso, n));
  }
  return out;
}

/**
 * `count` whole-week windows, each {start, end} (both inclusive ISO
 * dates), ending at endWeekStart+6 and stepping back by 7 days per window,
 * oldest first. This is the exact shape lib/report.js's and
 * lib/throughput.js's trend loops already hand-build independently today
 * (`rangeStart = addDays(endWeekStart, -7*(nWeeks-1))` then stepping
 * forward by 7), given here as one named, tested function instead of two
 * copies of the same four lines.
 *
 * weekdayAlignedWeekWindows("2026-08-24", 3) returns three Monday-to-Sunday
 * windows: 2026-08-10..16, 2026-08-17..23, 2026-08-24..30.
 */
export function weekdayAlignedWeekWindows(endWeekStart, count) {
  const rangeStart = addDays(endWeekStart, -7 * (count - 1));
  const windows = [];
  for (let w = 0; w < count; w++) {
    const start = addDays(rangeStart, w * 7);
    windows.push({ start, end: addDays(start, 6) });
  }
  return windows;
}
