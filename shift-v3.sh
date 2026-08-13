#!/usr/bin/env bash
# ============================================================
#  SHIFT v3
#    1. Week view: sortable columns, worst first (default look unchanged)
#    2. Leaderboard: rebuilt with a diverging bar chart
#    3. Sidebar collapses by clicking the logo, logo gains the Janus crown
#
#  Usage, from the repo root:   bash shift-v3.sh
# ============================================================
set -euo pipefail

[ -d app ] && [ -d components ] || { echo "Run this from the repo root, the one that holds app/ and components/."; exit 1; }
[ -f components/ShiftLogo.js ] || { echo "components/ShiftLogo.js is missing. Run shift-logo.sh first."; exit 1; }
[ -f lib/ui.js ] || { echo "lib/ui.js is missing. Run shift-setup.sh first."; exit 1; }

STAMP=$(date +%Y%m%d-%H%M%S)
write() {
  if [ -f "$1" ]; then cp "$1" "$1.$STAMP.bak"; fi
  cat > "$1"
  echo "    write   $1"
}

echo "==> writing v3 files  (backups tagged .$STAMP.bak)"
write components/ShiftLogo.js << '__SHIFT_EOF__'
const BLUE = '#3B6FB6';
const AMBER = '#D08A2C';
const EYE = '#F4F7F2';

const LEFT = 'M31 8C20 8 12 16 12 26L8 33l4 2v4c0 4 3 6 6 7l5 3v8h8z';
const RIGHT = 'M33 8c11 0 19 8 19 18l4 7-4 2v4c0 4-3 6-6 7l-5 3v8h-8z';

// Crown, split down the same seam as the faces: a lunate crescent with the
// horns turned up, on a short stem. Left half blue, right half amber.
const CROWN_LEFT = 'M12 -15Q14 -2 31.2 -2L31.2 -7.6Q15.4 -7.6 12 -15Z';
const CROWN_RIGHT = 'M52 -15Q50 -2 32.8 -2L32.8 -7.6Q48.6 -7.6 52 -15Z';
const STEM_LEFT = 'M28.8 -3.4h2.4V7h-2.4z';
const STEM_RIGHT = 'M32.8 -3.4h2.4V7h-2.4z';

const WORDMARK_FONT =
  'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif';

function Faces({ left = BLUE, right = AMBER, eye = EYE, showEyes = true, crown = false }) {
  return (
    <>
      {crown && (
        <g className="shift-crown">
          <path d={CROWN_LEFT} fill={left} />
          <path d={STEM_LEFT} fill={left} />
          <path d={CROWN_RIGHT} fill={right} />
          <path d={STEM_RIGHT} fill={right} />
        </g>
      )}
      <path d={LEFT} fill={left} />
      <path d={RIGHT} fill={right} />
      {showEyes && (
        <>
          <circle cx="17" cy="27" r="2.4" fill={eye} />
          <circle cx="47" cy="27" r="2.4" fill={eye} />
        </>
      )}
    </>
  );
}

/**
 * SHIFT logo.
 *
 * variant:
 *   'lockup'  mark + wordmark, horizontal (default)
 *   'stacked' mark above wordmark, centered
 *   'mark'    Janus mark only, in brand colors
 *   'mono'    Janus mark only, single color (inherits currentColor)
 *   'icon'    rounded square app icon, dark background
 *
 * size = rendered height in px. Width scales automatically.
 * The wordmark uses currentColor, so it follows your text color in light and dark mode.
 */
