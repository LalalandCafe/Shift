"use client";

import { useState } from "react";
import Icon from "./Icon";
import CupMedal from "./CupMedal";
import { GROUPS, median } from "../lib/ui";
import { bandForRating, inkOfBand, reviewLegend, RATING_TARGET } from "../lib/scale";
import {
  scoreStores,
  rankableRating,
  MIN_REVIEWS_TO_RANK,
} from "../lib/leaderboard";

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

/**
 * The three boards.
 *
 * Each one ranks on exactly the number it is named after, and the number it
 * ranks on is the number printed on the right of every row. The old screen
 * ranked on score no matter which tab was open, so switching to Reviews
 * reordered the rows but left the score ranks printed beside them, and the
 * list read as though the numbering were random. It was not: it was answering
 * a question nobody had asked.
 *
 * bar is what the progress track shows, always the ranked metric against the
 * store's own line, so the track means the same thing on all three boards.
 */
const BOARDS = {
  score: {
    key: "score",
    label: "Score",
    blurb: "Half labor efficiency, half guest reviews",
    rankBy: (s) => s.score,
    bar: (s) => ({ value: s.eff, target: 100 }),
  },
  rating: {
    key: "rating",
    label: "Reviews",
    blurb: `Google and Yelp average, ${RATING_TARGET.toFixed(2)} is the line`,
    rankBy: (s) => rankableRating(s),
    bar: (s) => ({ value: rankableRating(s), target: RATING_TARGET }),
  },
  splh: {
    key: "splh",
    label: "SPLH",
    blurb: "Sales per labor hour, nothing else",
    rankBy: (s) => s.splh,
    bar: (s) => ({ value: s.splh, target: s.target }),
  },
};

const BOARD_ORDER = ["score", "rating", "splh"];

// Period first. It is the wider window and the only one with enough reviews
// per store to be stable.
const WINDOWS = [
  { key: "period", label: "Period" },
  { key: "week", label: "This week" },
];

const PLACES = ["gold", "silver", "bronze"];

/** Progress toward the store's own line, with that line marked on the track. */
function GoalBar({ value, target, scale }) {
  if (value == null || !target || !scale) return <div className="lb-goal" />;
  const fill = Math.min(100, (value / scale) * 100);
  const mark = Math.min(100, (target / scale) * 100);
  return (
    <div className="lb-goal">
      <div
        className={"lb-goal-fill " + (value >= target ? "up" : "down")}
        style={{ width: fill + "%" }}
      />
      <div className="lb-goal-mark" style={{ left: mark + "%" }} />
    </div>
  );
}

