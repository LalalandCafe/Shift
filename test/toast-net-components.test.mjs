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
// Four cases below are the ones that would otherwise never be caught, and
// should not be deleted or weakened without a very good reason:
//
//   1. tipRefundAmount adjacency - Toast puts tipRefundAmount on the SAME
//      object as refundAmount, and tips are excluded from net sales. A loop
//      over refund-shaped keys would silently subtract tips.
//   2. refund present but refundAmount missing - a refund DID happen and its
//      amount could not be read. Coercing that to 0 loses real money quietly.
//   3. string coercion - "10.00" must not be counted. JS would happily add it
//      to a number and produce a string-concatenated total.
//   4. processingState VOID - a discount Toast has REMOVED still sits in
//      appliedDiscounts with its discountAmount intact. Counting it inflates
//      discounts and deflates net. This one is not hypothetical: it shipped,
//      and it is the entire reason discounts_amount disagreed with Toast.
//      See the VOID fixtures at the bottom, both built from real payloads.
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
  assert.deepEqual(discountsForCheck(check), {
    amount: 0,
    anomalies: [],
    skippedVoid: { count: 0, amount: 0 },
  });
});

// --- the production anchor --------------------------------------------------

test("anchor: 10001 on 2026-09-14 reproduces Toast's own Sales Summary", () => {
  // Ground truth pulled from Toast's native Sales Summary:
  //   gross 4483.40 - discounts 316.90 - refunds 0.00 = net 4166.50
  // gross_sales is already validated separately (exact to the cent against
  // Toast's export across all 35 stores, 2026-08-24..09-13, 735 store-days).
  //
  // THIS TEST USED TO BE WORTHLESS, and it is worth saying why, because it
  // looked like the strongest test in the file. It asserted that a single
  // fixture discount of 316.90 summed to 316.90. It passed throughout the
  // entire period discounts_amount was wrong in production, because the
  // fixture simply asserted the right answer instead of reproducing the
  // payload that produces it.
  //
  // It now carries the real shape: the raw sum on that day was 323.95 across
  // 52 discount items, one of which was a VOID-state "Manager 100% Comp" of
  // 7.05 that Toast had removed. The remainder is collapsed into one item
  // because the per-item breakdown of the other 51 does not change what is
  // being tested - the VOID pair does.
  const GROSS = 4483.4;
  const check = {
    guid: "anchor",
    appliedDiscounts: [
      // Stand-in for the 50 in-effect items, whose individual amounts are
      // not what this test is about.
      { name: "(the other in-effect discounts that day)", discountAmount: 309.85, processingState: null },
      // The real pair, from check 26535f10: applied, voided, reapplied.
      { name: "Manager 100% Comp", discountAmount: 7.05, processingState: "VOID" },
      { name: "Manager 100% Comp", discountAmount: 7.05, processingState: null },
    ],
    payments: [{ amount: 4166.5 }],
  };

  // The raw sum, if processingState were ignored - the old, wrong number.
  const naive = check.appliedDiscounts.reduce((a, d) => a + d.discountAmount, 0);
  assert.equal(Math.round(naive * 100) / 100, 323.95, "fixture must reproduce the wrong total too");

  const discounts = discountsForCheck(check);
  const refunds = refundsForCheck(check, "20260914");

  assert.equal(discounts.amount, 316.9);
  assert.equal(discounts.skippedVoid.count, 1);
  assert.equal(discounts.skippedVoid.amount, 7.05);
  assert.equal(refunds.amount, 0);
  assert.equal(discounts.anomalies.length, 0);
  assert.equal(refunds.anomalies.length, 0);
  assert.equal(Math.round((GROSS - discounts.amount - refunds.amount) * 100) / 100, 4166.5);
});

// --- discount processingState ------------------------------------------------
//
// THE CASE THAT SHIPPED. Every fixture above this line is hand-built from
// Toast's documentation, and the documentation never suggested that a removed
// discount stays in appliedDiscounts with its amount intact - so no fixture
// had one, and discounts_amount ran high against Toast for as long as the
// column existed.
//
// The two fixtures below are different in kind: they are built from the SHAPE
// OF REAL PAYLOADS, pulled 2026-09-16 from ordersBulk for the two gate days
// via the discount probe. The amounts and the state distributions are the real
// ones. They are still not live validation - see the header - but they are no
// longer guesses about what Toast can return, because Toast returned them.
//
// Both shapes matter, and they are genuinely different:
//
//   10001/2026-09-14 - ONE discount applied, voided, and REAPPLIED. The same
//     7.05 "Manager 100% Comp" twice on one check, once VOID and once null.
//     A fix that deduplicated repeated amounts would pass this and fail 10037.
//   10037/2026-08-28 - TWO unrelated discounts voided, never reapplied.
//     Nothing is duplicated. A fix that deduplicated would score 0 here.
//
// Keying on processingState is the only thing that handles both.

