import { buildDailyReport, groupStoresForEmail } from "@/lib/report";
import { generateEmailHTML } from "@/lib/email-generator";
import { requireAdmin } from "@/lib/auth";

// Admin only, enforced here and not only in middleware.js. Same pattern as
// app/api/sssg/route.js: middleware's ADMIN_ONLY_API list is the outer layer,
// this is the one that survives a change to that list. Before regional access
// existed every non-admin got a blanket 403, so this route was admin-only by
// side effect; admitting area managers removed that side effect and the gate
// has to be stated.

export async function GET(request) {
  // requireAdmin returns a JSON Response; this route otherwise serves HTML.
  // A 403 with a JSON body is fine and is what every other guarded route
  // sends, so the shape of a denial stays the same across the whole API.
  const denied = requireAdmin(request);
  if (denied) return denied;

  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date");
    const group = searchParams.get("group");
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return new Response("Falta parametro date en formato YYYY-MM-DD", { status: 400 });
    }
    const report = await buildDailyReport(date);
    const filteredRows = group ? report.rows.filter((r) => r.grp === group) : report.rows;
    const groupedStores = groupStoresForEmail(filteredRows);
    const html = generateEmailHTML({
      day: report.dayName,
      weekNumber: report.weekNum,
      refDate: date,
      groupedStores,
      isFullWeek: false,
      hasPTD: true,
      acNote: "",
    });
    return new Response(html, { headers: { "Content-Type": "text/html" } });
  } catch (err) {
    return new Response("Error: " + err.message, { status: 500 });
  }
}