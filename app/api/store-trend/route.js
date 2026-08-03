import { buildStoreTrend } from "@/lib/report";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const store = searchParams.get("store");
    const weeks = searchParams.get("weeks") || 4;

    let endIso = searchParams.get("date");
    if (!endIso) {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      endIso = d.toISOString().slice(0, 10);
    }

    // Sin tienda, devuelve la lista para poblar el selector
    if (!store) {
      const { data, error } = await supabaseAdmin
        .from("stores")
        .select("code, name, region, grp")
        .eq("active", true)
        .order("code");
      if (error) throw new Error(error.message);
      return Response.json({ ok: true, stores: data || [] });
    }

    const trend = await buildStoreTrend(store, endIso, weeks);
    return Response.json(trend);
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}