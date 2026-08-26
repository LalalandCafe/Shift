import { supabaseAdmin } from "@/lib/supabase";
import { getAllStores, updateStoreTargets } from "@/lib/data";
import { requireAdmin } from "@/lib/auth";

export async function GET() {
  try {
    const map = await getAllStores(supabaseAdmin);
    const list = Object.values(map).sort((a, b) => a.code - b.code);
    return Response.json({ ok: true, stores: list });
  } catch (err) {
    console.error("[stores GET]", err);
    return Response.json({ ok: false, error: "No se pudieron cargar las tiendas" }, { status: 500 });
  }
}

export async function PATCH(request) {
  // Los targets deciden quien sale en verde. Solo admin, y desde el paso 3
  // cada cambio queda en access_log con nombre y hora.
  const denied = requireAdmin(request);
  if (denied) return denied;

  try {
    const body = await request.json();
    const { code, weekdayTarget, weekendTarget, ptdTarget } = body;
    if (!code) {
      return Response.json({ ok: false, error: "Falta code" }, { status: 400 });
    }
    await updateStoreTargets(supabaseAdmin, code, weekdayTarget, weekendTarget, ptdTarget);
    return Response.json({ ok: true, code });
  } catch (err) {
    console.error("[stores PATCH]", err);
    return Response.json({ ok: false, error: "No se pudo guardar el target" }, { status: 500 });
  }
}