test("discounts: 10001/2026-09-14 shape - same discount VOID then reapplied, counted ONCE", () => {
  // Check 26535f10: "Manager 100% Comp" 7.05 applied, voided, reapplied.
  // The check is NOT voided and the selection is NOT voided - only the
  // discount's own processingState is. Filtering on check.voided or
  // selection.voided catches neither of these.
  const check = {
    guid: "26535f10",
    voided: false,
    appliedDiscounts: [
      { name: "Manager 100% Comp", discountAmount: 7.05, processingState: "VOID" },
      { name: "Manager 100% Comp", discountAmount: 7.05, processingState: null },
    ],
    selections: [{ guid: "s1", voided: false, preDiscountPrice: 7.05 }],
  };
  const { amount, skippedVoid, anomalies } = discountsForCheck(check);
  assert.equal(amount, 7.05, "the voided copy must not be counted a second time");
  assert.equal(skippedVoid.count, 1);
  assert.equal(skippedVoid.amount, 7.05);
  assert.deepEqual(anomalies, [], "a VOID discount is expected, not an anomaly");
});

test("discounts: 10037/2026-08-28 shape - two VOID discounts, never reapplied", () => {
  // Nothing duplicated here. Both are simply gone, and both were being
  // counted. 6.80 + 0.52 = 7.32, exactly the overage against Toast that day.
  const check = {
    guid: "10037-c1",
    appliedDiscounts: [
      { name: "Team Member Drinks/Food (ON SHIFT)", discountAmount: 6.8, processingState: "VOID" },
      { name: "Neighborhood Discount 10%", discountAmount: 0.52, processingState: "VOID" },
      { name: "Employee Meal", discountAmount: 12.0, processingState: null },
    ],
    selections: [],
  };
  const { amount, skippedVoid } = discountsForCheck(check);
  assert.equal(amount, 12.0);
  assert.equal(skippedVoid.count, 2);
  assert.equal(skippedVoid.amount, 7.32);
});

test("discounts: VOID is skipped at the SELECTION level too, not just check level", () => {
  // The check-level and selection-level arrays are separate objects in Toast's
  // model. A fix applied to only one of them would leave half the bug.
  const check = {
    guid: "c-sel",
    appliedDiscounts: [],
    selections: [
      {
        guid: "s1",
        voided: false,
        appliedDiscounts: [
          { name: "Item comp", discountAmount: 3.25, processingState: "VOID" },
          { name: "Item promo", discountAmount: 1.75, processingState: null },
        ],
      },
    ],
  };
  const { amount, skippedVoid } = discountsForCheck(check);
  assert.equal(amount, 1.75);
  assert.equal(skippedVoid.count, 1);
  assert.equal(skippedVoid.amount, 3.25);
});

test("discounts: the full state matrix - only VOID and PENDING_VOID are removed", () => {
  // null and APPLIED are observed in the real payloads (111 and 14 items on
  // 10037). PENDING_APPLIED and PENDING_VOID appear in neither payload and
  // rest on Toast's schema alone - which is exactly why they are pinned here:
  // if Toast's meaning ever changes, this fails loudly instead of drifting.
  const check = {
    guid: "c-matrix",
    appliedDiscounts: [
      { name: "native", discountAmount: 1.0, processingState: null },
      { name: "no state key at all", discountAmount: 2.0 },
      { name: "applied", discountAmount: 4.0, processingState: "APPLIED" },
      { name: "pending applied", discountAmount: 8.0, processingState: "PENDING_APPLIED" },
      { name: "void", discountAmount: 16.0, processingState: "VOID" },
      { name: "pending void", discountAmount: 32.0, processingState: "PENDING_VOID" },
    ],
    selections: [],
  };
  const { amount, skippedVoid } = discountsForCheck(check);
  assert.equal(amount, 15.0, "1 + 2 + 4 + 8, the four in-effect states");
  assert.equal(skippedVoid.count, 2);
  assert.equal(skippedVoid.amount, 48.0, "16 + 32, the two removed states");
});

