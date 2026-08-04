"use client";

import { useState, useEffect } from "react";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Escala inversa a la de SPLH: aqui MENOS tiempo es mejor.
// Los cortes son arbitrarios y razonables para bebidas de cafe,
// se pueden ajustar despues con mas data.
function cellStyle(min) {
  if (min === null || min === undefined) return null;
  if (min <= 1.5) return { background: "#1a6630", color: "#fff" };
  if (min <= 2.5) return { background: "#7ac496", color: "#0f3d24" };
  if (min <= 3.5) return { background: "#c6efce", color: "#1a6630" };
  if (min <= 5) return { background: "#f0f0ec", color: "#5f5f5c" };
  if (min <= 7) return { background: "#ffc7ce", color: "#9c0006" };
  return { background: "#c9302c", color: "#fff" };
}

export default function KitchenTrend({ code, weeks }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (!code) return;
    setLoading(true);
    setErr(null);
    const today = new Date();
    today.setDate(today.getDate() - 1);
    const isoDate = today.toISOString().slice(0, 10);
    fetch(`/api/kitchen-trend?store=${code}&date=${isoDate}&weeks=${weeks}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.ok) setErr(d.error);
        else setData(d);
        setLoading(false);
      })
      .catch((e) => { setErr(String(e)); setLoading(false); });
  }, [code, weeks]);

  if (loading) return <div className="empty">Loading ticket times...</div>;
  if (err) return <div className="empty">Error: {err}</div>;
  if (!data) return <div className="empty">Pick a store.</div>;

  if (!data.overall.itemCount) {
    return (
      <div className="tcard">
        <div className="empty" style={{ padding: 34 }}>
          No kitchen ticket data yet for this range. This fills in automatically as syncs run.
        </div>
      </div>
    );
  }

  const stuckPct = data.overall.itemCount > 0
    ? ((data.overall.stuckCount / data.overall.itemCount) * 100).toFixed(1)
    : 0;

  return (
    <>
      <div className="mc-grid">
        <div className="mc">
          <div className="mc-l">Median ticket time</div>
          <div className="mc-v" style={{ fontSize: 32 }}>
            {data.overall.medianMin !== null ? data.overall.medianMin.toFixed(1) : "—"}
            <span style={{ fontSize: 16, fontWeight: 600 }}> min</span>
          </div>
          <div className="mc-s">
            {data.overall.itemCount.toLocaleString("en-US")} items &middot; last {data.weeks} weeks
          </div>
        </div>
        <div className="mc">
          <div className="mc-l">Stuck tickets</div>
          <div className="mc-v" style={{ fontSize: 32, color: data.overall.stuckCount > 0 ? "#9a5e0a" : "#1a6630" }}>
            {data.overall.stuckCount}
          </div>
          <div className="mc-s">
            {stuckPct}% never fulfilled on the KDS &middot; excluded from times above
          </div>
        </div>
      </div>

      <div className="tcard">
        <div className="thead">
          <span className="ttl">Ticket time by day</span>
          <span style={{ fontSize: 11, color: "var(--text3)", fontWeight: 600 }}>fired to fulfilled, median</span>
        </div>
        <div style={{ padding: "18px 18px 16px" }}>
          <div className="st-grid">
            <div className="st-corner" />
            {DAYS.map((d) => (
              <div key={d} className="st-colhead">{d}</div>
            ))}

            {data.weekList.map((w) => (
              <div key={w.weekStart} style={{ display: "contents" }}>
                <div className="st-rowhead">
                  W{w.weekNum}
                  <small>
                    {w.totals.medianMin !== null ? w.totals.medianMin.toFixed(1) + "m" : "—"}
                    {w.partial ? " ·" : ""}
                  </small>
                </div>
                {w.days.map((d) => {
                  const s = cellStyle(d.medianMin);
                  if (!s) {
                    return (
                      <div key={d.date} className="st-cell empty">
                        {d.isFuture ? "" : "–"}
                      </div>
                    );
                  }
                  return (
                    <div
                      key={d.date}
                      className="st-cell"
                      style={s}
                      title={`${d.shortDay} ${d.date}\nMedian ${d.medianMin} min · ${d.itemCount} items\n${d.stuckCount} stuck`}
                    >
                      {d.medianMin.toFixed(1)}
                      <small>{d.itemCount}</small>
                    </div>
                  );
                })}
              </div>
            ))}

            <div className="st-rowhead" style={{ paddingTop: 8, color: "var(--text2)" }}>
              Avg
            </div>
            {data.byWeekday.map((b) => {
              const s = cellStyle(b.medianMin);
              return (
                <div
                  key={b.dayName}
                  className={s ? "st-cell" : "st-cell empty"}
                  style={s ? { ...s, marginTop: 8, opacity: 0.92 } : { marginTop: 8 }}
                  title={b.hasData ? `${b.dayName} average across ${b.weeksWithData} week(s): ${b.medianMin} min` : "No data"}
                >
                  {b.hasData ? b.medianMin.toFixed(1) : "–"}
                  {b.hasData && <small>{b.weeksWithData}w</small>}
                </div>
              );
            })}
          </div>

          <div className="st-legend">
            <span style={{ fontWeight: 600 }}>Faster</span>
            <div className="st-legend-scale">
              <div className="st-legend-sw" style={{ background: "#1a6630" }} />
              <div className="st-legend-sw" style={{ background: "#7ac496" }} />
              <div className="st-legend-sw" style={{ background: "#c6efce" }} />
              <div className="st-legend-sw" style={{ background: "#f0f0ec" }} />
              <div className="st-legend-sw" style={{ background: "#ffc7ce" }} />
              <div className="st-legend-sw" style={{ background: "#c9302c" }} />
            </div>
            <span style={{ fontWeight: 600 }}>Slower</span>
            <span style={{ marginLeft: "auto" }}>Median minutes from fired to fulfilled</span>
          </div>
        </div>
      </div>
    </>
  );
}