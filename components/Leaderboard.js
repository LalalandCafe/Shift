"use client";

import { useState } from "react";
import Icon from "./Icon";
import CupMedal from "./CupMedal";
import { GROUPS, money, int, median } from "../lib/ui";
import {
  bandForRating,
  bonusTierFor,
  BONUS_TIER_LABEL,
  inkOfBand,
  reviewLegend,
} from "../lib/scale";
import { scoreStores, efficiencyOf, MIN_REVIEWS_TO_RANK } from "../lib/leaderboard";

/**
 * The ranking math lives in lib/leaderboard.js because the Dashboard shows the
 * same top three. Two copies would drift the first time a weight changed.
 */

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
  { key: "rating", label: "Reviews" },
];

// Period first. It is the window the bonus is paid on and the only one with
// enough reviews per store to be stable.
const WINDOWS = [
  { key: "period", label: "Period" },
  { key: "week", label: "This week" },
];

const PLACES = ["gold", "silver", "bronze"];

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
    .map((s) => ({ ...s, eff: efficiencyOf(s) }))
    .filter((s) => s.eff !== null);

  const base = (report.rows || []).filter(scopeDef.match);
  const { rows, byScore, rank } = scoreStores(base, windowKey);

  if (!rows.length) {
    return (
      <div className="empty">
        <div className="empty-title">Nothing to rank</div>
        <div>No store in this scope has reported hours and sales yet.</div>
      </div>
    );
  }

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
            <CupMedal place={PLACES[i]} rank={i + 1} size={40} />
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