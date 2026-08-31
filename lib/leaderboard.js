/**
 * Leaderboard scoring, in one place.
 *
 * The Dashboard and the Leaderboard both show a ranked top three. If each one
 * carried its own copy of this math they would quietly disagree the first time
 * a weight or a threshold changed, and nobody would know which board was
 * right. Both import from here.
 */

/**
 * Below this a rating is displayed but greyed out and left out of the score.
 * A single week regularly gives a store two or three reviews, and two bad
 * ones would drop it to the bottom on noise rather than performance.
 */
export const MIN_REVIEWS_TO_RANK = 5;

/**
 * The company-wide rating target. A store at this rating hits target, the
 * same way a store at 100% efficiency hits its own SPLH target. One
 * constant, not a per-store column: every store is held to the same bar on
 * guest experience, unlike SPLH where each store has its own number.
 */
export const RATING_TARGET = 4.5;

export const WEIGHTS = { efficiency: 0.5, reviews: 0.5 };

/**
 * The store's SPLH for the window on screen.
 *
 * Week to date when it exists, the single day otherwise. This fallback used to
 * be written inline inside efficiencyOf, which meant the SPLH board and the
 * efficiency board could disagree about which number they were reading. One
 * function now, both callers.
 */
export function splhOf(s) {
  return s?.wtd?.splh ?? s?.day?.splh ?? null;
}

/** The store's own SPLH target. */
export function targetOf(s) {
  return s?.day?.target ?? null;
}

/**
 * Efficiency = week to date SPLH divided by the store's own target, as a
 * percentage. 100% means the store produced its sales with exactly the hours
 * the target allowed. Measuring each store against its own number is what lets
 * a $75 target store and a $90 target store compete fairly.
 */
export function efficiencyOf(s) {
  const splh = splhOf(s);
  const target = targetOf(s);
  // Explicit null checks, not falsy checks: a store with a genuinely valid
  // splh of 0 (no trade yet this week, or closed all week) used to be
  // treated the same as "no data" and silently dropped from every board,
  // including the Reviews-only one, which never even reads this field.
  if (splh === null || target === null) return null;
  if (!target) return null; // a zero target is a data error, never divide by it
  return (splh / target) * 100;
}

/**
 * The rating a store may be ranked on, or null.
 *
 * Anything under MIN_REVIEWS_TO_RANK is null rather than a low number, so a
 * store with two reviews is never treated as if it had earned that average.
 */
export function rankableRating(s) {
  const rev = s?.rev;
  if (!rev || rev.rating === null || rev.rating === undefined) return null;
  return rev.count >= MIN_REVIEWS_TO_RANK ? rev.rating : null;
}

/**
 * Rating, as a percentage of RATING_TARGET, mirroring efficiencyOf: 100%
 * means the store's rating sits exactly at RATING_TARGET, the same way 100%
 * efficiency means SPLH sits exactly at its own target. Above is over, below
 * is under.
 *
 * Unlike efficiency, this is never scored against the other stores in the
 * field — every store is held to the one company-wide target, not to
 * whoever else happens to be in view.
 */
export function ratingComponentOf(s) {
  const rating = rankableRating(s);
  // Explicit null check, not a falsy check: rankableRating already returns
  // null for "not enough reviews yet," and that must stay null here too,
  // never be coerced into a rating of 0.
  if (rating === null) return null;
  return (rating / RATING_TARGET) * 100;
}

/**
 * Percentile rank against the rest of the field, 0 to 100, ties averaged.
 * Nulls stay null.
 *
 * Used to rank efficiency: two stores' raw SPLH-vs-target ratios aren't
 * directly comparable to a blend with rating, so efficiency is read as a
 * percentile of the stores currently in view instead. Rating is not run
 * through this — see ratingComponentOf, which is scored against
 * RATING_TARGET instead of the field.
 */
export function percentiles(values) {
  const out = values.map(() => null);
  const valid = values
    .map((v, i) => ({ v: Number(v), i }))
    .filter((x) => Number.isFinite(x.v));

  if (!valid.length) return out;
  if (valid.length === 1) {
    out[valid[0].i] = 100;
    return out;
  }

  const sorted = [...valid].sort((a, b) => a.v - b.v);
  const last = sorted.length - 1;

  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1].v === sorted[i].v) j++;
    const pct = (((i + j) / 2) / last) * 100;
    for (let k = i; k <= j; k++) out[sorted[k].i] = pct;
    i = j + 1;
  }
  return out;
}

/**
 * Score a set of report rows.
 *
 * Stores are always scored against the other stores passed in, never against
 * the whole chain. That is deliberate: a DFW board should rank within DFW, so
 * changing the scope rescores the field.
 *
 * Returns the rows in input order with eff, splh, target, rev and score
 * attached, plus the same rows sorted by score and a code to rank lookup.
 *
 * byScore and rank are the score ranking only. A screen that ranks on some
 * other column has to build its own order, because a rank that does not match
 * the order the rows are printed in is worse than no rank at all.
 */
export function scoreStores(reportRows, windowKey = "period") {
  const base = (reportRows || [])
    .map((s) => ({
      ...s,
      eff: efficiencyOf(s),
      splh: splhOf(s),
      target: targetOf(s),
      rev: s.reviews?.[windowKey] || null,
    }))
    .filter((s) => s.eff !== null);

  if (!base.length) return { rows: [], byScore: [], rank: {} };

  const effPct = percentiles(base.map((s) => s.eff));

  const rows = base.map((s, i) => {
    const e = effPct[i];
    const r = ratingComponentOf(s);
    // A store without enough reviews is ranked on labor alone rather than
    // pushed to the bottom for something it has not had a chance to earn.
    const score =
      e !== null && r !== null
        ? e * WEIGHTS.efficiency + r * WEIGHTS.reviews
        : e !== null
        ? e
        : r;
    return {
      ...s,
      score: score === null ? null : Math.round(score * 10) / 10,
      scoredOnLaborOnly: r === null,
    };
  });

  const byScore = [...rows].sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  const rank = {};
  byScore.forEach((s, i) => (rank[s.code] = i + 1));

  return { rows, byScore, rank };
}

/**
 * Sales weighted rating across a set of stores. A store with four reviews
 * should not move the company number as much as one with sixty, so the
 * average is weighted by review count rather than by store.
 */
export function weightedRating(reportRows, windowKey = "period") {
  let n = 0;
  let sum = 0;
  (reportRows || []).forEach((s) => {
    const rev = s.reviews?.[windowKey];
    if (rev && rev.rating !== null && rev.count > 0) {
      n += rev.count;
      sum += rev.rating * rev.count;
    }
  });
  return n > 0 ? { rating: sum / n, count: n } : { rating: null, count: 0 };
}