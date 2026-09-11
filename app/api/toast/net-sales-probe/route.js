// TEMPORARY - built for the net_sales SSSG investigation only.
//
// Purpose: figure out which raw Toast fields compose "Net Sales" the way
// Toast's own reporting UI defines it, so lib/sssg.js's weekly report can
// eventually read a real net_sales column instead of gross_sales. See
// docs/sql/002-store-opened-at.sql / lib/sssg.js's weekly section for the
// investigation this supports.
//
// Once that investigation is done (net_sales composition confirmed,
// migration written, sync route updated to populate it), THIS ROUTE
// SHOULD BE DELETED. It reads raw Toast orders - guest data and payment
// metadata, redacted below, but still a surface nobody should be able to
// hit indefinitely just because it was convenient during an investigation.
// If you're reading this months later and the investigation above is long
// finished, that's a sign to remove this file, not extend it.
//
// GET /api/toast/net-sales-probe?storeCode=10001&businessDate=2026-08-24
// Header: x-sync-secret (same secret as /api/toast/sync-store - see below
// for why this route reuses SYNC_SECRET rather than admin session auth).
//
// Read-only: GET requests to Toast, one read-only Supabase select for the
// store's toast_guid, one read-only Supabase select against daily_sales to
// cross-check the computed gross figure. No writes anywhere.
//
// Auth: SYNC_SECRET, not an admin session. This route is meant to be
// called from a GitHub Actions workflow_dispatch (see
// .github/workflows/toast-probe.yml), which has no browser session to
// hold an admin cookie - x-sync-secret is the same mechanism
// /api/toast/sync-store already uses for exactly that reason. Not linked
// from any UI.
//
// PII: a raw Toast order carries guest name/phone/email/delivery address
// and payment card metadata. redactOrder() below blanks those before the
// order is ever returned, so nothing guest-identifying reaches an Actions
// log. The aggregate section (order count, gross, discount-field sums and
// their paths) has no PII and is returned in full.

import { getToastToken, isOrderExcluded, grossSalesForCheck } from "@/lib/toast";
import { supabaseAdmin } from "@/lib/supabase";

export const maxDuration = 60;

const HOST = process.env.TOAST_API_HOST;

// Whole subtrees that are guest/delivery data by definition - every leaf
// under one of these keys gets blanked, structure and key names kept.
const REDACT_SUBTREE_KEYS = /^(customer|guest|deliveryInfo|curbsidePickupInfo)$/i;

// Individual leaf fields redacted wherever they appear, regardless of
// parent - contact info, address components, and payment-card identifiers.
// Deliberately does NOT include firstName/lastName as a global rule: those
// also appear on non-guest nodes this app already treats as ordinary
// business data (e.g. the server/employee who took the order - see
// toast_labor_shifts, which already stores employee names unredacted).
// firstName/lastName are still fully redacted wherever they occur inside
// a REDACT_SUBTREE_KEYS node above.
const REDACT_LEAF_KEYS =
  /^(email|phone|phoneNumber|address1|address2|city|state|zip|zipCode|postalCode|latitude|longitude|cardType|last4|lastFour|maskedPan|cardNumber|panSuffix|cardHolderName|nameOnCard|authCode|driverName|dasherName|courierName)$/i;

const REDACTED = "[REDACTED]";

// These key/field patterns are this app's best knowledge of Toast's Orders
// API schema, NOT verified against a live order from this integration -
// this environment has no way to reach Toast's API to check (see the
// conversation this route came out of). If the first real run's redacted
// output still shows anything that looks like a guest name, phone, email,
// address, or card number, stop and widen these patterns before trusting
// any later run.
function redactOrder(node) {
  if (node === null || node === undefined) return node;
  if (Array.isArray(node)) return node.map(redactOrder);
  if (typeof node !== "object") return node;

  const out = {};
  for (const [key, value] of Object.entries(node)) {
    if (REDACT_SUBTREE_KEYS.test(key) && value !== null && typeof value === "object") {
      out[key] = blankAllLeaves(value);
    } else if (REDACT_LEAF_KEYS.test(key) && (typeof value === "string" || typeof value === "number")) {
      out[key] = REDACTED;
    } else {
      out[key] = redactOrder(value);
    }
  }
  return out;
}

// Keeps every key and the array/object shape, replaces every leaf value
// with the redaction marker. Used for subtrees that are entirely guest
// data (customer, deliveryInfo, ...) - there is no leaf under one of
// those worth keeping unredacted.
function blankAllLeaves(node) {
  if (node === null || node === undefined) return node;
  if (Array.isArray(node)) return node.map(blankAllLeaves);
  if (typeof node === "object") {
    const out = {};
    for (const [key, value] of Object.entries(node)) out[key] = blankAllLeaves(value);
    return out;
  }
  return REDACTED;
}

// Same shape as the standalone investigation script this route replaces:
// walks the whole order tree, calling onMatch(path, value) for every
// numeric leaf whose key name looks discount/promo/comp-shaped. Gated to
// numbers only so a string field (a GUID, a reason code) can never match -
// only an actual dollar amount can.
const DISCOUNT_KEY = /discount|promo|comp/i;

