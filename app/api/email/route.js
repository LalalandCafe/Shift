import { buildDailyReport, groupStoresForEmail } from "@/lib/report";
import { generateEmailHTML } from "@/lib/email-generator";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date");
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return new Response("Falta parametro date en formato YYYY-MM-DD", { status: 400 });
    }
    const report = await buildDailyReport(date);
    const groupedStores = groupStoresForEmail(report.rows);
    const html = generateEmailHTML({
      day: report.dayName,
      weekNumber: report.weekNum,
      refDate: date,
      groupedStores,
      isFullWeek: false,
      hasPTD: true,
      acNote: "",
    });
    return new Response(html, { headers: { "Content-Type": "text/html" } });
  } catch (err) {
    return new Response("Error: " + err.message, { status: 500 });
  }
}