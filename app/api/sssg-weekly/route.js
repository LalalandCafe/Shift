import { requireAdmin } from "@/lib/auth";
import { computeWeekComparison } from "@/lib/sssg";
import { getWeekStart } from "@/lib/fiscal";

// Weekly SSSG (SSSG-FILTERS). Own route, own file - deliberately not added
// to app/api/sssg/route.js, which stays exactly as it was and continues to
// serve only the existing monthly tab. The two routes share nothing but
// the requireAdmin gate pattern and lib/sssg.js's fetch helpers, several
// layers below computeWeekComparison/computeMonthComparison - neither
// route can affect the other's output.
//
// `stores`: comma-separated store codes the filter bar has ticked. Absent
// entirely -> no filter, every active store counts (the pre-filter-bar
// default, and what the very first request of a session sends before it
// knows the store universe to select from). Present, even as an empty
// string -> an explicit selection, computeWeekComparison(week, new Set())
// for "zero stores" included, which is a real, distinct state from "no
// filter" - see that function's own comment for why this distinction has
// to survive all the way through, not get collapsed into "all" somewhere
// on the way.

export async function GET(request) {
  const denied = requireAdmin(request);
  if (denied) return denied;

  try {
    const { searchParams } = new URL(request.url);
    const weekStart = searchParams.get("week") || getWeekStart();
    const storesParam = searchParams.get("stores");
    const selectedCodes =
      storesParam === null
        ? null
        : new Set(
            storesParam
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
              .map(Number)
          );

    const result = await computeWeekComparison(weekStart, selectedCodes);
    const markets = [...new Set(result.stores.map((s) => s.region))].sort();

    return Response.json({ ok: true, ...result, markets });
  } catch (err) {
    if (err.message.startsWith("weekStart must be a Monday")) {
      return Response.json({ ok: false, error: err.message }, { status: 400 });
    }
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}
