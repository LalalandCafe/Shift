import { getToastToken, getTimeEntries } from "@/lib/toast";
import { translateTimeEntries } from "@/lib/toast-labels";
import { supabaseAdmin } from "@/lib/supabase";

export const maxDuration = 60;

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
    const startDate = isoDate + "T00:00:00.000-0500";
    const endDate = isoDate + "T23:59:59.000-0500";
    const rawEntries = await getTimeEntries({ restaurantGuid, startDate, endDate });
    const translated = await translateTimeEntries(rawEntries, restaurantGuid);

    const laborRows = translated.map((t) => ({
      toast_entry_id: t.guid,
      store_id: String(storeCode),
      employee_id: null,
      employee_name: t.employee,
      job_title: t.jobTitle,
      clock_in: t.inDate,
      clock_out: t.outDate,
      hours: (t.regularHours || 0) + (t.overtimeHours || 0),
      raw_data: t,
      synced_at: new Date().toISOString(),
    }));

    // Borra los turnos existentes de esta tienda/dia antes de insertar.
    // Sin esto, los auto clock-out que Toast corrige despues dejan filas
    // huerfanas que siguen sumando horas para siempre.
    // Solo borra si Toast devolvio datos, para no vaciar el dia si la API falla.
    let deletedStale = 0;
    if (laborRows.length) {
      const keepIds = laborRows.map((r) => r.toast_entry_id);
      const { data: existing, error: exErr } = await supabaseAdmin
        .from("toast_labor_shifts")
        .select("toast_entry_id")
        .eq("store_id", String(storeCode))
        .gte("clock_in", isoDate + "T00:00:00")
        .lte("clock_in", isoDate + "T23:59:59");
      if (exErr) throw new Error("Leer existentes fallo: " + exErr.message);

      const stale = (existing || [])
        .map((r) => r.toast_entry_id)
        .filter((id) => !keepIds.includes(id));

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

    return Response.json({
      ok: true,
      storeCode,
      date: isoDate,
      elapsedSeconds: Math.round((Date.now() - started) / 1000),
      laborEntriesSynced: laborRows.length,
      staleRemoved: deletedStale,
      grossSales,
    });
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}