// lib/auth.js
//
// El helper que los route handlers usan para leer la sesion que el
// middleware ya verifico.
//
// Este archivo antes tambien traia el sistema de codigos (hasheo,
// findUserByCode, el limitador de intentos, el log de acceso): ese sistema
// se retiro junto con /api/auth/login, /api/auth/logout, /api/auth/me y
// lib/session.js. Lo que queda aqui no depende de ellos y sigue siendo lo
// que cada route handler protegido llama.
//
// Now carries grps as well, because the session can be regional. The shape
// mirrors what lib/permissions.js produces, so a handler can pass the
// return of accessOf() straight into canSeeGrp() or filterStores().
//
// It also carries oid, the stable Entra objectId. userId is a DISPLAY string
// (email, or the UPN when Entra sends no email claim) and the tenant runs two
// UPN domains, so it changes and is not unique in any way worth relying on.
// Anything that needs to record or look up a person - an audit row, a
// preference, an attribution - keys on oid. Neither field takes part in an
// access decision; those come from role and grps only.

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
  const grp = request.headers.get("x-shift-grp");
  const scope = request.headers.get("x-shift-scope") || null;
  return {
    userId: request.headers.get("x-shift-user"),
    // The stable key. Null on a session issued before oid was added, which
    // resolves itself the next time that user signs in - so a writer must
    // treat null as "unknown", never as a valid identity to store.
    oid: request.headers.get("x-shift-oid"),
    // El nombre puede traer acentos y las cabeceras HTTP son latin-1.
    name: name ? decodeURIComponent(name) : null,
    role,
    scope,
    // Empty string splits to [""], which would match no grp but also read as
    // a populated array. Guard it so grps is either real values or empty.
    grps: grp ? grp.split(",").filter(Boolean) : [],
    allStores: scope === "all",
    storeCode: storeCode ? Number(storeCode) : null,
  };
}

/**
 * The access object lib/permissions.js expects (canSeeGrp, filterStores).
 * Returns a deny-everything shape when there is no session, so a caller
 * that forgets the null check still fails closed.
 */
export function accessOf(request) {
  const session = sessionFrom(request);
  if (!session) return { role: "none", grps: [], allStores: false };
  return { role: session.role, grps: session.grps, allStores: session.allStores };
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