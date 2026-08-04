import { getToastToken, getTimeEntries } from "@/lib/toast";
import { translateTimeEntries } from "@/lib/toast-labels";
import { supabaseAdmin } from "@/lib/supabase";

export const maxDuration = 60;

// Un ticket que tarda mas de esto no es lento, es que nunca se marco
// cumplido en el KDS (se le olvido a alguien, o quedo abierto toda la
// noche). Se excluye del promedio y se cuenta aparte como "stuck".
const STUCK_THRESHOLD_MIN = 30;

async function computeGrossSales(businessDate, restaurantGuid) {
  const token = await getToastToken();
  const headers = {
    Authorization: "Bearer " + token,
    "Toast-Restaurant-External-ID": restaurantGuid,
  };

  let grossSales = 0;
  const PAGE_SIZE = 100;
  let page = 1;

  while (page <= 200) {
    const url =
      process.env.TOAST_API_HOST +
      "/orders/v2/ordersBulk?businessDate=" + businessDate +
      "&pageSize=" + PAGE_SIZE +
      "&page=" + page;

    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error("ordersBulk fallo: " + (await res.text()));
    const orders = await res.json();
    if (!Array.isArray(orders) || orders.length === 0) break;

    orders.forEach((order) => {
      if (!order || order.voided || order.deleted || order.excessFood) return;
      (order.checks || []).forEach((check) => {
        if (check.voided || check.deleted) return;
        (check.selections || []).forEach((sel) => {
          if (sel.voided) return;
          if (sel.deferred) return;
          grossSales += (sel.preDiscountPrice || 0);
        });
      });
    });

    if (orders.length < PAGE_SIZE) break;
    page++;
  }

  return Math.round(grossSales * 100) / 100;
}

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[idx];
}

async function computeKitchenMetrics(businessDate, restaurantGuid) {
  const token = await getToastToken();
  const headers = {
    Authorization: "Bearer " + token,
    "Toast-Restaurant-External-ID": restaurantGuid,
  };

  const url =
    process.env.TOAST_API_HOST +
    "/kitchen/v1/export/itemFulfillments?businessDate=" + businessDate;

  const res = await fetch(url, { headers });
  if (res.status === 204) {
    return { itemCount: 0, medianMin: null, avgMin: null, p90Min: null, stuckCount: 0 };
  }
  if (!res.ok) throw new Error("kitchen fulfillments fallo: " + (await res.text()));

  const items = await res.json();
  if (!Array.isArray(items) || !items.length) {
    return { itemCount: 0, medianMin: null, avgMin: null, p90Min: null, stuckCount: 0 };
  }

  const durationsMin = [];
  let stuckCount = 0;

  items.forEach((it) => {
    if (!it.ticketFiredAt || !it.itemFulfilledAt) return;
    const fired = new Date(it.ticketFiredAt).getTime();
    const done = new Date(it.itemFulfilledAt).getTime();
    if (!isFinite(fired) || !isFinite(done) || done < fired) return;
    const min = (done - fired) / 60000;
    if (min > STUCK_THRESHOLD_MIN) {
      stuckCount++;
      return;
    }
    durationsMin.push(min);
  });

  durationsMin.sort((a, b) => a - b);

  return {
    itemCount: items.length,
    medianMin: durationsMin.length ? Math.round(percentile(durationsMin, 0.5) * 10) / 10 : null,
    avgMin: durationsMin.length
      ? Math.round((durationsMin.reduce((a, b) => a + b, 0) / durationsMin.length) * 10) / 10
      : null,
    p90Min: durationsMin.length ? Math.round(percentile(durationsMin, 0.9) * 10) / 10 : null,
    stuckCount,
  };
}

