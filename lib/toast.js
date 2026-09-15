const HOST = process.env.TOAST_API_HOST;

let cachedToken = null;
let cachedExp = 0;

async function fetchNewToken() {
  const res = await fetch(`${HOST}/authentication/v1/authentication/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clientId: process.env.TOAST_CLIENT_ID,
      clientSecret: process.env.TOAST_CLIENT_SECRET,
      userAccessType: "TOAST_MACHINE_CLIENT",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Toast auth fallo (${res.status}): ${text}`);
  }

  const data = await res.json();
  const token = data?.token?.accessToken;
  const expiresIn = data?.token?.expiresIn;

  if (!token) {
    throw new Error("Toast auth: no vino accessToken en la respuesta");
  }

  cachedToken = token;
  cachedExp = Date.now() + (expiresIn - 60) * 1000;
  return token;
}

export async function getToastToken() {
  if (cachedToken && Date.now() < cachedExp) {
    return cachedToken;
  }
  return fetchNewToken();
}

export async function getTimeEntries({ restaurantGuid, startDate, endDate }) {
  const token = await getToastToken();
  const guid = restaurantGuid || process.env.TOAST_RESTAURANT_GUID;

  const url = new URL(`${HOST}/labor/v1/timeEntries`);
  url.searchParams.set("startDate", startDate);
  url.searchParams.set("endDate", endDate);

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      "Toast-Restaurant-External-ID": guid,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Toast timeEntries fallo (${res.status}): ${text}`);
  }

  return res.json();
}

// ---------------------------------------------------------------------------
// Net sales components: discounts and refunds.
//
// Toast's own definition, confirmed against their Sales Summary and verified
// against production for store 10001 on 2026-09-14 (gross 4483.40, discounts
// 316.90, refunds 0.00, net 4166.50):
//
//   Net = Gross - Discounts - Refunds
//
// Gross is summed in app/api/toast/sync-store/route.js from each selection's
// preDiscountPrice, and is validated: it matched Toast's own export to the
// cent across all 35 stores for 2026-08-24..2026-09-13, 735 store-days. These
// two functions supply the other two terms.
//
// WHY THESE ARE WRITTEN SO DEFENSIVELY. Refunds run 0.01%-0.07% of gross. A
// wrong implementation would move net_sales by thousandths of a percentage
// point: it would never visibly change an SSSG number, never be caught by
// anyone eyeballing a dashboard, and would sit there silently wrong for
// years. The cost of being wrong is therefore paid entirely in the future, by
// someone who has no reason to suspect these numbers. So:
//
//   1. Every field is read BY NAME. There is no key iteration, no
//      Object.keys, no /refund/i or /discount/i matching anywhere in this
//      file. That is deliberate and load-bearing: Toast puts tipRefundAmount
//      directly alongside refundAmount on the same refund object, and tips
//      are excluded from net sales entirely. Because the only key this code
//      ever names is `refundAmount`, a tip refund CANNOT leak into the total,
//      no matter what else Toast adds to that object later. Do not "simplify"
//      this into a loop over refund-shaped keys.
//   2. Nothing unreadable is silently coerced to 0. A refund object that
//      exists but whose amount can't be read is the exact failure that would
//      be invisible downstream, so it is returned as an anomaly for the
//      caller to surface rather than quietly contributing nothing.
//
// Both return { amount, anomalies } - anomalies is an array of human-readable
// strings naming the check/payment involved, intended to be surfaced in the
// sync response and from there into the backfill workflow's log.

function round2(n) {
  return Math.round(n * 100) / 100;
}

function isFiniteNumber(v) {
  return typeof v === "number" && Number.isFinite(v);
}

function describe(v) {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
}

function checkRef(check) {
  return check && check.guid ? `check ${check.guid}` : "check (no guid)";
}

/**
 * Sums one appliedDiscounts array. Shared by the check level and the
 * selection level, which are separate arrays in Toast's model and must both
 * be counted - a coupon on the whole check and a markdown on one item are
 * different objects and can coexist on the same check.
 */
function sumAppliedDiscounts(list, where, anomalies) {
  if (list === undefined || list === null) return 0;
  if (!Array.isArray(list)) {
    anomalies.push(`${where}: appliedDiscounts is ${describe(list)}, expected array - not counted`);
    return 0;
  }

  let sum = 0;
  list.forEach((d, i) => {
    if (!d || typeof d !== "object") {
      anomalies.push(`${where}: appliedDiscounts[${i}] is ${describe(d)}, expected object - not counted`);
      return;
    }
    const value = d.discountAmount;
    if (value === undefined || value === null) {
      anomalies.push(`${where}: appliedDiscounts[${i}] has no discountAmount - not counted as 0`);
      return;
    }
    if (!isFiniteNumber(value)) {
      anomalies.push(
        `${where}: appliedDiscounts[${i}].discountAmount is ${describe(value)} (${String(value)}), expected finite number - not counted`
      );
      return;
    }
    sum += value;
  });
  return sum;
}

/**
 * Total discounts on one check: check-level appliedDiscounts plus every
 * non-excluded selection's own appliedDiscounts.
 *
 * Selections that are voided or deferred are skipped, matching exactly what
 * the gross calculation skips. That alignment is required, not cosmetic: a
 * discount on a line whose sales were never counted would subtract money that
 * was never added, understating net.
 */
export function discountsForCheck(check) {
  const anomalies = [];
  if (!check || check.voided || check.deleted) return { amount: 0, anomalies };

  const where = checkRef(check);
  let amount = sumAppliedDiscounts(check.appliedDiscounts, `${where} check-level`, anomalies);

  const selections = check.selections;
  if (selections !== undefined && selections !== null && !Array.isArray(selections)) {
    anomalies.push(`${where}: selections is ${describe(selections)}, expected array - selection discounts not counted`);
  } else {
    (selections || []).forEach((sel, i) => {
      if (!sel || typeof sel !== "object") return;
      if (sel.voided || sel.deferred) return;
      amount += sumAppliedDiscounts(sel.appliedDiscounts, `${where} selection[${i}]`, anomalies);
    });
  }

  return { amount: round2(amount), anomalies };
}

/**
 * Total refunds on one check, read from payments[].refund.refundAmount and
 * nothing else.
 *
 * Note what is NOT read: refund.tipRefundAmount, which Toast places on this
 * same object. Tips are excluded from net sales, so subtracting a tip refund
 * would be wrong. It is never referenced here - see the file-level note above
 * for why that is structural rather than a matter of remembering.
 */
export function refundsForCheck(check) {
  const anomalies = [];
  if (!check || check.voided || check.deleted) return { amount: 0, anomalies };

  const where = checkRef(check);
  const payments = check.payments;
  if (payments === undefined || payments === null) return { amount: 0, anomalies };
  if (!Array.isArray(payments)) {
    anomalies.push(`${where}: payments is ${describe(payments)}, expected array - refunds not counted`);
    return { amount: 0, anomalies };
  }

  let amount = 0;
  payments.forEach((payment, i) => {
    if (!payment || typeof payment !== "object") {
      anomalies.push(`${where}: payments[${i}] is ${describe(payment)}, expected object - refund not counted`);
      return;
    }

    const refund = payment.refund;
    // No refund on this payment is the normal case, not an anomaly.
    if (refund === undefined || refund === null) return;

    if (typeof refund !== "object" || Array.isArray(refund)) {
      anomalies.push(`${where}: payments[${i}].refund is ${describe(refund)}, expected object - not counted`);
      return;
    }

    const value = refund.refundAmount;
    if (value === undefined || value === null) {
      anomalies.push(
        `${where}: payments[${i}].refund exists but has no refundAmount - NOT counted as 0, a refund happened and its amount could not be read`
      );
      return;
    }
    if (!isFiniteNumber(value)) {
      anomalies.push(
        `${where}: payments[${i}].refund.refundAmount is ${describe(value)} (${String(value)}), expected finite number - not counted`
      );
      return;
    }
    if (value < 0) {
      // Counted as-is rather than dropped: silently discarding it would hide
      // the problem, and a negative refund would inflate net, which the gate
      // comparison against Toast's own figure should catch loudly.
      anomalies.push(`${where}: payments[${i}].refund.refundAmount is negative (${value}) - counted as-is, verify against Toast`);
    }

    amount += value;
  });

  return { amount: round2(amount), anomalies };
}
