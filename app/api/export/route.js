import { buildDailyReport, groupStoresForEmail } from "@/lib/report";
import { generateWeekExcel } from "@/lib/excel-export";
import { mondayOf } from "@/lib/throughput";

export const maxDuration = 60;

function addDays(iso, n) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date");
    const group = searchParams.get("group");

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return new Response("Falta parametro date en formato YYYY-MM-DD", { status: 400 });
    }

    // Cualquier fecha de la semana sirve, siempre exporta Lunes a Domingo.
    const weekStart = mondayOf(date);
    const weekEnd = addDays(weekStart, 6);
    const isoDays = [0, 1, 2, 3, 4, 5, 6].map((n) => addDays(weekStart, n));

    // Los 7 dias en paralelo. Si un dia truena (sin data), sale null y se
    // muestra vacio en vez de tumbar todo el archivo.
    const reports = await Promise.all(
      isoDays.map((iso) =>
        buildDailyReport(iso)
          .then((r) => ({ iso, report: r }))
          .catch(() => ({ iso, report: null }))
      )
    );

    const days = reports.map(({ iso, report }) => {
      const byStore = {};
      if (report) {
        report.rows.forEach((r) => { byStore[r.code] = r.day; });
      }
      return {
        iso,
        dayName: report ? report.dayName : "",
        byStore,
      };
    });

    // El ultimo dia con data manda para los totales de semana (WTD acumulado)
    // y para la lista de tiendas.
    const last = [...reports].reverse().find((r) => r.report);
    if (!last) {
      return new Response("No hay datos para esa semana", { status: 404 });
    }

    const filteredRows = group
      ? last.report.rows.filter((r) => r.grp === group)
      : last.report.rows;
    const groupedStores = groupStoresForEmail(filteredRows);

    const xls = generateWeekExcel({
      weekNumber: last.report.weekNum,
      period: last.report.period,
      weekStart,
      weekEnd,
      days,
      groupedStores,
    });

    const suffix = group ? "-" + group : "";
    const filename = `SHIFT-Week${last.report.weekNum}-${weekStart}${suffix}.xls`;

    return new Response(xls, {
      headers: {
        "Content-Type": "application/vnd.ms-excel; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    return new Response("Error: " + err.message, { status: 500 });
  }
}