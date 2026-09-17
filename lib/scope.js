// lib/scope.js
//
// Server-side scoping helpers. These sit between the session (lib/auth.js,
// read from the middleware headers) and the rules (lib/permissions.js), so a
// route handler scopes its data in one line instead of reimplementing the
// check.
//
// Every helper fails closed: no session, no grp on the row, or a store that
// cannot be resolved all resolve to no access.

import { supabaseAdmin } from "./supabase";
import { canSeeGrp } from "./permissions";
import { accessOf } from "./auth";

/**
 * The grp of a single store, or null when the store does not exist.
 *
 * Needed because several endpoints take a storeCode and return that store's
 * detail directly, without ever loading a row that carries grp. Without this
 * lookup, ?storeCode=10030 from a TX-TN session would just work.
 */
export async function grpForStore(code) {
  const n = Number(code);
  if (!Number.isFinite(n)) return null;
  const { data, error } = await supabaseAdmin
    .from("stores")
    .select("grp")
    .eq("code", n)
    .limit(1);
  if (error) throw new Error("stores: " + error.message);
  if (!data || !data.length) return null;
  return data[0].grp || null;
}

/**
 * Filter any array of rows that carries a grp field.
 *
 * Admin passes through untouched, which keeps the admin path exactly as it
 * was before scoping existed.
 */
export function scopeRows(request, rows) {
  const access = accessOf(request);
  if (access.allStores) return Array.isArray(rows) ? rows : [];
  if (!Array.isArray(rows)) return [];
  return rows.filter((r) => canSeeGrp(access, r.grp));
}

/**
 * Guard for single-store endpoints. Returns a 403 Response to return early,
 * or null when the caller may proceed.
 */
export async function denyIfStoreOutOfScope(request, code) {
  const access = accessOf(request);
  if (access.allStores) return null;
  const grp = await grpForStore(code);
  if (!canSeeGrp(access, grp)) {
    return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  return null;
}

export function isAdminRequest(request) {
  return accessOf(request).allStores === true;
}