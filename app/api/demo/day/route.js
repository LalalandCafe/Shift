import { supabaseAdmin } from "@/lib/supabase";
import { getAllStores, getSalesForDate, getExcludedEmployees } from "@/lib/data";
import { aggregatePayroll, dayMetrics } from "@/lib/calc";

// GET /api/demo/day?storeCode=10002&date=2026-07-19&day=Sunday
// Lee labor+ventas ya guardados en Supabase para esa tienda/dia y devuelve
// las metricas calculadas (mismo resultado que veria SHIFT).
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const storeCode = parseInt(searchParams.get("storeCode"));
    const isoDate = searchParams.get("date");
    const dayName = searchParams.get("day") || "Sunday";

    if (!storeCode || !isoDate) {
      return Response.json({ ok: false, error: "Faltan storeCode y date" }, { status: 400 });
    }

    const stores = await getAllStores(supabaseAdmin);
    const store = stores[storeCode];
    if (!store) return Response.json({ ok: false, error: "Tienda no encontrada" }, { status: 404 });

    const excludedList = await getExcludedEmployees(supabaseAdmin);

    // Labor guardado para ese dia/tienda
    const { data: laborRows, error: laborErr } = await supabaseAdmin
      .from("toast_labor_shifts")
      .select("employee_name, job_title, hours")
      .eq("store_id", String(storeCode))
      .gte("clock_in", isoDate + "T00:00:00")
      .lt("clock_in", isoDate + "T23:59:59.999");
    if (laborErr) throw new Error(laborErr.message);

    const payrollRows = laborRows.map((r) => ({
      employee: r.employee_name,
      jobTitle: r.job_title,
      regularHours: r.hours,
      overtimeHours: 0,
      code: storeCode,
    }));
    const { hours, trainee, trainer, train, audit } = aggregatePayroll(payrollRows, excludedList);

    const salesMap = await getSalesForDate(supabaseAdmin, isoDate);
    const sales = salesMap[storeCode] || 0;
    const h = hours[storeCode] || 0;

    const metrics = dayMetrics(sales, h, store, dayName);

    return Response.json({
      ok: true,
      store: { code: storeCode, name: store.name },
      date: isoDate,
      day: dayName,
      metrics: {
        hours: metrics.hours,
        sales: metrics.sales,
        target: metrics.target,
        splh: Math.round(metrics.splh),
        overUnder: Math.round(metrics.overUnder),
        ok: metrics.ok,
      },
      training: {
        trainee: trainee[storeCode] || 0,
        trainer: trainer[storeCode] || 0,
        total: train[storeCode] || 0,
      },
      excludedCount: audit.filter((a) => a.excl).length,
      excludedDetail: audit.filter((a) => a.excl),
    });
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}
