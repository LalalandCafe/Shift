// lib/auth.js
//
// Todo lo que necesita Node: hasheo de codigos, busqueda del usuario,
// limitador de intentos, y el helper que los route handlers usan para
// leer la sesion que el middleware ya verifico.

import { createHash } from "crypto";
import { supabaseAdmin } from "@/lib/supabase";

const WINDOW_MINUTES = 15;
const MAX_FAILURES = 10;

/**
 * sha256 con pepper. No es bcrypt a proposito: los codigos los genera el
 * servidor con entropia alta, no los elige una persona, asi que no hay
 * diccionario que atacar. Contra fuerza bruta protege el limitador.
 */
export function hashCode(code) {
  const pepper = process.env.AUTH_PEPPER;
  if (!pepper || pepper.length < 16) {
    throw new Error("AUTH_PEPPER no esta configurado, o es muy corto");
  }
  return createHash("sha256").update(pepper + ":" + String(code).trim()).digest("hex");
}

export async function findUserByCode(code) {
  if (!code || String(code).trim().length < 4) return null;
  const { data, error } = await supabaseAdmin
    .from("app_users")
    .select("id, name, email, role, scope, store_code, active")
    .eq("code_hash", hashCode(code))
    .eq("active", true)
    .maybeSingle();
  if (error) {
    console.error("[auth] findUserByCode", error.message);
    return null;
  }
  return data || null;
}

export function ipOf(request) {
  const fwd = request.headers.get("x-forwarded-for");
  const ip = fwd ? fwd.split(",")[0] : request.headers.get("x-real-ip");
  return (ip || "unknown").trim();
}

export async function isRateLimited(ip) {
  const since = new Date(Date.now() - WINDOW_MINUTES * 60000).toISOString();
  const { count, error } = await supabaseAdmin
    .from("login_attempts")
    .select("id", { count: "exact", head: true })
    .eq("ip", ip)
    .eq("ok", false)
    .gte("at", since);
  // Si el limitador no se puede leer, se deja pasar: bloquear a todos por
  // un error de base seria peor que el riesgo que evita.
  if (error) {
    console.error("[auth] isRateLimited", error.message);
    return false;
  }
  return (count || 0) >= MAX_FAILURES;
}

export async function recordAttempt(ip, ok) {
  const { error } = await supabaseAdmin.from("login_attempts").insert({ ip, ok });
  if (error) console.error("[auth] recordAttempt", error.message);
}

export async function logAccess(entry) {
  const { error } = await supabaseAdmin.from("access_log").insert(entry);
  // La auditoria nunca tumba la peticion.
  if (error) console.error("[auth] logAccess", error.message);
}

/**
 * La sesion de esta peticion.
 *
 * El middleware ya verifico la firma y escribio estas cabeceras, y borro
 * cualquiera que viniera del cliente antes de escribirlas.
 */
export function sessionFrom(request) {
  const role = request.headers.get("x-shift-role");
  if (!role) return null;
  const storeCode = request.headers.get("x-shift-store");
  const name = request.headers.get("x-shift-name");
  return {
    userId: request.headers.get("x-shift-user"),
    // El nombre puede traer acentos y las cabeceras HTTP son latin-1.
    name: name ? decodeURIComponent(name) : null,
    role,
    scope: request.headers.get("x-shift-scope") || null,
    storeCode: storeCode ? Number(storeCode) : null,
  };
}

export function requireRole(request, roles) {
  const session = sessionFrom(request);
  if (!session) {
    return Response.json({ ok: false, error: "Not signed in" }, { status: 401 });
  }
  if (!roles.includes(session.role)) {
    return Response.json({ ok: false, error: "Not allowed" }, { status: 403 });
  }
  return null;
}

export const requireAdmin = (request) => requireRole(request, ["admin"]);
