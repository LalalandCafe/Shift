// SSSG tab - same-store sales growth, single-month comparison.
// Admin only, enforced server-side by app/api/sssg/route.js (requireAdmin),
// not just by this tab being hidden from non-admin nav in app/page.js.
//
// All aggregation - the comparable-store rule, the totals, the gap between
// headline and comp - happens in lib/sssg.js on the server. This component
// only formats and lays out numbers it's handed; it never re-derives
// "comparable" on its own, so there is exactly one definition of that word
// in the whole app.

"use client";

import { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Cell,
  ReferenceLine,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { money, pct } from "../lib/ui";

function round2(n) {
  return Math.round(n * 100) / 100;
}

const REASON_CHIP = {
  "incomplete data": "chip-neg",
  "not open in prior-year month": "chip-warn",
  "not trading in current month": "chip-warn",
};

function ReasonChip({ reason }) {
  return <span className={"chip " + (REASON_CHIP[reason] || "chip-mute")}>{reason}</span>;
}

function ChangeText({ value }) {
  if (value === null || value === undefined) return <span style={{ color: "var(--text3)" }}>—</span>;
  return (
    <span style={{ color: value >= 0 ? "var(--pos)" : "var(--neg)", fontWeight: 700 }}>
      {pct(value, 2)}
    </span>
  );
}

function ChartTooltip({ active, payload }) {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0].payload;
  const up = d.pct >= 0;
  return (
    <div
      style={{
        background: "var(--ink)",
        color: "var(--ink-text)",
        padding: "10px 13px",
        borderRadius: 9,
        fontSize: 12,
        boxShadow: "var(--sh-3)",
        maxWidth: 220,
        lineHeight: 1.5,
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 3 }}>{d.name}</div>
      <div style={{ opacity: 0.75 }}>
        {money(d.prior)} → {money(d.current)}
      </div>
      <div style={{ marginTop: 3, fontWeight: 700, color: up ? "var(--pos)" : "var(--neg)" }}>
        {up ? "▲" : "▼"} {pct(d.pct, 2)}
      </div>
    </div>
  );
}

function PctLabel(props) {
  const { x, y, width, height, value } = props;
  const up = value >= 0;
  const lx = up ? x + width + 7 : x - 7;
  return (
    <text
      x={lx}
      y={y + height / 2}
      dy={4}
      textAnchor={up ? "start" : "end"}
      fontSize={11}
      fontWeight={700}
      fill={up ? "var(--pos)" : "var(--neg)"}
    >
      {up ? "+" : ""}
      {value.toFixed(1)}%
    </text>
  );
}

