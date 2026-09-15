// Tests for lib/toast.js's discountsForCheck / refundsForCheck - the two
// components of Net = Gross - Discounts - Refunds.
//
// WHY THIS FILE EXISTS AT ALL. Refunds run 0.01%-0.07% of gross. A wrong
// implementation would shift net_sales by thousandths of a percentage point:
// it would never visibly move an SSSG number, never be caught by anyone
// reading a dashboard, and would sit there quietly wrong for years. There is
// no downstream check that would catch it. These assertions are the only
// thing standing between a silent bug and years of wrong net_sales.
//
// Three cases below are the ones that would otherwise never be caught, and
// should not be deleted or weakened without a very good reason:
//
//   1. tipRefundAmount adjacency - Toast puts tipRefundAmount on the SAME
//      object as refundAmount, and tips are excluded from net sales. A loop
//      over refund-shaped keys would silently subtract tips.
//   2. refund present but refundAmount missing - a refund DID happen and its
//      amount could not be read. Coercing that to 0 loses real money quietly.
//   3. string coercion - "10.00" must not be counted. JS would happily add it
//      to a number and produce a string-concatenated total.
//
// WHAT A GREEN RUN OF THIS FILE DOES NOT PROVE. Every payload below is
// CONSTRUCTED - hand-built objects shaped the way Toast's documentation says
// its orders are shaped. These tests prove the arithmetic and the defensive
// behavior are correct GIVEN that shape. They do not prove Toast's real
// responses have that shape.
//
// In particular, the two "gate target" tests below reproduce figures taken
// from Toast's own Sales Summary, which makes them look like validation
// against Toast. They are not. They only show that if a check arrives shaped
// like the fixture, the math lands on Toast's number. Whether a real check
// carries refundAmount as a positive magnitude, whether refundBusinessDate is
// populated, whether discounts really do appear at both levels - none of that
// is settled here. Only a live sync compared against Toast's own report
// settles it.
//
// Necessary, not sufficient. Do not read a green suite as "net_sales is
// validated."

import { test } from "node:test";
import assert from "node:assert/strict";
import { discountsForCheck, refundsForCheck } from "../lib/toast.js";

// --- the three that would otherwise never be caught -------------------------

test("refunds: tipRefundAmount sitting next to refundAmount is NOT counted", () => {
  const check = { guid: "c1", payments: [{ refund: { refundAmount: 10.0, tipRefundAmount: 5.0, refundBusinessDate: 20260828 } }] };
  const { amount, anomalies } = refundsForCheck(check, "20260828");
  assert.equal(amount, 10.0, "only refundAmount may be counted, never the tip refund");
  assert.equal(anomalies.length, 0, "a well-formed refund with a tip refund beside it is not an anomaly");
});

test("refunds: a refund object with no refundAmount is an anomaly, NOT a silent zero", () => {
  const check = { guid: "c2", payments: [{ refund: { tipRefundAmount: 5.0, refundBusinessDate: 20260828 } }] };
  const { amount, anomalies } = refundsForCheck(check, "20260828");
  assert.equal(amount, 0);
  assert.equal(anomalies.length, 1);
  assert.match(anomalies[0], /has no refundAmount/);
});

test("refunds: a string refundAmount is not coerced, it is an anomaly", () => {
  const check = { guid: "c3", payments: [{ refund: { refundAmount: "10.00", refundBusinessDate: 20260828 } }] };
  const { amount, anomalies } = refundsForCheck(check, "20260828");
  assert.equal(amount, 0, "a string must not be added to the total");
  assert.equal(anomalies.length, 1);
  assert.match(anomalies[0], /expected finite number/);
});

// --- refunds, everything else ----------------------------------------------

test("refunds: no refund on a payment is normal, not an anomaly", () => {
  const { amount, anomalies } = refundsForCheck({ guid: "c4", payments: [{ amount: 20 }] }, "20260828");
  assert.equal(amount, 0);
  assert.equal(anomalies.length, 0);
});

test("refunds: multiple payments each carrying a refund are summed", () => {
  const check = {
    guid: "c5",
    payments: [
      { refund: { refundAmount: 4.25, refundBusinessDate: 20260828 } },
      { amount: 10 },
      { refund: { refundAmount: 1.5, refundBusinessDate: 20260828 } },
    ],
  };
  assert.equal(refundsForCheck(check, "20260828").amount, 5.75);
});

test("refunds: a voided or deleted check contributes nothing", () => {
  const payments = [{ refund: { refundAmount: 50, refundBusinessDate: 20260828 } }];
  assert.equal(refundsForCheck({ voided: true, payments }, "20260828").amount, 0);
  assert.equal(refundsForCheck({ deleted: true, payments }, "20260828").amount, 0);
});

