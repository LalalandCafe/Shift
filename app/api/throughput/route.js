import { buildThroughput, mondayOf } from "@/lib/throughput";

export async function GET(request) {
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