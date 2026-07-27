import { checkReporterCode } from "@/lib/reporter-auth";

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const code = body.code || "";
    const fake = { headers: { get: (k) => (k === "x-reporter-code" ? code : null) } };
    const res = checkReporterCode(fake);
    if (!res.ok) {
      return Response.json({ ok: false, error: "Codigo incorrecto" }, { status: 401 });
    }
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}