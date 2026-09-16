// TEMPORARY DIAGNOSTIC - discount/refund breakdown for one store/day.
//
// Built to settle one question: why discounts_amount came out HIGHER than
// Toast's own Sales Summary on both gate days.
//
//   10037 / 2026-08-28: ours 848.16, Toast 840.84  (+7.32)
//   10001 / 2026-09-14: ours 323.95, Toast 316.90  (+7.05)
//
// Gross matched to the cent on both days, so the order pull and the
// store/day scoping are correct. The error is specific to how discounts are
// summed. Two competing hypotheses this route exists to separate:
//
//   (a) DOUBLE COUNT - a check-level discount that Toast ALSO allocates onto
//       the individual selections, so discountsForCheck counts it once at
//       the check level and again per selection. If true, the payload should
//       show the same amount present in both places on the same check, and
//       the duplicate total should be exactly 7.32 / 7.05.
//
//   (b) CATEGORY MISMATCH - a discount type Toast excludes from the Sales
//       Summary's Discounts line (comps, loyalty, employee meals). If true,
//       the payload should show a single discount of that amount carrying a
//       distinct type/name, appearing exactly once.
//
// The answer might be neither. This route reports what is there; it does not
// pick the closer fit.
//
// DELETE THIS ROUTE once the discount question is resolved. It reads raw
// Toast orders, and nothing should be able to hit that indefinitely because
// it was once convenient.
//
// GET /api/toast/discount-probe?storeCode=10037&businessDate=2026-08-28
// Header: x-sync-secret  (same secret as /api/toast/sync-store)
//
// SOURCE PARITY, and this is the important design decision: this route pulls
// orders from /orders/v2/ordersBulk, the SAME endpoint
// app/api/toast/sync-store/route.js uses - NOT the orders-list + per-order
// detail pattern that net-sales-probe uses. Diagnosing a discrepancy in what
// sync-store computed requires reading exactly what sync-store read. A
// different endpoint could return a different shape and send us chasing a
// difference that only exists between two Toast endpoints.
//
// It also imports discountsForCheck/refundsForCheck from lib/toast.js rather
// than reimplementing them, so `totals` below should reproduce the numbers
// already written to daily_sales. If it does not, that itself is the finding.
//
// PII: this returns NO raw order objects. Only whitelisted discount/refund
// fields are extracted. Guest name, phone, email, address and card data are
// never read, so there is nothing to redact. Approver is reported as a
// boolean, never the employee's name. `keysPresent` lists field NAMES only
// (not values) so the real shape of Toast's objects can be learned without
// dumping anything sensitive.

import { getToastToken, discountsForCheck, refundsForCheck } from "@/lib/toast";
import { supabaseAdmin } from "@/lib/supabase";

export const maxDuration = 60;

const HOST = process.env.TOAST_API_HOST;

// Checks with no discount and no refund are not interesting here and would
// bury the ones that are. A busy store-day is ~1,000 checks.
const MAX_CHECKS_REPORTED = 250;

function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Whitelisted fields off one appliedDiscount. Everything returned here is a
 * promotion/menu concept or a number - never guest data.
 *
 * `keysPresent` is the discovery mechanism: Toast's AppliedDiscount shape is
 * documented loosely, and rather than guess field names and silently report
 * nothing, this reports which keys actually exist on the real object.
 */
function describeDiscount(d, where) {
  if (!d || typeof d !== "object") return { where, malformed: true, type: d === null ? "null" : typeof d };
  return {
    where,
    name: typeof d.name === "string" ? d.name : null,
    discountAmount: typeof d.discountAmount === "number" ? d.discountAmount : d.discountAmount ?? null,
    nonTaxDiscountAmount: typeof d.nonTaxDiscountAmount === "number" ? d.nonTaxDiscountAmount : null,
    discountGuid: d.discount && typeof d.discount === "object" ? d.discount.guid ?? null : null,
    discountEntityType: d.discount && typeof d.discount === "object" ? d.discount.entityType ?? null : null,
    processingState: d.processingState ?? null,
    // Booleans only - an approver is an employee, and their name is not
    // needed to answer either hypothesis.
    hasApprover: !!d.approver,
    hasLoyaltyDetails: !!d.loyaltyDetails,
    hasTriggers: Array.isArray(d.triggers) ? d.triggers.length > 0 : !!d.triggers,
    appliedDiscountReason: d.appliedDiscountReason
      ? { name: d.appliedDiscountReason.name ?? null, guid: d.appliedDiscountReason.guid ?? null }
      : null,
    comboItems: Array.isArray(d.comboItems) ? d.comboItems.length : null,
    keysPresent: Object.keys(d).sort(),
  };
}

