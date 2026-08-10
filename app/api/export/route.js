import { buildDailyReport, groupStoresForEmail } from "@/lib/report";
import { generateWeekExcel } from "@/lib/excel-export";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date");
    const group = searchParams.get("group");

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return new Response("Falta parametro date en formato YYYY-MM-DD", { status: 400 });
    }

    const report = await buildDailyReport(date);
    const filteredRows = group ? report.rows.filter((r) => r.grp === group) : report.rows;
    const groupedStores = groupStoresForEmail(filteredRows);

    const xls = generateWeekExcel({
      weekNumber: report.weekNum,
      period: report.period,
      weekStart: report.weekStart,
      dayName: report.dayName,
      refDate: date,
      groupedStores,
    });

    const suffix = group ? "-" + group : "";
    const filename = `SHIFT-Week${report.weekNum}-${date}${suffix}.xls`;

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