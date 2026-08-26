// app/api/auth/login/route.js

import { NextResponse } from "next/server";
import { SESSION_COOKIE, SESSION_HOURS, signSession } from "@/lib/session";
import { findUserByCode, ipOf, isRateLimited, recordAttempt, logAccess } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

// hashCode usa node:crypto.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  const ip = ipOf(request);
  const userAgent = request.headers.get("user-agent") || null;

  try {
    if (await isRateLimited(ip)) {
      return NextResponse.json(
        { ok: false, error: "Demasiados intentos. Espera unos minutos." },
        { status: 429 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const user = await findUserByCode(body.code);

    if (!user) {
      await recordAttempt(ip, false);
      await logAccess({
        event: "login_failed",
        ip,
        user_agent: userAgent,
        path: "/api/auth/login",
        method: "POST",
        status: 401,
      });
      // Un solo mensaje para codigo inexistente y usuario desactivado.
      // Distinguirlos le confirmaria a un atacante que el codigo existe.
      return NextResponse.json({ ok: false, error: "Ese codigo no funciono." }, { status: 401 });
    }

    const token = await signSession(user);

    await recordAttempt(ip, true);
    await supabaseAdmin
      .from("app_users")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", user.id);
    await logAccess({
      user_id: user.id,
      user_name: user.name,
      role: user.role,
      scope: user.scope,
      store_code: user.store_code,
      event: "login",
      path: "/api/auth/login",
      method: "POST",
      ip,
      user_agent: userAgent,
      status: 200,
    });

    const res = NextResponse.json({
      ok: true,
      session: {
        name: user.name,
        role: user.role,
        scope: user.scope ?? null,
        storeCode: user.store_code ?? null,
      },
    });

    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_HOURS * 3600,
    });

    return res;
  } catch (err) {
    console.error("[auth/login]", err);
    return NextResponse.json({ ok: false, error: "No se pudo iniciar sesion." }, { status: 500 });
  }
}
