import { getTimeEntries } from "@/lib/toast";
import { translateTimeEntries } from "@/lib/toast-labels";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const guid = searchParams.get("guid");

    if (!startDate || !endDate) {
      return Response.json(
        { ok: false, error: "Faltan startDate y endDate (ISO 8601)" },
        { status: 400 }
      );
    }

    const entries = await getTimeEntries({ restaurantGuid: guid, startDate, endDate });
    const translated = await translateTimeEntries(entries, guid);
    const uniqueJobs = [...new Set(translated.map((t) => t.jobTitle))];

    return Response.json({
      ok: true,
      count: translated.length,
      uniqueJobTitles: uniqueJobs,
      entries: translated,
    });
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}
