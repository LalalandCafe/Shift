import { auth } from "../auth";
import { canSeeGrp, ROLE_NONE } from "./permissions";

/**
 * Guard for API route handlers.
 *
 * Middleware protects pages. It does not protect route handlers reached
 * directly, which is where the unauthenticated write and delete endpoints
 * live today. Every handler that touches store data calls this first.
 *
 * Usage:
 *   const { session, deny } = await requireSession();
 *   if (deny) return deny;
 */
export async function requireSession() {
  const session = await auth();

  if (!session || !session.user || session.user.role === ROLE_NONE) {
    return { session: null, deny: json({ ok: false, error: "unauthorized" }, 401) };
  }

  return { session, deny: null };
}

/**
 * Second half of the check. Being signed in says who you are. It does not
 * say which stores you may read. Pass the grp of the store being requested,
 * not the store code.
 */
export function requireGrp(session, grp) {
  const access = accessFromSession(session);

  if (!canSeeGrp(access, grp)) {
    return json({ ok: false, error: "forbidden" }, 403);
  }

  return null;
}

/**
 * Reshapes a session into the plain object permissions.js expects, so the
 * session shape and the permission logic can change independently.
 */
export function accessFromSession(session) {
  return {
    role: session?.user?.role ?? ROLE_NONE,
    grps: session?.user?.grps ?? [],
    allStores: session?.user?.allStores === true,
  };
}

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
