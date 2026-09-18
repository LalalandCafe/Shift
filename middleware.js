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
//
// Regional access (area managers) is now admitted. Two things changed:
// the blanket "role must be admin" rejection is gone, and the scope
// headers are written from the real session instead of being hardcoded
// to admin/all. A new x-shift-grp header carries the comma-separated
// grp list ("TX-TN", "CA-AZ") that lib/auth.js reads back.
import { NextResponse } from "next/server";
import NextAuth from "next-auth";
import authConfig from "./auth.config";

const { auth } = NextAuth(authConfig);

// Rutas de maquina: se autentican con x-sync-secret DENTRO del handler.
// Lista explicita y no prefijo a proposito: si fuera "/api/toast/", las
// rutas debug de ese directorio quedarian abiertas.
//
// LOAD-BEARING: this Set is matched exactly, never by prefix, and that is
// now what keeps the two lists from colliding. ADMIN_ONLY_API below carries
// "/api/toast" as a PREFIX entry, so every path under that directory is
// admin-only except the ones named here, which exit earlier in the handler.
// Converting this Set to prefix matching would hand the whole /api/toast/
// directory back to any signed-in session. Add machine routes one by one.
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

// API routes that back an admin-only tab. Until today every non-admin got
// a blanket 403, so these were protected by side effect. Admitting regional
// sessions removes that side effect, so the admin-only surface has to be
// named here explicitly.
//
// Prefix match, unlike MACHINE above: a nested route under an admin-only
// feature should inherit the gate, not escape it.
//
// VERIFY against `ls app/api` before merging. Anything that backs a tab
// whose roles array is ["admin"] in app/page.js belongs on this list.
//
// ONE DELIBERATE ABSENCE: /api/stores, which backs the Store targets tab, is
// NOT here and is not an oversight. It enforces admin inside the handler with
// requireAdmin() on both GET and PATCH (app/api/stores/route.js), which is
// strictly stronger than this list because it survives a middleware change.
// The routes that ARE listed here now do the same thing in their own handlers
// as well, so this list is the outer layer, not the only one. Do not "fix"
// the gap by adding /api/stores; check the handler first.
const ADMIN_ONLY_API = [
  "/api/sssg",
  "/api/email",
  "/api/export",
  "/api/throughput",
  // NOT /api/forecast: the planner lives inside the Store detail tab, which
  // area managers have. It is scoped per store in its own handlers instead
  // (denyIfStoreOutOfScope on GET, POST and DELETE). Putting it back here
  // would 403 regionals out of a tab they are meant to use, and would make
  // those guards unreachable.
  // Listed one by one, not as a bare "/api/kitchen". The prefix match below
  // is segment-aware: "/api/kitchen" matches "/api/kitchen" and
  // "/api/kitchen/..." but NOT "/api/kitchen-week", which is a different
  // segment entirely. The old "/api/kitchen" and "/api/service" entries
  // matched no route that exists and protected nothing - the Service times
  // tab fetches /api/kitchen-week, not /api/service.
  "/api/kitchen-week",
  "/api/kitchen-day",
  "/api/kitchen-trend",
  // Raw Toast and demo endpoints: per-employee names, job titles and hours,
  // plus a live token preview. Prefixes on purpose, so a debug route dropped
  // under either directory later is admin-only by default instead of open.
  //
  // Safe against the sync and cron routes that also live under /api/toast/:
  // MACHINE is checked earlier in the handler and returns immediately, so
  // those paths never reach this list. See the control-flow note there.
  "/api/toast",
  "/api/demo",
];

// Solo lo que Auth.js necesita para su propio ciclo OAuth, no todo el prefijo
// /api/auth/. El codigo de acceso viejo (retirado) vivia bajo ese mismo
// prefijo en /api/auth/login, /api/auth/logout y /api/auth/me, y un
// startsWith("/api/auth/") de puerta ancha lo dejaba pasar sin sesion junto
// con Auth.js. Esta lista es exactamente lo que NextAuth sirve desde
// app/api/auth/[...nextauth]/route.js: signin, el callback de cada
// proveedor, session, csrf, providers, signout y su pagina de error.
// Cualquier otra cosa que alguien deje caer bajo /api/auth/ en el futuro NO
// pasa gratis por aqui.
const AUTH_JS_EXACT = new Set([
  "/api/auth/signin",
  "/api/auth/session",
  "/api/auth/csrf",
  "/api/auth/providers",
  "/api/auth/signout",
  "/api/auth/error",
]);
const AUTH_JS_PREFIXES = ["/api/auth/signin/", "/api/auth/callback/"];

function isAuthJsPath(pathname) {
  if (AUTH_JS_EXACT.has(pathname)) return true;
  return AUTH_JS_PREFIXES.some((p) => pathname.startsWith(p));
}

function isAdminOnlyApi(pathname) {
  return ADMIN_ONLY_API.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export default auth(function middleware(request) {
  const { pathname } = request.nextUrl;

  // Ninguna de estas peticiones trae sesion por definicion: la del callback
  // llega justo antes de que exista una.
  if (
    isAuthJsPath(pathname) ||
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

  const isAdmin = user.role === "admin";
  const grps = Array.isArray(user.grps) ? user.grps : [];

  // Fail closed. A non-admin session with no grp is a config problem on the
  // Entra side (group claim missing, wrong GUID, or the env var undefined in
  // production). Letting it through would mean an unscoped session.
  if (!isAdmin && grps.length === 0) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ ok: false, error: "Not allowed" }, { status: 403 });
    }
    return NextResponse.redirect(new URL("/login?error=scope", request.nextUrl));
  }

  // Admin-only features stay admin-only. The tab is hidden client-side too,
  // but hiding a button is not access control.
  if (!isAdmin && pathname.startsWith("/api/") && isAdminOnlyApi(pathname)) {
    return NextResponse.json({ ok: false, error: "Not allowed" }, { status: 403 });
  }

  // Se BORRAN antes de escribirlas. Sin esto, cualquiera podria mandar
  // "x-shift-role: admin" a mano y sessionFrom() se lo creeria. Es el
  // unico detalle de este archivo que no es opcional.
  const headers = new Headers(request.headers);
  headers.delete("x-shift-user");
  headers.delete("x-shift-oid");
  headers.delete("x-shift-name");
  headers.delete("x-shift-role");
  headers.delete("x-shift-scope");
  headers.delete("x-shift-store");
  headers.delete("x-shift-grp");

  // x-shift-oid is the stable identifier (Entra objectId), x-shift-user is
  // the display string. The tenant mixes @lalalandcafe.com and
  // @lalalandkindcafe.com UPNs and Entra does not always populate `email`, so
  // x-shift-user is not a key and must never be used as one.
  //
  // Neither header is an access input. Scope is decided above this block from
  // role and grps alone; these two only travel so a handler can say WHO did
  // something. Both are in the delete list above for the same reason as the
  // rest: without it a client could send its own and sessionFrom() would
  // believe it.
  //
  // Set only when present. A session issued before oid was added carries none
  // until the user signs in again (12h maxAge), and an absent header reads
  // back as null rather than as the string "undefined".
  headers.set("x-shift-user", user.email ?? "unknown");
  if (user.oid) headers.set("x-shift-oid", user.oid);
  headers.set("x-shift-role", user.role);
  headers.set("x-shift-scope", isAdmin ? "all" : "grp");
  if (!isAdmin) headers.set("x-shift-grp", grps.join(","));
  if (user.name) headers.set("x-shift-name", encodeURIComponent(user.name));

  return NextResponse.next({ request: { headers } });
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png).*)"],
};