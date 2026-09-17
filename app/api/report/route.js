import { buildDailyReport } from "@/lib/report";
import { sessionFrom } from "@/lib/auth";
import { scopeRows, isAdminRequest } from "@/lib/scope";

/**
 * unanswered and responseRate describe how well a store is replying to its
 * own guest reviews. That's coaching material for whoever runs that store,
 * not something every signed-in viewer should see about every other store
 * on the chain, so a non-admin viewer never receives these two fields at
 * all — not hidden in a component, gone before the response leaves the
 * server. rating and count stay: those are the numbers a store is graded
 * on, same as every other board.
 *
 * Fail closed, same as lib/permissions.js: an unrecognized or missing
 * session strips the fields, it does not leave them in by default.
 */
function stripReviewResponseFields(report) {
  (report.rows || []).forEach((row) => {
    ["week", "period"].forEach((windowKey) => {
      const rev = row.reviews?.[windowKey];
      if (!rev) return;
      delete rev.unanswered;
      delete rev.responseRate;
    });
  });
  return report;
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date");
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return Response.json(
        { ok: false, error: "Falta parametro date en formato YYYY-MM-DD" },
        { status: 400 }
      );
    }
    let report = await buildDailyReport(date);

    const session = sessionFrom(request);
    if (!session || session.role !== "admin") {
      report = stripReviewResponseFields(report);
    }

    // Scoping happens here, not in the client. rows is what this session may
    // see; everything downstream (Week view, Dashboard, Excel, the emailed
    // report) reads rows and therefore inherits the scope for free.
    const allRows = report.rows || [];
    const scoped = scopeRows(request, allRows);
    const admin = isAdminRequest(request);

    // The one deliberate exception: the leaderboard ranks against the whole
    // chain, because a ranking of a third of the stores is not a ranking.
    // It ships as a separate key so nothing else can pick it up by accident,
    // and only for sessions that are actually scoped — an admin already has
    // the same data in rows, and sending it twice would double the payload.
    //
    // Same row shape as rows on purpose: components/Leaderboard.js reads it
    // unchanged. If the chain-wide detail here ever needs trimming, trim it
    // in this one spot after checking which fields that component uses.
    const body = {
      ...report,
      rows: scoped,
      storeCount: scoped.length,
    };
    if (!admin) body.leaderboardRows = allRows;

    return Response.json(body);
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}