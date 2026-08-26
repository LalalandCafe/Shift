// app/api/auth/logout/route.js

import { NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session";
import { ipOf, logAccess } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  // Es publica, asi que la sesion se lee de la cookie y no de las cabeceras
  // del middleware. Solo sirve para dejar rastro del cierre.
  const session = await verifySession(request.cookies.get(SESSION_COOKIE)?.value);

  if (session) {
    await logAccess({
      user_id: session.userId,
      user_name: session.name,
      role: session.role,
      scope: session.scope,
      store_code: session.storeCode,
      event: "logout",
      path: "/api/auth/logout",
      method: "POST",
      ip: ipOf(request),
      status: 200,
    });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
