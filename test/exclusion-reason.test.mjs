import { test } from "node:test";
import assert from "node:assert/strict";
import { exclusionReason, isExcludedEmp, normJobTitle } from "../lib/calc.js";

// Before this consolidation, lib/calc.js, lib/report.js, and
// lib/throughput.js each had their own copy of "which hours count as
// billable." report.js's and throughput.js's copies agreed with each other
// (throughput.js's own comment called this out as deliberate, to keep
// TPLH consistent with the Week View). calc.js's copy additionally excluded
// "Event Support - LA", which the other two did not - report.js and
// throughput.js feed the live dashboard/email; calc.js only feeds the demo
// endpoints. These tests pin the now-single shared behavior to the live
// path's list (report.js/throughput.js's), confirming:
//   (a) the three standard exclusions still fire correctly, and
//   (b) "Event Support - LA" is deliberately NOT excluded anymore, even
//       from calc.js - this is the one intentional behavior change from
//       this consolidation, and it only affects the demo endpoints
//       (app/api/demo/day, app/api/demo/email), never the live report.

test("exclusionReason: General Manager and NSO Trainer are excluded, case/surrounding-whitespace/trailing-* insensitive", () => {
  assert.equal(exclusionReason("Jane Doe", "General Manager", []), "General Manager");
  assert.equal(exclusionReason("Jane Doe", "general manager*", []), "General Manager");
  assert.equal(exclusionReason("Jane Doe", "  General Manager  ", []), "General Manager");
  assert.equal(exclusionReason("Jane Doe", "NSO Trainer", []), "NSO Trainer");
  assert.equal(exclusionReason("Jane Doe", "nso trainer*", []), "NSO Trainer");
});

test("exclusionReason: Event Support - LA is NOT excluded (the intentional behavior change)", () => {
  assert.equal(exclusionReason("Jane Doe", "Event Support - LA", []), "");
  assert.equal(exclusionReason("Jane Doe", "Event Support - LA*", []), "");
});

test("exclusionReason: excluded-list match takes priority regardless of job title", () => {
  assert.equal(exclusionReason("Jane Doe", "Barista", ["Jane Doe"]), "Excluded list");
  assert.equal(
    exclusionReason("Jane Doe", "Barista", new Set(["jane doe"])),
    "Excluded list"
  );
});

test("exclusionReason: unmatched employee/title returns empty string (not excluded)", () => {
  assert.equal(exclusionReason("Jane Doe", "Barista", []), "");
  assert.equal(exclusionReason("", "", []), "");
});

test("isExcludedEmp: works against a Set of pre-normalized names (report.js/throughput.js's shape)", () => {
  const set = new Set(["jane doe", "john  smith"]);
  assert.equal(isExcludedEmp("Jane Doe", set), true);
  assert.equal(isExcludedEmp("  JANE   DOE  ", set), true);
  assert.equal(isExcludedEmp("Someone Else", set), false);
});

test("isExcludedEmp: works against an array of raw names (lib/data.js's shape)", () => {
  const list = ["Jane Doe", "John Smith"];
  assert.equal(isExcludedEmp("jane doe", list), true);
  assert.equal(isExcludedEmp("JOHN   SMITH", list), true);
  assert.equal(isExcludedEmp("Someone Else", list), false);
});

test("isExcludedEmp: no excluded collection is falsy, not a throw", () => {
  assert.equal(isExcludedEmp("Jane Doe", null), false);
  assert.equal(isExcludedEmp("Jane Doe", undefined), false);
});

test("normJobTitle: lowercases, trims, strips one trailing asterisk", () => {
  assert.equal(normJobTitle("General Manager*"), "general manager");
  assert.equal(normJobTitle("  General Manager  "), "general manager");
  assert.equal(normJobTitle(null), "");
});
