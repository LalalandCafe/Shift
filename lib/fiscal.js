// Calendario fiscal 4-4-5 — portado exacto de SHIFT (ALL_LOC / FISCAL_PERIODS)

// Period 05 used to end on 2026-05-03, which left the three weeks from
// May 4 to May 24 belonging to no period at all. getPeriodForDate returned
// null for any date in that gap, which silently broke PTD totals and the
// review rollup. The end date now meets the start of period 06, and every
// period is a whole number of weeks: 28 days for a 4-week period, 35 for a
// 5-week one.
//
// 2027's periods (keyed "2027-01".."2027-12", since plain "01".."12" would
// collide with 2026's keys the moment a second year lives in this same
// object) were generated mechanically as a straight continuation of 2026's
// 4-4-5-4-4-5-4-4-5-4-4-5 week shape, starting the Monday right after 2026's
// period 12 ends (2026-12-28) and running 52 weeks with no adjustment.
// THIS HAS NOT BEEN VERIFIED against whatever calendar Finance/Ops actually
// publishes for 2027 - in particular, some 4-4-5 calendars insert a 53rd
// week every five or six years to stay aligned with the actual date, and
// nothing here checks whether 2027 is one of those years. Confirm these
// dates against the real published calendar before period 2027-01 opens
// (2026-12-28), the same way 2026's gap above had to be caught by hand.
export const FISCAL_PERIODS = {
  "01": { weeks: [1, 2, 3, 4], start: "2025-12-29", end: "2026-01-25" },
  "02": { weeks: [5, 6, 7, 8], start: "2026-01-26", end: "2026-02-22" },
  "03": { weeks: [9, 10, 11, 12, 13], start: "2026-02-23", end: "2026-03-29" },
  "04": { weeks: [14, 15, 16, 17], start: "2026-03-30", end: "2026-04-26" },
  "05": { weeks: [18, 19, 20, 21], start: "2026-04-27", end: "2026-05-24" },
  "06": { weeks: [22, 23, 24, 25, 26], start: "2026-05-25", end: "2026-06-28" },
  "07": { weeks: [27, 28, 29, 30], start: "2026-06-29", end: "2026-07-26" },
  "08": { weeks: [31, 32, 33, 34], start: "2026-07-27", end: "2026-08-23" },
  "09": { weeks: [35, 36, 37, 38, 39], start: "2026-08-24", end: "2026-09-27" },
  "10": { weeks: [40, 41, 42, 43], start: "2026-09-28", end: "2026-10-25" },
  "11": { weeks: [44, 45, 46, 47], start: "2026-10-26", end: "2026-11-22" },
  "12": { weeks: [48, 49, 50, 51, 52], start: "2026-11-23", end: "2026-12-27" },
  "2027-01": { weeks: [1, 2, 3, 4], start: "2026-12-28", end: "2027-01-24" },
  "2027-02": { weeks: [5, 6, 7, 8], start: "2027-01-25", end: "2027-02-21" },
  "2027-03": { weeks: [9, 10, 11, 12, 13], start: "2027-02-22", end: "2027-03-28" },
  "2027-04": { weeks: [14, 15, 16, 17], start: "2027-03-29", end: "2027-04-25" },
  "2027-05": { weeks: [18, 19, 20, 21], start: "2027-04-26", end: "2027-05-23" },
  "2027-06": { weeks: [22, 23, 24, 25, 26], start: "2027-05-24", end: "2027-06-27" },
  "2027-07": { weeks: [27, 28, 29, 30], start: "2027-06-28", end: "2027-07-25" },
  "2027-08": { weeks: [31, 32, 33, 34], start: "2027-07-26", end: "2027-08-22" },
  "2027-09": { weeks: [35, 36, 37, 38, 39], start: "2027-08-23", end: "2027-09-26" },
  "2027-10": { weeks: [40, 41, 42, 43], start: "2027-09-27", end: "2027-10-24" },
  "2027-11": { weeks: [44, 45, 46, 47], start: "2027-10-25", end: "2027-11-21" },
  "2027-12": { weeks: [48, 49, 50, 51, 52], start: "2027-11-22", end: "2027-12-26" },
};

export function getPeriodForWeek(wk) {
  wk = parseInt(wk);
  for (const p in FISCAL_PERIODS) {
    if (FISCAL_PERIODS[p].weeks.indexOf(wk) >= 0) return p;
  }
  return null;
}

// Numero de semana ISO — portado de getWN() en SHIFT
export function getWeekNumber(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dn = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dn);
  const y1 = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - y1) / 86400000) + 1) / 7);
}

export const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
export const WEEKEND = new Set(["Friday", "Saturday", "Sunday"]);

export function getWeekStart(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dn = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - (dn - 1));
  return d.toISOString().slice(0, 10);
}

export function getPeriodForDate(date = new Date()) {
  const iso = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
    .toISOString().slice(0, 10);
  for (const p in FISCAL_PERIODS) {
    const fp = FISCAL_PERIODS[p];
    if (iso >= fp.start && iso <= fp.end) {
      return { period: p, start: fp.start, end: fp.end };
    }
  }
  return null;
}

/**
 * Every period, oldest first. Used by any view that needs to lay periods out
 * side by side, the way the manual Tattle Report did with P4 through P7.
 */
export function listPeriods() {
  return Object.keys(FISCAL_PERIODS)
    .sort()
    .map((p) => ({ period: p, ...FISCAL_PERIODS[p] }));
}

// Fails loudly, at import time, the moment today falls in a gap FISCAL_PERIODS
// doesn't cover - instead of every PTD column on the dashboard and in the
// daily email quietly going blank with nothing in any log to say why, which
// is exactly what happened the last time this table had a hole in it (see
// the comment above). This runs once per cold start, wherever this module
// first gets imported.
if (!getPeriodForDate()) {
  throw new Error(
    "FISCAL_PERIODS has no period covering today (" +
      new Date().toISOString().slice(0, 10) +
      "). Every PTD figure on the dashboard and in the daily email will read " +
      "empty until FISCAL_PERIODS is extended - add the missing period(s) in lib/fiscal.js."
  );
}