function StatTile({ label, value, sub, primary }) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--rl)",
        padding: primary ? "20px 24px" : "14px 18px",
        boxShadow: "var(--sh-1)",
      }}
    >
      <div style={{ fontSize: primary ? 13 : 11.5, color: "var(--text3)", fontWeight: 700, letterSpacing: "0.02em", textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ fontSize: primary ? 48 : 24, fontWeight: 800, lineHeight: 1.15, marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: primary ? 13 : 11.5, color: "var(--text3)", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

export default function SSSG() {
  const [month, setMonth] = useState(null); // null = let the server pick the default
  const [region, setRegion] = useState("All");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let dead = false;
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (month) params.set("month", month);
    if (region !== "All") params.set("region", region);

    fetch(`/api/sssg?${params.toString()}`)
      .then((r) => r.json())
      .then((json) => {
        if (dead) return;
        if (!json.ok) throw new Error(json.error || "Failed to load SSSG data");
        setData(json);
      })
      .catch((e) => !dead && setError(e.message))
      .finally(() => !dead && setLoading(false));

    return () => {
      dead = true;
    };
  }, [month, region]);

  if (loading && !data) return <div className="empty">Loading SSSG…</div>;

  if (error) {
    return (
      <div className="empty">
        <div className="empty-title">Couldn't load SSSG</div>
        {error}
      </div>
    );
  }

  if (!data) return <div className="empty">No data yet.</div>;

  const { totals, comparable, excluded, months, regions, monthLabel, priorMonthLabel } = data;

  const chartRows = [...comparable]
    .sort((a, b) => b.pctChange - a.pctChange)
    .map((r) => ({ name: r.name, code: r.code, pct: r.pctChange, prior: r.salesPrior, current: r.salesCurrent }));

  const tableRows = [...comparable].sort((a, b) => b.pctChange - a.pctChange);

  const top3 = chartRows.slice(0, 3);
  const bottom3 = [...chartRows].slice(-3).reverse();

  const regionRollup = {};
  comparable.forEach((r) => {
    if (!regionRollup[r.region]) regionRollup[r.region] = { prior: 0, current: 0 };
    regionRollup[r.region].prior += r.salesPrior;
    regionRollup[r.region].current += r.salesCurrent;
  });
  const regionPct = Object.entries(regionRollup)
    .map(([rgn, v]) => ({ region: rgn, pctChange: v.prior > 0 ? round2((v.current / v.prior - 1) * 100) : null }))
    .filter((r) => r.pctChange !== null);
  const compPct = totals.comparable.pctChange;
  const aboveComp = regionPct.filter((r) => r.pctChange > compPct).sort((a, b) => b.pctChange - a.pctChange);
  const belowComp = regionPct.filter((r) => r.pctChange <= compPct).sort((a, b) => a.pctChange - b.pctChange);

  const dataExcluded = excluded.filter((r) => r.excludeReason === "incomplete data");

  const gapPositive = totals.gap !== null && totals.gap >= 0;
  const chartHeight = chartRows.length ? Math.max(180, chartRows.length * 32 + 24) : 0;

  return (
    <div className="shift-dense">
      {/* Month / region selectors */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 20 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11.5, color: "var(--text3)", fontWeight: 700 }}>
          MONTH
          <select
            value={month || data.month}
            onChange={(e) => setMonth(e.target.value)}
            style={{
              padding: "8px 12px",
              borderRadius: "var(--r)",
              border: "1px solid var(--border2)",
              fontSize: 13,
              background: "var(--surface)",
              color: "var(--text)",
              minWidth: 220,
            }}
          >
            {months.map((m) => (
              <option key={m.month} value={m.month} disabled={!m.comparable} title={m.comparable ? "" : m.reason}>
                {m.label}
                {m.comparable ? "" : ` — ${m.reason}`}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11.5, color: "var(--text3)", fontWeight: 700 }}>
          REGION
          <select
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            style={{
              padding: "8px 12px",
              borderRadius: "var(--r)",
              border: "1px solid var(--border2)",
              fontSize: 13,
              background: "var(--surface)",
              color: "var(--text)",
              minWidth: 160,
            }}
          >
            <option value="All">All regions</option>
            {regions.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>

        {loading && <span style={{ fontSize: 12, color: "var(--text3)" }}>Refreshing…</span>}
      </div>

      <div style={{ fontSize: 13, color: "var(--text2)", marginBottom: 20 }}>
        {monthLabel} vs {priorMonthLabel} · {region === "All" ? "all regions" : region}
      </div>

      {/* Headline row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.4fr 1fr 1fr 1fr",
          gap: 14,
          marginBottom: 28,
          alignItems: "stretch",
        }}
      >
        <StatTile
          primary
          label="Comparable SSSG"
          value={<ChangeText value={totals.comparable.pctChange} />}
          sub={`${money(totals.comparable.prior)} → ${money(totals.comparable.current)}, comparable stores only`}
        />
        <StatTile label="Comparable stores" value={totals.comparable.storeCount} sub={`of ${data.stores.length} total`} />
        <StatTile
          label="Headline (all stores)"
          value={<ChangeText value={totals.headline.pctChange} />}
          sub={`${money(totals.headline.prior)} → ${money(totals.headline.current)}`}
        />
        <StatTile
          label="Gap"
          value={
            <span style={{ color: gapPositive ? "var(--warn)" : "var(--text)" }}>
              {totals.gap === null ? "—" : (totals.gap >= 0 ? "+" : "") + totals.gap.toFixed(2) + " pts"}
            </span>
          }
          sub="headline minus comp — new-store contribution"
        />
      </div>

      {/* Bar chart */}
      <h3 style={{ fontSize: 14, fontWeight: 800, marginBottom: 10 }}>Per-store change, comparable stores</h3>
      {chartRows.length ? (
        <div style={{ width: "100%", height: chartHeight, marginBottom: 28 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartRows} layout="vertical" margin={{ top: 4, right: 54, bottom: 4, left: 4 }} barCategoryGap={10}>
              <CartesianGrid horizontal={false} stroke="var(--border)" />
              <XAxis type="number" tick={{ fontSize: 11, fill: "var(--text3)" }} axisLine={false} tickLine={false} unit="%" />
              <YAxis
                type="category"
                dataKey="name"
                width={150}
                tick={{ fontSize: 11, fill: "var(--text2)" }}
                axisLine={false}
                tickLine={false}
              />
              <ReferenceLine x={0} stroke="var(--navy)" strokeWidth={1.5} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(26,26,46,.04)" }} />
              <Bar dataKey="pct" radius={4} maxBarSize={16} label={PctLabel}>
                {chartRows.map((entry, i) => (
                  <Cell key={i} fill={entry.pct >= 0 ? "var(--pos)" : "var(--neg)"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="empty" style={{ padding: "24px 0", marginBottom: 28 }}>
          No comparable stores in this region.
        </div>
      )}

      {/* Table */}
      <h3 style={{ fontSize: 14, fontWeight: 800, marginBottom: 10 }}>Comparable stores</h3>
      <div style={{ overflowX: "auto", marginBottom: 28 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "2px solid var(--line)" }}>
              {["Code", "Store", "Region", monthLabelHeader(priorMonthLabel), monthLabelHeader(monthLabel), "$ Change", "% Change"].map((h, i) => (
                <th
                  key={h}
                  style={{
                    textAlign: i >= 3 ? "right" : "left",
                    padding: "8px 10px",
                    color: "var(--text3)",
                    fontWeight: 700,
                    fontSize: 11.5,
                    textTransform: "uppercase",
                    letterSpacing: "0.02em",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tableRows.map((r) => (
              <tr key={r.code} style={{ borderBottom: "1px solid var(--line)" }}>
                <td style={{ padding: "8px 10px", color: "var(--text3)" }}>{r.code}</td>
                <td style={{ padding: "8px 10px", fontWeight: 600 }}>{r.name}</td>
                <td style={{ padding: "8px 10px", color: "var(--text2)" }}>{r.region}</td>
                <td style={{ padding: "8px 10px", textAlign: "right" }}>{money(r.salesPrior)}</td>
                <td style={{ padding: "8px 10px", textAlign: "right" }}>{money(r.salesCurrent)}</td>
                <td style={{ padding: "8px 10px", textAlign: "right" }}>{money(r.dollarChange)}</td>
                <td style={{ padding: "8px 10px", textAlign: "right" }}>
                  <ChangeText value={r.pctChange} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Excluded stores */}
      <h3 style={{ fontSize: 14, fontWeight: 800, marginBottom: 10 }}>
        Excluded from comp ({excluded.length})
      </h3>
      {excluded.length ? (
        <div style={{ overflowX: "auto", marginBottom: 28 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "2px solid var(--line)" }}>
                {["Code", "Store", "Region", monthLabelHeader(monthLabel) + " sales", "Reason"].map((h, i) => (
                  <th
                    key={h}
                    style={{
                      textAlign: i === 3 ? "right" : "left",
                      padding: "8px 10px",
                      color: "var(--text3)",
                      fontWeight: 700,
                      fontSize: 11.5,
                      textTransform: "uppercase",
                      letterSpacing: "0.02em",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {excluded.map((r) => (
                <tr key={r.code} style={{ borderBottom: "1px solid var(--line)" }}>
                  <td style={{ padding: "8px 10px", color: "var(--text3)" }}>{r.code}</td>
                  <td style={{ padding: "8px 10px", fontWeight: 600 }}>{r.name}</td>
                  <td style={{ padding: "8px 10px", color: "var(--text2)" }}>{r.region}</td>
                  <td style={{ padding: "8px 10px", textAlign: "right" }}>{money(r.salesCurrent)}</td>
                  <td style={{ padding: "8px 10px" }}>
                    <ReasonChip reason={r.excludeReason} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty" style={{ padding: "20px 0", marginBottom: 28 }}>
          No stores excluded this month.
        </div>
      )}

      {/* Analysis block */}
      <h3 style={{ fontSize: 14, fontWeight: 800, marginBottom: 10 }}>Analysis</h3>
      <div
        style={{
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
          borderRadius: "var(--rl)",
          padding: 18,
          fontSize: 13,
          lineHeight: 1.7,
          color: "var(--text2)",
        }}
      >
        <p>
          <strong style={{ color: "var(--text)" }}>Top performers: </strong>
          {top3.length
            ? top3.map((r, i) => (
                <span key={r.code}>
                  {i > 0 && ", "}
                  {r.name} ({pct(r.pct, 2)})
                </span>
              ))
            : "None"}
        </p>
        <p>
          <strong style={{ color: "var(--text)" }}>Bottom performers: </strong>
          {bottom3.length
            ? bottom3.map((r, i) => (
                <span key={r.code}>
                  {i > 0 && ", "}
                  {r.name} ({pct(r.pct, 2)})
                </span>
              ))
            : "None"}
        </p>
        <p>
          <strong style={{ color: "var(--text)" }}>Regions above chain comp ({pct(compPct, 2)}): </strong>
          {aboveComp.length ? aboveComp.map((r, i) => (
            <span key={r.region}>
              {i > 0 && ", "}
              {r.region} ({pct(r.pctChange, 2)})
            </span>
          )) : "None"}
        </p>
        <p>
          <strong style={{ color: "var(--text)" }}>Regions below chain comp: </strong>
          {belowComp.length ? belowComp.map((r, i) => (
            <span key={r.region}>
              {i > 0 && ", "}
              {r.region} ({pct(r.pctChange, 2)})
            </span>
          )) : "None"}
        </p>
        <p style={{ marginBottom: 0 }}>
          <strong style={{ color: "var(--text)" }}>Excluded for data reasons (not opening date): </strong>
          {dataExcluded.length
            ? dataExcluded.map((r, i) => (
                <span key={r.code}>
                  {i > 0 && ", "}
                  {r.name}
                </span>
              ))
            : "None"}
        </p>
      </div>
    </div>
  );
}

function monthLabelHeader(label) {
  // "August 2025" -> "Aug 2025", keeps the table header from wrapping.
  return label.replace(/^(\w{3})\w*/, "$1");
}
