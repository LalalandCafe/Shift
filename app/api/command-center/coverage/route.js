import { requireAdmin } from "@/lib/auth";
import { monthCoverage, monthLabel } from "@/lib/coverage";

// Admin only, gated here the same way app/api/sssg/route.js gates itself -
// middleware.js already blocks any non-admin session chain-wide today, but
// this is the route-local layer on top of that, same pattern.
//
// GET /api/command-center/coverage?months=2026-09,2025-09
//
// months: comma-separated "YYYY-MM" list. Defaults to [this calendar
// month, the same month last year] - the one comparison shape that
// already exists in the app (lib/sssg.js's SSSG pairing) - when omitted.
// Any Command Center view that needs coverage for a different set of
// months (a trend window, a different prior-period shape) passes its own
// list; this route doesn't assume SSSG's specific pairing beyond the
// default.

function defaultMonths() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1; // 1-indexed
  const thisMonth = `${y}-${String(m).padStart(2, "0")}`;
  const lastYear = `${y - 1}-${String(m).padStart(2, "0")}`;
  return [thisMonth, lastYear];
}

export async function GET(request) {
  const denied = requireAdmin(request);
  if (denied) return denied;

  try {
    const { searchParams } = new URL(request.url);
    const raw = searchParams.get("months");
    const months = raw
      ? raw.split(",").map((m) => m.trim()).filter(Boolean)
      : defaultMonths();

    if (!months.length) {
      return Response.json({ ok: false, error: "No months to check" }, { status: 400 });
    }
    if (!months.every((m) => /^\d{4}-\d{2}$/.test(m))) {
      return Response.json(
        { ok: false, error: "months must be YYYY-MM, comma-separated" },
        { status: 400 }
      );
    }

    const coverage = await monthCoverage(months);
    const withLabels = coverage.map((c) => ({ ...c, label: monthLabel(c.month) }));

    return Response.json({
      ok: true,
      months: withLabels,
      allCovered: withLabels.every((c) => c.covered),
    });
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}
