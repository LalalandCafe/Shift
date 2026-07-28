import { getToastToken, getTimeEntries } from "@/lib/toast";
import { translateTimeEntries } from "@/lib/toast-labels";
import { supabaseAdmin } from "@/lib/supabase";

export const maxDuration = 60;

// Offset real de una zona IANA en un instante dado, en minutos.
function tzOffsetMinutes(date, tz) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const parts = {};
  dtf.formatToParts(date).forEach((p) => { parts[p.type] = p.value; });
  const asUTC = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour) % 24, Number(parts.minute), Number(parts.second)
  );
  return (asUTC - date.getTime()) / 60000;
}

function offsetToIso(offMinutes) {
  const sign = offMinutes <= 0 ? "-" : "+";
  const abs = Math.abs(offMinutes);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return sign + hh + mm;
}

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

    // Zona horaria real de la tienda. Sin esto, las tiendas del Pacifico
    // usaban Central y sus turnos de cierre caian en el dia equivocado.
    const { data: storeRow } = await supabaseAdmin
      .from("stores")
      .select("timezone")
      .eq("code", storeCode)
      .single();
    const tz = (storeRow && storeRow.timezone) || "America/Chicago";

    const probe = new Date(isoDate + "T12:00:00Z");
    const offMin = tzOffsetMinutes(probe, tz);
    const offIso = offsetToIso(offMin);

    // Esta ventana se usa para DOS cosas: pedirle turnos a Toast y decidir
    // que filas borrar. Tienen que ser identicas, si no se borran turnos
    // legitimos de la jornada anterior.
    const startDate = isoDate + "T00:00:00.000" + offIso;
    const endDate = isoDate + "T23:59:59.000" + offIso;

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

    return Response.json({
      ok: true,
      storeCode,
      date: isoDate,
      timezone: tz,
      utcOffset: offIso,
      elapsedSeconds: Math.round((Date.now() - started) / 1000),
      laborEntriesSynced: laborRows.length,
      staleRemoved: deletedStale,
      grossSales,
    });
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}