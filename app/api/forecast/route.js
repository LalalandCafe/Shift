import { buildForecast, mondayOf } from "@/lib/forecast";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const store = searchParams.get("store");
    if (!store) {
      return Response.json({ ok: false, error: "Falta store" }, { status: 400 });
    }

    // Por default, la semana que viene (los horarios se hacen con anticipacion)
    let weekStart = searchParams.get("weekStart");
    if (!weekStart) {
      const today = new Date().toISOString().slice(0, 10);
      const thisMonday = mondayOf(today);
      const d = new Date(thisMonday + "T12:00:00Z");
      d.setUTCDate(d.getUTCDate() + 7);
      weekStart = d.toISOString().slice(0, 10);
    }

    const lookback = searchParams.get("lookback") || 4;
    const result = await buildForecast(store, weekStart, lookback);
    return Response.json(result);
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { storeCode, days } = body;

    if (!storeCode || !Array.isArray(days)) {
      return Response.json({ ok: false, error: "Falta storeCode o days" }, { status: 400 });
    }

    const rows = [];
    for (const d of days) {
      if (!d.date) continue;
      const h = Number(d.plannedHours);
      if (!isFinite(h) || h < 0 || h > 1000) continue;
      rows.push({
        store_code: Number(storeCode),
        business_date: d.date,
        planned_hours: h,
        updated_at: new Date().toISOString(),
      });
    }

    if (!rows.length) {
      return Response.json({ ok: false, error: "Nada valido para guardar" }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("planned_hours")
      .upsert(rows, { onConflict: "store_code,business_date" });
    if (error) throw new Error(error.message);

    return Response.json({ ok: true, saved: rows.length });
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}

// Borra un dia especifico, o toda la semana si se pasa weekStart.
// Sin esto no habia forma de deshacer un plan capturado, solo corregirlo.
export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const store = searchParams.get("store");
    const date = searchParams.get("date");
    const weekStart = searchParams.get("weekStart");

    if (!store) {
      return Response.json({ ok: false, error: "Falta store" }, { status: 400 });
    }
    if (!date && !weekStart) {
      return Response.json({ ok: false, error: "Falta date o weekStart" }, { status: 400 });
    }

    let q = supabaseAdmin
      .from("planned_hours")
      .delete()
      .eq("store_code", Number(store));

    if (date) {
      q = q.eq("business_date", date);
    } else {
      const ws = mondayOf(weekStart);
      const d = new Date(ws + "T12:00:00Z");
      d.setUTCDate(d.getUTCDate() + 6);
      const we = d.toISOString().slice(0, 10);
      q = q.gte("business_date", ws).lte("business_date", we);
    }

    const { error } = await q;
    if (error) throw new Error(error.message);

    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}