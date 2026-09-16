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
// Toast's own definition, confirmed against their Sales Summary:
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
// Both return { amount, anomalies, ... } - anomalies is an array of
// human-readable strings naming the check/payment involved, intended to be
// surfaced in the sync response and from there into the backfill workflow's
// log.

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
 * Toast business dates are yyyyMMdd. The sync route passes one as a string
 * ("20260828"); the Refund object's refundBusinessDate is typed as an
 * integer (20260828). Both normalize to the same 8-digit string so they can
 * be compared without a type surprise.
 */
function normalizeBusinessDate(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return /^\d{8}$/.test(s) ? s : null;
}

// ---------------------------------------------------------------------------
// AppliedDiscount.processingState
//
// THIS IS WHY discounts_amount WAS TOO HIGH. Discovered 2026-09-16 by pulling
// the raw ordersBulk payloads for the two gate days and rolling discounts up
// by state. Before this, every appliedDiscount was counted, including the
// ones Toast had already removed:
//
//   10001 / 2026-09-14   ours 323.95   Toast 316.90   over by 7.05
//   10037 / 2026-08-28   ours 848.16   Toast 840.84   over by 7.32
//
// Both overages were exactly the VOID-state discounts on those days:
//
//   10001: ONE discount applied, voided, then reapplied - "Manager 100% Comp"
//          7.05 appearing TWICE on check 26535f10, once processingState VOID
//          and once null. Both were being counted.
//   10037: TWO unrelated discounts voided and never reapplied -
//          "Team Member Drinks/Food (ON SHIFT)" 6.80 and "Neighborhood
//          Discount 10%" 0.52. Nothing duplicated at all.
//
// The two shapes are why this keys on STATE and not on duplication:
// deduplicating identical amounts would have fixed 10001 and left 10037
// wrong, and the duplicate-detection pass found zero duplicate suspects on
// either day at the check-vs-selection level.
//
// NOTE WHAT DOES *NOT* IDENTIFY THESE. The check is not voided, the selection
// is not voided, and the order is not voided. Only the discount's own
// processingState is VOID. Filtering on check.voided or selection.voided -
// which the gross calculation does, and which this file already does - cannot
// catch it. There is no substitute for reading processingState.
//
// STATES, and how much of this rests on evidence vs. documentation:
//
//   null              in effect, count.    OBSERVED: 111 items on 10037.
//   "APPLIED"         in effect, count.    OBSERVED: 14 items, 61.45, on
//                     10037. Excluding them would land 61.45 UNDER Toast, so
//                     "applied" really does mean applied.
//   "PENDING_APPLIED" in effect, count.    DOCS ONLY - never seen in either
//                     payload. Toast: "Reward validated but not yet redeemed
//                     from customer's account", i.e. the discount is on the
//                     check.
//   "VOID"            removed, SKIP.      OBSERVED on both days, and skipping
//                     exactly these lands on Toast's figure to the cent.
//   "PENDING_VOID"    removed, SKIP.      DOCS ONLY - never seen in either
//                     payload. Toast's void-order guide: a voided discount's
//                     processingState is set to "either VOID or PENDING_VOID
//                     for discounts requiring external validation, for
//                     example, integrated loyalty programs." Excluding VOID
//                     alone and excluding the pair give IDENTICAL results on
//                     both gate days, so this half of the pair is supported by
//                     the documentation and NOT by any observation. If it ever
//                     turns out Toast's Sales Summary still counts
//                     PENDING_VOID as applied, this is the line to revisit.
//
// DO NOT GATE THIS ON LOYALTY. Toast's own schema says processingState
// "applies exclusively to loyalty program discounts" and is null for
// Toast-native ones. The payloads contradict that outright: both of 10037's
// VOID items carry hasLoyaltyDetails false, and they are a team-member
// discount and a neighborhood discount - neither is a loyalty reward. A
// version of this that only inspected processingState on loyalty discounts
// would have skipped nothing and fixed nothing. Every appliedDiscount gets
// its state read, whatever else it carries.
const DISCOUNT_STATES_REMOVED = new Set(["VOID", "PENDING_VOID"]);
const DISCOUNT_STATES_IN_EFFECT = new Set(["APPLIED", "PENDING_APPLIED"]);

