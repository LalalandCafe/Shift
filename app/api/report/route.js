import { buildDailyReport } from "@/lib/report";

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
    const report = await buildDailyReport(date);
    return Response.json(report);
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}