// Weekly SSSG - global filter bar (SSSG-FILTERS). Own component, own route
// (app/api/sssg-weekly/route.js), own tab entry - deliberately NOT added to
// components/SSSG.js or app/api/sssg/route.js, which are the existing,
// already-shipped monthly SSSG tab and stay completely untouched by this
// file. The isolation line:
//
//   - lib/sssg.js: everything above its "Weekly SSSG" marker comment is
//     the original monthly implementation, unmodified. computeMonthComparison(),
//     classifyStore(), getComparableMonths() - everything the monthly tab
//     calls - are exactly what they were before this feature existed.
//   - Routes: app/api/sssg-weekly/route.js is new. app/api/sssg/route.js
//     is untouched.
//   - Components: this file is new. components/SSSG.js is untouched.
//   - The only shared files touched at all are components/Icon.js (one
//     new glyph, "funnel", purely additive) and app/page.js (one new nav
//     entry + render branch, additive, does not alter the existing "sssg"
//     entry).
//
// Filter state (market, comp/non-comp, selected stores) lives in a
// module-level singleton below, not component state, so it survives this
// component unmounting when the user switches tabs (app/page.js only
// renders this component while its tab is active) and is restored as-is
// on remount - "persists across tab switches within the session" per the
// spec. It resets on a full page reload, which is what "session" means
// here - nothing is written to localStorage or the server.
//
// Average Ticket is out of scope for this pass (see
// docs/plans/SSSG-FILTERS-PROGRESS.md's pending-items note) - no block,
// no placeholder, below. Ticket SSSG (a different metric - sales SSSG
// minus transaction growth) is computed correctly in lib/sssg.js and
// returned by the API, but this pass doesn't surface it in the UI either -
// only the three summary blocks that were actually asked for.

"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import Icon from "./Icon";
import { money, int, pct } from "../lib/ui";
import { addDays } from "../lib/calendar";

const MARKET_ORDER = ["DFW", "HTX", "CA", "ATX", "NSH", "AZ", "SATX"];

function cloneFilters(f) {
  return {
    initialized: f.initialized,
    markets: new Set(f.markets),
    compFilter: new Set(f.compFilter),
    selectedCodes: new Set(f.selectedCodes),
  };
}

// Module-level, not component state - see file header. Exactly one
// <SSSGWeekly/> is ever mounted at a time (app/page.js's
// {view === "sssg-weekly" && <SSSGWeekly/>}), so a plain singleton is
// enough; there's no multi-instance sync problem to solve here.
let _filters = {
  initialized: false, // true once the first response has seeded "all selected"
  markets: new Set(),
  compFilter: new Set(["comp", "noncomp"]),
  selectedCodes: new Set(),
};

