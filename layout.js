import { getTimeEntries } from "@/lib/toast";

// GET /api/toast/labor?startDate=...&endDate=...&guid=...
// Jala time entries crudos de Toast. No escribe a Supabase.
// Util para inspeccionar la forma de los datos antes de mapearlos.
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const guid = searchParams.get("guid"); // opcional, usa el default si no viene

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
