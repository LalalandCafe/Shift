import { getTimeEntries } from "@/lib/toast";
import { supabaseAdmin } from "@/lib/supabase";

function calcHours(inTs, outTs) {
  if (!inTs || !outTs) return null;
  const ms = new Date(outTs).getTime() - new Date(inTs).getTime();
  return Math.round((ms / 3600000) * 100) / 100;
}

function mapEntry(entry, storeGuid) {
  return {
    toast_entry_id: entry.guid,
    store_id: storeGuid,
    employee_id: entry.employeeReference?.guid ?? null,
    employee_name: entry.employeeReference?.name ?? null,
    job_title: entry.jobReference?.name ?? null,
    clock_in: entry.inDate ?? null,
    clock_out: entry.outDate ?? null,
    hours: calcHours(entry.inDate, entry.outDate),
    raw_data: entry,
    synced_at: new Date().toISOString(),
  };
}

export async function GET(request) {
  try {
    const auth = request.headers.get("authorization");
    if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
      return Response.json({ ok: false, error: "No autorizado" }, { status: 401 });
    }

    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const y = yesterday.toISOString().slice(0, 10);
    const startDate = `${y}T00:00:00.000-0500`;
    const endDate = `${y}T23:59:59.000-0500`;

    const guid = process.env.TOAST_RESTAURANT_GUID;
    const entries = await getTimeEntries({ restaurantGuid: guid, startDate, endDate });

    if (!entries.length) {
      return Response.json({ ok: true, synced: 0, date: y });
    }

    const rows = entries.map((e) => mapEntry(e, guid));
    const { error } = await supabaseAdmin
      .from("toast_labor_shifts")
      .upsert(rows, { onConflict: "toast_entry_id" });

    if (error) throw new Error(error.message);

    return Response.json({ ok: true, synced: rows.length, date: y });
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}
