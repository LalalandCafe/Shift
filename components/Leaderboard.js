"use client";

import { useState } from "react";
import Icon from "./Icon";
import { GROUPS, money, int, median } from "../lib/ui";

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
  { key: "eff", label: "Efficiency" },
  { key: "splh", label: "SPLH" },
  { key: "name", label: "Name" },
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

export default function Leaderboard({ report }) {
  const [scope, setScope] = useState("All");
  const [sort, setSort] = useState("eff");
  const [pinned, setPinned] = useState(null);
  const [showAll, setShowAll] = useState(false);

  if (!report) return <div className="empty">Pick a date to build the leaderboard.</div>;

  const scopeDef = SCOPES.find((s) => s.key === scope) || SCOPES[0];
  const all = (report.rows || [])
    .map((s) => ({ ...s, eff: efficiencyOf(s) }))
    .filter((s) => s.eff !== null);
  const rows = all.filter(scopeDef.match);

  if (!rows.length) {
    return (
      <div className="empty">
        <div className="empty-title">Nothing to rank</div>
        <div>No store in this scope has reported hours and sales yet.</div>
      </div>
    );
  }

  const byEff = [...rows].sort((a, b) => b.eff - a.eff);
  const rank = {};
  byEff.forEach((s, i) => (rank[s.code] = i + 1));

  const podium = byEff.slice(0, 3);
  const ordered = [...rows].sort((a, b) => {
    if (sort === "name") return a.name.localeCompare(b.name);
    if (sort === "splh") return (b.wtd?.splh ?? 0) - (a.wtd?.splh ?? 0);
    return b.eff - a.eff;
  });
  // On the default sort the podium already covers the top three.
  const listSource = sort === "eff" ? ordered.slice(3) : ordered;
  const list = showAll ? listSource : listSource.slice(0, 10);

  const atTarget = rows.filter((s) => s.eff >= 100).length;
  const medEff = median(rows.map((s) => s.eff));
  const totalHours = rows.reduce((a, s) => a + (s.wtd?.hours || 0), 0);
  const totalSales = rows.reduce((a, s) => a + (s.wtd?.sales || 0), 0);
  const chainSplh = totalHours > 0 ? totalSales / totalHours : 0;
  const scale = Math.max(120, Math.ceil(Math.max(...rows.map((s) => s.eff)) / 10) * 10);

  const detail = pinned ? rows.find((s) => s.code === pinned) : null;

  return (
    <div className="view">
      <div className="ctx">
        <div className="ctx-block">
          <div>
            <b>Week {report.weekNum} leaderboard</b>
            <span> · through {report.dayName}, {report.date}</span>
            <div style={{ fontSize: 10.5, color: "var(--ink-text2)" }}>
              Week to date SPLH against each store's own target
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
          <div className="mc-s">{Math.round((atTarget / rows.length) * 100)}% of this scope</div>
        </div>
        <div className="mc">
          <div className="mc-l">Typical store</div>
          <div className="mc-v">
            {Math.round(medEff)}
            <span className="mc-u">%</span>
          </div>
          <div className="mc-s">Median, so one outlier cannot move it</div>
        </div>
        <div className="mc">
          <div className="mc-l">Blended SPLH</div>
          <div className="mc-v">${Math.round(chainSplh)}</div>
          <div className="mc-s">
            {int(totalHours)} hours · {money(totalSales)}
          </div>
        </div>
        <div className="mc">
          <div className="mc-l">Spread</div>
          <div className="mc-v">
            {Math.round(byEff[0].eff - byEff[byEff.length - 1].eff)}
            <span className="mc-u"> pts</span>
          </div>
          <div className="mc-s">First place to last place</div>
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
                ${s.wtd?.splh} SPLH · target ${s.day?.target} · {s.region}
              </div>
              <GoalBar eff={s.eff} scale={scale} />
            </div>
            <div className={"lb-pod-pct " + (s.eff >= 100 ? "up" : "down")}>
              {Math.round(s.eff)}
              <span>%</span>
            </div>
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
              <div className="kd-k">WTD hours</div>
              <div className="kd-v">{int(detail.wtd?.hours)}</div>
            </div>
            <div>
              <div className="kd-k">WTD sales</div>
              <div className="kd-v">{money(detail.wtd?.sales)}</div>
            </div>
            <div>
              <div className="kd-k">Yesterday</div>
              <div className="kd-v">${detail.day?.splh}</div>
            </div>
          </div>
          <div className="kd-note">
            {detail.eff >= 100
              ? `Beating target by ${Math.round(detail.eff - 100)} points: the sales came in with fewer hours than budgeted.`
              : `Short by ${Math.round(100 - detail.eff)} points: the hours used ran ahead of what the sales supported.`}
          </div>
        </div>
      )}

      <div className="tcard">
        <div className="thead">
          <div>
            <div className="ttl">{sort === "eff" ? "Rest of the field" : scopeDef.label}</div>
            <div className="tsub">
              The line on each bar is the store's own target. Click a row for the detail.
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
                  ${s.wtd?.splh} SPLH · target ${s.day?.target}
                </span>
              </span>
              <GoalBar eff={s.eff} scale={scale} />
              <span className={"lb-pct " + (s.eff >= 100 ? "up" : "down")}>
                {Math.round(s.eff)}%
              </span>
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
      </div>

      <div className="footnote">
        Efficiency is week to date SPLH divided by the store's own target. Over 100% means the
        store hit its sales with fewer hours than the target allowed. Since each store is measured
        against its own number, targets of $75 and $90 compare fairly. Stores with no hours or
        sales yet this week are left out.
      </div>
    </div>
  );
}
