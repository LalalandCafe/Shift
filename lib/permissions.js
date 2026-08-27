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

/**
 * Company wide views.
 *
 * A few screens are deliberately not scoped by grp. The leaderboard is the
 * main one: a ranking that only shows your own region is not a ranking, and
 * you cannot tell a GM they placed fourth out of 35 while showing them 12
 * stores. Store Wars depends on everyone seeing the same board.
 *
 * The exemption is on scope, not on fields. Seeing that another region's
 * store ranks fourth at 92 percent of target is the point. Seeing that
 * store's dollar sales, hours and day by day detail is not.
 */
export const COMPANY_WIDE_VIEWS = ["leaderboard", "serviceboard"];

/**
 * Strips figures a user has no business reading for stores outside their
 * own grp, while leaving the ranking intact. Admin gets everything.
 *
 * Add any new dollar or hour field to REDACTED_FIELDS when it is introduced.
 * A field that is not listed here is exposed, so the failure mode of
 * forgetting is a leak, not a blank column. That is worth knowing.
 */
const REDACTED_FIELDS = [
  "netSales",
  "sales",
  "hours",
  "laborHours",
  "laborCost",
  "transactions",
];

export function redactForeignStores(access, rows) {
  if (!Array.isArray(rows)) return [];
  if (!access) return [];
  if (access.allStores === true) return rows;

  return rows.map((r) => {
    const own = canSeeGrp(access, r.grp);
    if (own) return { ...r, isOwn: true };

    const safe = { ...r, isOwn: false };
    for (const f of REDACTED_FIELDS) {
      if (f in safe) delete safe[f];
    }
    return safe;
  });
}
