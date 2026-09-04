import { test } from "node:test";
import assert from "node:assert/strict";
import { monthBounds, comparabilityReason, monthLabel, MIN_COMPARABLE_STORES } from "../lib/coverage.js";

// These pin the pure, non-Supabase parts of lib/coverage.js - the parts
// extracted verbatim out of lib/sssg.js in Command Center Phase 2. The
// Supabase-dependent functions (monthStoreCount, monthCoverage) are moved,
// not rewritten, so exercising the pure logic here is what actually
// verifies the extraction didn't change behavior; a live-DB test isn't
// needed to catch a copy/paste error in these.

test("MIN_COMPARABLE_STORES is unchanged from lib/sssg.js's original value", () => {
  assert.equal(MIN_COMPARABLE_STORES, 10);
});

test("monthBounds: day range and day count for a 31-day and a 28-day month", () => {
  assert.deepEqual(monthBounds("2026-01"), {
    year: 2026, month: 1, gte: "2026-01-01", lte: "2026-01-31", days: 31,
  });
  assert.deepEqual(monthBounds("2026-02"), {
    year: 2026, month: 2, gte: "2026-02-01", lte: "2026-02-28", days: 28,
  });
});

test("monthBounds: leap year February", () => {
  assert.equal(monthBounds("2028-02").days, 29);
});

test("monthLabel: formats YYYY-MM as 'Month YYYY'", () => {
  assert.equal(monthLabel("2026-09"), "September 2026");
  assert.equal(monthLabel("2026-01"), "January 2026");
});

test("comparabilityReason: no prior-year data at all", () => {
  assert.equal(comparabilityReason(35, 0, "August 2025"), "No August 2025 data");
});

test("comparabilityReason: prior-year month below the store-count floor", () => {
  assert.equal(
    comparabilityReason(35, 1, "July 2024"),
    "Only 1 store has July 2024 data"
  );
  assert.equal(
    comparabilityReason(35, 9, "July 2024"),
    "Only 9 stores have July 2024 data"
  );
});

test("comparabilityReason: current month below the store-count floor", () => {
  assert.equal(
    comparabilityReason(3, 35, "August 2025"),
    "Only 3 stores have data this month"
  );
});

test("comparabilityReason: both months clear the floor - comparable, no reason", () => {
  assert.equal(comparabilityReason(35, 35, "August 2025"), null);
  assert.equal(comparabilityReason(10, 10, "August 2025"), null);
});
