import { buildKitchenTrend } from "@/lib/report";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const store = searchParams.get("store");
    if (!store) {
      return Response.json({ ok: false, error: "Falta store" }, { status: 400 });
    }

    let endIso = searchParams.get("date");
    if (!endIso) {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      endIso = d.toISOString().slice(0, 10);
    }

    const weeks = searchParams.get("weeks") || 4;
    const trend = await buildKitchenTrend(store, endIso, weeks);
    return Response.json(trend);
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}
