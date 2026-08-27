// TEMPORAL
import { createHash } from "crypto";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const fp = (v) => (v ? createHash("sha256").update(v).digest("hex").slice(0, 8) : "AUSENTE");
export async function GET() {
  return Response.json({
    pepperFingerprint: fp(process.env.AUTH_PEPPER),
    pepperLength: (process.env.AUTH_PEPPER || "").length,
  });
}