export async function GET(request) {
  try {
    const secret = request.headers.get("x-sync-secret");
    if (secret !== process.env.SYNC_SECRET) {
      return Response.json({ ok: false, error: "No autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const storeCodeParam = searchParams.get("storeCode");
    const isoDate = searchParams.get("businessDate");

    if (!storeCodeParam || !isoDate) {
      return Response.json(
        { ok: false, error: "storeCode and businessDate (YYYY-MM-DD) are required" },
        { status: 400 }
      );
    }
    const storeCode = Number(storeCodeParam);
    if (!Number.isInteger(storeCode)) {
      return Response.json({ ok: false, error: `storeCode must be an integer, got "${storeCodeParam}"` }, { status: 400 });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
      return Response.json({ ok: false, error: `businessDate must be YYYY-MM-DD, got "${isoDate}"` }, { status: 400 });
    }
    const businessDate = isoDate.replace(/-/g, "");

    const { data: store, error: storeErr } = await supabaseAdmin
      .from("stores")
      .select("code, name, toast_guid")
      .eq("code", storeCode)
      .single();
    if (storeErr) throw new Error(`stores lookup failed: ${storeErr.message}`);
    if (!store.toast_guid) {
      return Response.json({ ok: false, error: `Store ${storeCode} has no toast_guid` }, { status: 400 });
    }

    const token = await getToastToken();
    const headers = {
      Authorization: "Bearer " + token,
      "Toast-Restaurant-External-ID": store.toast_guid,
    };

    // Same pagination as sync-store's computeSalesTransactionsAndHours.
    const PAGE_SIZE = 100;
    let page = 1;
    const orders = [];
    while (page <= 200) {
      const url = `${HOST}/orders/v2/ordersBulk?businessDate=${businessDate}&pageSize=${PAGE_SIZE}&page=${page}`;
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error(`ordersBulk failed (${res.status}): ${await res.text()}`);
      const batch = await res.json();
      if (!Array.isArray(batch) || batch.length === 0) break;
      orders.push(...batch);
      if (batch.length < PAGE_SIZE) break;
      page++;
    }

    let grossComputed = 0;
    let discountsComputed = 0;
    let refundsComputed = 0;
    let skippedRefundCount = 0;
    let skippedRefundAmount = 0;
    let checkCount = 0;

    const checks = [];
    const rollup = new Map(); // name|guid|where -> { count, total }
    const duplicateSuspects = [];
    const refundDetail = [];

    for (const order of orders) {
      if (!order || order.voided || order.deleted || order.excessFood) continue;

      for (const check of order.checks || []) {
        if (check.voided || check.deleted) continue;
        checkCount += 1;

        // Reproduce exactly what sync-store wrote, using the same functions.
        let checkGross = 0;
        for (const sel of check.selections || []) {
          if (sel.voided || sel.deferred) continue;
          checkGross += sel.preDiscountPrice || 0;
        }
        grossComputed += checkGross;

        const d = discountsForCheck(check);
        const r = refundsForCheck(check, businessDate);
        discountsComputed += d.amount;
        refundsComputed += r.amount;
        skippedRefundCount += r.skippedOtherDate.count;
        skippedRefundAmount += r.skippedOtherDate.amount;

        const checkLevel = (check.appliedDiscounts || []).map((x) => describeDiscount(x, "check"));

        const selectionRows = [];
        for (const [i, sel] of (check.selections || []).entries()) {
          const selDiscounts = (sel?.appliedDiscounts || []).map((x) =>
            describeDiscount(x, `selection[${i}]`)
          );
          if (selDiscounts.length) {
            selectionRows.push({
              index: i,
              selectionGuid: sel.guid ?? null,
              displayName: typeof sel.displayName === "string" ? sel.displayName : null,
              voided: !!sel.voided,
              deferred: !!sel.deferred,
              // Counted by discountsForCheck only when NOT voided/deferred -
              // stated per selection so a skipped one is visible rather than
              // inferred.
              countedByUs: !sel.voided && !sel.deferred,
              preDiscountPrice: sel.preDiscountPrice ?? null,
              appliedDiscounts: selDiscounts,
            });
          }
        }

        // HYPOTHESIS (a): same amount present at check level AND on a
        // selection of the same check. Matched on amount, and separately on
        // discount guid, because an allocation might reuse the guid with a
        // split amount.
        const selAll = selectionRows.flatMap((s) => s.appliedDiscounts);
        for (const cl of checkLevel) {
          const byAmount = selAll.filter(
            (s) => typeof s.discountAmount === "number" && s.discountAmount === cl.discountAmount
          );
          const byGuid = selAll.filter((s) => s.discountGuid && s.discountGuid === cl.discountGuid);
          if (byAmount.length || byGuid.length) {
            duplicateSuspects.push({
              checkGuid: check.guid ?? null,
              checkLevel: cl,
              matchedOnAmount: byAmount.length,
              matchedOnGuid: byGuid.length,
              selectionSideTotal: round2(
                selAll
                  .filter((s) => s.discountGuid && s.discountGuid === cl.discountGuid)
                  .reduce((a, s) => a + (typeof s.discountAmount === "number" ? s.discountAmount : 0), 0)
              ),
            });
          }
        }

        // HYPOTHESIS (b): rollup by identity, so a distinct type totalling
        // exactly the overage stands out.
        for (const x of [...checkLevel, ...selAll]) {
          const key = `${x.name ?? "(no name)"} | guid=${x.discountGuid ?? "-"} | ${x.where.startsWith("selection") ? "selection" : "check"}`;
          const cur = rollup.get(key) || { count: 0, total: 0 };
          cur.count += 1;
          cur.total = round2(cur.total + (typeof x.discountAmount === "number" ? x.discountAmount : 0));
          rollup.set(key, cur);
        }

        for (const [pi, payment] of (check.payments || []).entries()) {
          const refund = payment?.refund;
          if (!refund || typeof refund !== "object") continue;
          refundDetail.push({
            checkGuid: check.guid ?? null,
            orderGuid: order.guid ?? null,
            orderBusinessDate: order.businessDate ?? null,
            paymentIndex: pi,
            paymentGuid: payment.guid ?? null,
            refundAmount: refund.refundAmount ?? null,
            tipRefundAmount: refund.tipRefundAmount ?? null,
            refundBusinessDate: refund.refundBusinessDate ?? null,
            refundDate: refund.refundDate ?? null,
            syncedBusinessDate: businessDate,
            // The whole question for the missing 9.20.
            countedByUs: String(refund.refundBusinessDate ?? "") === businessDate,
            keysPresent: Object.keys(refund).sort(),
          });
        }

        if ((checkLevel.length || selectionRows.length) && checks.length < MAX_CHECKS_REPORTED) {
          checks.push({
            checkGuid: check.guid ?? null,
            orderGuid: order.guid ?? null,
            orderBusinessDate: order.businessDate ?? null,
            voided: !!check.voided,
            deleted: !!check.deleted,
            checkGross: round2(checkGross),
            ourCheckDiscountTotal: d.amount,
            checkLevelDiscounts: checkLevel,
            selectionsWithDiscounts: selectionRows,
          });
        }
      }
    }

    const rollupRows = [...rollup.entries()]
      .map(([key, v]) => ({ key, count: v.count, total: round2(v.total) }))
      .sort((a, b) => b.total - a.total);

    // What daily_sales currently holds, so the comparison is in one place.
    const { data: storedRow } = await supabaseAdmin
      .from("daily_sales")
      .select("gross_sales, discounts_amount, refunds_amount, net_sales, synced_at")
      .eq("store_code", storeCode)
      .eq("business_date", isoDate)
      .maybeSingle();

    return Response.json({
      ok: true,
      storeCode,
      storeName: store.name,
      businessDate: isoDate,
      orderCount: orders.length,
      checkCount,
      totals: {
        grossComputed: round2(grossComputed),
        discountsComputed: round2(discountsComputed),
        refundsComputed: round2(refundsComputed),
        netComputed: round2(grossComputed - discountsComputed - refundsComputed),
        refundsSkippedOtherDateCount: skippedRefundCount,
        refundsSkippedOtherDateAmount: round2(skippedRefundAmount),
      },
      storedInDailySales: storedRow || null,
      // (a)
      duplicateSuspectCount: duplicateSuspects.length,
      duplicateSuspects: duplicateSuspects.slice(0, 100),
      // (b)
      discountRollup: rollupRows,
      // raw-ish detail, capped
      checksReported: checks.length,
      checksTruncated: checks.length >= MAX_CHECKS_REPORTED,
      checks,
      refundDetail,
    });
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}
