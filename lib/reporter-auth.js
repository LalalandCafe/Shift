export function checkReporterCode(request) {
  const expected = process.env.REPORTER_CODE;
  if (!expected) {
    return { ok: false, error: "REPORTER_CODE no configurado en el servidor" };
  }
  const provided = request.headers.get("x-reporter-code");
  if (!provided || provided !== expected) {
    return { ok: false, error: "Reporter mode requerido" };
  }
  return { ok: true };
}

export function reporterGuard(request) {
  const res = checkReporterCode(request);
  if (!res.ok) {
    return Response.json({ ok: false, error: res.error }, { status: 401 });
  }
  return null;
}