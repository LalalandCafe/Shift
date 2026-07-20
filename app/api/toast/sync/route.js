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

export async function POST(request) {
  try {
    const secret = request.headers.get("x-sync-secret");
    if (secret !== process.env.SYNC_SECRET) {
      return Response.json({ ok: false, error: "No autorizado" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { startDate, endDate } = body;
    const guid = body.guid || process.env.TOAST_RESTAURANT_GUID;

    if (!startDate || !endDate) {
      return Response.json(
        { ok: false, error: "Faltan startDate y endDate (ISO 8601)" },
        { status: 400 }
      );
    }

    const entries = await getTimeEntries({
      restaurantGuid: guid,
      startDate,
      endDate,
    });

    if (!entries.length) {
      return Response.json({ ok: true, synced: 0, message: "Sin registros en el rango" });
    }

    const rows = entries.map((e) => mapEntry(e, guid));

    const { error } = await supabaseAdmin
      .from("toast_labor_shifts")
      .upsert(rows, { onConflict: "toast_entry_id" });

    if (error) throw new Error(error.message);

    return Response.json({ ok: true, synced: rows.length });
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}
