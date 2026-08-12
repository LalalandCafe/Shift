// Drive-Thru tab component.
// Goes in components/DriveThru.js

"use client";

import { useEffect, useState } from "react";

function bandColor(seconds, targets) {
  if (seconds == null) return "#999";
  if (seconds <= targets.green_seconds) return "#22c55e";
  if (seconds <= targets.yellow_seconds) return "#f59e0b";
  return "#ef4444";
}

function fmtSeconds(s) {
  if (s == null) return "--";
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return m > 0 ? `${m}:${String(r).padStart(2, "0")}` : `${r}s`;
}

export default function DriveThru() {
  const [days, setDays] = useState(30);
  const [summary, setSummary] = useState(null);
  const [selectedStore, setSelectedStore] = useState(null);
  const [hourly, setHourly] = useState(null);
  const [distribution, setDistribution] = useState(null);
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

  if (loading) return <div style={{ padding: 24 }}>Loading drive-thru data...</div>;
  if (error) return <div style={{ padding: 24, color: "#ef4444" }}>Error: {error}</div>;
  if (!summary?.stores?.length) {
    return <div style={{ padding: 24 }}>No drive-thru stores configured yet.</div>;
  }

  const targets = summary.targets;

  // Group hourly rows into an average-by-hour-of-day heatmap.
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
    .map((h) => ({ hour: h, avg: hourBuckets[h].n ? hourBuckets[h].sum / hourBuckets[h].n : null }));

  const distTotal = distribution?.rows?.reduce((a, r) => a + r.car_count, 0) || 0;
  const bucketOrder = ["00-30s", "31-45s", "46-60s", "61-90s", "91-120s", "121-180s", "180s+"];
  const distByBucket = {};
  for (const r of distribution?.rows || []) distByBucket[r.bucket] = r.car_count;

  return (
    <div style={{ padding: 24, maxWidth: 1100 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Drive-Thru Window Times</h2>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>

      <p style={{ color: "#666", fontSize: 14, marginBottom: 24 }}>
        Target: green &le; {targets.green_seconds}s &middot; yellow &le; {targets.yellow_seconds}s &middot; red &gt; {targets.yellow_seconds}s
      </p>

      {/* Store summary cards, each vs its own history, no ranking */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16, marginBottom: 32 }}>
        {summary.stores.map((s) => (
          <div
            key={s.storeCode}
            onClick={() => setSelectedStore(s.storeCode)}
            style={{
              border: s.storeCode === selectedStore ? "2px solid #333" : "1px solid #ddd",
              borderRadius: 8,
              padding: 16,
              cursor: "pointer",
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 4 }}>{s.storeName}</div>
            <div style={{ fontSize: 13, color: "#666", marginBottom: 12 }}>
              {s.cars.toLocaleString()} cars &middot; {s.daysWithData} days
            </div>
            <div style={{ fontSize: 32, fontWeight: 700, color: bandColor(s.avgWindowTime, targets) }}>
              {fmtSeconds(s.avgWindowTime)}
            </div>
            <div style={{ fontSize: 13, color: "#666" }}>average window time</div>
            <div style={{ display: "flex", gap: 12, marginTop: 12, fontSize: 13 }}>
              <span style={{ color: "#22c55e" }}>{s.pctGreen}% green</span>
              <span style={{ color: "#ef4444" }}>{s.pctRed}% red</span>
            </div>
          </div>
        ))}
      </div>

      {/* Distribution: is the target reachable? */}
      {distribution && (
        <div style={{ marginBottom: 32 }}>
          <h3 style={{ fontSize: 16, marginBottom: 8 }}>
            Time distribution &middot; {summary.stores.find((s) => s.storeCode === selectedStore)?.storeName}
          </h3>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 140 }}>
            {bucketOrder.map((b) => {
              const count = distByBucket[b] || 0;
              const pct = distTotal ? (100 * count) / distTotal : 0;
              const isGreen = b === "00-30s" || b === "31-45s";
              const isYellow = b === "46-60s" || b === "61-90s";
              return (
                <div key={b} style={{ flex: 1, textAlign: "center" }}>
                  <div
                    style={{
                      height: `${Math.max(pct * 1.2, 2)}px`,
                      background: isGreen ? "#22c55e" : isYellow ? "#f59e0b" : "#ef4444",
                      borderRadius: "3px 3px 0 0",
                    }}
                    title={`${b}: ${count} cars (${pct.toFixed(1)}%)`}
                  />
                  <div style={{ fontSize: 11, color: "#666", marginTop: 4 }}>{b}</div>
                  <div style={{ fontSize: 11, fontWeight: 600 }}>{pct.toFixed(0)}%</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Hourly heatmap for the selected store */}
      {heatmapHours.length > 0 && (
        <div>
          <h3 style={{ fontSize: 16, marginBottom: 8 }}>Average window time by hour of day</h3>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {heatmapHours.map(({ hour, avg }) => (
              <div
                key={hour}
                style={{
                  width: 56,
                  padding: "8px 4px",
                  textAlign: "center",
                  borderRadius: 6,
                  background: bandColor(avg, targets),
                  color: "#fff",
                  fontSize: 12,
                }}
                title={`${hour}:00 - avg ${fmtSeconds(avg)}`}
              >
                <div>{hour}:00</div>
                <div style={{ fontWeight: 700 }}>{fmtSeconds(avg)}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}