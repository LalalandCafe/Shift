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
