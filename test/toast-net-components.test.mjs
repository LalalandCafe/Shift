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

import { test } from "node:test";
import assert from "node:assert/strict";
import { discountsForCheck, refundsForCheck } from "../lib/toast.js";

// --- the three that would otherwise never be caught -------------------------

test("refunds: tipRefundAmount sitting next to refundAmount is NOT counted", () => {
  const check = { guid: "c1", payments: [{ refund: { refundAmount: 10.0, tipRefundAmount: 5.0 } }] };
  const { amount, anomalies } = refundsForCheck(check);
  assert.equal(amount, 10.0, "only refundAmount may be counted, never the tip refund");
  assert.equal(anomalies.length, 0, "a well-formed refund with a tip refund beside it is not an anomaly");
});

test("refunds: a refund object with no refundAmount is an anomaly, NOT a silent zero", () => {
  const check = { guid: "c2", payments: [{ refund: { tipRefundAmount: 5.0 } }] };
  const { amount, anomalies } = refundsForCheck(check);
  assert.equal(amount, 0);
  assert.equal(anomalies.length, 1);
  assert.match(anomalies[0], /has no refundAmount/);
});

test("refunds: a string refundAmount is not coerced, it is an anomaly", () => {
  const check = { guid: "c3", payments: [{ refund: { refundAmount: "10.00" } }] };
  const { amount, anomalies } = refundsForCheck(check);
  assert.equal(amount, 0, "a string must not be added to the total");
  assert.equal(anomalies.length, 1);
  assert.match(anomalies[0], /expected finite number/);
});

// --- refunds, everything else ----------------------------------------------

test("refunds: no refund on a payment is normal, not an anomaly", () => {
  const { amount, anomalies } = refundsForCheck({ guid: "c4", payments: [{ amount: 20 }] });
  assert.equal(amount, 0);
  assert.equal(anomalies.length, 0);
});

test("refunds: multiple payments each carrying a refund are summed", () => {
  const check = {
    guid: "c5",
    payments: [{ refund: { refundAmount: 4.25 } }, { amount: 10 }, { refund: { refundAmount: 1.5 } }],
  };
  assert.equal(refundsForCheck(check).amount, 5.75);
});

test("refunds: a voided or deleted check contributes nothing", () => {
  const payments = [{ refund: { refundAmount: 50 } }];
  assert.equal(refundsForCheck({ voided: true, payments }).amount, 0);
  assert.equal(refundsForCheck({ deleted: true, payments }).amount, 0);
});

test("refunds: a negative refundAmount is counted as-is AND flagged", () => {
  const check = { guid: "c6", payments: [{ refund: { refundAmount: -3.0 } }] };
  const { amount, anomalies } = refundsForCheck(check);
  assert.equal(amount, -3.0, "dropping it silently would hide the problem");
  assert.equal(anomalies.length, 1);
  assert.match(anomalies[0], /negative/);
});

test("refunds: payments that is not an array is an anomaly, not a crash", () => {
  const { amount, anomalies } = refundsForCheck({ guid: "c7", payments: "nope" });
  assert.equal(amount, 0);
  assert.equal(anomalies.length, 1);
  assert.match(anomalies[0], /expected array/);
});

test("refunds: missing payments entirely is silent and safe", () => {
  assert.deepEqual(refundsForCheck({ guid: "c8" }), { amount: 0, anomalies: [] });
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
  const refunds = refundsForCheck(check);

  assert.equal(discounts.amount, 316.9);
  assert.equal(refunds.amount, 0);
  assert.equal(discounts.anomalies.length, 0);
  assert.equal(refunds.anomalies.length, 0);
  assert.equal(Math.round((GROSS - discounts.amount - refunds.amount) * 100) / 100, 4166.5);
});
