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
//
// Scoping: every branch below either guards an explicit storeCode against the
// session's grps, or filters the rows it returns by grp. The pilot is three
// stores today, but the tab is open to area managers, so a CA session must
// not be able to read a TX store by editing the query string.
//
// hasDriveThru / grpsWithDriveThru: every response carries these so the
// client can tell two different situations apart, which must never be
// collapsed into one message:
//
//   hasDriveThru: false  -> no store this session can see has drive-thru
//                           hardware AT ALL. Date-independent.
//   hasDriveThru: true   -> the region has hardware, but the selected date
//   + empty rows            window came back empty.
//
// grpsWithDriveThru narrows the same answer to one region, which is what a
// manager holding both grps needs when they filter the tab down to one.
//
// This is NOT a 403 and NOT a region allow-list. A CA-AZ manager gets a
// normal 200 with empty arrays and the flag set to false, and the tab stays
// visible for them. Both fields are derived from the data (see
// driveThruGrpsInScope below), so the day CA/AZ stores get hardware and
// start landing rows in drive_thru_daily, this begins returning true on its
// own with no code change here and no list to remember to edit.

import { supabaseAdmin } from "@/lib/supabase";
import { scopeRows, denyIfStoreOutOfScope } from "@/lib/scope";
import { accessOf } from "@/lib/auth";

const DT_METRIC = "dt_window";

function daysAgoISO(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

// PostgREST caps a single response at 1000 rows by default. A 90-day window
// across even one store's hourly rows, or the daily summary across every
// store, can exceed that - the same truncation class that once inflated WTD
// SPLH. Same pattern as lib/report.js's fetchAllRows: page with .range()
// until a page comes back short.
const PAGE_SIZE = 1000;

async function fetchAllRows(buildQuery, label) {
  const all = [];
  let from = 0;
  for (let guard = 0; guard < 200; guard++) {
    const { data, error } = await buildQuery(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(label + ": " + error.message);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return all;
}

/**
 * The grps in this session's scope that actually have drive-thru hardware.
 *
 * Read the question carefully, because what it does NOT ask is the whole
 * point. There is no date filter anywhere below. "This region has no
 * drive-thru hardware" and "this region has hardware but reported nothing in
 * the last 30 days" are different answers that deserve different copy, and a
 * windowed query cannot tell them apart.
 *
 * Returned as a list rather than a bare boolean because a manager who holds
 * both grps can filter the tab down to one of them. A boolean would force the
 * client to guess which of the two empty states applies to the filtered
 * region, which is exactly the conflation this flag exists to prevent.
 *
 * Derived from the data, never from a region allow-list:
 *   - the grps come from the stores table, so a new market appears on its own
 *   - membership comes from whether the grp's stores appear in
 *     drive_thru_daily at all
 * The first time a CA or AZ store syncs a drive_thru_daily row, "CA-AZ" joins
 * this list by itself and the tab starts working, with no code change here.
 *
 * Scoping note: resolved through stores.grp rather than through the
 * drive_thru_* views. stores.grp is the column the whole permission model is
 * built on (lib/permissions.js), so it is the one place grp is guaranteed to
 * exist; the views are maintained separately and this probe should not break
 * if one of them is ever rebuilt without carrying grp through.
 */
async function driveThruGrpsInScope(request) {
  const access = accessOf(request);

  let storeQuery = supabaseAdmin.from("stores").select("code, grp");
  if (access.allStores !== true) {
    // Fail closed, same as lib/permissions.js: a session with no grp sees no
    // stores, so it has no drive-thru regions either.
    if (!Array.isArray(access.grps) || access.grps.length === 0) return [];
    storeQuery = storeQuery.in("grp", access.grps);
  }
  const { data: stores, error } = await storeQuery;
  if (error) throw new Error("stores: " + error.message);

  const codesByGrp = new Map();
  for (const s of stores || []) {
    if (!s.grp) continue;
    if (!codesByGrp.has(s.grp)) codesByGrp.set(s.grp, []);
    codesByGrp.get(s.grp).push(s.code);
  }

  // One limit(1) probe per grp - two queries today, and bounded by the number
  // of markets rather than by the number of drive-thru rows. Asking once for
  // every code at a time and counting distinct grps would risk PostgREST's
  // 1000-row cap silently hiding a grp.
  const found = [];
  for (const [grp, codes] of codesByGrp) {
    const { data, error: probeError } = await supabaseAdmin
      .from("drive_thru_daily")
      .select("store_code")
      .in("store_code", codes)
      .limit(1);
    if (probeError) throw new Error("drive_thru_daily: " + probeError.message);
    if (data && data.length) found.push(grp);
  }
  return found;
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

    // One guard for every branch that names a store. The views that do not
    // name one are filtered by grp further down instead.
    //
    // Unchanged by the hasDriveThru work on purpose: a store outside this
    // session's region is still a 403, not an empty state. The empty state is
    // for a region with no hardware, which is not an access failure.
    if (storeCode) {
      const denied = await denyIfStoreOutOfScope(request, storeCode);
      if (denied) return denied;
    }

    const targets = await loadTarget();

    // Resolved once and attached to every branch below, so each of the three
    // views answers the "is there hardware in my scope" question identically.
    // A client that only ever calls one of them still gets the same contract.
    const grpsWithDriveThru = await driveThruGrpsInScope(request);
    const hasDriveThru = grpsWithDriveThru.length > 0;

    if (view === "hourly") {
      if (!storeCode) {
        return Response.json(
          { ok: false, error: "storeCode is required for view=hourly" },
          { status: 400 }
        );
      }
      const data = await fetchAllRows(
        (from, to) =>
          supabaseAdmin
            .from("drive_thru_hourly")
            .select("*")
            .eq("store_code", Number(storeCode))
            .gte("business_date", since)
            .order("business_date", { ascending: false })
            .order("departure_hour", { ascending: true })
            .range(from, to),
        "drive_thru_hourly"
      );
      return Response.json({
        ok: true,
        view,
        storeCode: Number(storeCode),
        targets,
        hasDriveThru,
        grpsWithDriveThru,
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
      // Without a storeCode this is every store, so it still needs filtering.
      // scopeRows is a no-op for admin and expects a grp field on each row.
      const rows = scopeRows(request, data || []);
      return Response.json({
        ok: true,
        view,
        targets,
        hasDriveThru,
        grpsWithDriveThru,
        rows,
      });
    }

    // default: summary, one row per store over the requested window
    const fetched = await fetchAllRows((from, to) => {
      let query = supabaseAdmin
        .from("drive_thru_daily")
        .select("*")
        .gte("business_date", since)
        .order("business_date", { ascending: true })
        .order("store_code", { ascending: true });
      if (storeCode) query = query.eq("store_code", Number(storeCode));
      return query.range(from, to);
    }, "drive_thru_daily");

    // Filtered before aggregation, so the per-store cards and the raw daily
    // array in the response describe the same set of stores.
    const data = scopeRows(request, fetched);

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

    return Response.json({
      ok: true,
      view,
      days,
      targets,
      hasDriveThru,
      grpsWithDriveThru,
      stores,
      daily: data,
    });
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}
