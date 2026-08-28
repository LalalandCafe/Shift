// middleware.js
//
// Una sola puerta para todo /api y para las paginas. Esto es lo que
// convierte el "roles" de VIEWS de una etiqueta de UI a una regla que el
// servidor impone.
//
// VA EN LA RAIZ, junto a package.json. Si esta en app/, Next lo ignora
// en silencio y el API queda abierto.
//
// La sesion ahora viene de Entra ID, no del sistema de codigos. Las
// cabeceras que escribe son las mismas de antes a proposito: ningun
// route handler tuvo que cambiar.
import { NextResponse } from "next/server";
import NextAuth from "next-auth";
import authConfig from "./auth.config";

const { auth } = NextAuth(authConfig);

// Rutas de maquina: se autentican con x-sync-secret DENTRO del handler.
// Lista explicita y no prefijo a proposito: si fuera "/api/toast/", las
// rutas debug de ese directorio quedarian abiertas.
// Reachable while signed out, or /login would redirect to itself forever.
const PUBLIC_PATHS = ["/login", "/signout"];

const MACHINE = new Set([
  "/api/toast/sync-store",
  "/api/toast/sync",
  "/api/toast/sales-compare",
  "/api/toast/cron",
  "/api/toast/cron-trigger",
  "/api/hme/sync-store",
  "/api/sync/tattle",
]);

export default auth(function middleware(request) {
  const { pathname } = request.nextUrl;

  // Auth.js maneja su propio ciclo completo bajo /api/auth/. Ninguna de
  // esas peticiones trae sesion por definicion: la del callback llega
  // justo antes de que exista una.
  if (
    pathname.startsWith("/api/auth/") ||
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))
  ) {
    return NextResponse.next();
  }

  if (MACHINE.has(pathname)) {
    return NextResponse.next();
  }

  const user = request.auth?.user;

  if (!user || user.role === "none") {
    // Las paginas se mandan al login. El API responde JSON, porque un
    // redirect a HTML rompe cualquier fetch que lo reciba.
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.nextUrl));
  }

  // El nivel regional todavia no tiene forma de expresarse en estas
  // cabeceras: no existe un x-shift-grp y ningun handler lo leeria. Hasta
  // que eso se construya, un regional entra pero no ve nada, en vez de
  // verlo todo por omision.
  if (user.role !== "admin") {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ ok: false, error: "Not allowed" }, { status: 403 });
    }
    return NextResponse.redirect(new URL("/login?error=scope", request.nextUrl));
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

  headers.set("x-shift-user", user.email ?? "unknown");
  headers.set("x-shift-role", "admin");
  headers.set("x-shift-scope", "all");
  if (user.name) headers.set("x-shift-name", encodeURIComponent(user.name));

  return NextResponse.next({ request: { headers } });
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png).*)"],
};
