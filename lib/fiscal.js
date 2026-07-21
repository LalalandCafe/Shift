// Calendario fiscal 4-4-5 — portado exacto de SHIFT (ALL_LOC / FISCAL_PERIODS)

export const FISCAL_PERIODS = {
  "01": { weeks: [1, 2, 3, 4], start: "2025-12-29", end: "2026-01-25" },
  "02": { weeks: [5, 6, 7, 8], start: "2026-01-26", end: "2026-02-22" },
  "03": { weeks: [9, 10, 11, 12, 13], start: "2026-02-23", end: "2026-03-29" },
  "04": { weeks: [14, 15, 16, 17], start: "2026-03-30", end: "2026-04-26" },
  "05": { weeks: [18, 19, 20, 21], start: "2026-04-27", end: "2026-05-03" },
  "06": { weeks: [22, 23, 24, 25, 26], start: "2026-05-25", end: "2026-06-28" },
  "07": { weeks: [27, 28, 29, 30], start: "2026-06-29", end: "2026-07-26" },
  "08": { weeks: [31, 32, 33, 34], start: "2026-07-27", end: "2026-08-23" },
  "09": { weeks: [35, 36, 37, 38, 39], start: "2026-08-24", end: "2026-09-27" },
  "10": { weeks: [40, 41, 42, 43], start: "2026-09-28", end: "2026-10-25" },
  "11": { weeks: [44, 45, 46, 47], start: "2026-10-26", end: "2026-11-22" },
  "12": { weeks: [48, 49, 50, 51, 52], start: "2026-11-23", end: "2026-12-27" },
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
