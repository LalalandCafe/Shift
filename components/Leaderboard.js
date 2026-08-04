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

const MEDALS = ["🥇", "🥈", "🥉"];

function efficiency(row) {
  const h = row.wtd.hours;
  if (!h || h <= 0) return null;
  return ((h + row.wtd.overUnder) / h) * 100;
}

function ServiceTag({ svc }) {
  if (!svc || svc.service === "ok" || svc.service === "unknown") return null;
  const map = {
    flagged: { bg: "#fdf0ee", color: "#9c0006", label: "Service" },
    watch: { bg: "#fdf5e6", color: "#9a5e0a", label: "Watch" },
    unreliable: { bg: "var(--bg3)", color: "var(--text2)", label: "KDS data" },
  };
  const s = map[svc.service];
  if (!s) return null;
  return (
    <span
      title={svc.serviceNote || ""}
      style={{
        display: "inline-flex", alignItems: "center", fontSize: 9, fontWeight: 700,
        letterSpacing: ".04em", textTransform: "uppercase", padding: "2px 7px",
        borderRadius: 100, background: s.bg, color: s.color, flexShrink: 0, marginLeft: 6,
      }}
    >
      {s.label}
    </span>
  );
}

function PodiumRow({ s, rank }) {
  const color = s.eff >= 100 ? "#1a6630" : "#9c0006";
  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
        borderRadius: 10, marginBottom: 8,
        background: rank === 1 ? "#f2f9f3" : "var(--bg3)",
        border: rank === 1 ? "1.5px solid #1a6630" : "1.5px solid transparent",
      }}
    >
      <div style={{ fontSize: 20, width: 26, textAlign: "center", flexShrink: 0 }}>
        {MEDALS[rank - 1]}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {s.name}
          <ServiceTag svc={s.svc} />
        </div>
        <div style={{ fontSize: 10, color: "var(--text3)" }}>
          ${s.wtd.splh} SPLH &middot; target ${s.day.target}
          {s.svc && s.svc.medianMin !== null ? ` · ${s.svc.medianMin} min tickets` : ""}
        </div>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color }}>{Math.round(s.eff)}%</div>
        <div style={{ fontSize: 9, color: "var(--text3)", fontWeight: 700, letterSpacing: ".03em" }}>
          VS TARGET
        </div>
      </div>
    </div>
  );
}

function CompactRow({ s, rank }) {
  const color = s.eff >= 100 ? "#1a6630" : "#9c0006";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 12px", fontSize: 12 }}>
      <div style={{ width: 26, textAlign: "center", color: "var(--text3)", fontWeight: 700, fontSize: 11, flexShrink: 0 }}>
        {rank}
      </div>
      <div style={{ flex: 1, minWidth: 0, color: "var(--text2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {s.name}
        <ServiceTag svc={s.svc} />
      </div>
      <div style={{ fontWeight: 700, color, flexShrink: 0 }}>{Math.round(s.eff)}%</div>
    </div>
  );
}

// Fila para los que quedaron fuera del podio por servicio
function DisqualifiedRow({ s }) {
  return (
    <div
      style={{
        display: "flex", alignItems: "flex-start", gap: 10, padding: "9px 12px",
        borderRadius: 9, marginBottom: 6, background: "#fdf0ee",
        border: "1px solid #f5b3ab",
      }}
    >
      <div style={{ fontSize: 13, flexShrink: 0, lineHeight: 1.4 }}>⏱</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700 }}>
          {s.name}
          <span style={{ fontWeight: 600, color: "var(--text3)", marginLeft: 7 }}>
            {Math.round(s.eff)}% vs target
          </span>
        </div>
        <div style={{ fontSize: 10.5, color: "#9c0006", marginTop: 2 }}>
          {s.svc.serviceNote}
        </div>
      </div>
    </div>
  );
}