export async function POST(request) {
  try {
    const secret = request.headers.get("x-sync-secret");
    if (secret !== process.env.SYNC_SECRET) {
      return Response.json({ ok: false, error: "No autorizado" }, { status: 401 });
    }
    const body = await request.json();
    const { storeCode, restaurantGuid, businessDate, isoDate } = body;
    if (!storeCode || !restaurantGuid || !businessDate || !isoDate) {
      return Response.json(
        { ok: false, error: "Faltan storeCode, restaurantGuid, businessDate (YYYYMMDD) o isoDate (YYYY-MM-DD)" },
        { status: 400 }
      );
    }

    const started = Date.now();

    // Esta ventana se usa para DOS cosas: pedirle los turnos a Toast y
    // decidir que filas borrar. Tienen que ser identicas, si no se borran
    // turnos legitimos de la jornada anterior.
    const startDate = isoDate + "T00:00:00.000-0500";
    const endDate = isoDate + "T23:59:59.000-0500";

    const rawEntries = await getTimeEntries({ restaurantGuid, startDate, endDate });
    const translated = await translateTimeEntries(rawEntries, restaurantGuid);

    const laborRows = translated.map((t) => ({
      toast_entry_id: t.guid,
      store_id: String(storeCode),
      employee_name: t.employee,
      employee_id: null,
      job_title: t.jobTitle,
      clock_in: t.inDate,
      clock_out: t.outDate,
      hours: (t.regularHours || 0) + (t.overtimeHours || 0),
      raw_data: t,
      synced_at: new Date().toISOString(),
    }));

    let deletedStale = 0;
    if (laborRows.length) {
      const keepIds = new Set(laborRows.map((r) => r.toast_entry_id));

      const { data: existing, error: exErr } = await supabaseAdmin
        .from("toast_labor_shifts")
        .select("toast_entry_id")
        .eq("store_id", String(storeCode))
        .gte("clock_in", startDate)
        .lte("clock_in", endDate);
      if (exErr) throw new Error("Leer existentes fallo: " + exErr.message);

      const stale = (existing || [])
        .map((r) => r.toast_entry_id)
        .filter((id) => !keepIds.has(id));

      if (stale.length) {
        const { error: delErr } = await supabaseAdmin
          .from("toast_labor_shifts")
          .delete()
          .in("toast_entry_id", stale);
        if (delErr) throw new Error("Borrar huerfanos fallo: " + delErr.message);
        deletedStale = stale.length;
      }

      const { error: laborErr } = await supabaseAdmin
        .from("toast_labor_shifts")
        .upsert(laborRows, { onConflict: "toast_entry_id" });
      if (laborErr) throw new Error("Guardar labor fallo: " + laborErr.message);
    }

    const grossSales = await computeGrossSales(businessDate, restaurantGuid);
    const { error: salesErr } = await supabaseAdmin
      .from("daily_sales")
      .upsert(
        [{ store_code: storeCode, business_date: isoDate, gross_sales: grossSales, synced_at: new Date().toISOString() }],
        { onConflict: "store_code,business_date" }
      );
    if (salesErr) throw new Error("Guardar ventas fallo: " + salesErr.message);

    // Kitchen metrics: si falla, no tumba el sync completo. Las ventas
    // y horas son lo critico, el tiempo de ticket es un extra.
    let kitchen = null;
    let kitchenError = null;
    try {
      kitchen = await computeKitchenMetrics(businessDate, restaurantGuid);
      const { error: kErr } = await supabaseAdmin
        .from("kitchen_metrics")
        .upsert(
          [{
            store_code: storeCode,
            business_date: isoDate,
            item_count: kitchen.itemCount,
            median_minutes: kitchen.medianMin,
            avg_minutes: kitchen.avgMin,
            p90_minutes: kitchen.p90Min,
            stuck_count: kitchen.stuckCount,
            synced_at: new Date().toISOString(),
          }],
          { onConflict: "store_code,business_date" }
        );
      if (kErr) throw new Error(kErr.message);
    } catch (e) {
      kitchenError = e.message;
    }

    return Response.json({
      ok: true,
      storeCode,
      date: isoDate,
      elapsedSeconds: Math.round((Date.now() - started) / 1000),
      laborEntriesSynced: laborRows.length,
      staleRemoved: deletedStale,
      grossSales,
      kitchen,
      kitchenError,
    });
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}