test("discounts: an UNRECOGNIZED processingState is COUNTED and flagged", () => {
  // Deliberate: counting preserves the behavior validated against Toast, so a
  // new enum value moves no total until someone reads the anomaly. Excluding
  // would silently push net UP the moment Toast ships a new state name. See
  // discountIsInEffect in lib/toast.js for the full argument.
  const check = {
    guid: "c-unknown",
    appliedDiscounts: [{ name: "mystery", discountAmount: 9.99, processingState: "SOMETHING_NEW" }],
    selections: [],
  };
  const { amount, skippedVoid, anomalies } = discountsForCheck(check);
  assert.equal(amount, 9.99, "counted, not dropped");
  assert.equal(skippedVoid.count, 0);
  assert.equal(anomalies.length, 1);
  assert.match(anomalies[0], /SOMETHING_NEW/);
  assert.match(anomalies[0], /COUNTED as in effect/);
});

test("discounts: a lowercase 'void' is still skipped, and flagged for the casing", () => {
  // The one casing bug that would quietly restore the overcount: treating
  // "void" as unrecognized-therefore-counted. Skipped AND reported.
  const check = {
    guid: "c-case",
    appliedDiscounts: [{ name: "lower", discountAmount: 5.0, processingState: "void" }],
    selections: [],
  };
  const { amount, skippedVoid, anomalies } = discountsForCheck(check);
  assert.equal(amount, 0);
  assert.equal(skippedVoid.amount, 5.0);
  assert.equal(anomalies.length, 1);
  assert.match(anomalies[0], /not the expected uppercase form/);
});

test("discounts: processingState is read regardless of loyalty flags", () => {
  // Toast's schema says processingState "applies exclusively to loyalty
  // program discounts". The real payload contradicts it: both of 10037's VOID
  // items carry hasLoyaltyDetails false and are a team-member discount and a
  // neighborhood discount. Gating on loyalty would have fixed nothing.
  const check = {
    guid: "c-loyalty",
    appliedDiscounts: [
      { name: "not loyalty at all", discountAmount: 6.8, processingState: "VOID", loyaltyDetails: null },
    ],
    selections: [],
  };
  const { amount, skippedVoid } = discountsForCheck(check);
  assert.equal(amount, 0, "skipped on state alone, with no loyalty details present");
  assert.equal(skippedVoid.amount, 6.8);
});

test("discounts: a non-string processingState is counted and flagged, amount intact", () => {
  const check = {
    guid: "c-weird",
    appliedDiscounts: [{ name: "numeric state", discountAmount: 2.5, processingState: 7 }],
    selections: [],
  };
  const { amount, anomalies } = discountsForCheck(check);
  assert.equal(amount, 2.5);
  assert.equal(anomalies.length, 1);
  assert.match(anomalies[0], /expected a string/);
});

test("discounts: an unreadable discountAmount reports ONE anomaly, not two", () => {
  // State is only inspected once the amount is known to be readable, so a
  // malformed amount does not also produce a state complaint.
  const check = {
    guid: "c-bad-amount",
    appliedDiscounts: [{ name: "bad", discountAmount: "5.00", processingState: "NONSENSE" }],
    selections: [],
  };
  const { amount, anomalies } = discountsForCheck(check);
  assert.equal(amount, 0);
  assert.equal(anomalies.length, 1);
  assert.match(anomalies[0], /expected finite number/);
});

test("discounts: skippedVoid is always present, even with no discounts at all", () => {
  // The route reads discounts.skippedVoid.count unconditionally on every
  // check. An undefined here would throw on the first clean check of the day.
  for (const check of [{ guid: "c-empty" }, { guid: "c-voided", voided: true }, null]) {
    const { skippedVoid } = discountsForCheck(check);
    assert.deepEqual(skippedVoid, { count: 0, amount: 0 });
  }
});

// --- gate arithmetic ---------------------------------------------------------

test("discounts: the two gate overages are exactly the VOID-state totals", () => {
  // Not validation against Toast - see the file header. This pins the
  // arithmetic the diagnosis rests on, so that if someone later weakens the
  // VOID handling, the number that broke is named in the failure.
  const cases = [
    { day: "10001/2026-09-14", ours: 323.95, toast: 316.9, voided: [7.05] },
    { day: "10037/2026-08-28", ours: 848.16, toast: 840.84, voided: [6.8, 0.52] },
  ];
  for (const c of cases) {
    const voidTotal = Math.round(c.voided.reduce((a, b) => a + b, 0) * 100) / 100;
    assert.equal(
      Math.round((c.ours - voidTotal) * 100) / 100,
      c.toast,
      `${c.day}: removing the VOID-state discounts must land on Toast's figure`
    );
  }
});
