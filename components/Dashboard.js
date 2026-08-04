"use client";

import { useState, useEffect } from "react";
import WeekOverWeekChart from "./WeekOverWeekChart";
import EfficiencyQuadrant from "./EfficiencyQuadrant";

const SEV_LABEL = { data: "Data issue", critical: "Critical", warning: "Watch" };

function ExceptionRow({ e }) {
  return (
    <div className={"dash-row sev-" + e.severity}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="dash-row-name">{e.name}</div>
        <div
          className="dash-row-label"
          style={{ color: e.severity === "critical" ? "#9c0006" : e.severity === "data" ? "#9a5e0a" : "var(--text2)" }}
        >
          {e.label}
        </div>
        <div className="dash-row-detail">{e.detail}</div>
      </div>
      <span
        className="dash-chip"
        style={{
          background: e.severity === "critical" ? "#fdf0ee" : e.severity === "data" ? "#fdf5e6" : "var(--bg3)",
          color: e.severity === "critical" ? "#9c0006" : e.severity === "data" ? "#9a5e0a" : "var(--text2)",
        }}
      >
        {SEV_LABEL[e.severity]}
      </span>
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
  const urgent = data.counts.critical + data.counts.data;
  const total = urgent + data.counts.warning;
  const clean = total === 0;

  return (
    <>
      <div className={"dash-hero " + (clean ? "clear" : "alert")} style={{ marginBottom: 18 }}>
        <div className="dash-hero-icon">{clean ? "✓" : "⚠️"}</div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div className="dash-hero-num" style={clean ? { color: "#1a6630" } : undefined}>
            {clean ? "All clear" : urgent + (urgent === 1 ? " store needs" : " stores need") + " attention"}
          </div>
          <div className="dash-hero-sub" style={clean ? { color: "var(--text2)", opacity: 1 } : undefined}>
            {clean
              ? `Every one of ${data.storeCount} stores is at or above target, and every sync came through clean.`
              : `${data.counts.critical} critical, ${data.counts.data} with missing data, and ${data.counts.warning} worth a look, out of ${data.storeCount} stores.`}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              opacity: clean ? 0.7 : 0.75,
              textTransform: "uppercase",
              letterSpacing: ".05em",
              color: clean ? "var(--text2)" : undefined,
            }}
          >
            Week {data.weekNum} &middot; {data.dayName}
          </div>
          <div style={{ fontSize: 10.5, opacity: clean ? 0.55 : 0.65, marginTop: 2 }}>
            {data.isLive && data.lastSyncAt
              ? "Live · updated " + new Date(data.lastSyncAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
              : "Period " + data.period}
          </div>
        </div>
      </div>

      <div className="mc-grid">
        <div className="mc">
          <div className="mc-l">Blended WTD SPLH</div>
          <div className="mc-v" style={{ fontSize: 32 }}>${t.blendedCurrent}</div>
          <div className="mc-s">
            {t.blendedPrior !== null ? `$${t.blendedPrior} same point last week` : "no prior week to compare"}
          </div>
        </div>
        <div className="mc">
          <div className="mc-l">Week over week</div>
          <div
            className="mc-v"
            style={{ fontSize: 32, color: t.blendedDelta === null ? undefined : t.blendedDelta >= 0 ? "#1a6630" : "#9c0006" }}
          >
            {t.blendedDelta === null ? "—" : (t.blendedDelta >= 0 ? "+" : "") + t.blendedDelta}
          </div>
          <div className="mc-s">{t.priorWeekNum ? `vs Week ${t.priorWeekNum}` : "needs prior week data"}</div>
        </div>
        <div className="mc">
          <div className="mc-l">Stores tracked</div>
          <div className="mc-v" style={{ fontSize: 32 }}>{data.storeCount}</div>
          <div className="mc-s">{t.comparable} comparable to last week</div>
        </div>
      </div>

      <EfficiencyQuadrant isoDate={isoDate} />

      <div className="tcard">
        <div className="thead">
          <span className="ttl">Week over week movers</span>
          <span style={{ fontSize: 11, color: "var(--text3)", fontWeight: 600 }}>SPLH change vs. last week</span>
        </div>
        <div style={{ padding: "18px 20px 8px" }}>
          {t.comparable > 0 ? (
            <WeekOverWeekChart improving={t.improving} declining={t.declining} />
          ) : (
            <div className="empty" style={{ padding: 30 }}>
              Not enough history yet. This needs the same weekday from last week.
            </div>
          )}
        </div>
      </div>

      <div className="tcard">
        <div className="thead">
          <span className="ttl">Needs attention</span>
          <span style={{ fontSize: 11, color: "var(--text3)", fontWeight: 600 }}>
            {total} item{total === 1 ? "" : "s"}
          </span>
        </div>
        {clean ? (
          <div className="empty" style={{ padding: 34 }}>
            Nothing to flag right now.
          </div>
        ) : (
          <div style={{ padding: "12px 14px" }}>
            {data.exceptions.map((e, i) => (
              <ExceptionRow key={e.code + "-" + i} e={e} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}