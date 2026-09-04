import { supabaseAdmin } from "@/lib/supabase";
import { getAllStores, updateStoreManagers } from "@/lib/data";
import { requireAdmin } from "@/lib/auth";

// Command Center Phase 3 (accountability). Admin only, gated here the same
// way app/api/stores/route.js gates its PATCH - middleware.js already
// blocks any non-admin session chain-wide today, but this is the
// route-local layer on top of that, same pattern used by every other
// Command Center route.
//
// Deliberately its own route rather than extending app/api/stores/route.js:
// that route is shared, existing infrastructure used outside this tab
// (components/Targets.js); this tab's rule is that everything it needs
// lives inside its own components and routes, not bolted onto something
// else's surface. Both ultimately read/write the same stores table - that
// overlap is fine, the route boundary is what stays separate.
//
// GET returns every active store's identity + accountability fields.
// PATCH { code, gmName, areaManagerName } saves one store's labels.
//
// Requires docs/sql/001-store-managers.sql to have been run against
// Supabase. Until then, GET works fine (gm_name/area_manager_name are
// simply absent from each row - getAllStores does select("*"), so an
// unmigrated column is just a missing key, not an error) and PATCH fails
// with the column-does-not-exist error Postgres gives, surfaced as a
// normal 500 rather than swallowed.

export async function GET() {
  try {
    const map = await getAllStores(supabaseAdmin);
    const list = Object.values(map).sort((a, b) => a.code - b.code);
    return Response.json({ ok: true, stores: list });
  } catch (err) {
    console.error("[command-center/managers GET]", err);
    return Response.json({ ok: false, error: "Could not load stores" }, { status: 500 });
  }
}

export async function PATCH(request) {
  const denied = requireAdmin(request);
  if (denied) return denied;

  try {
    const body = await request.json();
    const { code, gmName, areaManagerName } = body;
    if (!code) {
      return Response.json({ ok: false, error: "Missing store code" }, { status: 400 });
    }
    await updateStoreManagers(supabaseAdmin, code, gmName, areaManagerName);
    return Response.json({ ok: true, code });
  } catch (err) {
    console.error("[command-center/managers PATCH]", err);
    return Response.json({ ok: false, error: err.message || "Could not save that store" }, { status: 500 });
  }
}
