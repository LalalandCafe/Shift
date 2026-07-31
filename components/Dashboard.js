"use client";

import { useState, useEffect } from "react";

const SEV = {
  data: { bg: "#fdf5e6", border: "#f5d48a", color: "#9a5e0a", icon: "⚠️" },
  critical: { bg: "#fdf0ee", border: "#f5b3ab", color: "#b83228", icon: "🔴" },
  warning: { bg: "#f7f7f5", border: "#ccccc6", color: "#5f5f5c", icon: "🟡" },
};

function Stat({ label, value, sub, color }) {
  return (
    <div className="mc">
      <div className="mc-l">{label}</div>
      <div className="mc-v" style={color ? { color } : undefined}>{value}</div>
      {sub && <div className="mc-s">{sub}</div>}
    </div>
  );
}

function TrendRow({ t }) {
  const up = t.delta > 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", fontSize: 12.5, borderBottom: "1px solid var(--border)" }}>
      <div style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {t.name}
      </div>
      <div style={{ fontFamily: "monospace", fontSize: 11.5, color: "var(--text3)", flexShrink: 0 }}>
        ${t.prior} → ${t.current}
      </div>
      <div style={{ fontWeight: 700, color: up ? "#1a6630" : "#9c0006", minWidth: 48, textAlign: "right", flexShrink: 0 }}>
        {up ? "▲" : "▼"} {Math.abs(t.delta)}
      </div>
    </div>
  );
}

export default function Dashboard({ isoDate }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (!isoDate) return;
    setLoading(true);
    setErr(null);
    fetch(`/api/dashboard?date=${isoDate}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.ok) setErr(d.error);
        else setData(d);
        setLoading(false);
      })
      .catch((e) => { setErr(String(e)); setLoading(false); });
  }, [isoDate]);

  if (loading) return <div className="empty">Loading dashboard...</div>;
  if (err) return <div className="empty">Error: {err}</div>;
  if (!data) return <div className="empty">No data.</div>;

  const t = data.trend;
  const total = data.counts.data + data.counts.critical + data.counts.warning;
  const urgent = data.counts.data + data.counts.critical;

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <div style={{ background: "var(--navy)", color: "#fff", padding: "9px 15px", borderRadius: 10, fontSize: 13, display: "inline-block" }}>
          <span style={{ fontWeight: 700 }}>Week {data.weekNum} · {data.dayName}</span>
          <div style={{ fontSize: 10.5, opacity: 0.8, marginTop: 2 }}>
            {data.date} · Period {data.period}
            {data.isLive && data.lastSyncAt
              ? " · LIVE as of " + new Date(data.lastSyncAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
              : ""}
          </div>
        </div>
        {data.isLive && (
          <div style={{ fontSize: 11.5, color: "var(--text3)", marginTop: 8, maxWidth: 640, lineHeight: 1.5 }}>
            Today is still in progress, so numbers keep moving. Performance flags use week-to-date
            instead of a single day, which is far more stable this early.
          </div>
        )}
      </div>

      <div className="mc-grid">
        <Stat
          label="Needs attention"
          value={urgent}
          sub={`${data.counts.warning} more to watch · ${data.storeCount} stores`}
          color={urgent > 0 ? "#b83228" : "#1a6630"}
        />
        <Stat
          label="Blended WTD SPLH"
          value={"$" + t.blendedCurrent}
          sub={t.blendedPrior !== null ? `vs $${t.blendedPrior} same point last week` : "no prior week to compare"}
        />
        <Stat
          label="Week over week"
          value={
            t.blendedDelta === null
              ? "—"
              : (t.blendedDelta > 0 ? "▲ " : t.blendedDelta < 0 ? "▼ " : "") + "$" + Math.abs(t.blendedDelta)
          }
          sub={t.priorWeekNum ? `vs Week ${t.priorWeekNum}` : "needs prior week data"}
          color={t.blendedDelta === null ? undefined : t.blendedDelta >= 0 ? "#1a6630" : "#b83228"}
        />
      </div>

      <div className="tcard">
        <div className="thead">
          <span className="ttl">Needs attention</span>
          <span style={{ fontSize: 11, color: "var(--text3)", fontWeight: 600 }}>
            {total} item{total === 1 ? "" : "s"}
          </span>
        </div>
        {total === 0 ? (
          <div className="empty" style={{ padding: 34 }}>
            ✓ Every store is at or above target and all data synced.
          </div>
        ) : (
          <div style={{ padding: "10px 12px" }}>
            {data.exceptions.map((e, i) => {
              const s = SEV[e.severity];
              return (
                <div
                  key={e.code + "-" + i}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 10,
                    padding: "10px 12px",
                    borderRadius: 9,
                    marginBottom: 7,
                    background: s.bg,
                    border: "1px solid " + s.border,
                  }}
                >
                  <div style={{ fontSize: 14, flexShrink: 0, lineHeight: 1.3 }}>{s.icon}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{e.name}</div>
                    <div style={{ fontSize: 12, color: s.color, marginTop: 1 }}>{e.label}</div>
                    <div style={{ fontSize: 10.5, color: "var(--text3)", marginTop: 2 }}>{e.detail}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {t.comparable > 0 ? (
        <div
          style={{
            display: "grid",
            gap: 16,
            gridTemplateColumns: "repeat(auto-fit, minmax(min(300px, 100%), 1fr))",
            marginTop: 16,
            maxWidth: 900,
          }}
        >
          <div className="tcard" style={{ marginTop: 0 }}>
            <div className="thead"><span className="ttl">Biggest declines</span></div>
            {t.declining.length ? (
              <div>{t.declining.map((x) => <TrendRow key={x.code} t={x} />)}</div>
            ) : (
              <div className="empty" style={{ padding: 26 }}>No stores declined.</div>
            )}
          </div>
          <div className="tcard" style={{ marginTop: 0 }}>
            <div className="thead"><span className="ttl">Biggest gains</span></div>
            {t.improving.length ? (
              <div>{t.improving.map((x) => <TrendRow key={x.code} t={x} />)}</div>
            ) : (
              <div className="empty" style={{ padding: 26 }}>No stores improved.</div>
            )}
          </div>
        </div>
      ) : (
        <div className="tcard">
          <div className="thead"><span className="ttl">Week over week</span></div>
          <div className="empty" style={{ padding: 30 }}>
            Not enough history yet. Needs the same weekday from the prior week.
          </div>
        </div>
      )}
    </>
  );
}