/**
 * Decides whether one appliedDiscount's amount is actually in effect.
 *
 * UNRECOGNIZED STATES ARE COUNTED, AND FLAGGED. This is a deliberate
 * departure from the rest of this file, which excludes anything it cannot
 * read and reports it. That convention is about unreadable AMOUNTS, where
 * counting is impossible. Here the amount reads fine and only the state is
 * unfamiliar, so there is a real choice, and the two errors are not
 * symmetric:
 *
 *   - Counting an unknown state preserves exactly the behavior that was
 *     validated against Toast on the two gate days. A new Toast enum value
 *     changes no total until a human reads the anomaly.
 *   - Excluding an unknown state would silently move every total the moment
 *     Toast ships a new state name. An excluded discount pushes net UP -
 *     the same direction as the bug this fix removes, and just as invisible.
 *
 * So: count it, and make noise. The anomaly names the state so the fix is
 * one line once someone looks.
 *
 * Case is normalized before matching, and a mismatch in form is itself an
 * anomaly. A hypothetical "void" in lowercase must not slip through as
 * "unrecognized, therefore counted" - that is the one casing bug that would
 * quietly reintroduce the overcount. It is skipped AND reported.
 */
function discountIsInEffect(d, where, index, anomalies) {
  const raw = d.processingState;

  // Absent or null is the ordinary Toast-native case and by far the most
  // common: 111 of 127 items on 10037. Not an anomaly.
  if (raw === undefined || raw === null) return true;

  if (typeof raw !== "string") {
    anomalies.push(
      `${where}: appliedDiscounts[${index}].processingState is ${describe(raw)} (${String(raw)}), expected a string - ` +
        "COUNTED as in effect, because the discountAmount itself is readable. Verify against Toast's Sales Summary."
    );
    return true;
  }

  const state = raw.trim().toUpperCase();
  if (state !== raw) {
    anomalies.push(
      `${where}: appliedDiscounts[${index}].processingState is ${JSON.stringify(raw)}, not the expected uppercase form ` +
        `(${state}). Matched as ${state} anyway - flagged because Toast changing the casing of this enum would otherwise ` +
        "turn every void discount into an unrecognized state and silently restore the overcount."
    );
  }

  if (DISCOUNT_STATES_REMOVED.has(state)) return false;
  if (DISCOUNT_STATES_IN_EFFECT.has(state)) return true;

  anomalies.push(
    `${where}: appliedDiscounts[${index}].processingState is ${JSON.stringify(raw)}, which is not one of ` +
      `${[...DISCOUNT_STATES_IN_EFFECT, ...DISCOUNT_STATES_REMOVED].join("/")} or null - COUNTED as in effect. ` +
      "If this is a new REMOVED state, discounts are now too high by this discount's amount and " +
      "DISCOUNT_STATES_REMOVED in lib/toast.js needs it added."
  );
  return true;
}

/**
 * Sums one appliedDiscounts array. Shared by the check level and the
 * selection level, which are separate arrays in Toast's model and must both
 * be counted - a coupon on the whole check and a markdown on one item are
 * different objects and can coexist on the same check.
 *
 * Discounts Toast has removed (see DISCOUNT_STATES_REMOVED) are excluded from
 * the sum and accumulated into `skippedVoid` instead of being dropped
 * silently, so the size of what is being excluded stays visible in the sync
 * response and the workflow log - the same treatment refunds get for the
 * other-business-date case.
 */
function sumAppliedDiscounts(list, where, anomalies, skippedVoid) {
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

    // State is read only once the amount is known to be readable, so an
    // unreadable amount is reported as exactly one anomaly rather than two.
    if (!discountIsInEffect(d, where, i, anomalies)) {
      skippedVoid.count += 1;
      skippedVoid.amount = round2(skippedVoid.amount + value);
      return;
    }

    sum += value;
  });
  return sum;
}

/**
 * Total discounts on one check: check-level appliedDiscounts plus every
 * non-excluded selection's own appliedDiscounts, counting only those Toast
 * still has in effect.
 *
 * Selections that are voided or deferred are skipped, matching exactly what
 * the gross calculation skips. That alignment is required, not cosmetic: a
 * discount on a line whose sales were never counted would subtract money that
 * was never added, understating net.
 *
 * @param {object} check one check from a Toast order
 * @returns {{amount:number, anomalies:string[], skippedVoid:{count:number, amount:number}}}
 */
export function discountsForCheck(check) {
  const anomalies = [];
  const skippedVoid = { count: 0, amount: 0 };
  if (!check || check.voided || check.deleted) return { amount: 0, anomalies, skippedVoid };

  const where = checkRef(check);
  let amount = sumAppliedDiscounts(check.appliedDiscounts, `${where} check-level`, anomalies, skippedVoid);

  const selections = check.selections;
  if (selections !== undefined && selections !== null && !Array.isArray(selections)) {
    anomalies.push(`${where}: selections is ${describe(selections)}, expected array - selection discounts not counted`);
  } else {
    (selections || []).forEach((sel, i) => {
      if (!sel || typeof sel !== "object") return;
      if (sel.voided || sel.deferred) return;
      amount += sumAppliedDiscounts(sel.appliedDiscounts, `${where} selection[${i}]`, anomalies, skippedVoid);
    });
  }

  return { amount: round2(amount), anomalies, skippedVoid };
}

