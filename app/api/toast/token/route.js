import { getToastToken } from "@/lib/toast";

export async function GET() {
  try {
    const token = await getToastToken();
    return Response.json({
      ok: true,
      message: "Token obtenido correctamente",
      preview: token.slice(0, 12) + "...",
    });
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}
