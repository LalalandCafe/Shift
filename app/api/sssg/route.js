import { requireAdmin } from "@/lib/auth";
import { getComparableMonths, computeMonthComparison } from "@/lib/sssg";

// Admin only. Gated here (not just by hiding the nav tab) the same way
// app/api/stores/route.js gates its PATCH - middleware.js already blocks
// any non-admin session before a request reaches this file (every role
// besides admin is blocked chain-wide today per lib/permissions.js), but
// this is the route-local enforcement layer on top of that, same pattern.

function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Region filtering happens after computeMonthComparison(), which always
 * rolls up the whole chain. When a region is picked, the headline/comp
 * totals need to reflect just that region, not the chain totals with a
 * filtered table underneath them - otherwise the numbers on screen
 * wouldn't add up to what's in the rows.
 */
function totalsFor(stores, comparable) {
  const headlinePrior = round2(stores.reduce((a, r) => a + r.salesPrior, 0));
  const headlineCurrent = round2(stores.reduce((a, r) => a + r.salesCurrent, 0));
  const headlinePct = headlinePrior > 0 ? round2((headlineCurrent / headlinePrior - 1) * 100) : null;

  const compPrior = round2(comparable.reduce((a, r) => a + r.salesPrior, 0));
  const compCurrent = round2(comparable.reduce((a, r) => a + r.salesCurrent, 0));
  const compPct = compPrior > 0 ? round2((compCurrent / compPrior - 1) * 100) : null;

  return {
    headline: { prior: headlinePrior, current: headlineCurrent, pctChange: headlinePct },
    comparable: { prior: compPrior, current: compCurrent, pctChange: compPct, storeCount: comparable.length },
    gap: headlinePct !== null && compPct !== null ? round2(headlinePct - compPct) : null,
  };
}

export async function GET(request) {
  const denied = requireAdmin(request);
  if (denied) return denied;

  try {
    const { searchParams } = new URL(request.url);
    const region = searchParams.get("region") || "All";
    const requestedMonth = searchParams.get("month");

    const months = await getComparableMonths();
    const comparableMonths = months.filter((m) => m.comparable);

    const month = requestedMonth || comparableMonths[0]?.month || null;
    if (!month) {
      return Response.json(
        { ok: false, error: "No comparable month available yet", months },
        { status: 409 }
      );
    }

    const picked = months.find((m) => m.month === month);
    if (!picked) {
      return Response.json({ ok: false, error: `Unknown month ${month}`, months }, { status: 400 });
    }
    if (!picked.comparable) {
      return Response.json(
        { ok: false, error: `${picked.label} is not comparable: ${picked.reason}`, months },
        { status: 400 }
      );
    }

    const result = await computeMonthComparison(month);

    const inRegion = (r) => region === "All" || r.region === region;
    const stores = result.stores.filter(inRegion);
    const comparable = result.comparable.filter(inRegion);
    const excluded = result.excluded.filter(inRegion);
    const totals = region === "All" ? result.totals : totalsFor(stores, comparable);
    const regions = [...new Set(result.stores.map((r) => r.region))].sort();

    return Response.json({
      ok: true,
      month: result.month,
      monthLabel: result.monthLabel,
      priorMonth: result.priorMonth,
      priorMonthLabel: result.priorMonthLabel,
      region,
      regions,
      months,
      stores,
      comparable,
      excluded,
      totals,
    });
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}
