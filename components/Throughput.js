"use client";

import { useState, useEffect } from "react";

const GROUP_STRUCTURE = {
  "TX-TN": [
    { label: "DFW", regions: ["DFW"] },
    { label: "HTX", regions: ["HTX"] },
    { label: "ATX & NSH & SATX", regions: ["ATX", "NSH", "SATX"] },
  ],
  "CA-AZ": [
    { label: "AZ", regions: ["AZ"] },
    { label: "CA", regions: ["CA"] },
  ],
};

function num(n, dec = 2) {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function int(n) {
  if (n === null || n === undefined) return "—";
  return Math.round(n).toLocaleString("en-US");
}

function addDays(iso, n) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function prettyDate(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T12:00:00Z");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export default function Throughput() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [weekStart, setWeekStart] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const url = weekStart ? `/api/throughput?weekStart=${weekStart}` : "/api/throughput";

    fetch(url)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (!j.ok) throw new Error(j.error || "Unknown error");
        setData(j);
        if (!weekStart) setWeekStart(j.weekStart);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e.message);
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [weekStart]);

  function groupedSections(rows) {
    const sections = [];
    for (const grp of Object.keys(GROUP_STRUCTURE)) {
      GROUP_STRUCTURE[grp].forEach((rDef) => {
        const list = rows.filter((r) => r.grp === grp && rDef.regions.includes(r.region));
        if (list.length) sections.push({ label: rDef.label, stores: list });
      });
    }
    return sections;
  }

  if (loading && !data) {
    return <div className="empty">Loading throughput...</div>;
  }

  if (error) {
    return (
      <div className="empty">
        <div style={{ fontWeight: 700, color: "var(--red)" }}>Could not load throughput</div>
        <div>{error}</div>
        <div style={{ fontSize: 11.5, maxWidth: 420 }}>
          If this says daily_transactions does not exist, the table has not been
          created yet. This view is new and does not affect any other report.
        </div>
      </div>
    );
  }

  const rows = data?.rows || [];
  const sections = groupedSections(rows);
  const missing = rows.filter((r) => !r.hasTxnData);
  const partial = rows.filter((r) => r.hasTxnData && r.daysWithTxn < r.daysInWeek);
  const totalTxn = rows.reduce((a, r) => a + r.transactions, 0);

  const rank = {};
  rows.filter((r) => r.tplh !== null).forEach((r, i) => { rank[r.code] = i + 1; });

  function vsClass(pct) {
    if (pct === null || pct === undefined) return "num cell-dim";
    if (pct > 5) return "num cell-ok";
    if (pct < -5) return "num cell-bad";
    return "num";
  }

  function vsText(pct) {
    if (pct === null || pct === undefined) return "—";
    return (pct > 0 ? "+" : "") + num(pct, 1) + "%";
  }

  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 15,
          flexWrap: "wrap",
        }}
      >
        <button className="btn btn-sm" onClick={() => setWeekStart(addDays(data.weekStart, -7))}>
          ← Prev
        </button>
        <div
          style={{
            background: "var(--navy)",
            color: "#fff",
            padding: "8px 16px",
            borderRadius: "var(--rl)",
            fontSize: 13,
          }}
        >
          <span style={{ fontWeight: 700 }}>
            {prettyDate(data.weekStart)} – {prettyDate(data.weekEnd)}
          </span>
          <div style={{ fontSize: 10.5, opacity: 0.7, marginTop: 2 }}>
            Week starting {data.weekStart}
          </div>
        </div>
        <button className="btn btn-sm" onClick={() => setWeekStart(addDays(data.weekStart, 7))}>
          Next →
        </button>
        {loading && <span className="badge b-neutral">Refreshing…</span>}
      </div>

      <div className="mc-grid">
        <div className="mc">
          <div className="mc-l">Company TPLH</div>
          <div className="mc-v">{num(data.companyTplh)}</div>
          <div className="mc-s">Transactions per labor hour</div>
        </div>
        <div className="mc">
          <div className="mc-l">Stores Reporting</div>
          <div className="mc-v">
            {data.storesReporting} <span style={{ fontSize: 15, color: "var(--text3)" }}>/ {data.storesTotal}</span>
          </div>
          <div className="mc-s">
            {data.storesReporting === data.storesTotal
              ? "All stores have transaction data"
              : `${data.storesTotal - data.storesReporting} missing transaction data`}
          </div>
        </div>
        <div className="mc">
          <div className="mc-l">Total Transactions</div>
          <div className="mc-v">{int(totalTxn)}</div>
          <div className="mc-s">Closed checks this week</div>
        </div>
      </div>

      {missing.length > 0 && (
        <div className="warnbox">
          <span>⚠️</span>
          <div>
            <strong>No transaction data ({missing.length}):</strong>{" "}
            {missing.map((m) => m.name).join(", ")}.
            <div style={{ marginTop: 3, opacity: 0.85 }}>
              These stores show no TPLH rather than a zero. Transaction counts are
              only stored from the day this feature was deployed, so earlier weeks
              stay blank until a backfill is run.
            </div>
          </div>
        </div>
      )}

      {partial.length > 0 && (
        <div className="infobox">
          <span>ℹ️</span>
          <div>
            <strong>Partial week ({partial.length}):</strong>{" "}
            {partial.map((p) => `${p.name} (${p.daysWithTxn}/${p.daysInWeek}d)`).join(", ")}.
            TPLH is still accurate for the days present, but is not comparable to a
            full week.
          </div>
        </div>
      )}

      <div className="tcard desktop-table">
        <div className="thead">
          <span className="ttl">Throughput by Store</span>
          <span className="badge b-info">TPLH = transactions ÷ labor hours</span>
        </div>
        <div className="scx">
          <table className="grid">
            <thead>
              <tr>
                <th style={{ width: 40 }} className="r">#</th>
                <th>Location Name</th>
                <th className="r">TPLH</th>
                <th className="r">vs Company</th>
                <th className="r">Transactions</th>
                <th className="r">Hours</th>
                <th className="r" style={{ borderLeft: "2px solid #999" }}>Avg Ticket</th>
                <th className="r">Sales</th>
                <th className="r">SPLH</th>
                <th className="r">Target</th>
              </tr>
            </thead>
            <tbody>
              {sections.map((section) => (
                <>
                  <tr className="rrow" key={"h-" + section.label}>
                    <td colSpan={10}>{section.label}</td>
                  </tr>
                  {section.stores.map((s) => (
                    <tr key={s.code}>
                      <td className="num cell-dim">{rank[s.code] || "—"}</td>
                      <td>
                        <div className="lc-code">
                          {s.code}
                          {!s.hasTxnData && (
                            <span title="No transaction data this week" style={{ marginLeft: 5 }}>⚠️</span>
                          )}
                        </div>
                        <div className="lc-name">{s.name}</div>
                      </td>
                      <td className={vsClass(s.vsCompanyPct)} style={{ fontSize: 13 }}>
                        {num(s.tplh)}
                      </td>
                      <td className={vsClass(s.vsCompanyPct)}>{vsText(s.vsCompanyPct)}</td>
                      <td className="num">{int(s.transactions)}</td>
                      <td className="num">{num(s.hours, 1)}</td>
                      <td className="num" style={{ borderLeft: "2px solid #999" }}>
                        {s.avgTicket === null ? "—" : "$" + num(s.avgTicket)}
                      </td>
                      <td className="num">{s.sales ? "$" + int(s.sales) : "—"}</td>
                      <td className="num">{s.splh === null ? "—" : "$" + num(s.splh, 0)}</td>
                      <td className="num cell-dim">${s.target}</td>
                    </tr>
                  ))}
                </>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mobile-cards">
        {sections.map((section) => (
          <div key={"m-" + section.label}>
            <div className="scard-region-head">{section.label}</div>
            {section.stores.map((s) => {
              const good = s.vsCompanyPct !== null && s.vsCompanyPct > 5;
              const bad = s.vsCompanyPct !== null && s.vsCompanyPct < -5;
              return (
                <div className={"store-card " + (bad ? "bad" : good ? "ok" : "")} key={"mc-" + s.code}>
                  <div className="store-card-head">
                    <div>
                      <div className="store-card-code">
                        {rank[s.code] ? `#${rank[s.code]} · ` : ""}{s.code}
                      </div>
                      <div className="store-card-name">{s.name}</div>
                    </div>
                    <div
                      className="store-card-splh"
                      style={{
                        background: good ? "var(--cell-green-bg)" : bad ? "var(--cell-red-bg)" : "var(--bg3)",
                        color: good ? "var(--cell-green-t)" : bad ? "var(--cell-red-t)" : "var(--text)",
                      }}
                    >
                      {num(s.tplh)}
                      <div style={{ fontSize: 9, fontWeight: 700, opacity: 0.6, textAlign: "center", marginTop: -2 }}>
                        TPLH
                      </div>
                    </div>
                  </div>

                  <div className="scard-block">
                    <div className="scard-block-label">
                      Throughput {s.vsCompanyPct !== null && `· ${vsText(s.vsCompanyPct)} vs company`}
                    </div>
                    <div className="scard-row">
                      <div className="scard-cell">
                        <div className="scard-cell-lbl">Transactions</div>
                        <div className="scard-cell-val">{int(s.transactions)}</div>
                      </div>
                      <div className="scard-cell">
                        <div className="scard-cell-lbl">Hours</div>
                        <div className="scard-cell-val">{num(s.hours, 1)}</div>
                      </div>
                      <div className="scard-cell">
                        <div className="scard-cell-lbl">Avg Ticket</div>
                        <div className="scard-cell-val">
                          {s.avgTicket === null ? "—" : "$" + num(s.avgTicket)}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="scard-block">
                    <div className="scard-block-label">Sales context</div>
                    <div className="scard-row">
                      <div className="scard-cell">
                        <div className="scard-cell-lbl">Sales</div>
                        <div className="scard-cell-val">{s.sales ? "$" + int(s.sales) : "—"}</div>
                      </div>
                      <div className="scard-cell">
                        <div className="scard-cell-lbl">SPLH</div>
                        <div className="scard-cell-val">
                          {s.splh === null ? "—" : "$" + num(s.splh, 0)}
                        </div>
                      </div>
                      <div className="scard-cell">
                        <div className="scard-cell-lbl">Target</div>
                        <div className="scard-cell-val">${s.target}</div>
                      </div>
                    </div>
                  </div>

                  {!s.hasTxnData && (
                    <div style={{ fontSize: 11, color: "var(--amber)", marginTop: 6 }}>
                      ⚠️ No transaction data this week
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className="infobox" style={{ marginTop: 15, marginBottom: 0 }}>
        <span>ℹ️</span>
        <div>
          <strong>TPLH</strong> counts closed checks divided by labor hours. Unlike
          SPLH it does not move when prices change or when average ticket runs high,
          so it compares stores on throughput rather than on dollars. Labor hours use
          the same exclusions as the Week View: NSO Trainer, General Manager, and the
          excluded employee list. Open shifts count elapsed time, capped at 18 hours.
          Generated {data?.generatedAt ? new Date(data.generatedAt).toLocaleString() : ""}.
        </div>
      </div>
    </>
  );
}