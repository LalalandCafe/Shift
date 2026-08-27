// TEMPORAL. Borrar en cuanto se resuelva el login.
// No revela ningun secreto: solo huellas de 8 caracteres, para comparar
// si el valor de produccion es el mismo que el local sin exponerlo.
import { createHash } from "crypto";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fp = (v) =>
  v ? createHash("sha256").update(v).digest("hex").slice(0, 8) : "AUSENTE";

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "AUSENTE";
  let users = null, err = null;
  try {
    const r = await supabaseAdmin
      .from("app_users")
      .select("id", { count: "exact", head: true });
    users = r.count;
    err = r.error?.message || null;
  } catch (e) {
    err = e.message;
  }
  return Response.json({
    supabaseHost: url.replace("https://", "").split(".")[0],
    pepperFingerprint: fp(process.env.AUTH_PEPPER),
    sessionFingerprint: fp(process.env.SESSION_SECRET),
    appUsersCount: users,
    dbError: err,
  });
}
