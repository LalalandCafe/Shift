import { supabaseAdmin } from "@/lib/supabase";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const store = searchParams.get("store");
    const date = searchParams.get("date");
    if (!store || !date) {
      return Response.json({ ok: false, error: "Falta store o date" }, { status: 400 });
    }

    const { data: overall, error: oErr } = await supabaseAdmin
      .from("kitchen_metrics")
      .select("item_count, median_minutes, avg_minutes, p90_minutes, stuck_count")
      .eq("store_code", Number(store))
      .eq("business_date", date)
      .maybeSingle();
    if (oErr) throw new Error(oErr.message);

    const { data: stations, error: sErr } = await supabaseAdmin
      .from("kitchen_station_metrics")
      .select("prep_station_name, item_count, median_minutes, avg_minutes, p90_minutes, stuck_count")
      .eq("store_code", Number(store))
      .eq("business_date", date)
      .order("median_minutes", { ascending: false });
    if (sErr) throw new Error(sErr.message);

    return Response.json({
      ok: true,
      store: Number(store),
      date,
      overall: overall || null,
      stations: stations || [],
    });
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}