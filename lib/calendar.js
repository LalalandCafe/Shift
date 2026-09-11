// lib/calendar.js
//
// addDays - ISO date arithmetic shared by lib/sssg.js's weekly SSSG
// aggregation (server) and components/SSSGWeekly.js's week navigation
// (client). Zero dependencies and no import-time side effects, unlike
// lib/fiscal.js (which throws at import time once its calendar table
// expires) - nothing here has any reason to inherit that crash mode just
// to add/subtract days.

/**
 * iso + n days, both ISO "YYYY-MM-DD" strings. n may be negative.
 */
export function addDays(iso, n) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