export default function ShiftLogo({
  variant = 'lockup',
  size = 32,
  crown = false,
  className = '',
  title = 'SHIFT',
  ...rest
}) {
  const common = {
    className,
    role: 'img',
    'aria-label': title,
    xmlns: 'http://www.w3.org/2000/svg',
    ...rest,
  };

  // With the crown on, the viewBox opens up above the head so the faces keep
  // their exact geometry instead of being squashed to make room.
  const box = crown ? '0 -18 64 82' : '0 0 64 64';
  const ratio = crown ? 64 / 82 : 1;

  if (variant === 'mark' || variant === 'mono') {
    const mono = variant === 'mono';
    return (
      <svg viewBox={box} width={size * ratio} height={size} {...common}>
        {mono ? (
          <>
            {crown && (
              <g className="shift-crown">
                <path d={CROWN_LEFT} fill="currentColor" />
                <path d={STEM_LEFT} fill="currentColor" />
                <path d={CROWN_RIGHT} fill="currentColor" opacity="0.55" />
                <path d={STEM_RIGHT} fill="currentColor" opacity="0.55" />
              </g>
            )}
            <path d={LEFT} fill="currentColor" />
            <path d={RIGHT} fill="currentColor" opacity="0.55" />
          </>
        ) : (
          <Faces crown={crown} />
        )}
      </svg>
    );
  }

  if (variant === 'icon') {
    return (
      <svg viewBox="0 0 64 64" width={size} height={size} {...common}>
        <rect width="64" height="64" rx="14" fill="#132235" />
        <Faces left="#5B93DA" right="#E5A03F" eye="#132235" />
      </svg>
    );
  }

  if (variant === 'stacked') {
    return (
      <svg
        viewBox="0 0 160 108"
        width={(size * 160) / 108}
        height={size}
        {...common}
      >
        <g transform="translate(48 0)">
          <Faces />
        </g>
        <text
          x="80"
          y="98"
          textAnchor="middle"
          fontFamily={WORDMARK_FONT}
          fontSize="28"
          fontWeight="500"
          letterSpacing="5"
          fill="currentColor"
        >
          SHIFT
        </text>
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 232 64" width={(size * 232) / 64} height={size} {...common}>
      <Faces />
      <text
        x="82"
        y="44"
        fontFamily={WORDMARK_FONT}
        fontSize="34"
        fontWeight="500"
        letterSpacing="6"
        fill="currentColor"
      >
        SHIFT
      </text>
    </svg>
  );
}
__SHIFT_EOF__
write components/WeekView.js << '__SHIFT_EOF__'
"use client";

import { Fragment, useState } from "react";
import Icon from "./Icon";
import { sectionize, money, int, paren, clockTime } from "../lib/ui";

/**
 * Sortable columns. Region grouping is the default and is what the daily
 * email mirrors, so sorting is opt in: the moment a column is picked the
 * table flattens into one ranked list, and clearing it puts the regions back.
 */
const SORTS = {
  hours: (s) => s.day.hours,
  sales: (s) => s.day.sales,
  target: (s) => s.day.target,
  splh: (s) => s.day.splh,
  gap: (s) => s.day.splh - s.day.target,
  over: (s) => s.day.overUnder,
  wtdHours: (s) => s.wtd.hours,
  wtdSales: (s) => s.wtd.sales,
  wtdSplh: (s) => s.wtd.splh,
  wtdGap: (s) => s.wtd.splh - s.day.target,
  wtdOver: (s) => s.wtd.overUnder,
  ptdHours: (s) => (s.ptd.empty ? null : s.ptd.hours),
  ptdSales: (s) => (s.ptd.empty ? null : s.ptd.sales),
  ptdSplh: (s) => (s.ptd.empty ? null : s.ptd.splh),
};

/**
 * Deliberately frozen. This table is the daily email, so its layout, column
 * order and cell colors have to match what goes out to the field. Everything
 * here is scoped by .wk-legacy in globals.css, which cancels the new table
 * styling for this view only. Do not "clean it up".
 */

function Th({ label, sortKey, sort, onSort, className = "" }) {
  if (!sortKey) return <th className={className}>{label}</th>;
  const on = sort && sort.key === sortKey;
  return (
    <th
      className={className + " sortable" + (on ? " sorted" : "")}
      onClick={() => onSort(sortKey)}
      title={"Sort by " + label}
    >
      <span className="th-in">
        {label}
        <Icon name={on && sort.dir === "asc" ? "up" : "down"} size={11} className="th-caret" />
      </span>
    </th>
  );
}

function Flag({ flags }) {
  if (!flags || !flags.length) return null;
  return (
    <span className="lc-flag" title={flags.join(" \u00b7 ")}>
      <Icon name="alert" size={11} />
    </span>
  );
}

export default function WeekView({ report, loading, error, groupFilter, search }) {
  // null means the original region grouping, untouched.
  const [sort, setSort] = useState(null);

  function onSort(key) {
    setSort((cur) => {
      if (!cur || cur.key !== key) return { key, dir: "asc" };
      if (cur.dir === "asc") return { key, dir: "desc" };
      return null; // third click returns to the region view
    });
  }

  if (loading && !report) return <div className="empty">Loading...</div>;
  if (error) return <div className="empty">Error: {error}</div>;
  if (!report) return <div className="empty">Pick a date to load the report.</div>;

  const rows = report.rows || [];
  let sections = sectionize(rows, { group: groupFilter, search });

  if (sort) {
    const get = SORTS[sort.key];
    const flat = sections
      .flatMap((sec) => sec.stores)
      .sort((a, b) => {
        const av = get(a);
        const bv = get(b);
        if (av === null) return 1; // stores with no data always sink
        if (bv === null) return -1;
        return sort.dir === "asc" ? av - bv : bv - av;
      });
    sections = flat.length ? [{ label: null, stores: flat }] : [];
  }
  const totals = rows.reduce(
    (a, r) => ({ hours: a.hours + r.day.hours, sales: a.sales + r.day.sales }),
    { hours: 0, sales: 0 }
  );
  const totalSplh = totals.hours > 0 ? Math.round(totals.sales / totals.hours) : 0;

  return (
    <div className="wk-legacy">
      <div style={{ marginBottom: 17 }}>
        <div
          style={{
            background: "#1a1a2e",
            color: "#fff",
            padding: "8px 16px",
            borderRadius: 10,
            fontSize: 13,
            display: "inline-block",
            verticalAlign: "top",
          }}
        >
          <span style={{ fontWeight: 700 }}>Week {report.weekNum}</span>
          <span style={{ opacity: 0.85 }}>
            {" \u00b7 "}
            {report.dayName}
            {" \u00b7 "}Period {report.period}
          </span>
          <div style={{ fontSize: 10.5, opacity: 0.7, marginTop: 2 }}>
            Week starts {report.weekStart}
          </div>
        </div>
        {report.isLive ? (
          <div
            style={{
              display: "inline-block",
              marginLeft: 10,
              background: "#1a6630",
              color: "#fff",
              padding: "8px 14px",
              borderRadius: 10,
              fontSize: 12,
              verticalAlign: "top",
            }}
          >
            <span style={{ fontWeight: 700 }}>LIVE</span>
            <div style={{ fontSize: 10.5, opacity: 0.85, marginTop: 2 }}>
              {report.lastSyncAt
                ? "Data as of " + clockTime(report.lastSyncAt)
                : "Waiting for first sync today"}
            </div>
          </div>
        ) : (
          <div
            style={{
              display: "inline-block",
              marginLeft: 10,
              background: "#ededea",
              color: "#5f5f5c",
              padding: "8px 14px",
              borderRadius: 10,
              fontSize: 12,
              verticalAlign: "top",
            }}
          >
            <span style={{ fontWeight: 700 }}>Final</span>
            <div style={{ fontSize: 10.5, opacity: 0.75, marginTop: 2 }}>
              {report.lastSyncAt ? "Synced " + clockTime(report.lastSyncAt) : "Day closed"}
            </div>
          </div>
        )}
      </div>

      <div className="mc-grid cols-3">
        <div className="mc">
          <div className="mc-l">Total Hours ({report.dayName})</div>
          <div className="mc-v">{int(totals.hours)}</div>
        </div>
        <div className="mc">
          <div className="mc-l">Total Gross Sales</div>
          <div className="mc-v">{money(totals.sales)}</div>
        </div>
        <div className="mc">
          <div className="mc-l">Blended SPLH</div>
          <div className="mc-v">${totalSplh}</div>
          <div className="mc-s">
            {groupFilter === "All" ? "34 stores" : groupFilter}
            {" \u00b7 "}
            {report.dayName}, {report.date}
          </div>
        </div>
      </div>

      <div className="tcard desktop-table">
        <div className="thead">
          <span className="ttl">
            Labor Dashboard - {report.dayName}, {report.date}
          </span>
          <div className="thead-tools">
            <div className="seg">
              <button
                className={"seg-btn" + (!sort ? " active" : "")}
                onClick={() => setSort(null)}
              >
                By region
              </button>
              <button
                className={"seg-btn" + (sort && sort.key === "gap" ? " active" : "")}
                onClick={() => setSort({ key: "gap", dir: "asc" })}
              >
                Worst first
              </button>
              <button
                className={"seg-btn" + (sort && sort.key === "wtdGap" ? " active" : "")}
                onClick={() => setSort({ key: "wtdGap", dir: "asc" })}
              >
                Worst WTD
              </button>
            </div>
          </div>
        </div>
        <div className="scx">
          <table className="grid">
            <thead>
              <tr>
                <th>Location Name</th>
                <Th label="Hours" sortKey="hours" className="r" sort={sort} onSort={onSort} />
                <Th label="Sales" sortKey="sales" className="r" sort={sort} onSort={onSort} />
                <Th label="Target" sortKey="target" className="r" sort={sort} onSort={onSort} />
                <Th label="SPLH" sortKey="splh" className="r" sort={sort} onSort={onSort} />
                <Th label="(Over)/Under" sortKey="over" className="r" sort={sort} onSort={onSort} />
                <Th label="WTD Hours" sortKey="wtdHours" className="r sep" sort={sort} onSort={onSort} />
                <Th label="WTD Sales" sortKey="wtdSales" className="r" sort={sort} onSort={onSort} />
                <Th label="WTD SPLH" sortKey="wtdSplh" className="r" sort={sort} onSort={onSort} />
                <Th label="WTD (Over)/Under" sortKey="wtdOver" className="r" sort={sort} onSort={onSort} />
                <th className="r sep">Total Training</th>
                <th className="r">Trainee</th>
                <th className="r">Trainer</th>
                <Th label="PTD Hours" sortKey="ptdHours" className="r sep" sort={sort} onSort={onSort} />
                <Th label="PTD Sales" sortKey="ptdSales" className="r" sort={sort} onSort={onSort} />
                <Th label="PTD SPLH" sortKey="ptdSplh" className="r" sort={sort} onSort={onSort} />
              </tr>
            </thead>
            <tbody>
              {sections.map((sec) => (
                <Fragment key={sec.label || "ranked"}>
                  {sec.label && (
                    <tr className="rrow">
                      <td colSpan={16}>{sec.label}</td>
                    </tr>
                  )}
                  {sec.stores.map((s) => (
                    <tr key={s.code}>
                      <td>
                        <div className="lc-code">
                          {s.code}
                          {sort && <span className="lc-region">{s.region}</span>}
                          <Flag flags={s.day.flags} />
                        </div>
                        <div className="lc-name">{s.name}</div>
                      </td>
                      <td className="num">{s.day.hours}</td>
                      <td className="num">{money(s.day.sales)}</td>
                      <td className="num">${s.day.target}</td>
                      <td className={"num " + (s.day.ok ? "cell-ok" : "cell-bad")}>${s.day.splh}</td>
                      <td className="num">{paren(s.day.overUnder)}</td>

                      <td className="num sep">{s.wtd.hours}</td>
                      <td className="num">{money(s.wtd.sales)}</td>
                      <td className={"num " + (s.wtd.ok ? "cell-ok" : "cell-bad")}>${s.wtd.splh}</td>
                      <td className="num">{paren(s.wtd.overUnder)}</td>

                      <td className="num sep">{s.wtd.trainTotal || "-"}</td>
                      <td className="num">{s.wtd.trainee || "-"}</td>
                      <td className="num">{s.wtd.trainer || "-"}</td>

                      {s.ptd.empty ? (
                        <>
                          <td className="num sep cell-dim">-</td>
                          <td className="num cell-dim">-</td>
                          <td className="num cell-dim">-</td>
                        </>
                      ) : (
                        <>
                          <td className="num sep">{int(s.ptd.hours)}</td>
                          <td className="num">{money(s.ptd.sales)}</td>
                          <td className={"num " + (s.ptd.ok ? "cell-ok" : "cell-bad")}>
                            ${s.ptd.splh}
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mobile-cards">
        {sections.map((sec) => (
          <div key={sec.label || "ranked"}>
            {sec.label && <div className="scard-region-head">{sec.label}</div>}
            {sec.stores.map((s) => (
              <div className={"store-card " + (s.day.ok ? "ok" : "bad")} key={s.code}>
                <div className="store-card-head">
                  <div>
                    <div className="store-card-code">
                      {s.code}
                      <Flag flags={s.day.flags} />
                    </div>
                    <div className="store-card-name">{s.name}</div>
                  </div>
                  <div className="store-card-splh">
                    ${s.day.target}
                    <u>TARGET</u>
                  </div>
                </div>

                <div className="scard-block">
                  <div className="scard-block-label">Day - {report.dayName}</div>
                  <div className="scard-row">
                    <div className="scard-cell">
                      <div className="scard-cell-lbl">Hours</div>
                      <div className="scard-cell-val">{s.day.hours}</div>
                    </div>
                    <div className="scard-cell">
                      <div className="scard-cell-lbl">Sales</div>
                      <div className="scard-cell-val">{money(s.day.sales)}</div>
                    </div>
                    <div className={"scard-cell " + (s.day.ok ? "splh-ok" : "splh-bad")}>
                      <div className="scard-cell-lbl">SPLH</div>
                      <div className="scard-cell-val">${s.day.splh}</div>
                    </div>
                  </div>
                </div>

                <div className="scard-block">
                  <div className="scard-block-label">Week to Date</div>
                  <div className="scard-row">
                    <div className="scard-cell">
                      <div className="scard-cell-lbl">Hours</div>
                      <div className="scard-cell-val">{s.wtd.hours}</div>
                    </div>
                    <div className="scard-cell">
                      <div className="scard-cell-lbl">Sales</div>
                      <div className="scard-cell-val">{money(s.wtd.sales)}</div>
                    </div>
                    <div className={"scard-cell " + (s.wtd.ok ? "splh-ok" : "splh-bad")}>
                      <div className="scard-cell-lbl">SPLH</div>
                      <div className="scard-cell-val">${s.wtd.splh}</div>
                    </div>
                  </div>
                  <div className="scard-row" style={{ marginTop: 8 }}>
                    <div className="scard-cell">
                      <div className="scard-cell-lbl">Trainee</div>
                      <div className="scard-cell-val">{s.wtd.trainee || "-"}</div>
                    </div>
                    <div className="scard-cell">
                      <div className="scard-cell-lbl">Trainer</div>
                      <div className="scard-cell-val">{s.wtd.trainer || "-"}</div>
                    </div>
                    <div className="scard-cell">
                      <div className="scard-cell-lbl">(Over)/Under</div>
                      <div className="scard-cell-val">{paren(s.wtd.overUnder)}</div>
                    </div>
                  </div>
                </div>

                <div className="scard-block">
                  <div className="scard-block-label">Period to Date</div>
                  {s.ptd.empty ? (
                    <div style={{ fontSize: 12, color: "#999994", padding: "4px 2px" }}>
                      No period data
                    </div>
                  ) : (
                    <div className="scard-row">
                      <div className="scard-cell">
                        <div className="scard-cell-lbl">Hours</div>
                        <div className="scard-cell-val">{int(s.ptd.hours)}</div>
                      </div>
                      <div className="scard-cell">
                        <div className="scard-cell-lbl">Sales</div>
                        <div className="scard-cell-val">{money(s.ptd.sales)}</div>
                      </div>
                      <div className={"scard-cell " + (s.ptd.ok ? "splh-ok" : "splh-bad")}>
                        <div className="scard-cell-lbl">SPLH</div>
                        <div className="scard-cell-val">${s.ptd.splh}</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
__SHIFT_EOF__
write components/Leaderboard.js << '__SHIFT_EOF__'
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
__SHIFT_EOF__
write app/page.js << '__SHIFT_EOF__'
"use client";

import { useState, useEffect } from "react";
import "./globals.css";

import Icon from "../components/Icon";
import ShiftLogo from "../components/ShiftLogo";
import UnlockModal from "../components/UnlockModal";
import WeekView from "../components/WeekView";
import Targets from "../components/Targets";
import EmailPreview from "../components/EmailPreview";
import Dashboard from "../components/Dashboard";
import Leaderboard from "../components/Leaderboard";
import StoreTrend from "../components/StoreTrend";
import ServiceBoard from "../components/ServiceBoard";
import TPLH from "../components/TPLH";
import DriveThru from "../components/DriveThru";
import { yesterdayISO } from "../lib/ui";

/**
 * One source of truth for navigation, page titles and which topbar controls
 * appear. Adding a view means adding a row here, nothing else.
 *   lock    reporter mode required
 *   desktop hidden on narrow screens
 *   date / group / search  which controls the topbar shows
 */
const VIEWS = [
  { key: "dashboard", label: "Dashboard", short: "Dashboard", icon: "dashboard", group: "Today", lock: true, date: true },
  { key: "week", label: "Week view", short: "Week", icon: "table", group: "Today", date: true, region: true, search: true },
  { key: "storetrend", label: "Store detail", short: "Store", icon: "search", group: "Stores", date: true },
  { key: "leaderboard", label: "Leaderboard", short: "Board", icon: "rank", group: "Stores", date: true },
  { key: "service", label: "Service times", short: "Service", icon: "timer", group: "Operations", lock: true, date: true },
  { key: "tplh", label: "TPLH", short: "TPLH", icon: "activity", group: "Operations", lock: true },
  { key: "drivethru", label: "Drive-thru", short: "Drive", icon: "car", group: "Operations", lock: true },
  { key: "email", label: "HTML email", short: "Email", icon: "mail", group: "Share", lock: true, desktop: true, date: true, region: true },
  { key: "targets", label: "Store targets", short: "Targets", icon: "target", group: "Share", lock: true, desktop: true },
];

const NAV_GROUPS = ["Today", "Stores", "Operations", "Share"];

export default function ShiftApp() {
  const [view, setView] = useState("week");
  const [isoDate, setIsoDate] = useState(yesterdayISO());
  const [region, setRegion] = useState("All");
  const [search, setSearch] = useState("");

  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [reporter, setReporter] = useState(false);
  const [showUnlock, setShowUnlock] = useState(false);
  const [notice, setNotice] = useState(null);
  const [collapsed, setCollapsed] = useState(false);

  const cfg = VIEWS.find((v) => v.key === view) || VIEWS[1];
  const visible = VIEWS.filter((v) => !v.lock || reporter);

  // Restore a reporter session and land on the dashboard
  useEffect(() => {
    if (sessionStorage.getItem("shift_reporter_code")) {
      setReporter(true);
      setView("dashboard");
    }
    if (localStorage.getItem("shift_nav_collapsed") === "1") setCollapsed(true);
  }, []);

  function toggleNav() {
    setCollapsed((c) => {
      localStorage.setItem("shift_nav_collapsed", c ? "0" : "1");
      return !c;
    });
  }

  // The week view and the leaderboard share one report payload
  useEffect(() => {
    if (!isoDate) return;
    let dead = false;
    setLoading(true);
    setError(null);

    fetch(`/api/report?date=${isoDate}`)
      .then((r) => r.json())
      .then((d) => {
        if (dead) return;
        if (!d.ok) {
          setError(d.error);
          setReport(null);
        } else {
          setReport(d);
        }
        setLoading(false);
      })
      .catch((e) => {
        if (dead) return;
        setError(String(e));
        setLoading(false);
      });

    return () => {
      dead = true;
    };
  }, [isoDate]);

  // Today's numbers keep moving, so refresh every five minutes
  useEffect(() => {
    if (!report?.isLive) return;
    const id = setInterval(() => {
      fetch(`/api/report?date=${isoDate}`)
        .then((r) => r.json())
        .then((d) => d.ok && setReport(d))
        .catch(() => {});
    }, 300000);
    return () => clearInterval(id);
  }, [report?.isLive, isoDate]);

  function lock(message) {
    sessionStorage.removeItem("shift_reporter_code");
    setReporter(false);
    setNotice(message || null);
    if (VIEWS.find((v) => v.key === view)?.lock) setView("week");
  }

  return (
    <div className="app">
      <nav className={"sidebar" + (collapsed ? " collapsed" : "")}>
        <button
          className="logo"
          onClick={toggleNav}
          title={collapsed ? "Show the menu" : "Hide the menu"}
          aria-expanded={!collapsed}
        >
          <ShiftLogo variant="mark" size={34} crown />
          <div className="logo-words">
            <div className="logo-text">SHIFT</div>
            <div className="logo-sub">La La Land</div>
          </div>
        </button>

        {NAV_GROUPS.map((g) => {
          const items = visible.filter((v) => v.group === g);
          if (!items.length) return null;
          return (
            <div key={g}>
              <div className="nsec">{g}</div>
              {items.map((v) => (
                <button
                  key={v.key}
                  className={"nbtn" + (view === v.key ? " active" : "")}
                  onClick={() => setView(v.key)}
                  title={collapsed ? v.label : undefined}
                >
                  <Icon name={v.icon} />
                  <span className="nbtn-label">{v.label}</span>
                </button>
              ))}
            </div>
          );
        })}

        <div className="sidebar-spacer" />

        <button
          className="nbtn"
          onClick={() => (reporter ? lock() : setShowUnlock(true))}
          title={collapsed ? (reporter ? "Lock reporter mode" : "Unlock reporter mode") : undefined}
        >
          <Icon name={reporter ? "lock" : "unlock"} />
          <span className="nbtn-label">
            {reporter ? "Lock reporter mode" : "Unlock reporter mode"}
          </span>
        </button>
        <div className="nfoot" title={reporter ? "Reporter access on" : "Read only"}>
          <span className={"ndot" + (reporter ? " on" : "")} />
          <span className="nbtn-label">
            {reporter ? "Reporter access on" : "Read only"}
          </span>
        </div>
      </nav>

      {showUnlock && (
        <UnlockModal
          onClose={() => setShowUnlock(false)}
          onUnlocked={() => {
            setReporter(true);
            setShowUnlock(false);
            setNotice(null);
            setView("dashboard");
          }}
        />
      )}

      <div className="main">
        <header className="topbar">
          <div>
            <div className="ptitle">{cfg.label}</div>
            {report && (
              <div className="psub">
                Week {report.weekNum} · Period {report.period} · 34 stores
              </div>
            )}
          </div>

          <div className="tbr">
            {cfg.search && (
              <label className="field field-search">
                <Icon name="search" size={14} />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Store or code"
                />
              </label>
            )}
            {cfg.date && (
              <label className="field">
                <Icon name="calendar" size={14} />
                <input type="date" value={isoDate} onChange={(e) => setIsoDate(e.target.value)} />
              </label>
            )}
            {cfg.region && (
              <label className="field">
                <select value={region} onChange={(e) => setRegion(e.target.value)}>
                  <option value="All">All regions</option>
                  <option value="TX-TN">TX-TN</option>
                  <option value="CA-AZ">CA-AZ</option>
                </select>
                <Icon name="down" size={14} />
              </label>
            )}
          </div>
        </header>

        <div className="mobile-nav">
          {visible
            .filter((v) => !v.desktop)
            .map((v) => (
              <button
                key={v.key}
                className={"mnav-btn" + (view === v.key ? " active" : "")}
                onClick={() => setView(v.key)}
              >
                <Icon name={v.icon} size={14} />
                {v.short}
              </button>
            ))}
        </div>

        <main className="content">
          {notice && (
            <div className="note note-warn">
              <Icon name="alert" size={15} />
              <div>{notice}</div>
            </div>
          )}

          {view === "week" && (
            <WeekView
              report={report}
              loading={loading}
              error={error}
              groupFilter={region}
              search={search}
            />
          )}
          {view === "leaderboard" && <Leaderboard report={report} />}
          {view === "storetrend" && <StoreTrend isoDate={isoDate} />}
          {view === "dashboard" && reporter && <Dashboard isoDate={isoDate} />}
          {view === "service" && reporter && <ServiceBoard isoDate={isoDate} />}
          {view === "tplh" && reporter && <TPLH />}
          {view === "drivethru" && reporter && <DriveThru />}
          {view === "email" && reporter && (
            <EmailPreview isoDate={isoDate} groupFilter={region} />
          )}
          {view === "targets" && reporter && <Targets onAuthExpired={lock} />}

          {cfg.lock && !reporter && (
            <div className="empty">
              <Icon name="lock" size={22} />
              <div className="empty-title">Reporter mode required</div>
              <div>Unlock from the sidebar to open this view.</div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
__SHIFT_EOF__
write app/globals.css << '__SHIFT_EOF__'
/* ============================================================
   SHIFT design system
   Tokens first, then shell, then components. Legacy class names
   (.mc, .tcard, .grid, .dash-*, .st-*, .fc-*, .kd-*) are kept so
   Dashboard, StoreTrend, Leaderboard and DriveThru keep working.
   ============================================================ */

:root {
  /* dark shell */
  --ink: #0e1116;
  --ink-2: #161b23;
  --ink-3: #232b36;
  --ink-line: rgba(255, 255, 255, 0.09);
  --ink-text: #e8ebf0;
  --ink-text2: #97a1b0;

  /* light surfaces */
  --canvas: #f4f5f7;
  --surface: #ffffff;
  --surface-2: #f8f9fb;
  --surface-3: #eceff3;
  --line: #e2e5ea;
  --line-2: #cfd5dd;

  --text: #11151b;
  --text2: #5a6371;
  --text3: #8c96a4;

  /* signal colors: one accent, three states */
  --cobalt: #2258d8;
  --cobalt-bg: #eef3fd;
  --cobalt-line: #bfd1f7;

  --pos: #0b7a4c;
  --pos-bg: #e8f6ef;
  --pos-line: #a6ddc2;

  --neg: #b02a1f;
  --neg-bg: #fdeeec;
  --neg-line: #f2b9b2;

  --warn: #8a5a00;
  --warn-bg: #fdf4e3;
  --warn-line: #efd49a;

  --r: 8px;
  --rl: 12px;
  --rx: 16px;

  --dur: 160ms;
  --ease: cubic-bezier(0.2, 0.7, 0.2, 1);

  --sh-1: 0 1px 2px rgba(16, 22, 32, 0.05);
  --sh-2: 0 4px 16px rgba(16, 22, 32, 0.09);
  --sh-3: 0 18px 48px rgba(16, 22, 32, 0.22);

  --font: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
    "Helvetica Neue", Arial, sans-serif;
  --font-mono: ui-monospace, "SF Mono", "Cascadia Mono", "Roboto Mono", Menlo, monospace;

  /* legacy aliases */
  --bg: var(--surface);
  --bg2: var(--canvas);
  --bg3: var(--surface-3);
  --border: var(--line);
  --border2: var(--line-2);
  --navy: var(--ink);
  --accent: var(--cobalt);
  --green: var(--pos);
  --green-bg: var(--pos-bg);
  --green-b: var(--pos-line);
  --red: var(--neg);
  --red-bg: var(--neg-bg);
  --red-b: var(--neg-line);
  --blue: var(--cobalt);
  --blue-bg: var(--cobalt-bg);
  --blue-b: var(--cobalt-line);
  --amber: var(--warn);
  --amber-bg: var(--warn-bg);
  --amber-b: var(--warn-line);
  --cell-green-bg: var(--pos-bg);
  --cell-green-t: var(--pos);
  --cell-red-bg: var(--neg-bg);
  --cell-red-t: var(--neg);
  --text1: var(--text);
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: var(--font);
  background: var(--canvas);
  color: var(--text);
  font-size: 13px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}

button,
input,
select {
  font-family: inherit;
  font-size: inherit;
  color: inherit;
}

:focus-visible {
  outline: 2px solid var(--cobalt);
  outline-offset: 2px;
  border-radius: 5px;
}

.ic {
  flex-shrink: 0;
  display: block;
}

/* ============================ motion ============================ */

@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(7px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
@keyframes fade {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
@keyframes grow {
  from {
    transform: scaleX(0);
  }
  to {
    transform: scaleX(1);
  }
}
@keyframes pop {
  0% {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.4);
  }
  100% {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }
}
@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.35;
  }
}

.view {
  animation: rise 220ms var(--ease) both;
}
.stagger > * {
  animation: rise 260ms var(--ease) both;
  animation-delay: calc(var(--i, 0) * 16ms);
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 1ms !important;
    animation-delay: 0ms !important;
    transition-duration: 1ms !important;
  }
}

/* ============================ shell ============================ */

.app {
  display: flex;
  min-height: 100vh;
}

.sidebar {
  width: 226px;
  flex-shrink: 0;
  background: var(--ink);
  color: var(--ink-text);
  padding: 16px 12px 12px;
  display: flex;
  flex-direction: column;
  gap: 1px;
  position: sticky;
  top: 0;
  height: 100vh;
  overflow-y: auto;
}
.sidebar-spacer {
  flex: 1;
  min-height: 12px;
}

.main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.topbar {
  background: rgba(255, 255, 255, 0.86);
  backdrop-filter: saturate(180%) blur(12px);
  border-bottom: 1px solid var(--line);
  padding: 12px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  position: sticky;
  top: 0;
  z-index: 20;
}

.content {
  padding: 24px;
  flex: 1;
  max-width: 1440px;
  width: 100%;
}

/* ---- brand ---- */
.logo {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 8px 2px;
  margin-bottom: 16px;
}
.logo-mark {
  width: 30px;
  height: 30px;
  border-radius: 9px;
  background: linear-gradient(150deg, #3b6df0, #1e3fa8);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-size: 14px;
  font-weight: 700;
  color: #fff;
  letter-spacing: -0.02em;
}
.logo-text {
  font-size: 14.5px;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: #fff;
}
.logo-sub {
  font-size: 9.5px;
  color: var(--ink-text2);
  font-weight: 500;
  letter-spacing: 0.03em;
}

/* ---- nav ---- */
.nsec {
  font-size: 9px;
  font-weight: 700;
  color: #6b7684;
  letter-spacing: 0.11em;
  text-transform: uppercase;
  padding: 16px 10px 6px;
}
.nbtn {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: var(--r);
  font-size: 12.5px;
  color: var(--ink-text2);
  cursor: pointer;
  border: none;
  background: transparent;
  width: 100%;
  text-align: left;
  font-weight: 500;
  transition: background var(--dur) var(--ease), color var(--dur) var(--ease);
}
.nbtn:hover {
  background: var(--ink-2);
  color: var(--ink-text);
}
.nbtn.active {
  background: var(--ink-3);
  color: #fff;
  font-weight: 600;
}
.nbtn.active::before {
  content: "";
  position: absolute;
  left: -12px;
  top: 7px;
  bottom: 7px;
  width: 2.5px;
  border-radius: 0 3px 3px 0;
  background: #5b8bff;
  animation: fade var(--dur) var(--ease) both;
}
.nbtn .ic {
  opacity: 0.72;
  transition: opacity var(--dur) var(--ease);
}
.nbtn:hover .ic,
.nbtn.active .ic {
  opacity: 1;
}

.nfoot {
  margin-top: 4px;
  padding: 10px;
  border-top: 1px solid var(--ink-line);
  display: flex;
  align-items: center;
  gap: 9px;
  font-size: 11px;
  color: var(--ink-text2);
}
.ndot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #3f4855;
  flex-shrink: 0;
}
.ndot.on {
  background: #35c37d;
  box-shadow: 0 0 0 3px rgba(53, 195, 125, 0.16);
}

/* ---- topbar ---- */
.ptitle {
  font-size: 14px;
  font-weight: 700;
  letter-spacing: -0.015em;
}
.psub {
  font-size: 11px;
  color: var(--text3);
  font-weight: 500;
  margin-top: 1px;
}
.tbr {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

/* ============================ controls ============================ */

.field {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 0 10px;
  height: 32px;
  border: 1px solid var(--line-2);
  border-radius: var(--r);
  background: var(--surface);
  color: var(--text2);
  transition: border-color var(--dur) var(--ease), box-shadow var(--dur) var(--ease);
}
.field:focus-within {
  border-color: var(--cobalt);
  box-shadow: 0 0 0 3px rgba(34, 88, 216, 0.12);
}
.field input,
.field select {
  border: none;
  background: transparent;
  outline: none;
  font-size: 12.5px;
  color: var(--text);
  min-width: 0;
}
.field input::placeholder {
  color: var(--text3);
}
.field-search input {
  width: 168px;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 0 13px;
  height: 32px;
  font-size: 12.5px;
  font-weight: 600;
  border-radius: var(--r);
  border: 1px solid var(--line-2);
  background: var(--surface);
  color: var(--text);
  cursor: pointer;
  transition: background var(--dur) var(--ease), border-color var(--dur) var(--ease),
    transform var(--dur) var(--ease);
}
.btn:hover {
  background: var(--surface-2);
  border-color: var(--text3);
}
.btn:active {
  transform: translateY(1px);
}
.btn:disabled {
  opacity: 0.4;
  cursor: default;
  transform: none;
}
.btn-primary {
  background: var(--ink);
  color: #fff;
  border-color: var(--ink);
}
.btn-primary:hover {
  background: var(--ink-3);
  border-color: var(--ink-3);
}
.btn-icon {
  width: 32px;
  padding: 0;
}
.btn-sm {
  height: 28px;
  padding: 0 11px;
  font-size: 12px;
}
.btn-full {
  width: 100%;
}
.btn-green {
  background: var(--pos-bg);
  color: var(--pos);
  border-color: var(--pos-line);
}
.btn-ghost {
  border-color: transparent;
  background: transparent;
  color: var(--text2);
}
.btn-ghost:hover {
  background: var(--surface-3);
}
.btn-quiet {
  width: 100%;
  height: 34px;
  border-style: dashed;
  color: var(--text2);
  font-weight: 600;
}

/* segmented control */
.seg {
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--line-2);
  border-radius: var(--r);
  background: var(--surface);
  overflow: hidden;
}
.seg-btn {
  border: none;
  background: transparent;
  padding: 0 12px;
  height: 32px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text2);
  cursor: pointer;
  transition: background var(--dur) var(--ease), color var(--dur) var(--ease);
}
.seg-btn + .seg-btn {
  border-left: 1px solid var(--line);
}
.seg-btn:hover:not(:disabled) {
  background: var(--surface-2);
  color: var(--text);
}
.seg-btn:disabled {
  opacity: 0.35;
  cursor: default;
}
.seg-btn.active {
  background: var(--ink);
  color: #fff;
}
.seg-label {
  padding: 0 14px;
  height: 32px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  border-left: 1px solid var(--line);
  border-right: 1px solid var(--line);
  background: var(--surface-2);
}
.seg-label b {
  font-size: 12.5px;
  letter-spacing: -0.01em;
}
.seg-label span {
  font-size: 9.5px;
  color: var(--text3);
  margin-top: -1px;
}

/* ============================ chips ============================ */

.badge,
.chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 10px;
  padding: 3px 9px;
  border-radius: 100px;
  font-weight: 700;
  letter-spacing: 0.02em;
  white-space: nowrap;
  border: 1px solid transparent;
}
.b-ok,
.chip-pos {
  background: var(--pos-bg);
  color: var(--pos);
  border-color: var(--pos-line);
}
.b-neutral,
.chip-mute {
  background: var(--surface-3);
  color: var(--text2);
  border-color: var(--line);
}
.b-warn,
.chip-warn {
  background: var(--warn-bg);
  color: var(--warn);
  border-color: var(--warn-line);
}
.b-info,
.chip-info {
  background: var(--cobalt-bg);
  color: var(--cobalt);
  border-color: var(--cobalt-line);
}
.b-bad,
.chip-neg {
  background: var(--neg-bg);
  color: var(--neg);
  border-color: var(--neg-line);
}
.chip-live {
  background: var(--pos-bg);
  color: var(--pos);
  border-color: var(--pos-line);
}
.chip-live::before {
  content: "";
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--pos);
  animation: pulse 2.4s ease-in-out infinite;
}
.rbadge {
  display: inline-block;
  font-size: 9px;
  padding: 2px 8px;
  border-radius: 100px;
  font-weight: 700;
}
.rb-ca {
  background: var(--pos-bg);
  color: var(--pos);
}
.rb-tx {
  background: var(--cobalt-bg);
  color: var(--cobalt);
}

/* ============================ metric cards ============================ */

.mc-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(196px, 1fr));
  gap: 12px;
  margin-bottom: 18px;
}
.mc-grid.cols-3 {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  max-width: 1080px;
}
.mc {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--rl);
  padding: 14px 16px;
  box-shadow: var(--sh-1);
  transition: box-shadow var(--dur) var(--ease), transform var(--dur) var(--ease);
}
.mc:hover {
  box-shadow: var(--sh-2);
  transform: translateY(-1px);
}
.mc-l {
  font-size: 9.5px;
  font-weight: 700;
  color: var(--text3);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-bottom: 6px;
}
.mc-v {
  font-size: 25px;
  font-weight: 700;
  line-height: 1;
  letter-spacing: -0.03em;
  font-variant-numeric: tabular-nums;
}
.mc-v small,
.mc-u {
  font-size: 13px;
  font-weight: 600;
  color: var(--text3);
  letter-spacing: 0;
}
.mc-s {
  font-size: 11px;
  color: var(--text3);
  margin-top: 5px;
  line-height: 1.4;
}

.slbl {
  font-size: 10px;
  font-weight: 700;
  color: var(--text3);
  text-transform: uppercase;
  letter-spacing: 0.09em;
  margin-bottom: 8px;
}

/* context strip above content */
.ctx {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 18px;
}
.ctx-block {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 9px 15px;
  border-radius: var(--rl);
  background: var(--ink);
  color: #fff;
}
.ctx-block b {
  font-size: 13px;
  font-weight: 700;
}
.ctx-block span {
  font-size: 11px;
  color: var(--ink-text2);
}

/* ============================ day pills ============================ */

.dpills {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 18px;
}
.dpill {
  padding: 6px 14px;
  font-size: 12px;
  font-weight: 500;
  border-radius: 100px;
  border: 1px solid var(--line-2);
  background: var(--surface);
  cursor: pointer;
  color: var(--text2);
  transition: all var(--dur) var(--ease);
}
.dpill:hover {
  color: var(--text);
  border-color: var(--text3);
}
.dpill.active,
.dpill.has.active {
  background: var(--ink);
  color: #fff;
  border-color: var(--ink);
  font-weight: 600;
}
.dpill.has {
  border-color: var(--pos-line);
  color: var(--pos);
  font-weight: 600;
}

/* ============================ cards + tables ============================ */

.tcard {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--rl);
  overflow: hidden;
  margin-top: 16px;
  box-shadow: var(--sh-1);
}
.tcard:first-child {
  margin-top: 0;
}
.thead {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--line);
}
.ttl {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: -0.01em;
}
.tsub {
  font-size: 11px;
  color: var(--text3);
  font-weight: 500;
  margin-top: 1px;
}
.thead-tools {
  display: flex;
  align-items: center;
  gap: 8px;
}
.scx {
  overflow-x: auto;
}
.scx.tall {
  max-height: calc(100vh - 260px);
  overflow: auto;
}

table.grid {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  font-size: 12.5px;
}
table.grid th {
  padding: 8px 10px;
  text-align: left;
  font-size: 9.5px;
  font-weight: 700;
  color: var(--text3);
  text-transform: uppercase;
  letter-spacing: 0.07em;
  background: var(--surface-2);
  border-bottom: 1px solid var(--line);
  white-space: nowrap;
  position: sticky;
  top: 0;
  z-index: 2;
}
table.grid th.r {
  text-align: right;
}
table.grid td {
  padding: 9px 10px;
  border-bottom: 1px solid var(--line);
  font-size: 12.5px;
}
table.grid .num {
  text-align: right;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.01em;
}
table.grid tbody tr {
  transition: background var(--dur) var(--ease);
}
table.grid tbody tr:hover td {
  background: var(--surface-2);
}
table.grid tbody tr:last-child td {
  border-bottom: none;
}
.sep {
  box-shadow: inset 1px 0 0 var(--line-2);
}
.cell-ok {
  color: var(--pos);
  font-weight: 700;
}
.cell-bad {
  color: var(--neg);
  font-weight: 700;
}
.cell-dim {
  color: var(--text3);
}
.grid .rrow td {
  padding: 7px 10px;
  font-size: 9.5px;
  font-weight: 700;
  color: var(--text2);
  background: var(--surface-3);
  letter-spacing: 0.11em;
  text-transform: uppercase;
  border-bottom: 1px solid var(--line);
  position: sticky;
  top: 30px;
  z-index: 1;
}
.grid .rrow:hover td {
  background: var(--surface-3);
}
.lc-code {
  font-size: 10px;
  font-weight: 600;
  color: var(--text3);
  font-family: var(--font-mono);
  white-space: nowrap;
  display: flex;
  align-items: center;
  gap: 5px;
}
.lc-name {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 190px;
}
.lc-flag {
  color: var(--warn);
  display: inline-flex;
}

table.stores {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  font-size: 13px;
}
table.stores th {
  padding: 9px 14px;
  text-align: left;
  font-size: 9.5px;
  font-weight: 700;
  color: var(--text3);
  text-transform: uppercase;
  letter-spacing: 0.07em;
  border-bottom: 1px solid var(--line);
  background: var(--surface-2);
}
table.stores th.r {
  text-align: right;
}
table.stores td {
  padding: 10px 14px;
  border-bottom: 1px solid var(--line);
}
table.stores tr:hover td {
  background: var(--surface-2);
}

/* ============================ inline bar ============================ */

.bar {
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: flex-end;
}
.bar-track {
  position: relative;
  flex: 1;
  min-width: 54px;
  max-width: 96px;
  height: 5px;
  border-radius: 100px;
  background: var(--surface-3);
  overflow: hidden;
}
.bar-fill {
  position: absolute;
  top: 0;
  bottom: 0;
  border-radius: 100px;
  background: var(--text3);
  transform-origin: left center;
  animation: grow 420ms var(--ease) both;
}
.bar-fill.pos {
  background: var(--pos);
}
.bar-fill.neg {
  background: var(--neg);
}
.bar-fill.warn {
  background: var(--warn);
}
.bar-fill.cobalt {
  background: var(--cobalt);
}

/* ============================ rail (signature) ============================
   One shared visual grammar: every store plotted against the company
   distribution. Band = middle 50%, line = median. No invented targets.
   ======================================================================= */

.rail {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--rl);
  padding: 18px 20px 14px;
  box-shadow: var(--sh-1);
}
.rail-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 20px;
}
.rail-track {
  position: relative;
  height: 34px;
  margin: 0 6px;
}
.rail-line {
  position: absolute;
  left: 0;
  right: 0;
  top: 16px;
  height: 2px;
  border-radius: 2px;
  background: var(--surface-3);
}
.rail-band {
  position: absolute;
  top: 8px;
  height: 18px;
  border-radius: 5px;
  background: var(--cobalt-bg);
  border: 1px solid var(--cobalt-line);
  animation: fade 320ms var(--ease) both;
}
.rail-median {
  position: absolute;
  top: 2px;
  bottom: 2px;
  width: 2px;
  background: var(--ink);
  border-radius: 2px;
}
.rail-median::after {
  content: attr(data-label);
  position: absolute;
  top: -16px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text2);
  white-space: nowrap;
}
.rail-dot {
  position: absolute;
  top: 17px;
  width: 11px;
  height: 11px;
  border-radius: 50%;
  border: 2px solid var(--surface);
  background: var(--text3);
  cursor: help;
  animation: pop 380ms var(--ease) both;
  animation-delay: calc(var(--i, 0) * 14ms);
  transition: transform var(--dur) var(--ease), box-shadow var(--dur) var(--ease);
}
.rail-dot:hover {
  transform: translate(-50%, -50%) scale(1.7);
  box-shadow: var(--sh-2);
  z-index: 4;
}
.rail-dot.fast {
  background: var(--pos);
}
.rail-dot.pace {
  background: var(--cobalt);
}
.rail-dot.watch {
  background: var(--warn);
}
.rail-dot.slow {
  background: var(--neg);
}
.rail-axis {
  display: flex;
  justify-content: space-between;
  margin: 10px 6px 0;
  font-size: 10.5px;
  color: var(--text3);
  font-variant-numeric: tabular-nums;
}
.rail-legend {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--line);
  font-size: 10.5px;
  color: var(--text2);
}
.rail-legend i {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
  margin-right: 6px;
  vertical-align: -1px;
}

/* ============================ notes ============================ */

.note,
.infobox,
.warnbox {
  display: flex;
  gap: 10px;
  padding: 11px 14px;
  border-radius: var(--r);
  font-size: 12px;
  line-height: 1.55;
  margin-bottom: 16px;
  border: 1px solid var(--line);
  background: var(--surface-2);
  color: var(--text2);
}
.note-info,
.infobox {
  background: var(--cobalt-bg);
  border-color: var(--cobalt-line);
  color: #1b3d8f;
}
.note-warn,
.warnbox {
  background: var(--warn-bg);
  border-color: var(--warn-line);
  color: var(--warn);
}
.note b {
  color: inherit;
}
.note .ic {
  margin-top: 1px;
  opacity: 0.8;
}
.footnote {
  font-size: 11px;
  color: var(--text3);
  line-height: 1.6;
  margin-top: 14px;
  max-width: 720px;
}

/* disclosure */
.disc {
  border: 1px solid var(--line);
  border-radius: var(--rl);
  background: var(--surface);
  margin-top: 16px;
  overflow: hidden;
  box-shadow: var(--sh-1);
}
.disc-btn {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  background: transparent;
  border: none;
  cursor: pointer;
  text-align: left;
  transition: background var(--dur) var(--ease);
}
.disc-btn:hover {
  background: var(--surface-2);
}
.disc-btn .ic {
  transition: transform var(--dur) var(--ease);
  color: var(--text3);
}
.disc.open .disc-btn .ic-caret {
  transform: rotate(180deg);
}
.disc-title {
  font-size: 12.5px;
  font-weight: 700;
  flex: 1;
}
.disc-body {
  border-top: 1px solid var(--line);
  animation: fade 200ms var(--ease) both;
}

/* row list used inside cards */
.lrow {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--line);
  transition: background var(--dur) var(--ease);
}
.lrow:last-child {
  border-bottom: none;
}
.lrow:hover {
  background: var(--surface-2);
}
.lrow-main {
  flex: 1;
  min-width: 0;
}
.lrow-name {
  font-size: 12.5px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.lrow-sub {
  font-size: 10.5px;
  color: var(--text3);
  margin-top: 1px;
}
.lrow-val {
  font-size: 14px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  text-align: right;
}

/* ============================ inputs ============================ */

.tinput {
  width: 66px;
  padding: 6px 9px;
  font-size: 13px;
  border: 1px solid var(--line-2);
  border-radius: 6px;
  text-align: right;
  background: var(--surface);
  color: var(--text);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  transition: border-color var(--dur) var(--ease), box-shadow var(--dur) var(--ease);
}
.tinput:focus {
  outline: none;
  border-color: var(--cobalt);
  box-shadow: 0 0 0 3px rgba(34, 88, 216, 0.12);
}

/* ============================ modal ============================ */

.scrim {
  position: fixed;
  inset: 0;
  background: rgba(9, 12, 18, 0.5);
  backdrop-filter: blur(3px);
  z-index: 999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  animation: fade 140ms var(--ease) both;
}
.modal {
  background: var(--surface);
  border-radius: var(--rx);
  padding: 22px;
  width: 340px;
  max-width: 100%;
  box-shadow: var(--sh-3);
  animation: rise 200ms var(--ease) both;
}
.modal-title {
  font-size: 15px;
  font-weight: 700;
  letter-spacing: -0.01em;
}
.modal-sub {
  font-size: 12px;
  color: var(--text2);
  margin: 5px 0 16px;
  line-height: 1.5;
}
.modal-in {
  width: 100%;
  height: 36px;
  padding: 0 12px;
  border-radius: var(--r);
  border: 1px solid var(--line-2);
  font-size: 13px;
  transition: border-color var(--dur) var(--ease), box-shadow var(--dur) var(--ease);
}
.modal-in:focus {
  outline: none;
  border-color: var(--cobalt);
  box-shadow: 0 0 0 3px rgba(34, 88, 216, 0.12);
}
.modal-err {
  color: var(--neg);
  font-size: 12px;
  margin-top: 8px;
}
.modal-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 16px;
}

/* ============================ states ============================ */

.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 56px 24px;
  color: var(--text3);
  gap: 8px;
  font-size: 13px;
  text-align: center;
  animation: fade 200ms var(--ease) both;
}
.empty-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--text);
}
.skel {
  border-radius: var(--rl);
  background: linear-gradient(90deg, var(--surface-3), var(--surface-2), var(--surface-3));
  background-size: 240% 100%;
  animation: shimmer 1.3s linear infinite;
  height: 84px;
}
@keyframes shimmer {
  from {
    background-position: 120% 0;
  }
  to {
    background-position: -120% 0;
  }
}

#toast {
  position: fixed;
  bottom: 22px;
  right: 22px;
  padding: 10px 16px;
  border-radius: var(--r);
  font-size: 12px;
  font-weight: 600;
  z-index: 9999;
  pointer-events: none;
  display: none;
  box-shadow: var(--sh-2);
}
.t-ok {
  background: var(--pos-bg);
  border: 1px solid var(--pos-line);
  color: var(--pos);
}
.t-err {
  background: var(--neg-bg);
  border: 1px solid var(--neg-line);
  color: var(--neg);
}

/* ============================ email ============================ */

.email-frame {
  width: 100%;
  border: 1px solid var(--line);
  min-height: 420px;
  border-radius: var(--r);
  background: #fff;
}
.email-steps {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 14px;
}
.estep {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 9px 12px;
  background: var(--surface-2);
  border-radius: var(--r);
  font-size: 12px;
  color: var(--text2);
}
.estep-num {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--ink);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

/* ============================ mobile store cards ============================ */

.mobile-cards {
  display: none;
}
.desktop-table {
  display: block;
}

.store-card {
  position: relative;
  overflow: hidden;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--rl);
  padding: 15px;
  margin-bottom: 12px;
  box-shadow: var(--sh-1);
}
.store-card.ok {
  border-left: 3px solid var(--pos);
}
.store-card.bad {
  border-left: 3px solid var(--neg);
}
.store-card-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--line);
}
.store-card-name {
  font-size: 15px;
  font-weight: 700;
}
.store-card-code {
  font-size: 10.5px;
  color: var(--text3);
  font-family: var(--font-mono);
}
.store-card-splh {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-width: 72px;
  line-height: 1;
  font-size: 20px;
  font-weight: 700;
  padding: 6px 10px;
  border-radius: var(--r);
  font-variant-numeric: tabular-nums;
  background: var(--surface-3);
}
.store-card-splh u {
  font-size: 8.5px;
  font-weight: 700;
  letter-spacing: 0.08em;
  opacity: 0.65;
  text-decoration: none;
  margin-top: 3px;
}
.scard-block {
  margin-bottom: 10px;
}
.scard-block:last-child {
  margin-bottom: 0;
}
.scard-block-label {
  font-size: 9.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.09em;
  color: var(--text3);
  margin-bottom: 7px;
}
.scard-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.scard-cell {
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-radius: var(--r);
  padding: 8px 9px;
  text-align: center;
}
.scard-cell-lbl {
  font-size: 9px;
  color: var(--text3);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 3px;
}
.scard-cell-val {
  font-size: 14.5px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.scard-cell.splh-ok {
  background: var(--pos-bg);
  border-color: var(--pos-line);
}
.scard-cell.splh-ok .scard-cell-val,
.scard-cell.splh-ok .scard-cell-lbl {
  color: var(--pos);
}
.scard-cell.splh-bad {
  background: var(--neg-bg);
  border-color: var(--neg-line);
}
.scard-cell.splh-bad .scard-cell-val,
.scard-cell.splh-bad .scard-cell-lbl {
  color: var(--neg);
}
.scard-region-head {
  font-size: 9.5px;
  font-weight: 700;
  color: var(--text3);
  letter-spacing: 0.11em;
  text-transform: uppercase;
  padding: 4px 2px;
  margin: 18px 0 8px;
  border-bottom: 1px solid var(--line);
}

.mobile-nav {
  display: none;
}

@media (max-width: 900px) {
  .desktop-table {
    display: none;
  }
  .mobile-cards {
    display: block;
  }
  .sidebar {
    display: none;
  }
  .content {
    padding: 14px 12px 28px;
  }
  .topbar {
    padding: 11px 14px;
  }
  .field-search input {
    width: 108px;
  }
  .mc-grid,
  .mc-grid.cols-3 {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 9px;
  }
  .mc {
    padding: 12px 13px;
  }
  .mc-v {
    font-size: 20px;
  }
  .mobile-nav {
    display: flex;
    gap: 6px;
    padding: 9px 12px;
    background: var(--surface);
    border-bottom: 1px solid var(--line);
    position: sticky;
    top: 51px;
    z-index: 19;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .mobile-nav::-webkit-scrollbar {
    display: none;
  }
  .mnav-btn {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 7px 13px;
    border-radius: 100px;
    border: 1px solid var(--line-2);
    background: var(--surface);
    font-size: 12.5px;
    font-weight: 600;
    color: var(--text2);
    cursor: pointer;
    white-space: nowrap;
    transition: all var(--dur) var(--ease);
  }
  .mnav-btn.active {
    background: var(--ink);
    color: #fff;
    border-color: var(--ink);
  }
}

/* ============================ legacy: dashboard ============================ */

.dash-hero {
  border-radius: var(--rx);
  padding: 22px 26px;
  display: flex;
  align-items: center;
  gap: 20px;
  flex-wrap: wrap;
}
.dash-hero.clear {
  background: var(--pos-bg);
  border: 1px solid var(--pos-line);
}
.dash-hero.alert {
  background: linear-gradient(140deg, var(--ink) 0%, #232b3d 100%);
  color: #fff;
}
/* emoji slot in Dashboard.js, hidden until that file is refactored */
.dash-hero-icon {
  display: none;
}
.dash-hero-num {
  font-size: 29px;
  font-weight: 700;
  line-height: 1.15;
  letter-spacing: -0.03em;
}
.dash-hero-sub {
  font-size: 12.5px;
  opacity: 0.85;
  margin-top: 7px;
  max-width: 440px;
  line-height: 1.55;
}
.dash-chip {
  display: inline-flex;
  align-items: center;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  padding: 3px 9px;
  border-radius: 100px;
  flex-shrink: 0;
}
.dash-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 14px;
  border-radius: var(--r);
  margin-bottom: 6px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-left-width: 3px;
  border-left-style: solid;
  transition: transform var(--dur) var(--ease), box-shadow var(--dur) var(--ease);
}
.dash-row:hover {
  transform: translateX(2px);
  box-shadow: var(--sh-1);
}
.dash-row.sev-critical {
  border-left-color: var(--neg);
}
.dash-row.sev-data {
  border-left-color: var(--warn);
}
.dash-row.sev-warning {
  border-left-color: var(--line-2);
}
.dash-row-name {
  font-size: 13px;
  font-weight: 700;
}
.dash-row-label {
  font-size: 11.5px;
  margin-top: 1px;
  font-weight: 600;
}
.dash-row-detail {
  font-size: 10.5px;
  color: var(--text3);
  margin-top: 2px;
}

/* ============================ legacy: store trend ============================ */

.st-verdict {
  border-radius: var(--rx);
  padding: 24px 28px;
  margin-bottom: 20px;
}
.st-verdict.good {
  background: linear-gradient(140deg, #0a3d28 0%, #0b7a4c 100%);
  color: #fff;
}
.st-verdict.bad {
  background: linear-gradient(140deg, var(--ink) 0%, #3d1518 100%);
  color: #fff;
}
.st-verdict.none {
  background: var(--surface-3);
  color: var(--text2);
}
.st-verdict-eyebrow {
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.13em;
  text-transform: uppercase;
  opacity: 0.65;
  margin-bottom: 8px;
}
.st-verdict-head {
  font-size: 24px;
  font-weight: 700;
  letter-spacing: -0.025em;
  line-height: 1.2;
}
.st-verdict-detail {
  font-size: 13px;
  opacity: 0.85;
  margin-top: 9px;
  max-width: 600px;
  line-height: 1.6;
}
.st-grid {
  display: grid;
  grid-template-columns: auto repeat(7, minmax(0, 1fr));
  gap: 5px;
}
.st-colhead {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text3);
  text-align: center;
  padding-bottom: 4px;
}
.st-colhead.flagged {
  color: var(--neg);
}
.st-rowhead {
  font-size: 10.5px;
  font-weight: 700;
  color: var(--text3);
  padding-right: 10px;
  white-space: nowrap;
  display: flex;
  flex-direction: column;
  justify-content: center;
  line-height: 1.25;
}
.st-rowhead small {
  font-weight: 500;
  opacity: 0.7;
  font-size: 9.5px;
}
.st-cell {
  aspect-ratio: 1.35;
  border-radius: var(--r);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  font-size: 12.5px;
  font-weight: 700;
  transition: transform var(--dur) var(--ease), box-shadow var(--dur) var(--ease);
  position: relative;
  min-height: 42px;
  font-variant-numeric: tabular-nums;
}
.st-cell:hover {
  transform: scale(1.06);
  box-shadow: var(--sh-2);
  z-index: 3;
}
.st-cell small {
  font-size: 8.5px;
  font-weight: 600;
  opacity: 0.7;
  margin-top: 1px;
}
.st-cell.empty {
  background: transparent;
  border: 1px dashed var(--line-2);
  color: var(--text3);
  font-weight: 500;
  font-size: 11px;
  padding: 0;
}
.st-legend {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
  margin-top: 16px;
  font-size: 10.5px;
  color: var(--text3);
}
.st-legend-scale {
  display: flex;
  align-items: center;
  gap: 3px;
}
.st-legend-sw {
  width: 19px;
  height: 12px;
  border-radius: 3px;
}
.st-wk {
  display: flex;
  align-items: baseline;
  gap: 9px;
  padding: 11px 14px;
  border-bottom: 1px solid var(--line);
}
.st-wk:last-child {
  border-bottom: none;
}
.st-wk-num {
  font-size: 11px;
  font-weight: 700;
  color: var(--text3);
  min-width: 62px;
}
.st-wk-splh {
  font-size: 19px;
  font-weight: 700;
  letter-spacing: -0.025em;
  font-variant-numeric: tabular-nums;
}
.st-wk-meta {
  font-size: 11px;
  color: var(--text3);
  margin-left: auto;
  text-align: right;
  line-height: 1.4;
}
.st-partial {
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--warn);
  background: var(--warn-bg);
  padding: 2px 6px;
  border-radius: 4px;
  margin-left: 6px;
}

/* ============================ legacy: forecast ============================ */

.fc-hero {
  border-radius: var(--rx);
  padding: 22px 26px;
  margin-bottom: 18px;
}
.fc-hero.over {
  background: linear-gradient(140deg, var(--ink) 0%, #3d1518 100%);
  color: #fff;
}
.fc-hero.ok {
  background: linear-gradient(140deg, #0a3d28 0%, #0b7a4c 100%);
  color: #fff;
}
.fc-hero.under {
  background: linear-gradient(140deg, var(--ink) 0%, #1c3a63 100%);
  color: #fff;
}
.fc-hero.empty {
  background: var(--surface-3);
  color: var(--text);
}
.fc-eyebrow {
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.13em;
  text-transform: uppercase;
  opacity: 0.65;
  margin-bottom: 7px;
}
.fc-head {
  font-size: 23px;
  font-weight: 700;
  letter-spacing: -0.025em;
  line-height: 1.22;
}
.fc-detail {
  font-size: 13px;
  opacity: 0.85;
  margin-top: 8px;
  max-width: 620px;
  line-height: 1.6;
}
.fc-row {
  display: grid;
  grid-template-columns: 52px 1.5fr 90px 100px 96px;
  gap: 10px;
  align-items: center;
  padding: 11px 14px;
  border-bottom: 1px solid var(--line);
}
.fc-row.head {
  border-bottom: 1px solid var(--line-2);
  padding: 8px 14px;
  background: var(--surface-2);
}
.fc-row.total {
  border-bottom: none;
  background: var(--surface-2);
  font-weight: 700;
}
.fc-lbl {
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text3);
}
.fc-day {
  font-size: 13px;
  font-weight: 700;
}
.fc-sales,
.fc-allowed,
.fc-var,
.fc-range {
  font-variant-numeric: tabular-nums;
}
.fc-sales {
  font-size: 14px;
  font-weight: 700;
}
.fc-range {
  font-size: 10.5px;
  color: var(--text3);
  margin-top: 1px;
}
.fc-allowed {
  font-size: 17px;
  font-weight: 700;
  text-align: right;
}
.fc-input {
  width: 84px;
  padding: 7px 9px;
  font-size: 14px;
  border: 1px solid var(--line-2);
  border-radius: var(--r);
  text-align: right;
  font-weight: 700;
  background: var(--surface);
  font-variant-numeric: tabular-nums;
}
.fc-input:focus {
  outline: none;
  border-color: var(--cobalt);
  box-shadow: 0 0 0 3px rgba(34, 88, 216, 0.12);
}
.fc-var {
  font-size: 12.5px;
  font-weight: 700;
  text-align: right;
}
.fc-conf {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  margin-right: 5px;
  vertical-align: middle;
}
.fc-conf.high {
  background: var(--pos);
}
.fc-conf.medium {
  background: var(--warn);
}
.fc-conf.low {
  background: var(--line-2);
}
.fc-save {
  padding: 0 22px;
  height: 38px;
  border-radius: var(--r);
  border: none;
  background: var(--ink);
  color: #fff;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: background var(--dur) var(--ease);
}
.fc-save:hover:not(:disabled) {
  background: var(--ink-3);
}
.fc-save:disabled {
  opacity: 0.45;
  cursor: default;
}
.fc-save.saved {
  background: var(--pos);
}

.day-panel,
.kd-panel {
  background: var(--ink);
  color: #fff;
  border-radius: var(--rl);
  padding: 18px 20px;
  margin-bottom: 16px;
  animation: rise 220ms var(--ease) both;
}
.day-panel-close,
.kd-close {
  float: right;
  background: var(--ink-3);
  border: none;
  color: #fff;
  width: 26px;
  height: 26px;
  border-radius: 7px;
  cursor: pointer;
  font-size: 15px;
  line-height: 1;
}
.day-panel-grid,
.kd-summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(96px, 1fr));
  gap: 14px;
  margin-top: 14px;
}
.day-panel-k,
.kd-k {
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  opacity: 0.6;
}
.day-panel-v,
.kd-v {
  font-size: 19px;
  font-weight: 700;
  margin-top: 3px;
  font-variant-numeric: tabular-nums;
}
.kd-eyebrow {
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.11em;
  text-transform: uppercase;
  opacity: 0.6;
}
.kd-title {
  font-size: 19px;
  font-weight: 700;
  margin-top: 4px;
  letter-spacing: -0.02em;
}
.kd-summary {
  margin: 15px 0 18px;
}
.kd-sec {
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.11em;
  text-transform: uppercase;
  opacity: 0.55;
  margin-bottom: 9px;
  padding-top: 14px;
  border-top: 1px solid var(--ink-line);
}
.kd-st {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 8px 0;
}
.kd-st-name {
  font-size: 13px;
  font-weight: 700;
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.kd-st-sub {
  font-size: 10px;
  opacity: 0.6;
  margin-top: 1px;
}
.kd-bar-track {
  flex: 1.4;
  height: 6px;
  background: rgba(255, 255, 255, 0.14);
  border-radius: 100px;
  overflow: hidden;
  min-width: 52px;
}
.kd-bar-fill {
  height: 100%;
  border-radius: 100px;
  transform-origin: left center;
  animation: grow 420ms var(--ease) both;
}
.kd-st-val {
  font-size: 15px;
  font-weight: 700;
  min-width: 52px;
  text-align: right;
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}
.kd-note {
  font-size: 11.5px;
  opacity: 0.75;
  margin-top: 15px;
  line-height: 1.55;
  max-width: 560px;
}

@media (max-width: 900px) {
  .dash-hero {
    padding: 17px 18px;
    gap: 14px;
  }
  .dash-hero-num {
    font-size: 21px;
  }
  .st-verdict {
    padding: 18px 20px;
  }
  .st-verdict-head {
    font-size: 19px;
  }
  .st-grid {
    gap: 3px;
  }
  .st-cell {
    min-height: 36px;
    font-size: 11px;
    cursor: pointer;
  }
  .st-cell small {
    display: none;
  }
  .st-rowhead {
    font-size: 9.5px;
    padding-right: 6px;
  }
  .fc-hero {
    padding: 17px 19px;
  }
  .fc-head {
    font-size: 18px;
  }
  .fc-row {
    grid-template-columns: 42px 1fr 62px 74px;
    gap: 7px;
    padding: 10px;
  }
  .fc-row .fc-var-col {
    display: none;
  }
  .fc-input {
    width: 64px;
    font-size: 13px;
  }
  .fc-allowed {
    font-size: 15px;
  }
  .kd-panel {
    padding: 15px 16px;
  }
  .kd-title {
    font-size: 16px;
  }
  .kd-bar-track {
    display: none;
  }
  .rail {
    padding: 15px 14px 12px;
  }
}

/* ============================================================
   .wk-legacy
   The Week view feeds the daily email, so it keeps the original
   spreadsheet look. This block cancels the new table styling for
   that view only. Nothing else on the app is affected.
   ============================================================ */

.wk-legacy table.grid {
  border-collapse: collapse;
}
.wk-legacy table.grid th {
  position: static;
  padding: 7px;
  font-size: 10px;
  letter-spacing: 0.05em;
  color: #999994;
  background: #f7f7f5;
  border: 1px solid #e0dfd8;
}
.wk-legacy table.grid td {
  padding: 7px;
  font-size: 12px;
  border: 1px solid #e0dfd8;
}
.wk-legacy table.grid .num {
  font-family: var(--font-mono);
  font-size: 11.5px;
  letter-spacing: 0;
}
.wk-legacy table.grid tbody tr:last-child td {
  border-bottom: 1px solid #e0dfd8;
}
.wk-legacy table.grid tbody tr:hover td {
  background: #fafaf8;
}
.wk-legacy .cell-ok {
  background: #c6efce !important;
  color: #1a6630;
  font-weight: 700;
}
.wk-legacy .cell-bad {
  background: #ffc7ce !important;
  color: #9c0006;
  font-weight: 700;
}
.wk-legacy .grid .rrow td,
.wk-legacy .grid .rrow:hover td {
  position: static;
  padding: 9px 10px 4px;
  font-size: 10.5px;
  font-weight: 700;
  color: #fff;
  background: #1a1a2e !important;
  letter-spacing: 0.05em;
  border: 1px solid rgba(255, 255, 255, 0.15);
}
.wk-legacy .sep {
  box-shadow: none;
  border-left: 2px solid #999 !important;
}
.wk-legacy .scx {
  max-height: none;
  overflow: auto;
}
.wk-legacy .tcard {
  border-radius: 11px;
  box-shadow: none;
  border-color: #e0dfd8;
}
.wk-legacy .lc-code {
  color: #999994;
  font-weight: 700;
}
.wk-legacy .lc-name {
  max-width: 160px;
  font-weight: 500;
}
.wk-legacy .lc-flag {
  color: #9a5e0a;
}

/* metric cards, original weight and no hover lift */
.wk-legacy .mc {
  border-radius: 11px;
  padding: 13px 15px;
  border-color: #e0dfd8;
  box-shadow: none;
}
.wk-legacy .mc:hover {
  transform: none;
  box-shadow: none;
}
.wk-legacy .mc-l {
  font-size: 9.5px;
  letter-spacing: 0.05em;
  margin-bottom: 4px;
}
.wk-legacy .mc-v {
  font-size: 24px;
  letter-spacing: -0.025em;
}
.wk-legacy .mc-s {
  font-size: 10.5px;
  margin-top: 3px;
}

/* mobile cards, original chunky look */
.wk-legacy .store-card {
  border-radius: 12px;
  padding: 16px;
  border-color: #e0dfd8;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04);
}
.wk-legacy .store-card.ok {
  border-left: 5px solid #1a6630;
}
.wk-legacy .store-card.bad {
  border-left: 5px solid #9c0006;
}
.wk-legacy .store-card-splh {
  background: #ededea;
  font-size: 22px;
  font-weight: 800;
  border-radius: 8px;
  padding: 4px 12px;
}
.wk-legacy .store-card-splh u {
  font-size: 9px;
  opacity: 0.6;
  margin-top: -2px;
}
.wk-legacy .scard-block-label {
  font-size: 10px;
  color: #1a1a2e;
  letter-spacing: 0.06em;
}
.wk-legacy .scard-cell {
  background: #f7f7f5;
  border: none;
  border-radius: 8px;
  padding: 9px;
}
.wk-legacy .scard-cell-val {
  font-size: 15px;
}
.wk-legacy .scard-cell.splh-ok {
  background: #c6efce;
  border: 1px solid #1a6630;
}
.wk-legacy .scard-cell.splh-ok .scard-cell-val,
.wk-legacy .scard-cell.splh-ok .scard-cell-lbl {
  color: #1a6630;
}
.wk-legacy .scard-cell.splh-bad {
  background: #ffc7ce;
  border: 1px solid #9c0006;
}
.wk-legacy .scard-cell.splh-bad .scard-cell-val,
.wk-legacy .scard-cell.splh-bad .scard-cell-lbl {
  color: #9c0006;
}
.wk-legacy .scard-region-head {
  font-size: 12px;
  font-weight: 800;
  color: #fff;
  background: #1a1a2e;
  padding: 7px 12px;
  border: none;
  border-radius: 8px;
  margin: 16px 0 10px;
  letter-spacing: 0;
  text-transform: none;
}

/* ============================================================
   v3: collapsible nav, sortable headers, leaderboard chart
   ============================================================ */

/* ---- logo as a button ---- */
.logo {
  width: 100%;
  border: none;
  background: transparent;
  cursor: pointer;
  text-align: left;
  border-radius: var(--r);
  transition: background var(--dur) var(--ease);
}
.logo:hover {
  background: var(--ink-2);
}
.logo .shift-crown {
  transform-origin: 32px 20px;
  transition: transform var(--dur) var(--ease), opacity var(--dur) var(--ease);
  opacity: 0.92;
}
.logo:hover .shift-crown {
  transform: translateY(-1.5px);
  opacity: 1;
}
.logo-words {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
}

/* ---- collapsed sidebar ---- */
.sidebar {
  transition: width 200ms var(--ease), padding 200ms var(--ease);
}
.sidebar.collapsed {
  width: 68px;
  padding-left: 10px;
  padding-right: 10px;
  align-items: stretch;
}
.sidebar.collapsed .logo {
  justify-content: center;
  padding: 4px 0 2px;
}
.sidebar.collapsed .logo-words,
.sidebar.collapsed .nbtn-label,
.sidebar.collapsed .nsec {
  display: none;
}
.sidebar.collapsed .nbtn {
  justify-content: center;
  padding: 10px 0;
}
.sidebar.collapsed .nbtn.active::before {
  left: -10px;
}
.sidebar.collapsed .nfoot {
  justify-content: center;
  padding: 12px 0;
}
/* keeps a little breathing room between groups once the labels are gone */
.sidebar.collapsed .nsec + .nbtn {
  margin-top: 10px;
}

/* ---- sortable table headers ---- */
table.grid th.sortable {
  cursor: pointer;
  user-select: none;
  transition: color var(--dur) var(--ease), background var(--dur) var(--ease);
}
table.grid th.sortable:hover {
  color: var(--text);
  background: var(--surface-3);
}
table.grid th.sorted {
  color: var(--cobalt);
}
.th-in {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}
th.r .th-in {
  flex-direction: row-reverse;
}
.th-caret {
  opacity: 0;
  transition: opacity var(--dur) var(--ease);
}
th.sortable:hover .th-caret {
  opacity: 0.45;
}
th.sorted .th-caret {
  opacity: 1;
}
.lc-region {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--text3);
  background: var(--surface-3);
  border-radius: 3px;
  padding: 1px 5px;
}

/* ---- leaderboard ---- */
.lb-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 4px;
}
.lb-chips {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.lb-chip {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 6px 12px;
  border-radius: 100px;
  border: 1px solid var(--line-2);
  background: var(--surface);
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text2);
  cursor: pointer;
  transition: all var(--dur) var(--ease);
}
.lb-chip:hover {
  border-color: var(--text3);
  color: var(--text);
}
.lb-chip.active {
  background: var(--ink);
  border-color: var(--ink);
  color: #fff;
}
.lb-chip-n {
  font-size: 10px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 100px;
  background: var(--surface-3);
  color: var(--text2);
}
.lb-chip.active .lb-chip-n {
  background: rgba(255, 255, 255, 0.16);
  color: #fff;
}

.lb-axis {
  display: grid;
  grid-template-columns: 34px minmax(150px, 1.1fr) minmax(220px, 2.4fr) 62px;
  gap: 12px;
  padding: 9px 16px;
  border-bottom: 1px solid var(--line);
  background: var(--surface-2);
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text3);
}
.lb-axis span:first-child,
.lb-axis span:nth-child(2) {
  grid-column: auto;
}
.lb-axis > span:nth-child(1) {
  grid-column: 3;
  text-align: left;
}
.lb-axis > span:nth-child(2) {
  grid-column: 3;
  text-align: center;
}
.lb-axis > span:nth-child(3) {
  grid-column: 3;
  text-align: right;
}
.lb-axis-mid {
  color: var(--text2);
}

.lb-chart {
  padding: 6px 0;
}
.lb-row {
  display: grid;
  grid-template-columns: 34px minmax(150px, 1.1fr) minmax(220px, 2.4fr) 62px;
  gap: 12px;
  align-items: center;
  width: 100%;
  padding: 9px 16px;
  border: none;
  border-left: 2px solid transparent;
  background: transparent;
  cursor: pointer;
  text-align: left;
  transition: background var(--dur) var(--ease), border-color var(--dur) var(--ease);
}
.lb-row:hover {
  background: var(--surface-2);
}
.lb-row.pinned {
  background: var(--cobalt-bg);
  border-left-color: var(--cobalt);
}
.lb-rank {
  font-size: 11px;
  font-weight: 700;
  color: var(--text3);
  font-variant-numeric: tabular-nums;
  text-align: right;
}
.lb-name {
  display: flex;
  flex-direction: column;
  min-width: 0;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text);
}
.lb-meta {
  font-size: 10.5px;
  font-weight: 500;
  color: var(--text3);
  margin-top: 1px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.lb-track {
  position: relative;
  height: 18px;
  border-radius: 4px;
  background: var(--surface-2);
  overflow: hidden;
}
.lb-base {
  position: absolute;
  left: 50%;
  top: 0;
  bottom: 0;
  width: 1.5px;
  margin-left: -0.75px;
  background: var(--line-2);
  z-index: 2;
}
.lb-bar {
  position: absolute;
  top: 3px;
  bottom: 3px;
  border-radius: 3px;
  transform-origin: left center;
  animation: grow 460ms var(--ease) both;
  animation-delay: calc(var(--i, 0) * 16ms);
}
.lb-bar.up {
  background: var(--pos);
}
.lb-bar.down {
  background: var(--neg);
  transform-origin: right center;
}
.lb-row:hover .lb-bar {
  filter: brightness(1.12);
}
.lb-pct {
  font-size: 14px;
  font-weight: 700;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.lb-pct.up {
  color: var(--pos);
}
.lb-pct.down {
  color: var(--neg);
}

@media (max-width: 900px) {
  .lb-axis,
  .lb-row {
    grid-template-columns: 26px minmax(0, 1.3fr) minmax(90px, 1fr) 48px;
    gap: 8px;
    padding: 9px 12px;
  }
  .lb-meta {
    font-size: 9.5px;
  }
  .lb-pct {
    font-size: 12.5px;
  }
  .lb-controls {
    margin-bottom: 10px;
  }
  .lb-chips {
    overflow-x: auto;
    flex-wrap: nowrap;
    scrollbar-width: none;
  }
  .lb-chips::-webkit-scrollbar {
    display: none;
  }
}
__SHIFT_EOF__

echo
echo "==> sanity check"
MISS=0
for f in components/ShiftLogo.js components/WeekView.js components/Leaderboard.js app/page.js app/globals.css; do
  [ -s "$f" ] && echo "    ok      $f" || { echo "    MISSING $f"; MISS=1; }
done
grep -q "shift_nav_collapsed" app/page.js && echo "    ok      sidebar collapse wired" || echo "    WARNING collapse not found in page.js"
grep -q "lb-chart" app/globals.css && echo "    ok      leaderboard styles present" || echo "    WARNING leaderboard styles missing"
grep -q "CROWN_LEFT" components/ShiftLogo.js && echo "    ok      crown present" || echo "    WARNING crown missing"

echo
[ "$MISS" = "0" ] && echo "All good. Run:  npm run dev" || echo "Fix the items above first."
echo "To undo any single file:  mv <file>.$STAMP.bak <file>"
