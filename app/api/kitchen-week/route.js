import { buildKitchenWeek } from "@/lib/report";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    let isoDate = searchParams.get("date");
    if (!isoDate) {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      isoDate = d.toISOString().slice(0, 10);
    }
    const result = await buildKitchenWeek(isoDate);
    return Response.json(result);
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}