import { buildThroughput, mondayOf } from "@/lib/throughput";
import { requireAdmin } from "@/lib/auth";

// Admin only, enforced here and not only in middleware.js. Same pattern as
// app/api/sssg/route.js: middleware's ADMIN_ONLY_API list is the outer layer,
// this is the one that survives a change to that list. Before regional access
// existed every non-admin got a blanket 403, so this route was admin-only by
// side effect; admitting area managers removed that side effect and the gate
// has to be stated.

export async function GET(request) {
  const denied = requireAdmin(request);
  if (denied) return denied;

  try {
    const { searchParams } = new URL(request.url);

    // Por default, la semana en curso.
    let weekStart = searchParams.get("weekStart");
    if (!weekStart) {
      const today = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit",
      }).format(new Date());
      weekStart = mondayOf(today);
    }

    const result = await buildThroughput(weekStart);
    return Response.json(result);
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}