// SSSG tab - same-store sales growth, single-month comparison.
// Admin only, enforced server-side by app/api/sssg/route.js (requireAdmin),
// not just by this tab being hidden from non-admin nav in app/page.js.
//
// All aggregation - the comparable-store rule, the totals, the gap between
// headline and comp - happens in lib/sssg.js on the server. This component
// only formats and lays out numbers it's handed; it never re-derives
// "comparable" on its own, so there is exactly one definition of that word
// in the whole app. The one arithmetic exception is the region filter and
// the store-rank lookup below: both are plain sums/sorts over rows the
// server already classified, the same way a spreadsheet subtotal doesn't
// change what the rows mean.

"use client";

import { useEffect, useMemo, useState } from "react";
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

// Compact currency for dense contexts (bar labels, tooltips) - "$53.8K", not
// "$53,806". Matches the "1,284 / 12.9K / $4.2M" auto-compact convention used
// everywhere else a value has to sit beside other data instead of alone.
function compactMoney(n, { signed = false } = {}) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const neg = n < 0;
  const abs = Math.abs(n);
  const body = abs >= 1000 ? `$${(abs / 1000).toFixed(1)}K` : `$${Math.round(abs)}`;
  if (neg) return `-${body}`;
  return signed ? `+${body}` : body;
}

// Reserved chart margin is computed from the actual label strings in this
// month's data, not a guessed constant - a longer store list or a wider
// outlier next month gets the room it needs automatically instead of
// clipping again. Average-glyph-width heuristic, calibrated wide on purpose
// so the estimate errs toward too much margin, never too little.
function estimateTextWidth(text, fontSize = 11, bold = true) {
  return text.length * fontSize * (bold ? 0.62 : 0.56);
}

function totalsFor(stores, comparable) {
  const headlinePrior = round2(stores.reduce((a, r) => a + r.salesPrior, 0));
  const headlineCurrent = round2(stores.reduce((a, r) => a + r.salesCurrent, 0));
  const headlinePct = headlinePrior > 0 ? round2((headlineCurrent / headlinePrior - 1) * 100) : null;

  const compPrior = round2(comparable.reduce((a, r) => a + r.salesPrior, 0));
  const compCurrent = round2(comparable.reduce((a, r) => a + r.salesCurrent, 0));
  const compPct = compPrior > 0 ? round2((compCurrent / compPrior - 1) * 100) : null;

  return {
    headline: { prior: headlinePrior, current: headlineCurrent, pctChange: headlinePct },
    comparable: { prior: compPrior, current: compCurrent, pctChange: compPct, storeCount: comparable.length },
    gap: headlinePct !== null && compPct !== null ? round2(headlinePct - compPct) : null,
  };
}

const REASON_CHIP = {
  "incomplete data": "chip-neg",
  "not open in prior-year month": "chip-warn",
  "not trading in current month": "chip-warn",
};

function ReasonChip({ reason }) {
  return <span className={"chip " + (REASON_CHIP[reason] || "chip-mute")}>{reason}</span>;
}

// muted renders the sign/number with no direction color - used on the
// headline stat, which is deliberately the quiet number on this screen.
// Color is spent on the comp figure; the headline earns it back only in
// the one place readers already expect red/green, the per-store table.
function ChangeText({ value, muted = false }) {
  if (value === null || value === undefined) return <span style={{ color: "var(--text3)" }}>—</span>;
  return (
    <span style={{ color: muted ? "var(--text2)" : value >= 0 ? "var(--pos)" : "var(--neg)", fontWeight: 700 }}>
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
        maxWidth: 230,
        lineHeight: 1.5,
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 3 }}>{d.name}</div>
      <div style={{ opacity: 0.75 }}>
        {money(d.prior)} → {money(d.current)}
      </div>
      <div style={{ marginTop: 3, fontWeight: 700, color: up ? "var(--pos)" : "var(--neg)" }}>
        {up ? "▲" : "▼"} {pct(d.pct, 2)} · {compactMoney(d.dollar, { signed: true })}
      </div>
    </div>
  );
}

// Combined percent + dollar label, one line, anchored outside the bar's own
// end. Direction (left for negative, right for positive) matches which way
// the bar already points, so the label reads as a continuation of the bar,
// not a separate annotation.
function BarValueLabel(props) {
  const { x, y, width, height, value, payload } = props;
  const up = value >= 0;
  const lx = up ? x + width + 8 : x - 8;
  return (
    <text
      x={lx}
      y={y + height / 2}
      dy={4}
      textAnchor={up ? "start" : "end"}
      fontSize={11.5}
      fontWeight={700}
      fill={up ? "var(--pos)" : "var(--neg)"}
    >
      {up ? "+" : ""}
      {value.toFixed(1)}%  {compactMoney(payload.dollar, { signed: true })}
    </text>
  );
}

