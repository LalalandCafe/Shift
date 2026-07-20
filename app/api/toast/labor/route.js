import { getTimeEntries } from "@/lib/toast";

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

    const entries = await getTimeEntries({
      restaurantGuid: guid,
      startDate,
      endDate,
    });

    return Response.json({ ok: true, count: entries.length, entries });
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}
