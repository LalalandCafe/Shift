// Syncs one window of drive-thru data for ONE store.
// Goes in app/api/hme/sync-store/route.js
//
// The GitHub Actions workflow loops over windows and stores, the same way
// it already does for Toast. Every call here is short and bounded, so it
// never runs into the Vercel timeout.
//
// POST body:
//   { storeCode, hmeStoreNumber, startDateTime, endDateTime }
// Header:
//   x-sync-secret

import { supabaseAdmin } from "@/lib/supabase";
import { fetchWindow } from "@/lib/hme";

export const maxDuration = 60;

export async function POST(request) {
  try {
    if (request.headers.get("x-sync-secret") !== process.env.SYNC_SECRET) {
      return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    for (const v of ["HME_SERVICE_ACCOUNT", "HME_AUTH_KEY", "HME_ACCOUNT_EMAIL"]) {
      if (!process.env[v]) {
        return Response.json(
          { ok: false, error: `Missing environment variable ${v}` },
          { status: 500 }
        );
      }
    }

    const { storeCode, hmeStoreNumber, startDateTime, endDateTime } =
      await request.json();

    if (!storeCode || !hmeStoreNumber || !startDateTime || !endDateTime) {
      return Response.json(
        {
          ok: false,
          error: "Missing storeCode, hmeStoreNumber, startDateTime or endDateTime",
        },
        { status: 400 }
      );
    }

    const code = Number(storeCode);

    // HME serves nothing older than 90 days.
    const floor = new Date(Date.now() - 89 * 24 * 3600e3);
    const start = new Date(startDateTime) < floor ? floor : new Date(startDateTime);
    const end = new Date(endDateTime);

    if (end <= start) {
      return Response.json(
        { ok: false, error: "endDateTime must be later than startDateTime" },
        { status: 400 }
      );
    }
    if (end - start > 71 * 3600e3) {
      return Response.json(
        { ok: false, error: "Window cannot exceed 71 hours" },
        { status: 400 }
      );
    }

    const rows = await fetchWindow(
      hmeStoreNumber,
      code,
      start.toISOString(),
      end.toISOString()
    );

    // Upsert on record_id. HME can insert late records inside a range that
    // was already fetched (FIFO), so re-fetching is free and never duplicates.
    let written = 0;
    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const slice = rows.slice(i, i + CHUNK);
      const { error } = await supabaseAdmin
        .from("hme_car_events")
        .upsert(slice, { onConflict: "record_id" });
      if (error) throw new Error(`Upsert failed: ${error.message}`);
      written += slice.length;
    }

    // The watermark only moves forward, never backward, so that a backfill
    // running over old history cannot rewind the incremental sync's position.
    let newest = null;
    for (const r of rows) {
      const d = new Date(r.departure_time);
      if (!newest || d > newest) newest = d;
    }

    const { data: prior } = await supabaseAdmin
      .from("hme_sync_state")
      .select("last_departure_time")
      .eq("store_code", code)
      .maybeSingle();

    const priorWm = prior?.last_departure_time
      ? new Date(prior.last_departure_time)
      : null;
    const watermark = !newest
      ? priorWm
      : !priorWm || newest > priorWm
      ? newest
      : priorWm;

    const { error: stateErr } = await supabaseAdmin.from("hme_sync_state").upsert(
      {
        store_code: code,
        last_departure_time: watermark ? watermark.toISOString() : null,
        last_sync_at: new Date().toISOString(),
        last_status: "ok",
        last_error: null,
        records_synced: written,
      },
      { onConflict: "store_code" }
    );
    if (stateErr) throw new Error(`Sync state update failed: ${stateErr.message}`);

    return Response.json({
      ok: true,
      storeCode: code,
      hmeStoreNumber,
      window: { start: start.toISOString(), end: end.toISOString() },
      cars: written,
      newestDeparture: newest ? newest.toISOString() : null,
    });
  } catch (err) {
    // Record the failure without bringing down the whole run.
    try {
      const body = await request.clone().json();
      if (body?.storeCode) {
        await supabaseAdmin.from("hme_sync_state").upsert(
          {
            store_code: Number(body.storeCode),
            last_sync_at: new Date().toISOString(),
            last_status: "error",
            last_error: String(err.message).slice(0, 500),
          },
          { onConflict: "store_code" }
        );
      }
    } catch {}

    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}