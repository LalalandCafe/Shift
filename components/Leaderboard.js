"use client";

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

function Row({ s, rank, compact }) {
  const medal = rank <= 3 ? MEDALS[rank - 1] : null;
  const color = s.eff >= 100 ? "#1a6630" : "#9c0006";

  if (compact) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "5px 12px", fontSize: 12 }}>
        <div style={{ width: 28, textAlign: "center", color: "var(--text3)", fontWeight: 700, fontSize: 11 }}>
          {rank}
        </div>
        <div style={{ flex: 1, minWidth: 0, color: "var(--text2)" }}>{s.name}</div>
        <div style={{ fontWeight: 700, color }}>{Math.round(s.eff)}%</div>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 12px",
        borderRadius: 10,
        marginBottom: 8,
        background: rank === 1 ? "#f2f9f3" : "var(--bg3)",
        border: rank === 1 ? "1.5px solid #1a6630" : "1.5px solid transparent",
      }}
    >
      <div style={{ fontSize: 22, width: 28, textAlign: "center" }}>{medal}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700 }}>{s.name}</div>
        <div style={{ fontSize: 10.5, color: "var(--text3)" }}>
          {s.code} &middot; ${s.wtd.splh} SPLH &middot; target ${s.day.target}
        </div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ fontSize: 17, fontWeight: 800, color }}>{Math.round(s.eff)}%</div>
        <div style={{ fontSize: 9.5, color: "var(--text3)", fontWeight: 700, letterSpacing: ".04em" }}>
          VS TARGET
        </div>
      </div>
    </div>
  );
}

export default function Leaderboard({ report }) {
  if (!report || !report.rows) {
    return <div className="empty">Cargando...</div>;
  }

  const all = report.rows
    .map((r) => ({ ...r, eff: efficiency(r) }))
    .filter((r) => r.eff !== null)
    .sort((a, b) => b.eff - a.eff);

  const sections = [];
  for (const grp of Object.keys(GROUP_STRUCTURE)) {
    GROUP_STRUCTURE[grp].forEach((rDef) => {
      const list = all.filter((r) => r.grp === grp && rDef.regions.includes(r.region));
      if (list.length) sections.push({ label: rDef.label, stores: list });
    });
  }

  return (
    <>
      <div style={{ marginBottom: 18 }}>
        <div style={{ background: "var(--navy)", color: "#fff", padding: "10px 16px", borderRadius: 10, display: "inline-block", fontSize: 13 }}>
          <span style={{ fontWeight: 700 }}>Week {report.weekNum} Leaderboard</span>
          <span style={{ opacity: 0.85 }}> &middot; through {report.dayName}, {report.date}</span>
        </div>
        <div style={{ fontSize: 11.5, color: "var(--text3)", marginTop: 8, maxWidth: 620 }}>
          Ranked by labor efficiency: hours the target called for, divided by hours actually used.
          Over 100% means the store hit its sales with fewer hours than budgeted. Each store is
          measured against its own target, so stores with different targets compete fairly.
        </div>
      </div>

      <div className="tcard" style={{ marginBottom: 22 }}>
        <div className="thead">
          <span className="ttl">All Stores</span>
          <span style={{ float: "right", fontSize: 11, color: "var(--text3)", fontWeight: 600 }}>
            {all.length} stores
          </span>
        </div>
        <div style={{ padding: "12px 14px" }}>
          {all.slice(0, 3).map((s, i) => (
            <Row key={s.code} s={s} rank={i + 1} />
          ))}
          {all.length > 3 && (
            <div style={{ marginTop: 12, borderTop: "1px solid var(--border2)", paddingTop: 10 }}>
              {all.slice(3).map((s, i) => (
                <Row key={s.code} s={s} rank={i + 4} compact />
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: "grid", gap: 18, gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))" }}>
        {sections.map((sec) => (
          <div className="tcard" key={sec.label}>
            <div className="thead">
              <span className="ttl">{sec.label}</span>
              <span style={{ float: "right", fontSize: 11, color: "var(--text3)", fontWeight: 600 }}>
                {sec.stores.length} stores
              </span>
            </div>
            <div style={{ padding: "12px 14px" }}>
              {sec.stores.slice(0, 3).map((s, i) => (
                <Row key={s.code} s={s} rank={i + 1} />
              ))}
              {sec.stores.length > 3 && (
                <div style={{ marginTop: 12, borderTop: "1px solid var(--border2)", paddingTop: 10 }}>
                  {sec.stores.slice(3).map((s, i) => (
                    <Row key={s.code} s={s} rank={i + 4} compact />
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}