function Board({ title, stores }) {
  const [expanded, setExpanded] = useState(false);

  const eligible = stores.filter((s) => !s.svc || s.svc.service !== "flagged");
  const disqualified = stores.filter((s) => s.svc && s.svc.service === "flagged");

  const top = eligible.slice(0, 3);
  const rest = eligible.slice(3);

  return (
    <div className="tcard">
      <div className="thead" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span className="ttl">{title}</span>
        <span style={{ fontSize: 11, color: "var(--text3)", fontWeight: 600 }}>
          {stores.length} stores
        </span>
      </div>
      <div style={{ padding: "12px 12px" }}>
        {top.map((s, i) => (
          <PodiumRow key={s.code} s={s} rank={i + 1} />
        ))}

        {rest.length > 0 && (
          <>
            {expanded && (
              <div style={{ marginTop: 10, borderTop: "1px solid var(--border2)", paddingTop: 8 }}>
                {rest.map((s, i) => (
                  <CompactRow key={s.code} s={s} rank={i + 4} />
                ))}
              </div>
            )}
            <button
              onClick={() => setExpanded(!expanded)}
              style={{
                width: "100%", marginTop: 10, padding: "8px 0", borderRadius: 8,
                border: "1.5px solid var(--border2)", background: "#fff", cursor: "pointer",
                fontFamily: "inherit", fontSize: 12, fontWeight: 600, color: "var(--text2)",
              }}
            >
              {expanded ? "Show top 3 only" : `Show all ${eligible.length}`}
            </button>
          </>
        )}

        {disqualified.length > 0 && (
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--border2)" }}>
            <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".07em", textTransform: "uppercase", color: "var(--text3)", marginBottom: 7 }}>
              Not eligible this week
            </div>
            {disqualified.map((s) => (
              <DisqualifiedRow key={s.code} s={s} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Leaderboard({ report }) {
  const [svcByCode, setSvcByCode] = useState({});
  const [companyMedian, setCompanyMedian] = useState(null);

  useEffect(() => {
    if (!report || !report.date) return;
    fetch(`/api/kitchen-week?date=${report.date}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.ok) return;
        const map = {};
        (d.stores || []).forEach((s) => { map[s.code] = s; });
        setSvcByCode(map);
        setCompanyMedian(d.companyMedianMin);
      })
      .catch(() => {});
  }, [report?.date]);

  if (!report || !report.rows) {
    return <div className="empty">Cargando...</div>;
  }

  const all = report.rows
    .map((r) => ({ ...r, eff: efficiency(r), svc: svcByCode[r.code] || null }))
    .filter((r) => r.eff !== null)
    .sort((a, b) => b.eff - a.eff);

  if (!all.length) {
    return <div className="empty">Sin datos para esta fecha.</div>;
  }

  const sections = [];
  for (const grp of Object.keys(GROUP_STRUCTURE)) {
    GROUP_STRUCTURE[grp].forEach((rDef) => {
      const list = all.filter((r) => r.grp === grp && rDef.regions.includes(r.region));
      if (list.length) sections.push({ label: rDef.label, stores: list });
    });
  }

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <div style={{ background: "var(--navy)", color: "#fff", padding: "10px 14px", borderRadius: 10, fontSize: 13 }}>
          <span style={{ fontWeight: 700 }}>Week {report.weekNum} Leaderboard</span>
          <div style={{ fontSize: 10.5, opacity: 0.8, marginTop: 2 }}>
            Through {report.dayName}, {report.date}
            {report.isLive ? " · LIVE" : ""}
          </div>
        </div>
        <div style={{ fontSize: 11.5, color: "var(--text3)", marginTop: 8, lineHeight: 1.5 }}>
          Ranked by labor efficiency: the hours your target allowed, divided by the hours you
          actually used. Over 100% means you hit your sales with fewer hours than budgeted.
          Every store is measured against its own target, so different targets compete fairly.
          {companyMedian !== null && (
            <>
              {" "}A store is not eligible for the podium if its kitchen ticket times run far above
              the company median of {companyMedian} min, so nobody wins by cutting service.
            </>
          )}
        </div>
      </div>

      <div style={{ marginBottom: 20 }}>
        <Board title="All Stores" stores={all} />
      </div>

      <div
        style={{
          display: "grid",
          gap: 16,
          gridTemplateColumns: "repeat(auto-fit, minmax(min(300px, 100%), 1fr))",
        }}
      >
        {sections.map((sec) => (
          <Board key={sec.label} title={sec.label} stores={sec.stores} />
        ))}
      </div>
    </>
  );
}