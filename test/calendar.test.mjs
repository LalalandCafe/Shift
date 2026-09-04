import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addDays,
  sameWeekdayNWeeksAgo,
  priorNSameWeekdays,
  weekdayAlignedWeekWindows,
} from "../lib/calendar.js";

test("addDays: forward and backward, month/year rollover", () => {
  assert.equal(addDays("2026-09-04", 1), "2026-09-05");
  assert.equal(addDays("2026-09-04", -1), "2026-09-03");
  assert.equal(addDays("2026-01-01", -1), "2025-12-31");
  assert.equal(addDays("2026-01-31", 1), "2026-02-01");
  assert.equal(addDays("2026-09-04", 0), "2026-09-04");
});

test("sameWeekdayNWeeksAgo: matches the dashboard's existing -7-day compare", () => {
  // app/api/dashboard/route.js does addDays(isoDate, -7) for its prior-week
  // WTD comparison - this must agree exactly for n=1.
  assert.equal(sameWeekdayNWeeksAgo("2026-09-04", 1), addDays("2026-09-04", -7));
  assert.equal(sameWeekdayNWeeksAgo("2026-09-04", 1), "2026-08-28");
  assert.equal(sameWeekdayNWeeksAgo("2026-09-04", 4), "2026-08-07");
});

test("priorNSameWeekdays: most-recent-first, excludes the anchor date, stays on the same weekday", () => {
  const anchor = "2026-09-11"; // a Friday
  const dayOfWeek = (iso) => new Date(iso + "T12:00:00Z").getUTCDay();
  const result = priorNSameWeekdays(anchor, 3);
  assert.deepEqual(result, ["2026-09-04", "2026-08-28", "2026-08-21"]);
  assert.ok(!result.includes(anchor));
  result.forEach((iso) => assert.equal(dayOfWeek(iso), dayOfWeek(anchor)));
});

test("weekdayAlignedWeekWindows: whole 7-day windows, oldest first, contiguous, matches report.js's trend-loop shape", () => {
  const windows = weekdayAlignedWeekWindows("2026-08-24", 3);
  assert.deepEqual(windows, [
    { start: "2026-08-10", end: "2026-08-16" },
    { start: "2026-08-17", end: "2026-08-23" },
    { start: "2026-08-24", end: "2026-08-30" },
  ]);
  // Each window is exactly 7 days and contiguous with the next.
  windows.forEach((w) => assert.equal(addDays(w.start, 6), w.end));
  for (let i = 1; i < windows.length; i++) {
    assert.equal(addDays(windows[i - 1].end, 1), windows[i].start);
  }
});

test("weekdayAlignedWeekWindows: count=1 is just the one window", () => {
  assert.deepEqual(weekdayAlignedWeekWindows("2026-08-24", 1), [
    { start: "2026-08-24", end: "2026-08-30" },
  ]);
});
