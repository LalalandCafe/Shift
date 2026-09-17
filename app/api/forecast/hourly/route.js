import { buildHourlyPlan } from "@/lib/hourly-shape";
import { denyIfStoreOutOfScope } from "@/lib/scope";

// Endpoint aparte y no un campo mas en /api/forecast a proposito: la curva
// solo se pide cuando alguien abre un dia. El planeador carga igual de
// rapido para quien nunca la abre.
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const store = searchParams.get("store");
    const weekStart = searchParams.get("weekStart");
    const lookback = searchParams.get("lookback");

    if (!store || !weekStart) {
      return Response.json(
        { ok: false, error: "Faltan store y weekStart (YYYY-MM-DD)" },
        { status: 400 }
      );
    }

    // Same scope guard as app/api/forecast/route.js. This endpoint is split
    // out for load reasons only, which does not make it any less of a way to
    // read another region's store.
    const denied = await denyIfStoreOutOfScope(request, store);
    if (denied) return denied;

    const data = await buildHourlyPlan(
      store,
      weekStart,
      lookback ? Number(lookback) : 4
    );

    return Response.json(data);
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}