test("refunds: a negative refundAmount is counted as-is AND flagged", () => {
  const check = { guid: "c6", payments: [{ refund: { refundAmount: -3.0, refundBusinessDate: 20260828 } }] };
  const { amount, anomalies } = refundsForCheck(check, "20260828");
  assert.equal(amount, -3.0, "dropping it silently would hide the problem");
  assert.equal(anomalies.length, 1);
  assert.match(anomalies[0], /negative/);
});

test("refunds: payments that is not an array is an anomaly, not a crash", () => {
  const { amount, anomalies } = refundsForCheck({ guid: "c7", payments: "nope" }, "20260828");
  assert.equal(amount, 0);
  assert.equal(anomalies.length, 1);
  assert.match(anomalies[0], /expected array/);
});

test("refunds: missing payments entirely is silent and safe", () => {
  const r = refundsForCheck({ guid: "c8" }, "20260828");
  assert.equal(r.amount, 0);
  assert.deepEqual(r.anomalies, []);
  assert.deepEqual(r.skippedOtherDate, { count: 0, amount: 0 });
});

// --- refund date attribution ------------------------------------------------
//
// Toast attributes a refund to the day the REFUND was issued, not the day of
// the original order: "Refunds do not affect financial data on the day of the
// original order. Refunds only affect financial data on the day of the
// refund." Orders are pulled by the ORDER's business date, so a check
// returned for day X can carry a refund issued on a different day. Counting
// it against X would put money on the wrong date.

test("refunds: a refund from a DIFFERENT business date is NOT counted", () => {
  // order belongs to 08-28, refund was issued 09-02
  const check = { guid: "x1", payments: [{ refund: { refundAmount: 9.2, refundBusinessDate: 20260902 } }] };
  const { amount, skippedOtherDate } = refundsForCheck(check, "20260828");
  assert.equal(amount, 0, "a refund issued on another day must not land on this day");
  assert.equal(skippedOtherDate.count, 1);
  assert.equal(skippedOtherDate.amount, 9.2);
});

test("refunds: a same-day refund IS counted and is not reported as skipped", () => {
  const check = { guid: "x2", payments: [{ refund: { refundAmount: 9.2, refundBusinessDate: 20260828 } }] };
  const { amount, skippedOtherDate } = refundsForCheck(check, "20260828");
  assert.equal(amount, 9.2);
  assert.deepEqual(skippedOtherDate, { count: 0, amount: 0 });
});

test("refunds: same-day and other-day refunds on one check are separated", () => {
  const check = {
    guid: "x3",
    payments: [
      { refund: { refundAmount: 5.0, refundBusinessDate: 20260828 } },
      { refund: { refundAmount: 3.0, refundBusinessDate: 20260901 } },
      { refund: { refundAmount: 1.25, refundBusinessDate: 20260828 } },
    ],
  };
  const { amount, skippedOtherDate } = refundsForCheck(check, "20260828");
  assert.equal(amount, 6.25, "only the two issued on 08-28");
  assert.equal(skippedOtherDate.count, 1);
  assert.equal(skippedOtherDate.amount, 3.0);
});

test("refunds: skipping an other-day refund is NOT an anomaly (it is expected)", () => {
  const check = { guid: "x4", payments: [{ refund: { refundAmount: 9.2, refundBusinessDate: 20260902 } }] };
  assert.deepEqual(refundsForCheck(check, "20260828").anomalies, [], "must not drown real anomalies in expected noise");
});

test("refunds: integer and string business dates compare equal", () => {
  // the route passes a string; Toast types refundBusinessDate as an integer
  const check = { guid: "x5", payments: [{ refund: { refundAmount: 4.0, refundBusinessDate: 20260828 } }] };
  assert.equal(refundsForCheck(check, "20260828").amount, 4.0);
  assert.equal(refundsForCheck(check, 20260828).amount, 4.0);
});

test("refunds: a refund with no readable refundBusinessDate is an anomaly, not counted", () => {
  const check = { guid: "x6", payments: [{ refund: { refundAmount: 9.2 } }] };
  const { amount, anomalies, skippedOtherDate } = refundsForCheck(check, "20260828");
  assert.equal(amount, 0, "cannot attribute it to a day, so it must not be counted");
  assert.equal(skippedOtherDate.count, 0, "unattributable is not the same as belonging to another day");
  assert.equal(anomalies.length, 1);
  assert.match(anomalies[0], /no readable refundBusinessDate/);
});

test("refunds: a missing business date argument throws rather than counting everything", () => {
  const check = { guid: "x7", payments: [{ refund: { refundAmount: 9.2, refundBusinessDate: 20260828 } }] };
  assert.throws(() => refundsForCheck(check), TypeError);
  assert.throws(() => refundsForCheck(check, "not-a-date"), TypeError);
  assert.throws(() => refundsForCheck(check, "2026-08-28"), TypeError, "yyyyMMdd only, not ISO");
});

