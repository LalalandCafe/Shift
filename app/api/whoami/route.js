import { auth } from "../../../auth";

/**
 * Diagnostic endpoint. Shows exactly what the token carried, which is the
 * fastest way to tell a missing groups claim apart from a wrong group ID.
 * Remove it once the rollout is done.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();

  if (!session || !session.user) {
    return Response.json({ ok: true, signedIn: false }, { status: 200 });
  }

  return Response.json({
    ok: true,
    signedIn: true,
    name: session.user.name ?? null,
    email: session.user.email ?? null,
    role: session.user.role,
    grps: session.user.grps,
    allStores: session.user.allStores,
  });
}
