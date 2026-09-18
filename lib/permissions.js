/**
 * Maps Entra security group IDs to a SHIFT role.
 *
 * Access is scoped by grp, the column already used in the stores table,
 * whose values are exactly TX-TN and CA-AZ. That is deliberate: it means a
 * newly opened market inherits access from its group with no code change.
 * Scoping by region instead would have made every new market invisible to
 * everyone except Admin until someone noticed and shipped a fix.
 */

const ADMIN = process.env.ENTRA_GROUP_ADMIN;
const TX_TN = process.env.ENTRA_GROUP_TX_TN;
const CA_AZ = process.env.ENTRA_GROUP_CA_AZ;

/**
 * Which group env vars are missing, by name.
 *
 * This exists because of how quietly this used to fail. resolveAccess guards
 * every comparison with `TX_TN && ...`, so an undefined var does not throw -
 * it just never matches, the area manager resolves to ROLE_NONE, and the
 * sign-in screen tells them they are "not in a SHIFT access group yet". That
 * message points at Entra and at InfoSec, when the actual fault is a missing
 * value in Vercel. The two look identical from the outside, which is exactly
 * the debugging trap worth spending a few lines to avoid.
 *
 * Exported so the failed-signIn log in auth.config.js can say which one is
 * missing at the moment it matters, not only at cold start.
 */
export function missingGroupEnv() {
  const missing = [];
  if (!ADMIN) missing.push("ENTRA_GROUP_ADMIN");
  if (!TX_TN) missing.push("ENTRA_GROUP_TX_TN");
  if (!CA_AZ) missing.push("ENTRA_GROUP_CA_AZ");
  return missing;
}

// Once per cold start, named specifically. These are read at module scope,
// and on Vercel that means they are inlined into the Edge bundle at BUILD
// time - so fixing one of these in the dashboard needs a redeploy, not just a
// restart. Worth saying out loud in the log, because "I already set it" and
// "it is live" are not the same thing here.
{
  const missing = missingGroupEnv();
  if (missing.length > 0) {
    console.error(
      "[permissions] MISSING GROUP ENV: " +
        missing.join(", ") +
        ". Every account matched only by a missing var resolves to ROLE_NONE " +
        "and is told it has no SHIFT access, which is indistinguishable from " +
        "a real group membership problem. Set it in Vercel and REDEPLOY " +
        "(these are build-time inlined for the Edge middleware)."
    );
  }
}

export const ROLE_ADMIN = "admin";
export const ROLE_REGIONAL = "regional";
export const ROLE_NONE = "none";

export const GRP_TX_TN = "TX-TN";
export const GRP_CA_AZ = "CA-AZ";

export function resolveAccess(groups) {
  const g = Array.isArray(groups) ? groups : [];

  if (ADMIN && g.includes(ADMIN)) {
    return { role: ROLE_ADMIN, grps: [], allStores: true };
  }

  const grps = [];
  if (TX_TN && g.includes(TX_TN)) grps.push(GRP_TX_TN);
  if (CA_AZ && g.includes(CA_AZ)) grps.push(GRP_CA_AZ);

  if (grps.length > 0) {
    return { role: ROLE_REGIONAL, grps, allStores: false };
  }

  return { role: ROLE_NONE, grps: [], allStores: false };
}

/**
 * Fail closed. An unknown role, a missing grp, or a store row that somehow
 * has no grp at all, all resolve to no access.
 */
export function canSeeGrp(access, grp) {
  if (!access) return false;
  if (access.allStores === true) return true;
  if (!grp) return false;
  return Array.isArray(access.grps) && access.grps.includes(grp);
}

/**
 * Filter store rows down to what this session may see.
 *
 * Rows are expected to carry a grp field, which is how lib/report.js already
 * shapes them. Keeping the filter in one place is the point: the same call
 * is used by every route handler instead of each one reimplementing it.
 */
export function filterStores(access, rows) {
  if (!Array.isArray(rows)) return [];
  if (!access) return [];
  if (access.allStores === true) return rows;
  return rows.filter((r) => canSeeGrp(access, r.grp));
}