test("refunds: the negative-sign anomaly spells out the 2x consequence", () => {
  const check = { guid: "x8", payments: [{ refund: { refundAmount: -9.2, refundBusinessDate: 20260828 } }] };
  const { anomalies } = refundsForCheck(check, "20260828");
  assert.equal(anomalies.length, 1);
  assert.match(anomalies[0], /SIGN CHECK/);
  assert.match(anomalies[0], /too HIGH by 2x/);
  assert.match(anomalies[0], /18\.4/, "states the actual dollar consequence, not just the rule");
});

// --- gate target 2, the real non-zero refund --------------------------------

test("gate target 2: 10037 on 2026-08-28 reproduces Toast's Sales Summary", () => {
  // Toast's own figures: gross 13364.95 - discounts 840.84 - refunds 9.20
  //                    = net 12514.91
  // This is the one that exercises refundsForCheck against a real non-zero
  // answer; the 10001 anchor sums an empty array and would pass even if
  // refundsForCheck were completely broken.
  const GROSS = 13364.95;
  const check = {
    guid: "gate2",
    appliedDiscounts: [{ discountAmount: 840.84 }],
    payments: [{ refund: { refundAmount: 9.2, refundBusinessDate: 20260828 } }],
  };

  const discounts = discountsForCheck(check);
  const refunds = refundsForCheck(check, "20260828");

  assert.equal(discounts.amount, 840.84);
  assert.equal(refunds.amount, 9.2, "positive magnitude, subtracted by the caller");
  assert.equal(refunds.anomalies.length, 0);
  assert.equal(Math.round((GROSS - discounts.amount - refunds.amount) * 100) / 100, 12514.91);
});

// --- discounts --------------------------------------------------------------

test("discounts: check-level and selection-level are both counted", () => {
  const check = {
    guid: "d1",
    appliedDiscounts: [{ discountAmount: 5.0 }],
    selections: [{ preDiscountPrice: 20, appliedDiscounts: [{ discountAmount: 2.5 }] }],
  };
  assert.equal(discountsForCheck(check).amount, 7.5);
});

test("discounts: on voided or deferred selections are skipped, matching gross", () => {
  // gross skips these selections, so counting their discounts would subtract
  // money that was never added.
  const check = {
    guid: "d2",
    selections: [
      { voided: true, appliedDiscounts: [{ discountAmount: 99 }] },
      { deferred: true, appliedDiscounts: [{ discountAmount: 99 }] },
      { appliedDiscounts: [{ discountAmount: 1.25 }] },
    ],
  };
  assert.equal(discountsForCheck(check).amount, 1.25);
});

test("discounts: a null discountAmount is an anomaly and the rest still sums", () => {
  const check = { guid: "d3", appliedDiscounts: [{ discountAmount: null }, { discountAmount: 3.0 }] };
  const { amount, anomalies } = discountsForCheck(check);
  assert.equal(amount, 3.0);
  assert.equal(anomalies.length, 1);
  assert.match(anomalies[0], /has no discountAmount/);
});

test("discounts: appliedDiscounts that is not an array is an anomaly", () => {
  const { amount, anomalies } = discountsForCheck({ guid: "d4", appliedDiscounts: {} });
  assert.equal(amount, 0);
  assert.equal(anomalies.length, 1);
  assert.match(anomalies[0], /expected array/);
});

test("discounts: a voided or deleted check contributes nothing", () => {
  const appliedDiscounts = [{ discountAmount: 50 }];
  assert.equal(discountsForCheck({ voided: true, appliedDiscounts }).amount, 0);
  assert.equal(discountsForCheck({ deleted: true, appliedDiscounts }).amount, 0);
});

test("discounts: a check with no discounts anywhere is zero and silent", () => {
  const check = { guid: "d5", selections: [{ preDiscountPrice: 12.5 }] };
  assert.deepEqual(discountsForCheck(check), { amount: 0, anomalies: [] });
});

// --- the production anchor --------------------------------------------------

test("anchor: 10001 on 2026-09-14 reproduces Toast's own Sales Summary", () => {
  // Ground truth pulled from Toast's native Sales Summary:
  //   gross 4483.40 - discounts 316.90 - refunds 0.00 = net 4166.50
  // gross_sales is already validated separately (exact to the cent against
  // Toast's export across all 35 stores, 2026-08-24..09-13, 735 store-days).
  const GROSS = 4483.4;
  const check = {
    guid: "anchor",
    appliedDiscounts: [{ discountAmount: 316.9 }],
    payments: [{ amount: 4166.5 }],
  };

  const discounts = discountsForCheck(check);
  const refunds = refundsForCheck(check, "20260914");

  assert.equal(discounts.amount, 316.9);
  assert.equal(refunds.amount, 0);
  assert.equal(discounts.anomalies.length, 0);
  assert.equal(refunds.anomalies.length, 0);
  assert.equal(Math.round((GROSS - discounts.amount - refunds.amount) * 100) / 100, 4166.5);
});
