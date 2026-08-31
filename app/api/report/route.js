import { buildDailyReport } from "@/lib/report";
import { sessionFrom } from "@/lib/auth";

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

    return Response.json(report);
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}
