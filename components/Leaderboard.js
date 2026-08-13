"use client";

import { useState } from "react";
import Icon from "./Icon";
import { GROUPS, money, int, dec, median } from "../lib/ui";

/**
 * Efficiency = week to date SPLH divided by the store's own target, as a
 * percentage. 100% means the store hit its sales with exactly the hours the
 * target allowed. Because every store is measured against its own target, a
 * $75 target store and a $90 target store compete on even ground.
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

export default function Leaderboard({ report }) {
  const [scope, setScope] = useState("All");
  const [sort, setSort] = useState("eff");
  const [pinned, setPinned] = useState(null);

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
        <div>No store in this scope reported hours and sales yet.</div>
      </div>
    );
  }

  const sorted = [...rows].sort((a, b) => {
    if (sort === "name") return a.name.localeCompare(b.name);
    if (sort === "splh") return (b.wtd?.splh ?? 0) - (a.wtd?.splh ?? 0);
    return b.eff - a.eff;
  });

  // Ranking is always by efficiency, whatever the display order is.
  const byEff = [...rows].sort((a, b) => b.eff - a.eff);
  const rank = {};
  byEff.forEach((s, i) => (rank[s.code] = i + 1));

  const atTarget = rows.filter((s) => s.eff >= 100).length;
  const medEff = median(rows.map((s) => s.eff));

  const totalHours = rows.reduce((a, s) => a + (s.wtd?.hours || 0), 0);
  const totalSales = rows.reduce((a, s) => a + (s.wtd?.sales || 0), 0);
  const chainSplh = totalHours > 0 ? totalSales / totalHours : 0;

  // Symmetric scale so the two sides of the baseline are visually comparable.
  const maxDev = Math.max(10, Math.ceil(Math.max(...rows.map((s) => Math.abs(s.eff - 100))) / 5) * 5);
  const best = byEff[0];
  const worst = byEff[byEff.length - 1];

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
          <div className="mc-s">
            {Math.round((atTarget / rows.length) * 100)}% of the stores in this scope
          </div>
        </div>
        <div className="mc">
          <div className="mc-l">Typical store</div>
          <div className="mc-v">
            {Math.round(medEff)}<span className="mc-u">%</span>
          </div>
          <div className="mc-s">Median efficiency, not the average</div>
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
            {Math.round(best.eff - worst.eff)}<span className="mc-u"> pts</span>
          </div>
          <div className="mc-s">
            {best.name} to {worst.name}
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
              <div className="kd-v">${detail.wtd?.splh ?? "—"}</div>
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
              <div className="kd-k">Yesterday SPLH</div>
              <div className="kd-v">${detail.day?.splh}</div>
            </div>
          </div>
          <div className="kd-note">
            At {Math.round(detail.eff)}% this store is{" "}
            {detail.eff >= 100
              ? `beating its target by ${Math.round(detail.eff - 100)} points, which means it is producing its sales with fewer hours than budgeted.`
              : `${Math.round(100 - detail.eff)} points short, which means it used more hours than the target allowed for the sales it produced.`}
          </div>
        </div>
      )}

      <div className="tcard">
        <div className="thead">
          <div>
            <div className="ttl">{scopeDef.label}</div>
            <div className="tsub">
              Bars run from the target line. Right is ahead, left is behind. Click a store for
              the detail.
            </div>
          </div>
          <span className="chip chip-mute">{rows.length} stores</span>
        </div>

        <div className="lb-axis">
          <span>-{maxDev} pts</span>
          <span className="lb-axis-mid">Target</span>
          <span>+{maxDev} pts</span>
        </div>

        <div className="lb-chart stagger">
          {sorted.map((s, i) => {
            const dev = s.eff - 100;
            const width = (Math.abs(dev) / maxDev) * 50;
            const ahead = dev >= 0;
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
                  <span className="lb-meta">
                    ${s.wtd?.splh ?? "—"} SPLH · target ${s.day?.target}
                  </span>
                </span>
                <span className="lb-track">
                  <span className="lb-base" />
                  <span
                    className={"lb-bar " + (ahead ? "up" : "down")}
                    style={{
                      left: ahead ? "50%" : `${50 - width}%`,
                      width: `${Math.max(width, 0.6)}%`,
                    }}
                  />
                </span>
                <span className={"lb-pct " + (ahead ? "up" : "down")}>
                  {Math.round(s.eff)}%
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="footnote">
        Efficiency is week to date SPLH divided by the store's own target. Over 100% means the
        store hit its sales with fewer hours than the target allowed. Because each store is
        measured against its own number, a $75 target store and a $90 target store are compared
        fairly. Stores with no hours or no sales yet this week are left out of the ranking.
      </div>
    </div>
  );
}
