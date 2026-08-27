// middleware.js
//
// Una sola puerta para todo /api. Esto es lo que convierte el "roles" de
// VIEWS de una etiqueta de UI a una regla que el servidor impone.
//
// VA EN LA RAIZ, junto a package.json. Si esta en app/, Next lo ignora
// en silencio y el API queda abierto.

import { NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

const PUBLIC = new Set(["/api/auth/login", "/api/auth/logout", "/api/auth/me"]);

// Rutas de maquina: se autentican con x-sync-secret DENTRO del handler.
// Lista explicita y no prefijo a proposito: si fuera "/api/toast/", las
// rutas debug de ese directorio quedarian abiertas.
const MACHINE = new Set([
  "/api/toast/sync-store",
  "/api/toast/sync",
  "/api/toast/sales-compare",
  "/api/toast/cron",
  "/api/toast/cron-trigger",
  "/api/hme/sync-store",
  "/api/sync/tattle",
]);

export async function middleware(request) {
  const { pathname } = request.nextUrl;

  if (PUBLIC.has(pathname) || MACHINE.has(pathname)) {
    return NextResponse.next();
  }

  const session = await verifySession(request.cookies.get(SESSION_COOKIE)?.value);

  if (!session) {
    return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
  }

  // Se BORRAN antes de escribirlas. Sin esto, cualquiera podria mandar
  // "x-shift-role: admin" a mano y sessionFrom() se lo creeria. Es el
  // unico detalle de este archivo que no es opcional.
  const headers = new Headers(request.headers);
  headers.delete("x-shift-user");
  headers.delete("x-shift-name");
  headers.delete("x-shift-role");
  headers.delete("x-shift-scope");
  headers.delete("x-shift-store");

  headers.set("x-shift-user", session.userId);
  headers.set("x-shift-role", session.role);
  if (session.name) headers.set("x-shift-name", encodeURIComponent(session.name));
  if (session.scope) headers.set("x-shift-scope", session.scope);
  if (session.storeCode != null) headers.set("x-shift-store", String(session.storeCode));

  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/api/:path*"],
};
