"use client";

import { useState, useEffect } from "react";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Escala inversa a la de SPLH: aqui MENOS tiempo es mejor.
function cellStyle(min) {
  if (min === null || min === undefined) return null;
  if (min <= 1.5) return { background: "#1a6630", color: "#fff" };
  if (min <= 2.5) return { background: "#7ac496", color: "#0f3d24" };
  if (min <= 3.5) return { background: "#c6efce", color: "#1a6630" };
  if (min <= 5) return { background: "#f0f0ec", color: "#5f5f5c" };
  if (min <= 7) return { background: "#ffc7ce", color: "#9c0006" };
  return { background: "#c9302c", color: "#fff" };
}

function barColor(min) {
  if (min <= 1.5) return "#6ee7a8";
  if (min <= 3.5) return "#8ce0ac";
  if (min <= 5) return "#f5d48a";
  return "#ff9a91";
}

function prettyFull(iso) {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", timeZone: "UTC",
  });
}

function DayPanel({ storeCode, date, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/kitchen-day?store=${storeCode}&date=${date}`)
      .then((r) => r.json())
      .then((d) => { setData(d.ok ? d : null); setLoading(false); })
      .catch(() => setLoading(false));
  }, [storeCode, date]);

  if (loading) {
    return (
      <div className="kd-panel">
        <button className="kd-close" onClick={onClose}>×</button>
        <div className="kd-eyebrow">Day detail</div>
        <div className="kd-title">{prettyFull(date)}</div>
        <div style={{ opacity: 0.6, fontSize: 12.5, marginTop: 12 }}>Loading...</div>
      </div>
    );
  }

  if (!data || !data.overall) {
    return (
      <div className="kd-panel">
        <button className="kd-close" onClick={onClose}>×</button>
        <div className="kd-eyebrow">Day detail</div>
        <div className="kd-title">{prettyFull(date)}</div>
        <div style={{ opacity: 0.7, fontSize: 12.5, marginTop: 12 }}>
          No kitchen data recorded for this day.
        </div>
      </div>
    );
  }

  const o = data.overall;
  const stations = data.stations || [];
  const slowest = stations.length ? stations[0] : null;
  const fastest = stations.length ? stations[stations.length - 1] : null;
  const maxMedian = stations.reduce((m, s) => Math.max(m, s.median_minutes || 0), 0) || 1;

  const spread =
    slowest && fastest && fastest.median_minutes > 0
      ? Math.round((slowest.median_minutes / fastest.median_minutes) * 10) / 10
      : null;

  return (
    <div className="kd-panel">
      <button className="kd-close" onClick={onClose} title="Close">×</button>
      <div className="kd-eyebrow">Kitchen detail</div>
      <div className="kd-title">{prettyFull(date)}</div>

      <div className="kd-summary">
        <div>
          <div className="kd-k">Median</div>
          <div className="kd-v">{o.median_minutes !== null ? o.median_minutes.toFixed(1) : "—"}<span style={{ fontSize: 11, fontWeight: 600, opacity: 0.6 }}> min</span></div>
        </div>
        <div>
          <div className="kd-k">Average</div>
          <div className="kd-v" style={{ opacity: 0.85 }}>{o.avg_minutes !== null ? o.avg_minutes.toFixed(1) : "—"}<span style={{ fontSize: 11, fontWeight: 600, opacity: 0.6 }}> min</span></div>
        </div>
        <div>
          <div className="kd-k">Slowest 10%</div>
          <div className="kd-v" style={{ opacity: 0.85 }}>{o.p90_minutes !== null ? o.p90_minutes.toFixed(1) : "—"}<span style={{ fontSize: 11, fontWeight: 600, opacity: 0.6 }}> min</span></div>
        </div>
        <div>
          <div className="kd-k">Items</div>
          <div className="kd-v">{o.item_count.toLocaleString("en-US")}</div>
        </div>
        <div>
          <div className="kd-k">Stuck</div>
          <div className="kd-v" style={{ color: o.stuck_count > 0 ? "#f5d48a" : undefined }}>
            {o.stuck_count}
          </div>
        </div>
      </div>

      {stations.length > 0 && (
        <>
          <div className="kd-sec">By prep station</div>
          {stations.map((s) => (
            <div className="kd-st" key={s.prep_station_name}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="kd-st-name">{s.prep_station_name}</div>
                <div className="kd-st-sub">
                  {s.item_count.toLocaleString("en-US")} items
                  {s.stuck_count > 0 ? ` · ${s.stuck_count} stuck` : ""}
                </div>
              </div>
              <div className="kd-bar-track">
                <div
                  className="kd-bar-fill"
                  style={{
                    width: Math.max(4, ((s.median_minutes || 0) / maxMedian) * 100) + "%",
                    background: barColor(s.median_minutes || 0),
                  }}
                />
              </div>
              <div className="kd-st-val" style={{ color: barColor(s.median_minutes || 0) }}>
                {s.median_minutes !== null ? s.median_minutes.toFixed(1) : "—"}
              </div>
            </div>
          ))}

          {spread && spread >= 2 && slowest && fastest && (
            <div className="kd-note">
              <strong>{slowest.prep_station_name}</strong> runs {spread}× slower than{" "}
              <strong>{fastest.prep_station_name}</strong> ({slowest.median_minutes} min vs{" "}
              {fastest.median_minutes} min). The overall median of {o.median_minutes} min hides
              that gap, so if guests are waiting, this is where to look first.
            </div>
          )}
        </>
      )}

      {stations.some((s) => s.prep_station_name === "Unassigned") && (
        <div className="kd-note" style={{ opacity: 0.6 }}>
          Items showing as Unassigned did not come through a named prep station. That is usually
          orders from channels that skip the station routing, or a KDS station without a name set.
        </div>
      )}
    </div>
  );
}

export default function KitchenTrend({ code, weeks }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [selDate, setSelDate] = useState(null);

  useEffect(() => {
    if (!code) return;
    setLoading(true);
    setErr(null);
    setSelDate(null);
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

      {selDate && (
        <DayPanel storeCode={code} date={selDate} onClose={() => setSelDate(null)} />
      )}

      <div className="tcard">
        <div className="thead">
          <span className="ttl">Ticket time by day</span>
          <span style={{ fontSize: 11, color: "var(--text3)", fontWeight: 600 }}>tap any day for station detail</span>
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
                  const isSel = selDate === d.date;
                  return (
                    <div
                      key={d.date}
                      className="st-cell"
                      style={{
                        ...s,
                        cursor: "pointer",
                        boxShadow: isSel ? "0 0 0 3px var(--navy)" : undefined,
                      }}
                      onClick={() => setSelDate(isSel ? null : d.date)}
                      title={`${d.shortDay} ${d.date} — tap for station detail`}
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