function fmtDate(iso) {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function compKeyOf(store) {
  return store.excluded ? "noncomp" : "comp";
}

// Why a ticked store is showing greyed in a narrowed list - built from the
// two narrowing filters, never from search (search hides non-matches
// outright rather than pinning them, see FilterPanel's `bySearch` below).
function mismatchReason(store, filters) {
  const parts = [];
  if (!filters.markets.has(store.region)) parts.push(`${store.region} is unchecked under Market`);
  if (!filters.compFilter.has(compKeyOf(store))) {
    parts.push(store.excluded ? "Non-Comp is unchecked" : "Comp is unchecked");
  }
  return parts.join(" and ");
}

// One bar per entry in `bars` - today that's always exactly two ("Prior
// yr" / "Current wk"), but the shape is generic on purpose. Per the
// reference report's actual layout (Day / WTD / PTD / QTD / YTD), a
// SummaryBlock later just gets handed more entries here - QTD/YTD need
// backfill this app doesn't have yet, so they aren't added now, but this
// component never needs a rewrite when they land, only a longer `bars`
// array from the caller.
function TimeframeBars({ bars, formatter }) {
  const max = Math.max(...bars.map((b) => Math.abs(b.value || 0)), 1);
  const height = Math.max(64, bars.length * 26 + 18);
  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={bars} layout="vertical" margin={{ top: 4, right: 10, bottom: 4, left: 8 }} barCategoryGap={16}>
          <XAxis type="number" hide domain={[0, max * 1.08]} />
          <YAxis type="category" dataKey="label" width={62} tick={{ fontSize: 11, fill: "var(--text3)" }} axisLine={false} tickLine={false} />
          <Tooltip formatter={(v) => formatter(v)} cursor={{ fill: "rgba(43,34,26,.05)" }} />
          <Bar dataKey="value" maxBarSize={20} radius={[0, 4, 4, 0]} isAnimationActive={false}>
            {bars.map((b, i) => (
              <Cell key={b.label} fill={i === bars.length - 1 ? "var(--ink)" : "var(--border2)"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// `bars`: [{ label, value }, ...] - see TimeframeBars above for why this
// is an array rather than fixed prior/current props. The metrics row
// below reads its endpoints generically (first bar -> last bar), which
// today means Prior -> Current and will still make sense once more
// timeframes are appended, since the last bar is always "now."
function SummaryBlock({ label, bars, pctChange, storeCount, formatter }) {
  const showPct = pctChange !== undefined;
  const changeColor = pctChange === null ? "var(--text3)" : pctChange >= 0 ? "var(--pos)" : "var(--neg)";
  const first = bars[0];
  const last = bars[bars.length - 1];
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--rl)", padding: 18, boxShadow: "var(--sh-1)" }}>
      <div style={{ fontSize: 11.5, color: "var(--text3)", fontWeight: 700, letterSpacing: "0.03em", textTransform: "uppercase", marginBottom: 10 }}>
        {label}
      </div>
      <TimeframeBars bars={bars} formatter={formatter} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 12, fontSize: 13 }}>
        <div style={{ color: "var(--text2)" }}>
          {formatter(first.value)} → {formatter(last.value)}
        </div>
        {showPct && (
          <div style={{ fontWeight: 800, color: changeColor }}>{pctChange === null ? "—" : pct(pctChange, 2)}</div>
        )}
      </div>
      <div style={{ fontSize: 11.5, color: "var(--text3)", marginTop: 4 }}>
        {storeCount} store{storeCount === 1 ? "" : "s"}
      </div>
    </div>
  );
}

function FilterPanel({ filters, markets, stores, search, setSearch, onToggleMarket, onToggleComp, onToggleStore, onSelectAll, onClearAll, onClose }) {
  const q = search.trim().toLowerCase();
  const bySearch = stores.filter((s) => !q || s.name.toLowerCase().includes(q) || String(s.code).includes(q));

  const narrowedVisible = bySearch.filter((s) => filters.markets.has(s.region) && filters.compFilter.has(compKeyOf(s)));
  const rows = bySearch
    .filter((s) => (filters.markets.has(s.region) && filters.compFilter.has(compKeyOf(s))) || filters.selectedCodes.has(s.code))
    .sort((a, b) => a.code - b.code);

  return (
    <div
      style={{
        position: "absolute",
        top: "calc(100% + 8px)",
        left: 0,
        zIndex: 30,
        width: 360,
        maxWidth: "90vw",
        maxHeight: 520,
        overflowY: "auto",
        background: "var(--surface)",
        border: "1px solid var(--border2)",
        borderRadius: "var(--rl)",
        boxShadow: "var(--sh-3)",
        padding: 18,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 800 }}>Filters</div>
        <button onClick={onClose} aria-label="Close filters" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text3)", padding: 4 }}>
          <Icon name="close" size={15} />
        </button>
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: "var(--text3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.02em", marginBottom: 8 }}>
          Market
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {MARKET_ORDER.filter((m) => markets.includes(m)).map((m) => (
            <label key={m} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12.5, cursor: "pointer" }}>
              <input type="checkbox" checked={filters.markets.has(m)} onChange={() => onToggleMarket(m)} />
              {m}
            </label>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: "var(--text3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.02em", marginBottom: 8 }}>
          Comp / Non-Comp
        </div>
        <div style={{ display: "flex", gap: 14 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12.5, cursor: "pointer" }}>
            <input type="checkbox" checked={filters.compFilter.has("comp")} onChange={() => onToggleComp("comp")} />
            Comp
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12.5, cursor: "pointer" }}>
            <input type="checkbox" checked={filters.compFilter.has("noncomp")} onChange={() => onToggleComp("noncomp")} />
            Non-Comp
          </label>
        </div>
      </div>

      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ fontSize: 11, color: "var(--text3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.02em" }}>
            Stores
          </div>
          <span className="chip chip-mute">
            {filters.selectedCodes.size} of {stores.length} selected
          </span>
        </div>

        <input
          type="text"
          placeholder="Search code or name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: "100%",
            padding: "7px 10px",
            borderRadius: "var(--r)",
            border: "1px solid var(--border2)",
            fontSize: 12.5,
            background: "var(--surface)",
            color: "var(--text)",
            marginBottom: 8,
            boxSizing: "border-box",
          }}
        />

        <div style={{ display: "flex", gap: 10, marginBottom: 4 }}>
          <button
            onClick={() => onSelectAll(narrowedVisible.map((s) => s.code))}
            style={{ background: "none", border: "none", color: "var(--link, #2b6cb0)", fontSize: 12, fontWeight: 700, cursor: "pointer", padding: 0 }}
          >
            Select all
          </button>
          <button
            onClick={() => onClearAll(narrowedVisible.map((s) => s.code))}
            style={{ background: "none", border: "none", color: "var(--link, #2b6cb0)", fontSize: 12, fontWeight: 700, cursor: "pointer", padding: 0 }}
          >
            Clear all
          </button>
        </div>
        <div style={{ fontSize: 10.5, color: "var(--text3)", marginBottom: 8 }}>Applies to the stores currently shown below.</div>

        <div style={{ border: "1px solid var(--border)", borderRadius: "var(--r)", maxHeight: 260, overflowY: "auto" }}>
          {rows.length === 0 && <div style={{ padding: 14, fontSize: 12.5, color: "var(--text3)" }}>No stores match this search.</div>}
          {rows.map((s) => {
            const ticked = filters.selectedCodes.has(s.code);
            const matches = filters.markets.has(s.region) && filters.compFilter.has(compKeyOf(s));
            const reason = !matches ? mismatchReason(s, filters) : "";
            return (
              <label
                key={s.code}
                title={reason ? `Selected and counted, but hidden by the current filter: ${reason}.` : ""}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "7px 10px",
                  borderBottom: "1px solid var(--line)",
                  fontSize: 12.5,
                  cursor: "pointer",
                  opacity: matches ? 1 : 0.45,
                }}
              >
                <input type="checkbox" checked={ticked} onChange={() => onToggleStore(s.code)} />
                <span style={{ color: "var(--text3)", minWidth: 42 }}>{s.code}</span>
                <span style={{ flex: 1, fontWeight: 600 }}>{s.name}</span>
                <span className="chip chip-mute">{s.region}</span>
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function SSSGWeekly() {
  const [weekStart, setWeekStart] = useState(null); // null = let the server pick the current fiscal week
  const [filters, setFiltersState] = useState(() => cloneFilters(_filters));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [errorStatus, setErrorStatus] = useState(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [search, setSearch] = useState("");

  const setFilters = (updater) => {
    setFiltersState((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      _filters = cloneFilters(next);
      return next;
    });
  };

  const storesKey = useMemo(() => [...filters.selectedCodes].sort((a, b) => a - b).join(","), [filters.selectedCodes]);

  useEffect(() => {
    let dead = false;
    setLoading(true);
    setError(null);
    setErrorStatus(null);

    const params = new URLSearchParams();
    if (weekStart) params.set("week", weekStart);
    // Omit `stores` entirely until filters are initialized, so the very
    // first request of the session (before we know the store universe to
    // default-select) gets every active store, unfiltered - see
    // app/api/sssg-weekly/route.js's own comment on this same contract.
    if (filters.initialized) params.set("stores", storesKey);

    fetch(`/api/sssg-weekly?${params.toString()}`)
      .then(async (r) => ({ status: r.status, json: await r.json() }))
      .then(({ status, json }) => {
        if (dead) return;
        if (!json.ok) {
          const err = new Error(json.error || "Failed to load weekly SSSG data");
          err.status = status;
          throw err;
        }
        setData(json);
        if (!filters.initialized) {
          setFilters({
            initialized: true,
            markets: new Set(json.markets),
            compFilter: new Set(["comp", "noncomp"]),
            selectedCodes: new Set(json.stores.map((s) => s.code)),
          });
        }
      })
      .catch((e) => {
        if (dead) return;
        setError(e.message);
        setErrorStatus(e.status || null);
      })
      .finally(() => !dead && setLoading(false));

    return () => {
      dead = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart, filters.initialized, storesKey]);

  if (loading && !data) return <div className="empty">Loading weekly SSSG…</div>;

  if (error) {
    if (errorStatus === 403) {
      return (
        <div className="empty">
          <div className="empty-title">Access restricted</div>
          Your access does not allow viewing Weekly SSSG.
        </div>
      );
    }
    if (errorStatus === 401) {
      return (
        <div className="empty">
          <div className="empty-title">Signed out</div>
          Your session expired. Sign in again.
        </div>
      );
    }
    return (
      <div className="empty">
        <div className="empty-title">Couldn't load Weekly SSSG</div>
        {error}
      </div>
    );
  }

  if (!data) return <div className="empty">No data yet.</div>;

  const noStoresSelected = filters.initialized && filters.selectedCodes.size === 0;
  const weekRangeLabel = `${fmtDate(data.weekStart)} – ${fmtDate(data.weekEnd)}`;
  const priorWeekRangeLabel = `${fmtDate(data.priorWeekStart)} – ${fmtDate(data.priorWeekEnd)}`;

  return (
    <div className="shift-dense" style={{ opacity: loading ? 0.55 : 1, transition: "opacity 120ms var(--ease)" }}>
      <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 14, marginBottom: 16, flexWrap: "wrap" }}>
        <button
          onClick={() => setFilterOpen((o) => !o)}
          aria-expanded={filterOpen}
          title="Filters"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 34,
            height: 34,
            borderRadius: "var(--r)",
            border: "1px solid var(--border2)",
            background: filterOpen ? "var(--surface-2)" : "var(--surface)",
            color: "var(--text)",
            cursor: "pointer",
          }}
        >
          <Icon name="funnel" size={17} />
        </button>

        {filterOpen && (
          <FilterPanel
            filters={filters}
            markets={data.markets}
            stores={data.stores}
            search={search}
            setSearch={setSearch}
            onToggleMarket={(m) =>
              setFilters((f) => {
                const next = new Set(f.markets);
                next.has(m) ? next.delete(m) : next.add(m);
                return { ...f, markets: next };
              })
            }
            onToggleComp={(key) =>
              setFilters((f) => {
                const next = new Set(f.compFilter);
                next.has(key) ? next.delete(key) : next.add(key);
                return { ...f, compFilter: next };
              })
            }
            onToggleStore={(code) =>
              setFilters((f) => {
                const next = new Set(f.selectedCodes);
                next.has(code) ? next.delete(code) : next.add(code);
                return { ...f, selectedCodes: next };
              })
            }
            onSelectAll={(codes) =>
              setFilters((f) => ({ ...f, selectedCodes: new Set([...f.selectedCodes, ...codes]) }))
            }
            onClearAll={(codes) =>
              setFilters((f) => {
                const next = new Set(f.selectedCodes);
                codes.forEach((c) => next.delete(c));
                return { ...f, selectedCodes: next };
              })
            }
            onClose={() => setFilterOpen(false)}
          />
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button
            onClick={() => setWeekStart(addDays(data.weekStart, -7))}
            style={{ background: "none", border: "1px solid var(--border2)", borderRadius: "var(--r)", width: 28, height: 28, cursor: "pointer", color: "var(--text)" }}
          >
            <Icon name="left" size={14} />
          </button>
          <div style={{ fontWeight: 700, fontSize: 13, minWidth: 170, textAlign: "center" }}>{weekRangeLabel}</div>
          <button
            onClick={() => setWeekStart(addDays(data.weekStart, 7))}
            style={{ background: "none", border: "1px solid var(--border2)", borderRadius: "var(--r)", width: 28, height: 28, cursor: "pointer", color: "var(--text)" }}
          >
            <Icon name="right" size={14} />
          </button>
        </div>

        <div style={{ marginLeft: "auto", fontSize: 12.5, color: "var(--text3)", fontWeight: 700 }}>
          Stores polled: {data.totals.comparable.storeCount} / {data.stores.length}
        </div>

        {loading && <span style={{ fontSize: 12, color: "var(--text3)" }}>Refreshing…</span>}
      </div>

      <div style={{ fontSize: 13, color: "var(--text2)", marginBottom: 20 }}>
        {weekRangeLabel} vs {priorWeekRangeLabel} (prior year)
      </div>

      {noStoresSelected ? (
        <div className="empty" style={{ padding: "40px 0" }}>
          <div className="empty-title">No stores selected</div>
          Tick at least one store in the filter panel to see Weekly SSSG.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
          <SummaryBlock
            label="Total Comp Sales"
            bars={[
              { label: "Prior yr", value: data.totals.comparable.salesPrior },
              { label: "Current wk", value: data.totals.comparable.salesCurrent },
            ]}
            pctChange={data.totals.comparable.salesSSSGPct}
            storeCount={data.totals.comparable.storeCount}
            formatter={money}
          />
          <SummaryBlock
            label="Total System Sales"
            bars={[
              { label: "Prior yr", value: data.totals.system.salesPrior },
              { label: "Current wk", value: data.totals.system.salesCurrent },
            ]}
            storeCount={data.totals.system.storeCount}
            formatter={money}
          />
          <SummaryBlock
            label="Total Comp Transactions"
            bars={[
              { label: "Prior yr", value: data.totals.comparable.txnsPrior },
              { label: "Current wk", value: data.totals.comparable.txnsCurrent },
            ]}
            pctChange={data.totals.comparable.txnGrowthPct}
            storeCount={data.totals.comparable.storeCount}
            formatter={int}
          />
        </div>
      )}
    </div>
  );
}