function walkForDiscountFields(node, path, onMatch) {
  if (node === null || node === undefined) return;
  if (Array.isArray(node)) {
    node.forEach((item) => walkForDiscountFields(item, `${path}[]`, onMatch));
    return;
  }
  if (typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      const nextPath = path ? `${path}.${key}` : key;
      if (DISCOUNT_KEY.test(key) && typeof value === "number") onMatch(nextPath, value);
      walkForDiscountFields(value, nextPath, onMatch);
    }
  }
}

function grossSalesForOrders(orders) {
  let total = 0;
  orders.forEach((order) => {
    if (isOrderExcluded(order)) return;
    (order.checks || []).forEach((check) => {
      if (check.voided || check.deleted) return;
      total += grossSalesForCheck(check);
    });
  });
  return Math.round(total * 100) / 100;
}

async function fetchOrderDetail(headers, guid) {
  const res = await fetch(`${HOST}/orders/v2/orders/${guid}`, { headers });
  if (!res.ok) {
    const text = await res.text();
    return { error: true, guid, status: res.status, body: text.slice(0, 300) };
  }
  return res.json();
}

export async function GET(request) {
  try {
    const secret = request.headers.get("x-sync-secret");
    if (secret !== process.env.SYNC_SECRET) {
      return Response.json({ ok: false, error: "No autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const storeCodeParam = searchParams.get("storeCode");
    const businessDateParam = searchParams.get("businessDate");

    if (!storeCodeParam || !businessDateParam) {
      return Response.json(
        { ok: false, error: "storeCode and businessDate (YYYY-MM-DD) are required query params" },
        { status: 400 }
      );
    }
    const storeCode = Number(storeCodeParam);
    if (!Number.isInteger(storeCode)) {
      return Response.json({ ok: false, error: `storeCode must be an integer, got "${storeCodeParam}"` }, { status: 400 });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(businessDateParam)) {
      return Response.json({ ok: false, error: `businessDate must be YYYY-MM-DD, got "${businessDateParam}"` }, { status: 400 });
    }
    const businessDate = businessDateParam.replace(/-/g, "");

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
    const headers = { Authorization: `Bearer ${token}`, "Toast-Restaurant-External-ID": store.toast_guid };

    const listRes = await fetch(`${HOST}/orders/v2/orders?businessDate=${businessDate}`, { headers });
    if (!listRes.ok) {
      const text = await listRes.text();
      throw new Error(`Toast order list failed (${listRes.status}): ${text}`);
    }
    const orderGuids = await listRes.json();

    const details = [];
    const fetchErrors = [];
    const BATCH = 3;
    for (let i = 0; i < orderGuids.length; i += BATCH) {
      const batch = orderGuids.slice(i, i + BATCH);
      const results = await Promise.all(batch.map((guid) => fetchOrderDetail(headers, guid)));
      results.forEach((r) => {
        if (r && r.error) fetchErrors.push(r);
        else if (r) details.push(r);
      });
      await new Promise((r) => setTimeout(r, 150));
    }

    const sample =
      details.find((o) => !o.voided && (o.checks || []).some((c) => !c.voided && (c.selections || []).length > 0)) ||
      details[0] ||
      null;

    const grossComputed = grossSalesForOrders(details);

    const discountTotals = new Map();
    details.forEach((order) => {
      walkForDiscountFields(order, "", (path, value) => {
        const entry = discountTotals.get(path) || { sum: 0, count: 0 };
        entry.sum += value;
        entry.count += 1;
        discountTotals.set(path, entry);
      });
    });
    const discountFields = [...discountTotals.entries()]
      .sort((a, b) => b[1].sum - a[1].sum)
      .map(([path, { sum, count }]) => ({ path, sum: Math.round(sum * 100) / 100, count }));

    // Cross-check against what production actually wrote for this store/day
    // - this is the whole point: if these disagree, the problem isn't net
    // vs. gross at all, and that has to be surfaced loudly, not buried in
    // a nested field nobody checks.
    const { data: storedRow, error: storedErr } = await supabaseAdmin
      .from("daily_sales")
      .select("gross_sales")
      .eq("store_code", storeCode)
      .eq("business_date", businessDateParam)
      .maybeSingle();
    if (storedErr) throw new Error(`daily_sales lookup failed: ${storedErr.message}`);

    const grossStored = storedRow ? Number(storedRow.gross_sales) : null;
    const grossMatchesStored = grossStored !== null && Math.abs(grossStored - grossComputed) < 0.01;

    return Response.json({
      ok: true,
      storeCode,
      storeName: store.name,
      businessDate: businessDateParam,
      orderCount: details.length,
      fetchErrorCount: fetchErrors.length,
      fetchErrors: fetchErrors.length ? fetchErrors : undefined,
      grossComputedFromToastJustNow: grossComputed,
      grossStoredInDailySales: grossStored,
      grossMatchesStored,
      grossMismatchWarning: grossMatchesStored
        ? undefined
        : `MISMATCH: computed ${grossComputed} vs stored ${grossStored} for store ${storeCode} on ${businessDateParam}. This means the gross-vs-net theory is not the explanation - stop and look at why our own gross figure doesn't reproduce, before touching net sales at all.`,
      discountFields,
      sampleOrderGuid: sample ? sample.guid : null,
      sampleOrderRedacted: sample ? redactOrder(sample) : null,
    });
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}
