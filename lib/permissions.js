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
