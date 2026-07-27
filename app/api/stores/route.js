import { supabaseAdmin } from "@/lib/supabase";
import { getAllStores, updateStoreTargets } from "@/lib/data";
import { reporterGuard } from "@/lib/reporter-auth";

export async function GET() {
  try {
    const map = await getAllStores(supabaseAdmin);
    const list = Object.values(map).sort((a, b) => a.code - b.code);
    return Response.json({ ok: true, stores: list });
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}

export async function PATCH(request) {
  const denied = reporterGuard(request);
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
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}