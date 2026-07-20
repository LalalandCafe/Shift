import { supabaseAdmin } from "@/lib/supabase";

export async function GET(request) {
  try {
    const auth = request.headers.get("authorization");
    if (process.env.CRON_SECRET && auth !== "Bearer " + process.env.CRON_SECRET) {
      return Response.json({ ok: false, error: "No autorizado" }, { status: 401 });
    }

    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isoDate = yesterday.toISOString().slice(0, 10);
    const businessDate = isoDate.replace(/-/g, "");

    const { data: stores, error } = await supabaseAdmin
      .from("stores")
      .select("code, toast_guid")
      .not("toast_guid", "is", null)
      .eq("active", true);
    if (error) throw new Error(error.message);

    const baseUrl = process.env.VERCEL_URL
      ? "https://" + process.env.VERCEL_URL
      : "http://localhost:3000";

    const triggered = [];
    for (const s of stores) {
      fetch(baseUrl + "/api/toast/sync-store", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-sync-secret": process.env.SYNC_SECRET,
        },
        body: JSON.stringify({
          storeCode: s.code,
          restaurantGuid: s.toast_guid,
          businessDate,
          isoDate,
        }),
      }).catch(() => {});
      triggered.push(s.code);
      await new Promise((r) => setTimeout(r, 300));
    }

    return Response.json({
      ok: true,
      date: isoDate,
      storesTriggered: triggered.length,
      note: "Cada tienda sincroniza en su propia funcion. Revisa daily_sales en Supabase en unos minutos.",
    });
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}