function StatTile({ label, value, sub, primary, tint }) {
  return (
    <div
      style={{
        background: tint || "var(--surface)",
        border: primary ? "1.5px solid var(--border2)" : "1px solid var(--border)",
        borderRadius: "var(--rl)",
        padding: primary ? "22px 26px" : "14px 18px",
        boxShadow: primary ? "var(--sh-2)" : "var(--sh-1)",
      }}
    >
      <div
        style={{
          fontSize: primary ? 13 : 11,
          color: "var(--text3)",
          fontWeight: 700,
          letterSpacing: "0.03em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: primary ? 52 : 22, fontWeight: 800, lineHeight: 1.1, marginTop: 6 }}>{value}</div>
      {sub && (
        <div style={{ fontSize: primary ? 13 : 11, color: "var(--text3)", marginTop: 6 }}>{sub}</div>
      )}
    </div>
  );
}

// Tight, consistent row bands - the bar is most of the row, not a thin
// ribbon in a tall one. Capped at 24px per the house mark spec regardless
// of how few stores are in a filtered region, so a short list doesn't
// suddenly get fat bars.
const ROW_HEIGHT = 30;
const BAR_THICKNESS = 22;
const LABEL_GAP = 16;

export default function SSSG() {
  const [month, setMonth] = useState(null); // null = let the server pick the default
  const [region, setRegion] = useState("All");
  const [selectedCode, setSelectedCode] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Region is a client-side filter over one fetch, not a second round trip -
  // it's a plain sum over rows the server already classified, and it means
  // the store selector below always has the full 35-store universe on hand
  // regardless of which region is currently in view above it.
  useEffect(() => {
    let dead = false;
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (month) params.set("month", month);

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
  }, [month]);

  const scoped = useMemo(() => {
    if (!data) return null;
    const stores = region === "All" ? data.stores : data.stores.filter((s) => s.region === region);
    const comparable = stores.filter((s) => !s.excluded);
    const excluded = stores.filter((s) => s.excluded);
    const totals = region === "All" ? data.totals : totalsFor(stores, comparable);
    return { stores, comparable, excluded, totals };
  }, [data, region]);

  if (loading && !data) return <div className="empty">Loading SSSG…</div>;

  if (error) {
    return (
      <div className="empty">
        <div className="empty-title">Couldn't load SSSG</div>
        {error}
      </div>
    );
  }

  if (!data || !scoped) return <div className="empty">No data yet.</div>;

  const { months, regions, monthLabel, priorMonthLabel } = data;
  const { stores, comparable, excluded, totals } = scoped;

  const chartRows = [...comparable]
    .sort((a, b) => b.pctChange - a.pctChange)
    .map((r) => ({
      name: r.name,
      code: r.code,
      pct: r.pctChange,
      prior: r.salesPrior,
      current: r.salesCurrent,
      dollar: r.dollarChange,
    }));

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

  const compTint = totals.comparable.pctChange >= 0 ? "var(--pos-bg)" : "var(--neg-bg)";

  // Reserved margin comes from the widest label on each side of zero, not a
  // guess - see estimateTextWidth. A month with a more extreme outlier than
  // -26.9% gets more room automatically; a month with none doesn't carry
  // dead space it doesn't need.
  const negLabels = chartRows.filter((r) => r.pct < 0).map((r) => `${r.pct.toFixed(1)}%  ${compactMoney(r.dollar, { signed: true })}`);
  const posLabels = chartRows.filter((r) => r.pct >= 0).map((r) => `+${r.pct.toFixed(1)}%  ${compactMoney(r.dollar, { signed: true })}`);
  const leftMargin = Math.ceil(Math.max(0, ...negLabels.map((t) => estimateTextWidth(t)), 0)) + LABEL_GAP;
  const rightMargin = Math.ceil(Math.max(0, ...posLabels.map((t) => estimateTextWidth(t)), 0)) + LABEL_GAP;
  const chartHeight = chartRows.length ? chartRows.length * ROW_HEIGHT + 20 : 0;

  const rankedComparable = [...data.comparable].sort((a, b) => b.pctChange - a.pctChange);
  const selectedStore = selectedCode ? data.stores.find((s) => String(s.code) === selectedCode) : null;
  const selectedRank = selectedStore && !selectedStore.excluded
    ? rankedComparable.findIndex((r) => r.code === selectedStore.code) + 1
    : null;

  return (
    <div className="shift-dense" style={{ opacity: loading ? 0.55 : 1, transition: "opacity 120ms var(--ease)" }}>
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

      {/* Headline row - the comp figure is the hero; everything else recedes */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.6fr 1fr 1fr 1fr",
          gap: 14,
          marginBottom: 30,
          alignItems: "stretch",
        }}
      >
        <StatTile
          primary
          tint={compTint}
          label="Comparable SSSG"
          value={<ChangeText value={totals.comparable.pctChange} />}
          sub={`${money(totals.comparable.prior)} → ${money(totals.comparable.current)} · comparable stores only`}
        />
        <StatTile label="Comparable stores" value={totals.comparable.storeCount} sub={`of ${stores.length} total`} />
        <StatTile
          label="Headline, all stores"
          value={<ChangeText value={totals.headline.pctChange} muted />}
          sub={`${money(totals.headline.prior)} → ${money(totals.headline.current)}`}
        />
        <StatTile
          label="Gap"
          value={
            <span style={{ color: totals.gap === null ? "var(--text3)" : "var(--warn)" }}>
              {totals.gap === null ? "—" : (totals.gap >= 0 ? "+" : "") + totals.gap.toFixed(2) + " pts"}
            </span>
          }
          sub="headline minus comp — new-store contribution"
        />
      </div>

      {/* Bar chart */}
      <h3 style={{ fontSize: 14, fontWeight: 800, marginBottom: 2 }}>Per-store change, comparable stores</h3>
      <div style={{ fontSize: 12, color: "var(--text3)", marginBottom: 12 }}>
        Percent change vs {priorMonthLabel}, dollar change alongside — sorted best to worst
      </div>
      {chartRows.length ? (
        <div style={{ width: "100%", height: chartHeight, marginBottom: 28 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartRows}
              layout="vertical"
              margin={{ top: 8, right: rightMargin, bottom: 8, left: leftMargin }}
              barCategoryGap={ROW_HEIGHT - BAR_THICKNESS}
            >
              <CartesianGrid horizontal={false} stroke="var(--border)" strokeWidth={1} />
              <XAxis type="number" tick={{ fontSize: 11, fill: "var(--text3)" }} axisLine={false} tickLine={false} unit="%" />
              <YAxis
                type="category"
                dataKey="name"
                width={168}
                tickMargin={10}
                tick={{ fontSize: 11.5, fill: "var(--text2)" }}
                axisLine={false}
                tickLine={false}
              />
              <ReferenceLine x={0} stroke="var(--text)" strokeWidth={2} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(43,34,26,.05)" }} />
              <Bar dataKey="pct" maxBarSize={BAR_THICKNESS} label={BarValueLabel} isAnimationActive={false} activeBar={{ stroke: "var(--text)", strokeWidth: 1 }}>
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
          marginBottom: 28,
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

      {/* Store detail lookup */}
      <h3 style={{ fontSize: 14, fontWeight: 800, marginBottom: 10 }}>Store detail</h3>
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--rl)",
          padding: 20,
        }}
      >
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11.5, color: "var(--text3)", fontWeight: 700, marginBottom: 18 }}>
          STORE
          <select
            value={selectedCode}
            onChange={(e) => setSelectedCode(e.target.value)}
            style={{
              padding: "8px 12px",
              borderRadius: "var(--r)",
              border: "1px solid var(--border2)",
              fontSize: 13,
              background: "var(--surface)",
              color: "var(--text)",
              maxWidth: 320,
            }}
          >
            <option value="">Select a store…</option>
            {[...data.stores].sort((a, b) => a.code - b.code).map((s) => (
              <option key={s.code} value={s.code}>
                {s.code} — {s.name}
              </option>
            ))}
          </select>
        </label>

        {!selectedStore && (
          <div style={{ fontSize: 13, color: "var(--text3)" }}>Pick a store to see its month detail.</div>
        )}

        {selectedStore && (
          <>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 16 }}>
              <div style={{ fontSize: 20, fontWeight: 800 }}>{selectedStore.name}</div>
              <div style={{ fontSize: 13, color: "var(--text3)" }}>#{selectedStore.code} · {selectedStore.region}</div>
            </div>

            {!selectedStore.excluded ? (
              <>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(4, 1fr)",
                    gap: 14,
                    marginBottom: 16,
                  }}
                >
                  <StatTile label={monthLabelHeader(priorMonthLabel) + " sales"} value={money(selectedStore.salesPrior)} />
                  <StatTile label={monthLabelHeader(monthLabel) + " sales"} value={money(selectedStore.salesCurrent)} />
                  <StatTile label="$ change" value={money(selectedStore.dollarChange)} />
                  <StatTile label="% change" value={<ChangeText value={selectedStore.pctChange} />} />
                </div>
                <div style={{ fontSize: 13, color: "var(--text2)" }}>
                  Ranks <strong>#{selectedRank}</strong> of <strong>{rankedComparable.length}</strong> comparable stores chain-wide
                  {selectedRank && selectedRank <= 3 ? " — a top performer this month." : ""}
                  {selectedRank && selectedRank > rankedComparable.length - 3 ? " — a bottom performer this month." : ""}
                </div>
              </>
            ) : (
              <>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(2, 1fr)",
                    gap: 14,
                    marginBottom: 14,
                  }}
                >
                  <StatTile label={monthLabelHeader(monthLabel) + " sales"} value={money(selectedStore.salesCurrent)} />
                  <StatTile label="Prior-year comparison" value="Not available" />
                </div>
                <div style={{ fontSize: 13, color: "var(--text2)", display: "flex", alignItems: "center", gap: 8 }}>
                  No {priorMonthLabel} comparison exists for this store.
                  <ReasonChip reason={selectedStore.excludeReason} />
                </div>
              </>
            )}

            <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--line)" }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 4 }}>
                Daily trend
              </div>
              <div style={{ fontSize: 13, color: "var(--text3)" }}>
                Available once the daily sync lands — this section is reserved for it.
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function monthLabelHeader(label) {
  // "August 2025" -> "Aug 2025", keeps the table header from wrapping.
  return label.replace(/^(\w{3})\w*/, "$1");
}
