import { supabaseAdmin } from "@/lib/supabase";
import { getAllStores, getSalesForDate, getExcludedEmployees } from "@/lib/data";
import { aggregatePayroll, dayMetrics } from "@/lib/calc";
import { generateEmailHTML } from "@/lib/email-generator";
import { getWeekNumber } from "@/lib/fiscal";

// GET /api/demo/email?storeCode=10002&date=2026-07-19&day=Sunday
// Genera el correo HTML real (mismo formato de SHIFT) para la tienda/dia de la demo.
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const storeCode = parseInt(searchParams.get("storeCode"));
    const isoDate = searchParams.get("date");
    const dayName = searchParams.get("day") || "Sunday";

    const stores = await getAllStores(supabaseAdmin);
    const store = stores[storeCode];
    if (!store) return new Response("Tienda no encontrada", { status: 404 });

    const excludedList = await getExcludedEmployees(supabaseAdmin);

    const { data: laborRows } = await supabaseAdmin
      .from("toast_labor_shifts")
      .select("employee_name, job_title, hours")
      .eq("store_id", String(storeCode))
      .gte("clock_in", isoDate + "T00:00:00")
      .lt("clock_in", isoDate + "T23:59:59.999");

    const payrollRows = (laborRows || []).map((r) => ({
      employee: r.employee_name,
      jobTitle: r.job_title,
      regularHours: r.hours,
      overtimeHours: 0,
      code: storeCode,
    }));
    const { hours, trainee, trainer, train } = aggregatePayroll(payrollRows, excludedList);

    const salesMap = await getSalesForDate(supabaseAdmin, isoDate);
    const sales = salesMap[storeCode] || 0;
    const h = hours[storeCode] || 0;

    const dayM = dayMetrics(sales, h, store, dayName);

    const groupedStores = [{
      group: store.grp,
      regions: [{
        label: store.region,
        stores: [{
          code: storeCode,
          name: store.name,
          day: dayM,
          wtd: { ...dayM, trainTotal: train[storeCode] || 0, trainee: trainee[storeCode] || 0, trainer: trainer[storeCode] || 0 },
          ptd: null,
        }],
      }],
    }];

    const html = generateEmailHTML({
      day: dayName,
      weekNumber: getWeekNumber(new Date(isoDate)),
      refDate: isoDate,
      groupedStores,
      isFullWeek: false,
      hasPTD: false,
    });

    return new Response(html, { headers: { "Content-Type": "text/html" } });
  } catch (err) {
    return new Response("Error: " + err.message, { status: 500 });
  }
}
