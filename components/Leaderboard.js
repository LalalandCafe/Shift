"use client";

import { useState } from "react";
import Icon from "./Icon";
import { GROUPS, money, int, median } from "../lib/ui";
import {
  bandForRating,
  bonusTierFor,
  BONUS_TIER_LABEL,
  inkOfBand,
  reviewLegend,
} from "../lib/scale";

/**
 * Efficiency = week to date SPLH divided by the store's own target, as a
 * percentage. 100% means the store produced its sales with exactly the hours
 * the target allowed. Measuring each store against its own number is what lets
 * a $75 target store and a $90 target store compete fairly.
 */
function efficiencyOf(s) {
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
function percentiles(values) {
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

const WEIGHTS = { efficiency: 0.5, reviews: 0.5 };

/**
 * Below this a rating is displayed but greyed out and left out of the score.
 * A single week regularly gives a store two or three reviews, and two bad
 * ones would drop it to the bottom on noise rather than performance.
 */
const MIN_REVIEWS_TO_RANK = 5;

const SCOPES = [
  { key: "All", label: "All stores", match: () => true },
  { key: "TX-TN", label: "TX-TN", match: (s) => s.grp === "TX-TN" },
  { key: "CA-AZ", label: "CA-AZ", match: (s) => s.grp === "CA-AZ" },
  ...Object.values(GROUPS)
    .flat()
    .map((def) => ({
      key: def.label,
      label: def.label,
      match: (s) => def.regions.includes(s.region),
    })),
];

const SORTS = [
  { key: "score", label: "Score" },
  { key: "eff", label: "Efficiency" },
  { key: "rating", label: "Reviews" },
  { key: "name", label: "Name" },
];

// Period first. It is the window the bonus is paid on and the only one with
// enough reviews per store to be stable.
const WINDOWS = [
  { key: "period", label: "Period" },
  { key: "week", label: "This week" },
];

const PLACES = ["gold", "silver", "bronze"];

/** Struck medal: ribbon tails, ring, disc, rank number. No emoji. */
function Medal({ place, rank, size = 46 }) {
  return (
    <svg className={"lb-medal " + place} width={size} height={size} viewBox="0 0 44 44" aria-hidden="true">
      <path className="ribbon l" d="M13 2 L20 17 L14.5 20.5 L7.5 5 Z" />
      <path className="ribbon r" d="M31 2 L24 17 L29.5 20.5 L36.5 5 Z" />
      <circle className="ring" cx="22" cy="28" r="13" />
      <circle className="disc" cx="22" cy="28" r="9.6" />
      <text className="num" x="22" y="28" textAnchor="middle" dominantBaseline="central">
        {rank}
      </text>
    </svg>
  );
}

/** Progress toward the store's own target, with the target marked on the track. */
function GoalBar({ eff, scale }) {
  const fill = Math.min(100, (eff / scale) * 100);
  const mark = (100 / scale) * 100;
  return (
    <div className="lb-goal">
      <div
        className={"lb-goal-fill " + (eff >= 100 ? "up" : "down")}
        style={{ width: fill + "%" }}
      />
      <div className="lb-goal-mark" style={{ left: mark + "%" }} />
    </div>
  );
}

/**
 * Star average colored by the Operating Partner Program cutoffs. The
 * thresholds live in lib/scale.js, never here.
 */
function Rating({ rev, showCount = true }) {
  if (!rev || rev.rating === null || rev.rating === undefined) {
    return <span className="lb-rating none">--</span>;
  }
  const thin = rev.count < MIN_REVIEWS_TO_RANK;
  return (
    <span
      className={"lb-rating" + (thin ? " thin" : "")}
      style={{ color: thin ? "var(--text3)" : inkOfBand(bandForRating(rev.rating)) }}
      title={thin ? `Only ${rev.count} reviews, too few to rank on` : undefined}
    >
      <b>{rev.rating.toFixed(2)}</b>
      {showCount && <span className="lb-rating-n">{rev.count}</span>}
    </span>
  );
}

export default function Leaderboard({ report }) {
  const [scope, setScope] = useState("All");
  const [sort, setSort] = useState("score");
  const [windowKey, setWindowKey] = useState("period");
  const [pinned, setPinned] = useState(null);
  const [showAll, setShowAll] = useState(false);

  if (!report) return <div className="empty">Pick a date to build the leaderboard.</div>;

  const scopeDef = SCOPES.find((s) => s.key === scope) || SCOPES[0];

  const all = (report.rows || [])
    .map((s) => ({ ...s, eff: efficiencyOf(s), rev: s.reviews?.[windowKey] || null }))
    .filter((s) => s.eff !== null);

  const base = all.filter(scopeDef.match);

  if (!base.length) {
    return (
      <div className="empty">
        <div className="empty-title">Nothing to rank</div>
        <div>No store in this scope has reported hours and sales yet.</div>
      </div>
    );
  }

  // Scored against the stores currently in view. Changing scope rescores,
  // which is the point: a region board should rank within that region.
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

  const podium = byScore.slice(0, 3);
  const ordered = [...rows].sort((a, b) => {
    if (sort === "name") return a.name.localeCompare(b.name);
    if (sort === "eff") return b.eff - a.eff;
    if (sort === "rating") return (b.rev?.rating ?? -1) - (a.rev?.rating ?? -1);
    return (b.score ?? -1) - (a.score ?? -1);
  });

  // On the default sort the podium already covers the top three.
  const listSource = sort === "score" ? ordered.slice(3) : ordered;
  const list = showAll ? listSource : listSource.slice(0, 10);

  const atTarget = rows.filter((s) => s.eff >= 100).length;
  const rated = rows.filter(
    (s) => s.rev && s.rev.rating !== null && s.rev.count >= MIN_REVIEWS_TO_RANK
  );
  const medRating = rated.length ? median(rated.map((s) => s.rev.rating)) : null;
  const earning = rated.filter((s) => s.rev.rating >= 4.5).length;
  const losing = rated.filter((s) => s.rev.rating < 4.0).length;
  const totalReviews = rated.reduce((a, s) => a + s.rev.count, 0);
  const unanswered = rated.reduce((a, s) => a + s.rev.unanswered, 0);
  const scale = Math.max(120, Math.ceil(Math.max(...rows.map((s) => s.eff)) / 10) * 10);

  const detail = pinned ? rows.find((s) => s.code === pinned) : null;
  const windowLabel = windowKey === "period" ? `period ${report.period}` : "this week";

  return (
    <div className="view">
      <div className="ctx">
        <div className="ctx-block">
          <div>
            <b>Week {report.weekNum} leaderboard</b>
            <span> · through {report.dayName}, {report.date}</span>
            <div style={{ fontSize: 10.5, color: "var(--ink-text2)" }}>
              Half labor efficiency, half guest reviews
            </div>
          </div>
        </div>
      </div>

      <div className="mc-grid">
        <div className="mc">
          <div className="mc-l">At or above target</div>
          <div className="mc-v">
            {atTarget} <span className="mc-u">/ {rows.length}</span>
          </div>
          <div className="mc-s">Labor efficiency, week to date</div>
        </div>
        <div className="mc">
          <div className="mc-l">Typical rating</div>
          <div
            className="mc-v"
            style={{ color: medRating === null ? undefined : inkOfBand(bandForRating(medRating)) }}
          >
            {medRating === null ? "--" : medRating.toFixed(2)}
          </div>
          <div className="mc-s">
            Median of {rated.length} stores, {windowLabel}
          </div>
        </div>
        <div className="mc">
          <div className="mc-l">Earning the bonus</div>
          <div className="mc-v">
            {earning} <span className="mc-u">/ {rated.length}</span>
          </div>
          <div className="mc-s">
            {losing} below 4.0 and losing it entirely
          </div>
        </div>
        <div className="mc">
          <div className="mc-l">Reviews unanswered</div>
          <div className="mc-v">
            {unanswered} <span className="mc-u">/ {totalReviews}</span>
          </div>
          <div className="mc-s">
            {totalReviews > 0
              ? `${Math.round((unanswered / totalReviews) * 100)}% never got a reply`
              : "No reviews in this window"}
          </div>
        </div>
      </div>

      <div className="lb-controls">
        <div className="lb-chips">
          {SCOPES.map((sc) => {
            const n = all.filter(sc.match).length;
            if (!n) return null;
            return (
              <button
                key={sc.key}
                className={"lb-chip" + (scope === sc.key ? " active" : "")}
                onClick={() => {
                  setScope(sc.key);
                  setPinned(null);
                  setShowAll(false);
                }}
              >
                {sc.label}
                <span className="lb-chip-n">{n}</span>
              </button>
            );
          })}
        </div>
        <div className="lb-segs">
          <div className="seg">
            {WINDOWS.map((w) => (
              <button
                key={w.key}
                className={"seg-btn" + (windowKey === w.key ? " active" : "")}
                onClick={() => setWindowKey(w.key)}
              >
                {w.label}
              </button>
            ))}
          </div>
          <div className="seg">
            {SORTS.map((s) => (
              <button
                key={s.key}
                className={"seg-btn" + (sort === s.key ? " active" : "")}
                onClick={() => setSort(s.key)}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="lb-podium stagger">
        {podium.map((s, i) => (
          <button
            key={s.code}
            className={"lb-pod " + PLACES[i] + (pinned === s.code ? " pinned" : "")}
            style={{ "--i": i }}
            onClick={() => setPinned(pinned === s.code ? null : s.code)}
          >
            <Medal place={PLACES[i]} rank={i + 1} />
            <div className="lb-pod-body">
              <div className="lb-pod-name">{s.name}</div>
              <div className="lb-pod-meta">
                {Math.round(s.eff)}% eff · <Rating rev={s.rev} /> · {s.region}
              </div>
              <GoalBar eff={s.eff} scale={scale} />
            </div>
            <div className="lb-pod-pct neutral">{Math.round(s.score)}</div>
          </button>
        ))}
      </div>

      {detail && (
        <div className="kd-panel">
          <button className="kd-close" onClick={() => setPinned(null)} aria-label="Close">
            <Icon name="close" size={14} />
          </button>
          <div className="kd-eyebrow">
            Rank {rank[detail.code]} of {rows.length} · {detail.region}
          </div>
          <div className="kd-title">{detail.name}</div>
          <div className="kd-summary">
            <div>
              <div className="kd-k">Score</div>
              <div className="kd-v">{Math.round(detail.score)}</div>
            </div>
            <div>
              <div className="kd-k">Efficiency</div>
              <div className="kd-v">{Math.round(detail.eff)}%</div>
            </div>
            <div>
              <div className="kd-k">WTD SPLH</div>
              <div className="kd-v">${detail.wtd?.splh ?? "-"}</div>
            </div>
            <div>
              <div className="kd-k">Target</div>
              <div className="kd-v">${detail.day?.target}</div>
            </div>
            <div>
              <div className="kd-k">Rating</div>
              <div className="kd-v">
                {detail.rev?.rating != null ? detail.rev.rating.toFixed(2) : "--"}
              </div>
            </div>
            <div>
              <div className="kd-k">Reviews</div>
              <div className="kd-v">{detail.rev?.count ?? 0}</div>
            </div>
            <div>
              <div className="kd-k">Answered</div>
              <div className="kd-v">
                {detail.rev?.responseRate != null ? `${detail.rev.responseRate}%` : "--"}
              </div>
            </div>
            <div>
              <div className="kd-k">Bonus</div>
              <div className="kd-v" style={{ fontSize: 15 }}>
                {detail.rev?.rating != null && detail.rev.count >= MIN_REVIEWS_TO_RANK
                  ? BONUS_TIER_LABEL[bonusTierFor(detail.rev.rating)]
                  : "--"}
              </div>
            </div>
          </div>
          <div className="kd-note">
            {detail.eff >= 100
              ? `Beating the labor target by ${Math.round(detail.eff - 100)} points. `
              : `Short of the labor target by ${Math.round(100 - detail.eff)} points. `}
            {detail.rev?.rating == null
              ? "No Google or Yelp reviews landed in this window, so the rank is on labor alone."
              : detail.rev.count < MIN_REVIEWS_TO_RANK
              ? `Only ${detail.rev.count} reviews landed in this window, too few to rank on, so the score is labor alone.`
              : detail.rev.rating >= 4.5
              ? `Guests are rating ${detail.rev.rating.toFixed(2)} across ${detail.rev.count} reviews, which clears the top bonus line.`
              : detail.rev.rating >= 4.0
              ? `Guests are rating ${detail.rev.rating.toFixed(2)}. Another ${(4.5 - detail.rev.rating).toFixed(2)} would reach the top bonus line.`
              : `Guests are rating ${detail.rev.rating.toFixed(2)}, below the 4.0 line, so no bonus at all.`}
            {detail.rev?.unanswered > 0 &&
              ` ${detail.rev.unanswered} of those reviews still have no reply.`}
          </div>
        </div>
      )}

      <div className="tcard">
        <div className="thead">
          <div>
            <div className="ttl">{sort === "score" ? "Rest of the field" : scopeDef.label}</div>
            <div className="tsub">
              The line on each bar is the store's own labor target. Click a row for the detail.
            </div>
          </div>
          <span className="chip chip-mute">{rows.length} stores</span>
        </div>

        <div className="lb-list stagger">
          {list.map((s, i) => (
            <button
              key={s.code}
              className={"lb-row" + (pinned === s.code ? " pinned" : "")}
              style={{ "--i": i }}
              onClick={() => setPinned(pinned === s.code ? null : s.code)}
            >
              <span className={"lb-rank" + (rank[s.code] <= 3 ? " top" : "")}>{rank[s.code]}</span>
              <span className="lb-name">
                {s.name}
                <span className="lb-meta">
                  {Math.round(s.eff)}% eff · ${s.wtd?.splh} SPLH
                </span>
              </span>
              <GoalBar eff={s.eff} scale={scale} />
              <Rating rev={s.rev} />
              <span className="lb-pct">{Math.round(s.score)}</span>
            </button>
          ))}
        </div>

        {listSource.length > 10 && (
          <div style={{ padding: 12 }}>
            <button className="btn btn-quiet" onClick={() => setShowAll(!showAll)}>
              <Icon name={showAll ? "up" : "down"} size={14} />
              {showAll ? "Show fewer" : `Show all ${listSource.length}`}
            </button>
          </div>
        )}

        <div className="lb-legend">
          {reviewLegend().map((l) => (
            <span key={l.band} className="lb-legend-item">
              <i style={{ background: l.fill }} />
              {l.text}
            </span>
          ))}
        </div>
      </div>

      <div className="footnote">
        Score is half labor efficiency and half guest reviews. Each half is ranked against the
        other stores currently in view and then blended, because a percentage and a star rating
        cannot be averaged directly. Efficiency is week to date SPLH divided by the store's own
        target, so targets of $75 and $90 compare fairly. Review color follows the Operating
        Partner Program: 4.5 and up earns the full bonus, 4.0 to 4.49 earns base only, and below
        4.0 earns none. Stores with fewer than five reviews in the window are ranked on labor
        alone, because two or three reviews say more about who happened to post than about
        the store.
      </div>
    </div>
  );
}