/**
 * Total refunds on one check for ONE business date, read from
 * payments[].refund.refundAmount and nothing else.
 *
 * Note what is NOT read: refund.tipRefundAmount, which Toast places on this
 * same object. Tips are excluded from net sales, so subtracting a tip refund
 * would be wrong. It is never referenced here - see the file-level note above
 * for why that is structural rather than a matter of remembering.
 *
 * WHY businessDate IS REQUIRED. Toast attributes a refund to the day the
 * REFUND was issued, not the day of the original order: "Refunds do not
 * affect financial data on the day of the original order. Refunds only affect
 * financial data on the day of the refund." The Refund object carries its own
 * refundBusinessDate for exactly this reason. Since orders are pulled by the
 * ORDER's businessDate, a check returned for day X can carry a refund issued
 * on a completely different day - counting it against X would put money on
 * the wrong date and disagree with every Toast report. So only refunds whose
 * refundBusinessDate equals the date being synced are counted.
 *
 * KNOWN GAP, and it is one-directional. A refund whose refundBusinessDate
 * differs from its order's businessDate is counted on NEITHER day: skipped
 * here (wrong date), and never seen on the refund's own day either, because
 * that day's ordersBulk pull returns orders by ORDER date and this order
 * belongs to a different one. Those refunds are missing from net entirely,
 * which always overstates net, never understates it.
 *
 * `skippedOtherDate` measures only the visible half of that gap - refunds
 * this day's pull DID return but that belong elsewhere. The other half is
 * invisible from here by construction: a refund issued on day X against an
 * order created before X never appears in X's pull at all, so it does not
 * even reach this counter. Confirmed on 2026-09-16: 10037 / 2026-08-28
 * reports skippedOtherDateCount 0 with an empty refund detail, while Toast
 * reports 9.20 of refunds that day. A zero here does NOT mean no refunds are
 * missing. Closing that half needs a separate sweep indexed on the refund's
 * own business date; it is not fixable inside a per-day order pull.
 *
 * @param {object} check              one check from a Toast order
 * @param {string|number} businessDate the date being synced, yyyyMMdd
 * @returns {{amount:number, anomalies:string[], skippedOtherDate:{count:number, amount:number}}}
 */
export function refundsForCheck(check, businessDate) {
  const wanted = normalizeBusinessDate(businessDate);
  if (!wanted) {
    // Deliberately fatal rather than defaulting to "count everything". A
    // missing date here cannot produce a correct answer, and the wrong
    // answer would be invisible downstream.
    throw new TypeError(
      `refundsForCheck requires the business date being synced as yyyyMMdd, got ${JSON.stringify(businessDate)}. ` +
        "Without it refunds cannot be attributed to the day Toast attributes them to."
    );
  }

  const anomalies = [];
  const skippedOtherDate = { count: 0, amount: 0 };
  const empty = { amount: 0, anomalies, skippedOtherDate };
  if (!check || check.voided || check.deleted) return empty;

  const where = checkRef(check);
  const payments = check.payments;
  if (payments === undefined || payments === null) return empty;
  if (!Array.isArray(payments)) {
    anomalies.push(`${where}: payments is ${describe(payments)}, expected array - refunds not counted`);
    return empty;
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
      // Counted as-is rather than flipped or dropped: guessing the sign is
      // how a silent 2x error gets in. The message spells out the arithmetic
      // so the gate comparison is not a squinting exercise.
      anomalies.push(
        `${where}: payments[${i}].refund.refundAmount is NEGATIVE (${value}) - SIGN CHECK. ` +
          "Counted as-is, not flipped. net = gross - discounts - refunds, so a negative refund ADDS to net " +
          `instead of subtracting: net will be too HIGH by 2x this amount (${round2(Math.abs(value) * 2)}). ` +
          "If net exceeds Toast's figure by exactly twice the refund total, this is the cause and refundsForCheck must negate."
      );
    }

    // Attribution. Only refunds issued ON the date being synced belong to it.
    const issuedOn = normalizeBusinessDate(refund.refundBusinessDate);
    if (!issuedOn) {
      anomalies.push(
        `${where}: payments[${i}].refund has no readable refundBusinessDate (${describe(refund.refundBusinessDate)}) - ` +
          `NOT counted, because it cannot be attributed to a day. Amount was ${value}.`
      );
      return;
    }
    if (issuedOn !== wanted) {
      // Expected and normal, not malformed - kept out of `anomalies` so it
      // does not drown the signals that mean something is actually broken.
      // Counted here instead, because this is the one-directional bias
      // described above and its size is worth knowing.
      skippedOtherDate.count += 1;
      skippedOtherDate.amount = round2(skippedOtherDate.amount + value);
      return;
    }

    amount += value;
  });

  return { amount: round2(amount), anomalies, skippedOtherDate };
}
