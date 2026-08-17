// Read-only endpoint for the drive-thru tab.
// Goes in app/api/drive-thru/route.js
//
// This route only reads. The sync lives in app/api/hme/sync-store/route.js
// and runs from GitHub Actions, never from here.
//
//   GET /api/drive-thru?days=30
//   GET /api/drive-thru?days=30&storeCode=10008&view=hourly
//   GET /api/drive-thru?storeCode=10008&view=distribution
//
// Thresholds come from metric_targets and are passed through untouched. This
// route does not know what 105 seconds means and must never decide it.

import { supabaseAdmin } from "@/lib/supabase";

const DT_METRIC = "dt_window";

function daysAgoISO(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

async function loadTarget() {
  // green_value is optional on this table: it lets a metric name its own
  // green line instead of accepting target * 0.85. Drive-thru window time
  // sets it (2:00 while the target is 2:30), so it must be selected here or
  // the client silently falls back to the 85% default and every color on
  // this tab drifts from what operations actually configured.
  const { data, error } = await supabaseAdmin
    .from("metric_targets")
    .select("metric, label, target_value, red_value, green_value, unit, lower_is_better")
    .eq("metric", DT_METRIC)
    .single();
  if (error) throw new Error(`metric_targets: ${error.message}`);
  return data;
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const days = Math.min(parseInt(searchParams.get("days") || "30", 10), 90);
    const storeCode = searchParams.get("storeCode");
    const view = searchParams.get("view") || "summary";
    const since = daysAgoISO(days);

    const targets = await loadTarget();

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
      return Response.json({
        ok: true,
        view,
        storeCode: Number(storeCode),
        targets,
        rows: data,
      });
    }

    if (view === "distribution") {
      let query = supabaseAdmin
        .from("drive_thru_distribution")
        .select("*")
        .order("bucket_order", { ascending: true });
      if (storeCode) query = query.eq("store_code", Number(storeCode));
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return Response.json({ ok: true, view, targets, rows: data });
    }

    // default: summary, one row per store over the requested window
    let query = supabaseAdmin.from("drive_thru_daily").select("*").gte("business_date", since);
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
        bandGreen: 0,
        bandLightGreen: 0,
        bandLightRed: 0,
        bandRed: 0,
        atTarget: 0,
        overRed: 0,
        windowSum: 0,
        menuSum: 0,
        greetSum: 0,
        days: 0,
      };
      cur.cars += r.car_count || 0;
      cur.bandGreen += r.band_green || 0;
      cur.bandLightGreen += r.band_light_green || 0;
      cur.bandLightRed += r.band_light_red || 0;
      cur.bandRed += r.band_red || 0;
      cur.atTarget += r.green_cars || 0;
      cur.overRed += r.red_cars || 0;
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
        pctGreen: s.cars ? +((100 * s.atTarget) / s.cars).toFixed(1) : null,
        pctRed: s.cars ? +((100 * s.overRed) / s.cars).toFixed(1) : null,
        bands: {
          green: s.bandGreen,
          lightGreen: s.bandLightGreen,
          lightRed: s.bandLightRed,
          red: s.bandRed,
        },
      }))
      // Fixed order by store number. Cards must not reshuffle because one
      // store had a bad Tuesday, or nobody can find their store twice.
      .sort((a, b) => a.storeCode - b.storeCode);

    return Response.json({ ok: true, view, days, targets, stores, daily: data });
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}
