import { getToastToken, getTimeEntries } from "@/lib/toast";
import { translateTimeEntries } from "@/lib/toast-labels";
import { supabaseAdmin } from "@/lib/supabase";

async function computeGrossSales(businessDate, restaurantGuid) {
  const token = await getToastToken();
  const headers = {
    Authorization: "Bearer " + token,
    "Toast-Restaurant-External-ID": restaurantGuid,
  };
  const listUrl = process.env.TOAST_API_HOST + "/orders/v2/orders?businessDate=" + businessDate;
  const listRes = await fetch(listUrl, { headers });
  if (!listRes.ok) throw new Error("Orders list fallo: " + (await listRes.text()));
  const orderGuids = await listRes.json();

  let grossSales = 0;
  const BATCH = 3;
  for (let i = 0; i < orderGuids.length; i += BATCH) {
    const batch = orderGuids.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map(async (og) => {
        try {
          const r = await fetch(process.env.TOAST_API_HOST + "/orders/v2/orders/" + og, { headers });
          if (!r.ok) return null;
          return await r.json();
        } catch (e) { return null; }
      })
    );
    results.forEach((order) => {
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
    await new Promise((r) => setTimeout(r, 150));
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

    if (laborRows.length) {
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
      laborEntriesSynced: laborRows.length,
      grossSales,
    });
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}
