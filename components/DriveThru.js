// Drive-Thru tab component.
// Goes in components/DriveThru.js

"use client";

import { useEffect, useState } from "react";

function fmtSeconds(s) {
  if (s == null) return "--";
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return m > 0 ? `${m}:${String(r).padStart(2, "0")}` : `${r}s`;
}

function bandColor(seconds, targets, intensity = 1) {
  if (seconds == null) return "var(--bg3)";
  if (seconds <= targets.green_seconds) {
    // darker green = further under target, matching the Store detail shading logic
    const t = Math.min(seconds / targets.green_seconds, 1);
    return t < 0.6 ? "#0f6e3e" : t < 0.85 ? "#3a9b63" : "#8fd4a8";
  }
  if (seconds <= targets.yellow_seconds) return "#f4c04d";
  const over = seconds - targets.yellow_seconds;
  return over > 90 ? "#a11d1d" : "#e0574f";
}

function textOn(bg) {
  return ["#8fd4a8", "#f4c04d"].includes(bg) ? "#1a1a1a" : "#fff";
}

export default function DriveThru() {
  const [days, setDays] = useState(30);
  const [summary, setSummary] = useState(null);
  const [selectedStore, setSelectedStore] = useState(null);
  const [hourly, setHourly] = useState(null);
  const [distribution, setDistribution] = useState(null);
  const [tab, setTab] = useState("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/drive-thru?days=${days}`)
      .then((r) => r.json())
      .then((json) => {
        if (!json.ok) throw new Error(json.error);
        setSummary(json);
        if (!selectedStore && json.stores?.length) {
          setSelectedStore(json.stores[0].storeCode);
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [days]);

  useEffect(() => {
    if (!selectedStore) return;
    fetch(`/api/drive-thru?days=${days}&storeCode=${selectedStore}&view=hourly`)
      .then((r) => r.json())
      .then((json) => json.ok && setHourly(json))
      .catch(() => {});
    fetch(`/api/drive-thru?storeCode=${selectedStore}&view=distribution`)
      .then((r) => r.json())
      .then((json) => json.ok && setDistribution(json))
      .catch(() => {});
  }, [selectedStore, days]);

  if (loading) return <div className="empty">Loading drive-thru data...</div>;
  if (error) return <div className="empty">Error: {error}</div>;
  if (!summary?.stores?.length) {
    return <div className="empty">No drive-thru stores configured yet.</div>;
  }

  const targets = summary.targets;
  const store = summary.stores.find((s) => s.storeCode === selectedStore) || summary.stores[0];

  // Hourly averages for the heatmap strip
  const hourBuckets = {};
  if (hourly?.rows) {
    for (const r of hourly.rows) {
      const h = r.departure_hour;
      if (!hourBuckets[h]) hourBuckets[h] = { sum: 0, n: 0 };
      hourBuckets[h].sum += (r.avg_window_time || 0) * (r.car_count || 0);
      hourBuckets[h].n += r.car_count || 0;
    }
  }
  const heatmapHours = Object.keys(hourBuckets)
    .map(Number)
    .sort((a, b) => a - b)
    .map((h) => ({ hour: h, avg: hourBuckets[h].n ? hourBuckets[h].sum / hourBuckets[h].n : null, n: hourBuckets[h].n }));

  const worstHour = heatmapHours.reduce(
    (worst, h) => (h.avg != null && (!worst || h.avg > worst.avg) ? h : worst),
    null
  );
  const bestHour = heatmapHours.reduce(
    (best, h) => (h.avg != null && (!best || h.avg < best.avg) ? h : best),
    null
  );

  // Distribution buckets
  const distTotal = distribution?.rows?.reduce((a, r) => a + r.car_count, 0) || 0;
  const bucketOrder = ["00-30s", "31-45s", "46-60s", "61-90s", "91-120s", "121-180s", "180s+"];
  const distByBucket = {};
  for (const r of distribution?.rows || []) distByBucket[r.bucket] = r.car_count;

  // Dynamic headline, same voice as "Running at target"
  const gap = store.avgWindowTime != null ? store.avgWindowTime - targets.green_seconds : null;
  const isOnTarget = gap != null && gap <= 0;
  const headline = isOnTarget
    ? "Running at target"
    : gap != null && gap <= 30
    ? "Close to target"
    : "Above target";
  const headlineDetail = isOnTarget
    ? `Average window time is ${fmtSeconds(store.avgWindowTime)}, at or under the ${targets.green_seconds}s goal.`
    : `Average window time is ${fmtSeconds(store.avgWindowTime)}, ${fmtSeconds(Math.abs(gap))} over the ${targets.green_seconds}s goal.`;
  const bannerBg = isOnTarget ? "#0f6e3e" : gap != null && gap <= 30 ? "#8a6a12" : "#8a1f1f";

  const TabButton = ({ id, label }) => (
    <button
      onClick={() => setTab(id)}
      style={{
        padding: "8px 18px",
        borderRadius: 20,
        border: "none",
        background: tab === id ? "var(--navy)" : "transparent",
        color: tab === id ? "#fff" : "var(--text2)",
        fontWeight: 600,
        fontSize: 13,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );

  return (
    <div>
      {/* Store + window selectors, same label style as Store detail */}
      <div style={{ display: "flex", gap: 32, marginBottom: 18, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text3)", letterSpacing: 0.5, marginBottom: 6 }}>
            STORE
          </div>
          <select
            value={selectedStore || ""}
            onChange={(e) => setSelectedStore(Number(e.target.value))}
            style={{ padding: "8px 14px", borderRadius: 8, border: "1.5px solid var(--border2)", fontFamily: "inherit", fontSize: 13.5, minWidth: 200 }}
          >
            {summary.stores.map((s) => (
              <option key={s.storeCode} value={s.storeCode}>
                {s.storeCode} — {s.storeName}
              </option>
            ))}
          </select>
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text3)", letterSpacing: 0.5, marginBottom: 6 }}>
            WINDOW
          </div>
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            style={{ padding: "8px 14px", borderRadius: 8, border: "1.5px solid var(--border2)", fontFamily: "inherit", fontSize: 13.5 }}
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </div>
      </div>

      {/* Tabs, same pill pattern as What happened / Ticket times / Plan next week */}
      <div style={{ display: "flex", gap: 8, marginBottom: 18, background: "var(--bg3)", borderRadius: 24, padding: 4, width: "fit-content" }}>
        <TabButton id="overview" label="Overview" />
        <TabButton id="hourly" label="By hour" />
        <TabButton id="distribution" label="Distribution" />
      </div>

      {tab === "overview" && (
        <>
          {/* Headline banner */}
          <div style={{ background: bannerBg, borderRadius: 14, padding: "22px 28px", marginBottom: 20, color: "#fff" }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, opacity: 0.75, letterSpacing: 0.5, marginBottom: 6 }}>
              {store.storeCode} &middot; {store.storeName.toUpperCase()} &middot; LAST {days} DAYS
            </div>
            <div style={{ fontSize: 26, fontWeight: 700, marginBottom: 6 }}>{headline}</div>
            <div style={{ fontSize: 14, opacity: 0.9 }}>{headlineDetail}</div>
          </div>

          {/* KPI cards, same visual weight as SPLH/Hours over budget/Best day */}
          <div className="mc-grid" style={{ marginBottom: 24 }}>
            <div className="mc">
              <div className="mc-l">Average Window Time</div>
              <div className="mc-v" style={{ color: bandColor(store.avgWindowTime, targets) }}>
                {fmtSeconds(store.avgWindowTime)}
              </div>
              <div className="mc-s">
                {store.cars.toLocaleString()} cars &middot; target {targets.green_seconds}s
              </div>
            </div>
            <div className="mc">
              <div className="mc-l">Cars In Target</div>
              <div className="mc-v" style={{ color: store.pctGreen >= 50 ? "#0f6e3e" : "#a11d1d" }}>
                {store.pctGreen}%
              </div>
              <div className="mc-s">{store.pctRed}% over {targets.yellow_seconds}s</div>
            </div>
            <div className="mc">
              <div className="mc-l">Toughest Hour</div>
              <div className="mc-v">{worstHour ? `${worstHour.hour}:00` : "--"}</div>
              <div className="mc-s">{worstHour ? `avg ${fmtSeconds(worstHour.avg)}` : "no data"}</div>
            </div>
            <div className="mc">
              <div className="mc-l">Best Hour</div>
              <div className="mc-v" style={{ color: "#0f6e3e" }}>{bestHour ? `${bestHour.hour}:00` : "--"}</div>
              <div className="mc-s">{bestHour ? `avg ${fmtSeconds(bestHour.avg)}` : "no data"}</div>
            </div>
          </div>

          {/* Segment breakdown */}
          <div className="tcard">
            <div className="thead"><span className="ttl">Where the time goes</span></div>
            <div style={{ display: "flex", gap: 24, padding: "20px 24px" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: "var(--text2)", marginBottom: 4 }}>Menu board</div>
                <div style={{ fontSize: 22, fontWeight: 700 }}>{fmtSeconds(store.avgMenuTime)}</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: "var(--text2)", marginBottom: 4 }}>Greet</div>
                <div style={{ fontSize: 22, fontWeight: 700 }}>{fmtSeconds(store.avgGreetTime)}</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: "var(--text2)", marginBottom: 4 }}>Window (measured)</div>
                <div style={{ fontSize: 22, fontWeight: 700 }}>{fmtSeconds(store.avgWindowTime)}</div>
              </div>
            </div>
          </div>
        </>
      )}

      {tab === "hourly" && (
        <div className="tcard">
          <div className="thead">
            <span className="ttl">Average window time by hour &middot; {store.storeName}</span>
          </div>
          <div style={{ padding: 24 }}>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {heatmapHours.map(({ hour, avg, n }) => {
                const bg = bandColor(avg, targets);
                return (
                  <div
                    key={hour}
                    style={{
                      width: 92,
                      height: 92,
                      borderRadius: 10,
                      background: bg,
                      color: textOn(bg),
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "center",
                      alignItems: "center",
                      textAlign: "center",
                    }}
                    title={`${hour}:00 - ${n} cars`}
                  >
                    <div style={{ fontSize: 11, opacity: 0.85, fontWeight: 600 }}>{hour}:00</div>
                    <div style={{ fontSize: 20, fontWeight: 700, marginTop: 2 }}>{fmtSeconds(avg)}</div>
                    <div style={{ fontSize: 10, opacity: 0.8, marginTop: 2 }}>{n} cars</div>
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 16, marginTop: 20, fontSize: 12, color: "var(--text2)" }}>
              <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: "#0f6e3e", marginRight: 6 }} />under target</span>
              <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: "#f4c04d", marginRight: 6 }} />monitor</span>
              <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: "#a11d1d", marginRight: 6 }} />call for support</span>
            </div>
          </div>
        </div>
      )}

      {tab === "distribution" && (
        <div className="tcard">
          <div className="thead">
            <span className="ttl">Time distribution &middot; {store.storeName}</span>
          </div>
          <div style={{ padding: "24px 24px 12px" }}>
            <div style={{ fontSize: 13, color: "var(--text2)", marginBottom: 18 }}>
              Share of cars landing in each window time range, out of {distTotal.toLocaleString()} cars.
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 180 }}>
              {bucketOrder.map((b) => {
                const count = distByBucket[b] || 0;
                const pct = distTotal ? (100 * count) / distTotal : 0;
                const isGreen = b === "00-30s" || b === "31-45s";
                const isYellow = b === "46-60s" || b === "61-90s";
                const color = isGreen ? "#0f6e3e" : isYellow ? "#f4c04d" : "#a11d1d";
                return (
                  <div key={b} style={{ flex: 1, textAlign: "center" }}>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>{pct.toFixed(0)}%</div>
                    <div
                      style={{
                        height: `${Math.max(pct * 1.4, 3)}px`,
                        background: color,
                        borderRadius: "5px 5px 0 0",
                      }}
                      title={`${b}: ${count} cars`}
                    />
                    <div style={{ fontSize: 11.5, color: "var(--text2)", marginTop: 8, fontWeight: 600 }}>{b}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}