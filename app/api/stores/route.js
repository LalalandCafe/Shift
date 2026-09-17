import { supabaseAdmin } from "@/lib/supabase";
import { getAllStores, updateStoreTargets } from "@/lib/data";
import { requireAdmin } from "@/lib/auth";

export async function GET(request) {
  // Admin only, same as PATCH below. This is the read side of the Store
  // targets tab, whose roles array is ["admin"] in app/page.js, and it
  // returns every store's targets chain-wide. It was protected by side
  // effect while middleware 403'd every non-admin; now that area managers
  // are admitted, the gate has to be stated here.
  //
  // Note it takes `request` now - it did not before, because it had no
  // reason to read anything off the request.
  const denied = requireAdmin(request);
  if (denied) return denied;

  try {
    const map = await getAllStores(supabaseAdmin);
    const list = Object.values(map).sort((a, b) => a.code - b.code);
    return Response.json({ ok: true, stores: list });
  } catch (err) {
    console.error("[stores GET]", err);
    return Response.json({ ok: false, error: "Could not load stores" }, { status: 500 });
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
      return Response.json({ ok: false, error: "Missing store code" }, { status: 400 });
    }
    await updateStoreTargets(supabaseAdmin, code, weekdayTarget, weekendTarget, ptdTarget);
    return Response.json({ ok: true, code });
  } catch (err) {
    console.error("[stores PATCH]", err);
    return Response.json({ ok: false, error: "Could not save that target" }, { status: 500 });
  }
}
