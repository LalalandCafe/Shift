import { auth } from "../../../auth";

/**
 * Diagnostic endpoint. Shows exactly what the token carried, which is the
 * fastest way to tell a missing groups claim apart from a wrong group ID.
 * Remove it once the rollout is done.
 *
 * Identity is read from the session (auth()), not from the x-shift-* request
 * headers, which is how this route has always worked and why GET takes no
 * request argument. The two agree by construction - middleware.js writes
 * those headers from this same session - so reading the session here keeps
 * the endpoint honest about what the TOKEN holds rather than about what the
 * middleware managed to forward.
 *
 * What this never returns: the raw token, and the Entra security group GUIDs.
 * `grps` below is the SHIFT grp labels ("TX-TN", "CA-AZ") that came out of
 * lib/permissions.js, not the group IDs that went in.
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
    // The stable identifier (Entra objectId). ALWAYS present as a key, and
    // null rather than undefined or the string "undefined" when there is no
    // value, because the three states have to be told apart:
    //
    //   key absent      -> this deploy predates the field; you are not
    //                      running the code you think you are
    //   "oid": null     -> the route works, the value is not in the session.
    //                      Either the session predates oid (sign out and back
    //                      in - JWTs live 12h) or Entra is not sending the
    //                      claim at all
    //   "oid": "..."    -> working
    //
    // Display only, same as email. Nothing here decides access; role and grps
    // come from the groups claim and from nothing else.
    oid: session.user.oid ?? null,
    role: session.user.role,
    grps: session.user.grps,
    allStores: session.user.allStores,
  });
}
