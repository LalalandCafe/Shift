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

export const WEIGHTS = { efficiency: 0.5, reviews: 0.5 };

/**
 * Efficiency = week to date SPLH divided by the store's own target, as a
 * percentage. 100% means the store produced its sales with exactly the hours
 * the target allowed. Measuring each store against its own number is what lets
 * a $75 target store and a $90 target store compete fairly.
 */
export function efficiencyOf(s) {
  const splh = s.wtd?.splh ?? s.day?.splh ?? null;
  const target = s.day?.target ?? null;
  if (!splh || !target) return null;
  return (splh / target) * 100;
}

/**
 * Percentile rank against the rest of the field, 0 to 100, ties averaged.
 * Nulls stay null.
 *
 * Efficiency and star ratings cannot be averaged directly: 112% and 4.6 are
 * different units on different scales. Converting both to a percentile of the
 * stores currently in view puts them in the same space, so a 50/50 blend
 * actually means half labor and half guest experience.
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
 * Returns the rows in input order with eff, rev and score attached, plus the
 * same rows sorted by score and a code to rank lookup.
 */
export function scoreStores(reportRows, windowKey = "period") {
  const base = (reportRows || [])
    .map((s) => ({ ...s, eff: efficiencyOf(s), rev: s.reviews?.[windowKey] || null }))
    .filter((s) => s.eff !== null);

  if (!base.length) return { rows: [], byScore: [], rank: {} };

  const effPct = percentiles(base.map((s) => s.eff));
  const revPct = percentiles(
    base.map((s) => (s.rev && s.rev.count >= MIN_REVIEWS_TO_RANK ? s.rev.rating : null))
  );

  const rows = base.map((s, i) => {
    const e = effPct[i];
    const r = revPct[i];
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