/**
 * Star average colored by the review cutoffs. The thresholds live in
 * lib/scale.js, never here.
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
  const [boardKey, setBoardKey] = useState("score");
  const [windowKey, setWindowKey] = useState("period");
  const [pinned, setPinned] = useState(null);
  const [showAll, setShowAll] = useState(false);

  if (!report) return <div className="empty">Pick a date to build the leaderboard.</div>;

  const scopeDef = SCOPES.find((s) => s.key === scope) || SCOPES[0];
  const board = BOARDS[boardKey];

  const base = (report.rows || []).filter(scopeDef.match);
  const { rows } = scoreStores(base, windowKey);

  // Chip counts are the whole chain, not the current scope, so the numbers on
  // the chips do not move when you click one of them.
  const chipRows = scoreStores(report.rows || [], windowKey).rows;

  if (!rows.length) {
    return (
      <div className="empty">
        <div className="empty-title">Nothing to rank</div>
        <div>No store in this scope has reported hours and sales yet.</div>
      </div>
    );
  }

  /**
   * One ordering, used for both the podium and the list, and the ranks are
   * read off that same ordering. Rank 1 is always the top of the podium and
   * the list picks up at 4 with no gap, on every board.
   *
   * Name is the tie break so two stores on the same number do not swap places
   * between renders.
   */
  const ordered = [...rows].sort((a, b) => {
    const d = (board.rankBy(b) ?? -Infinity) - (board.rankBy(a) ?? -Infinity);
    if (d) return d;
    return a.name.localeCompare(b.name);
  });

  const rank = {};
  ordered.forEach((s, i) => (rank[s.code] = i + 1));

  const podium = ordered.slice(0, 3);
  const listSource = ordered.slice(3);
  const list = showAll ? listSource : listSource.slice(0, 10);

  // Header numbers. Both are counts of stores clearing their own line, which
  // is what a GM is graded on. They are deliberately not blended.
  const atSplh = rows.filter((s) => s.eff >= 100).length;
  const rated = rows.filter((s) => rankableRating(s) !== null);
  const atRating = rated.filter((s) => s.rev.rating >= RATING_TARGET).length;
  const medRating = rated.length ? median(rated.map((s) => s.rev.rating)) : null;

  const effScale = Math.max(120, Math.ceil(Math.max(...rows.map((s) => s.eff)) / 10) * 10);
  const splhScale = Math.ceil(Math.max(...rows.map((s) => s.splh || 0)) / 10) * 10 || 100;
  const scaleFor = boardKey === "splh" ? splhScale : boardKey === "rating" ? 5 : effScale;

  const detail = pinned ? rows.find((s) => s.code === pinned) : null;
  const windowLabel = windowKey === "period" ? `period ${report.period}` : "this week";

  /**
   * The number this board ranks on, printed large on the right of each row.
   * Returns text and color rather than an element, because the podium and the
   * list wrap it in different classes and a nested span would inherit both.
   */
  function boardValue(store) {
    if (boardKey === "splh") return { text: "$" + store.splh, color: undefined };
    if (boardKey === "rating") {
      const r = rankableRating(store);
      return {
        text: r === null ? "--" : r.toFixed(2),
        color: r === null ? "var(--text3)" : inkOfBand(bandForRating(r)),
      };
    }
    return { text: String(Math.round(store.score)), color: undefined };
  }

  /**
   * The slot to the left of the big number. Held open on every board even when
   * it is empty, so the row grid does not reflow when you switch tabs.
   */
  function BoardAside({ store }) {
    if (boardKey === "score") return <Rating rev={store.rev} />;
    if (boardKey === "rating") {
      return (
        <span className="lb-rating none">
          <span className="lb-rating-n">{store.rev?.count ?? 0}</span>
        </span>
      );
    }
    return <span className="lb-rating none" aria-hidden="true" />;
  }

  function metaOf(store) {
    if (boardKey === "splh") return `target $${store.target} · ${store.region}`;
    if (boardKey === "rating") return `${store.rev?.count ?? 0} reviews · ${store.region}`;
    return `${Math.round(store.eff)}% eff · $${store.splh} SPLH`;
  }

  return (
    <div className="view">
      <div className="ctx">
        <div className="ctx-block">
          <div>
            <b>Week {report.weekNum} {board.label.toLowerCase()} leaderboard</b>
            <span> · through {report.dayName}, {report.date}</span>
            <div style={{ fontSize: 10.5, color: "var(--ink-text2)" }}>{board.blurb}</div>
          </div>
        </div>
      </div>

      <div className="mc-grid">
        <div className="mc">
          <div className="mc-l">At or above SPLH</div>
          <div className="mc-v">
            {atSplh} <span className="mc-u">/ {rows.length}</span>
          </div>
          <div className="mc-s">Hitting their own SPLH target, week to date</div>
        </div>
        <div className="mc">
          <div className="mc-l">At or above ratings</div>
          <div className="mc-v">
            {atRating} <span className="mc-u">/ {rated.length}</span>
          </div>
          <div className="mc-s">
            {RATING_TARGET.toFixed(2)} or better, {windowLabel}
          </div>
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
      </div>

      <div className="lb-controls">
        <div className="lb-chips">
          {SCOPES.map((sc) => {
            const n = chipRows.filter(sc.match).length;
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
            {BOARD_ORDER.map((k) => (
              <button
                key={k}
                className={"seg-btn" + (boardKey === k ? " active" : "")}
                onClick={() => {
                  setBoardKey(k);
                  setShowAll(false);
                }}
              >
                {BOARDS[k].label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="lb-podium stagger">
        {podium.map((s, i) => {
          const b = board.bar(s);
          return (
            <button
              key={s.code}
              className={"lb-pod " + PLACES[i] + (pinned === s.code ? " pinned" : "")}
              style={{ "--i": i }}
              onClick={() => setPinned(pinned === s.code ? null : s.code)}
            >
              <CupMedal place={PLACES[i]} rank={i + 1} size={40} />
              <div className="lb-pod-body">
                <div className="lb-pod-name">{s.name}</div>
                <div className="lb-pod-meta">{metaOf(s)}</div>
                <GoalBar value={b.value} target={b.target} scale={scaleFor} />
              </div>
              <div className="lb-pod-pct neutral" style={{ color: boardValue(s).color }}>
                {boardValue(s).text}
              </div>
            </button>
          );
        })}
      </div>

      {detail && (
        <div className="kd-panel">
          <button className="kd-close" onClick={() => setPinned(null)} aria-label="Close">
            <Icon name="close" size={14} />
          </button>
          <div className="kd-eyebrow">
            {board.label} rank {rank[detail.code]} of {rows.length} · {detail.region}
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
              <div className="kd-v">${detail.splh ?? "-"}</div>
            </div>
            <div>
              <div className="kd-k">Target</div>
              <div className="kd-v">${detail.target}</div>
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
          </div>
          <div className="kd-note">
            {detail.eff >= 100
              ? `Beating the labor target by ${Math.round(detail.eff - 100)} points. `
              : `Short of the labor target by ${Math.round(100 - detail.eff)} points. `}
            {detail.rev?.rating == null
              ? "No Google or Yelp reviews landed in this window, so the score is on labor alone."
              : detail.rev.count < MIN_REVIEWS_TO_RANK
              ? `Only ${detail.rev.count} reviews landed in this window, too few to rank on, so the score is labor alone.`
              : detail.rev.rating >= RATING_TARGET
              ? `Guests are rating ${detail.rev.rating.toFixed(2)} across ${detail.rev.count} reviews, at or above the ${RATING_TARGET.toFixed(2)} line.`
              : `Guests are rating ${detail.rev.rating.toFixed(2)} across ${detail.rev.count} reviews, ${(RATING_TARGET - detail.rev.rating).toFixed(2)} under the ${RATING_TARGET.toFixed(2)} line.`}
          </div>
        </div>
      )}

      <div className="tcard">
        <div className="thead">
          <div>
            <div className="ttl">Rest of the field</div>
            <div className="tsub">
              {boardKey === "splh"
                ? "The line on each bar is the store's own SPLH target. Click a row for the detail."
                : boardKey === "rating"
                ? `The line on each bar is ${RATING_TARGET.toFixed(2)}. Click a row for the detail.`
                : "The line on each bar is the store's own labor target. Click a row for the detail."}
            </div>
          </div>
          <span className="chip chip-mute">{rows.length} stores</span>
        </div>

        <div className="lb-list stagger">
          {list.map((s, i) => {
            const b = board.bar(s);
            return (
              <button
                key={s.code}
                className={"lb-row" + (pinned === s.code ? " pinned" : "")}
                style={{ "--i": i }}
                onClick={() => setPinned(pinned === s.code ? null : s.code)}
              >
                <span className="lb-rank">{rank[s.code]}</span>
                <span className="lb-name">
                  {s.name}
                  <span className="lb-meta">{metaOf(s)}</span>
                </span>
                <GoalBar value={b.value} target={b.target} scale={scaleFor} />
                <BoardAside store={s} />
                <span className="lb-pct" style={{ color: boardValue(s).color }}>
                  {boardValue(s).text}
                </span>
              </button>
            );
          })}
        </div>

        {listSource.length > 10 && (
          <div style={{ padding: 12 }}>
            <button className="btn btn-quiet" onClick={() => setShowAll(!showAll)}>
              <Icon name={showAll ? "up" : "down"} size={14} />
              {showAll ? "Show fewer" : `Show all ${listSource.length}`}
            </button>
          </div>
        )}

        {boardKey !== "splh" && (
          <div className="lb-legend">
            {reviewLegend().map((l) => (
              <span key={l.band} className="lb-legend-item">
                <i style={{ background: l.fill }} />
                {l.text}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="footnote">
        {boardKey === "splh" ? (
          <>
            Ranked on sales per labor hour, week to date, and nothing else. This is the raw
            dollar figure, not a percentage of target, so a store carrying a $90 target has
            further to fall but also more room at the top. The line on each bar is that store's
            own target, which is why a store can sit low on this board and still be clearing its
            number.
          </>
        ) : boardKey === "rating" ? (
          <>
            Ranked on the Google and Yelp average for {windowLabel}, highest first. Stores with
            fewer than {MIN_REVIEWS_TO_RANK} reviews in the window are shown at the bottom
            rather than ranked, because two or three reviews say more about who happened to post
            than about the store. Color follows the review scale: 4.5 and up, 4.0 to 4.49, 3.5
            to 3.99, and under 3.5.
          </>
        ) : (
          <>
            Score is half labor efficiency and half guest reviews. Each half is ranked against
            the other stores currently in view and then blended, because a percentage and a star
            rating cannot be averaged directly. Efficiency is week to date SPLH divided by the
            store's own target, so targets of $75 and $90 compare fairly. Stores with fewer than{" "}
            {MIN_REVIEWS_TO_RANK} reviews in the window are scored on labor alone. If you want
            the two halves separately, the Reviews and SPLH tabs each rank on that one number.
          </>
        )}
      </div>
    </div>
  );
}