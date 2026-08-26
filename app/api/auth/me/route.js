// app/api/auth/me/route.js
//
// Lo primero que pide la pagina al cargar. Es publica porque tiene que
// poder contestar "no hay sesion" sin devolver 401: eso es un estado
// normal, no un error.

import { NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const session = await verifySession(request.cookies.get(SESSION_COOKIE)?.value);

  if (!session) return NextResponse.json({ ok: true, session: null });

  return NextResponse.json({
    ok: true,
    session: {
      name: session.name,
      role: session.role,
      scope: session.scope,
      storeCode: session.storeCode,
    },
  });
}
