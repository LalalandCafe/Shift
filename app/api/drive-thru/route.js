// Read-only endpoint for the drive-thru tab.
// Goes in app/api/drive-thru/route.js
//
// This route only reads. The sync lives in app/api/hme/sync-store/route.js
// and runs from GitHub Actions, never from here.
//
//   GET /api/drive-thru?days=30
//   GET /api/drive-thru?days=30&storeCode=10008&view=hourly

import { supabaseAdmin } from "@/lib/supabase";

function daysAgoISO(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const days = Math.min(parseInt(searchParams.get("days") || "30", 10), 90);
    const storeCode = searchParams.get("storeCode");
    const view = searchParams.get("view") || "summary";
    const since = daysAgoISO(days);

    const { data: targets, error: targetsErr } = await supabaseAdmin
      .from("drive_thru_targets")
      .select("green_seconds, yellow_seconds")
      .eq("id", 1)
      .single();
    if (targetsErr) throw new Error(`targets: ${targetsErr.message}`);

    if (view === "hourly") {
      if (!storeCode) {
        return Response.json(
          { ok: false, error: "storeCode is required for view=hourly" },
          { status: 400 }
        );
      }
      const { data, error } = await supabaseAdmin
        .from("drive_thru_hourly")
        .select("*")
        .eq("store_code", Number(storeCode))
        .gte("business_date", since)
        .order("business_date", { ascending: false })
        .order("departure_hour", { ascending: true });
      if (error) throw new Error(error.message);
      return Response.json({ ok: true, view, storeCode: Number(storeCode), targets, rows: data });
    }

    if (view === "distribution") {
      let query = supabaseAdmin.from("drive_thru_distribution").select("*");
      if (storeCode) query = query.eq("store_code", Number(storeCode));
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return Response.json({ ok: true, view, targets, rows: data });
    }

    // default: summary, one row per store over the requested window
    let query = supabaseAdmin
      .from("drive_thru_daily")
      .select("*")
      .gte("business_date", since);
    if (storeCode) query = query.eq("store_code", Number(storeCode));
    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const byStore = new Map();
    for (const r of data) {
      const key = r.store_code;
      const cur = byStore.get(key) || {
        storeCode: r.store_code,
        storeName: r.store_name,
        region: r.region,
        grp: r.grp,
        cars: 0,
        greenCars: 0,
        redCars: 0,
        windowSum: 0,
        menuSum: 0,
        greetSum: 0,
        days: 0,
      };
      cur.cars += r.car_count || 0;
      cur.greenCars += r.green_cars || 0;
      cur.redCars += r.red_cars || 0;
      cur.windowSum += (r.avg_window_time || 0) * (r.car_count || 0);
      cur.menuSum += (r.avg_menu_time || 0) * (r.car_count || 0);
      cur.greetSum += (r.avg_greet_time || 0) * (r.car_count || 0);
      cur.days += 1;
      byStore.set(key, cur);
    }

    const stores = [...byStore.values()]
      .map((s) => ({
        storeCode: s.storeCode,
        storeName: s.storeName,
        region: s.region,
        grp: s.grp,
        cars: s.cars,
        daysWithData: s.days,
        avgWindowTime: s.cars ? Math.round(s.windowSum / s.cars) : null,
        avgMenuTime: s.cars ? Math.round(s.menuSum / s.cars) : null,
        avgGreetTime: s.cars ? Math.round(s.greetSum / s.cars) : null,
        pctGreen: s.cars ? +((100 * s.greenCars) / s.cars).toFixed(1) : null,
        pctRed: s.cars ? +((100 * s.redCars) / s.cars).toFixed(1) : null,
      }))
      .sort((a, b) => (a.avgWindowTime ?? 1e9) - (b.avgWindowTime ?? 1e9));

    return Response.json({ ok: true, view, days, targets, stores, daily: data });
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}