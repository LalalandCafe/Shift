// Drive-Thru tab component.
// Goes in components/DriveThru.js
//
// Single view, progressive disclosure. Click a store card to switch stores,
// click a day in the calendar to drill into that day's hour-by-hour.

"use client";

import { useEffect, useState } from "react";

const DOW = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

function fmtSeconds(s) {
  if (s == null) return "--";
  const n = Math.round(s);
  const m = Math.floor(n / 60);
  const r = n % 60;
  return m > 0 ? `${m}:${String(r).padStart(2, "0")}` : `${r}s`;
}

function shortDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function mondayOf(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const shift = (dt.getDay() + 6) % 7; // Monday = 0
  dt.setDate(dt.getDate() - shift);
  return dt.toISOString().slice(0, 10);
}

function dowIndex(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return (new Date(y, m - 1, d).getDay() + 6) % 7;
}

/**
 * Green is reserved for hitting the goal, so it never lies. Above the goal
 * the scale spreads across the store's own observed range, otherwise every
 * cell would be the same red and no pattern would be visible.
 */
function cellColor(value, goal, max) {
  if (value == null) return "transparent";
  if (value <= goal) return "#0f6e3e";
  const span = Math.max(max - goal, 1);
  const t = Math.min((value - goal) / span, 1);
  if (t < 0.25) return "#f6d98a";
  if (t < 0.5) return "#f0b04a";
  if (t < 0.75) return "#dd6b4a";
  return "#a11d1d";
}

function textOn(bg) {
  return ["#f6d98a", "#f0b04a"].includes(bg) ? "#3a2a05" : "#fff";
}

export default function DriveThru() {
  const [days, setDays] = useState(30);
  const [summary, setSummary] = useState(null);
  const [selectedStore, setSelectedStore] = useState(null);
  const [selectedDay, setSelectedDay] = useState(null);
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
        if (!selectedStore && json.stores?.length) setSelectedStore(json.stores[0].storeCode);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [days]);

  useEffect(() => {
    if (!selectedStore) return;
    setSelectedDay(null);
    fetch(`/api/drive-thru?days=${days}&storeCode=${selectedStore}&view=hourly`)
      .then((r) => r.json())
      .then((j) => j.ok && setHourly(j))
      .catch(() => {});
    fetch(`/api/drive-thru?storeCode=${selectedStore}&view=distribution`)
      .then((r) => r.json())
      .then((j) => j.ok && setDistribution(j))
      .catch(() => {});
  }, [selectedStore, days]);

  if (loading) return <div className="empty">Loading drive-thru data...</div>;
  if (error) return <div className="empty">Error: {error}</div>;
  if (!summary?.stores?.length) return <div className="empty">No drive-thru stores configured yet.</div>;

  const targets = summary.targets;
  const goal = targets.green_seconds;
  const store = summary.stores.find((s) => s.storeCode === selectedStore) || summary.stores[0];

  // Daily rows for the selected store
  const dailyRows = (summary.daily || [])
    .filter((r) => r.store_code === store.storeCode)
    .sort((a, b) => a.business_date.localeCompare(b.business_date));

  const maxDaily = dailyRows.reduce((m, r) => Math.max(m, r.avg_window_time || 0), goal + 1);

  // Group days into Monday-anchored weeks
  const weekMap = new Map();
  for (const r of dailyRows) {
    const wk = mondayOf(r.business_date);
    if (!weekMap.has(wk)) weekMap.set(wk, {});
    weekMap.get(wk)[dowIndex(r.business_date)] = r;
  }
  const weeks = [...weekMap.entries()].sort((a, b) => b[0].localeCompare(a[0]));

  // Hourly rows, either for the clicked day or aggregated across the window
  const allHourly = hourly?.rows || [];
  const dayHourly = selectedDay ? allHourly.filter((r) => r.business_date === selectedDay) : null;

  const hourAgg = {};
  for (const r of dayHourly || allHourly) {
    const h = r.departure_hour;
    if (!hourAgg[h]) hourAgg[h] = { sum: 0, n: 0, menu: 0, queue: 0 };
    hourAgg[h].sum += (r.avg_window_time || 0) * (r.car_count || 0);
    hourAgg[h].menu += (r.avg_menu_time || 0) * (r.car_count || 0);
    hourAgg[h].queue += (r.avg_cars_in_queue || 0) * (r.car_count || 0);
    hourAgg[h].n += r.car_count || 0;
  }
  const hours = Object.keys(hourAgg)
    .map(Number)
    .sort((a, b) => a - b)
    .map((h) => ({
      hour: h,
      avg: hourAgg[h].n ? hourAgg[h].sum / hourAgg[h].n : null,
      menu: hourAgg[h].n ? hourAgg[h].menu / hourAgg[h].n : null,
      queue: hourAgg[h].n ? hourAgg[h].queue / hourAgg[h].n : null,
      cars: hourAgg[h].n,
    }));

  const maxHourly = hours.reduce((m, h) => Math.max(m, h.avg || 0), goal + 1);
  const worstHour = hours.reduce((w, h) => (h.avg != null && (!w || h.avg > w.avg) ? h : w), null);
  const bestHour = hours.reduce((b, h) => (h.avg != null && (!b || h.avg < b.avg) ? h : b), null);

  const selectedDayRow = selectedDay ? dailyRows.find((r) => r.business_date === selectedDay) : null;

  // Distribution
  const distTotal = distribution?.rows?.reduce((a, r) => a + r.car_count, 0) || 0;
  const buckets = ["00-30s", "31-45s", "46-60s", "61-90s", "91-120s", "121-180s", "180s+"];
  const distBy = {};
  for (const r of distribution?.rows || []) distBy[r.bucket] = r.car_count;
  const pctAtGoal = distTotal
    ? (100 * ((distBy["00-30s"] || 0) + (distBy["31-45s"] || 0))) / distTotal
    : 0;

  // Headline
  const gap = store.avgWindowTime != null ? store.avgWindowTime - goal : null;
  const onTarget = gap != null && gap <= 0;
  const headline = onTarget ? "Running at target" : gap <= 30 ? "Close to target" : "Above target";
  const detail = onTarget
    ? `Average window time is ${fmtSeconds(store.avgWindowTime)}, at or under the ${goal}s goal.`
    : `Average window time is ${fmtSeconds(store.avgWindowTime)}. That is ${fmtSeconds(gap)} over the ${goal}s goal, with ${pctAtGoal.toFixed(0)}% of cars already making it.`;
  const bannerBg = onTarget ? "#0f6e3e" : gap <= 30 ? "#8a6a12" : "#8a1f1f";

  return (
    <div>
      {/* Window selector */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <div style={{ fontSize: 13, color: "var(--text2)" }}>
          Window time is measured at the service window, the same number the store sees on its own timer.
        </div>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          style={{ padding: "7px 12px", borderRadius: 8, border: "1.5px solid var(--border2)", fontFamily: "inherit", fontSize: 13 }}
        >
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>

      {/* Store cards, click to switch */}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(summary.stores.length, 4)}, 1fr)`, gap: 12, marginBottom: 20 }}>
        {summary.stores.map((s) => {
          const active = s.storeCode === store.storeCode;
          return (
            <div
              key={s.storeCode}
              onClick={() => setSelectedStore(s.storeCode)}
              style={{
                border: active ? "2px solid var(--navy)" : "1.5px solid var(--border2)",
                background: active ? "var(--bg3)" : "#fff",
                borderRadius: 12,
                padding: "14px 16px",
                cursor: "pointer",
              }}
            >
              <div style={{ fontSize: 11.5, color: "var(--text3)", fontWeight: 700, letterSpacing: 0.4 }}>
                {s.storeCode}
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>{s.storeName}</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontSize: 24, fontWeight: 700 }}>{fmtSeconds(s.avgWindowTime)}</span>
                <span style={{ fontSize: 12, color: "var(--text2)" }}>{s.pctGreen}% at goal</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Headline */}
      <div style={{ background: bannerBg, borderRadius: 14, padding: "22px 28px", marginBottom: 20, color: "#fff" }}>
        <div style={{ fontSize: 11.5, fontWeight: 700, opacity: 0.75, letterSpacing: 0.5, marginBottom: 6 }}>
          {store.storeCode} &middot; {store.storeName.toUpperCase()} &middot; LAST {days} DAYS
        </div>
        <div style={{ fontSize: 26, fontWeight: 700, marginBottom: 6 }}>{headline}</div>
        <div style={{ fontSize: 14, opacity: 0.92 }}>{detail}</div>
      </div>

      {/* KPI row */}
      <div className="mc-grid" style={{ marginBottom: 22 }}>
        <div className="mc">
          <div className="mc-l">Average Window Time</div>
          <div className="mc-v">{fmtSeconds(store.avgWindowTime)}</div>
          <div className="mc-s">{store.cars.toLocaleString()} cars &middot; goal {goal}s</div>
        </div>
        <div className="mc">
          <div className="mc-l">Cars At Goal</div>
          <div className="mc-v" style={{ color: pctAtGoal >= 50 ? "#0f6e3e" : "#a11d1d" }}>
            {pctAtGoal.toFixed(0)}%
          </div>
          <div className="mc-s">{(100 - pctAtGoal).toFixed(0)}% still above {goal}s</div>
        </div>
        <div className="mc">
          <div className="mc-l">Toughest Hour</div>
          <div className="mc-v" style={{ color: "#a11d1d" }}>{worstHour ? `${worstHour.hour}:00` : "--"}</div>
          <div className="mc-s">{worstHour ? `avg ${fmtSeconds(worstHour.avg)}` : "no data"}</div>
        </div>
        <div className="mc">
          <div className="mc-l">Best Hour</div>
          <div className="mc-v" style={{ color: "#0f6e3e" }}>{bestHour ? `${bestHour.hour}:00` : "--"}</div>
          <div className="mc-s">{bestHour ? `avg ${fmtSeconds(bestHour.avg)}` : "no data"}</div>
        </div>
      </div>

      {/* Calendar grid */}
      <div className="tcard" style={{ marginBottom: 22 }}>
        <div className="thead" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span className="ttl">Every day, every week</span>
          <span style={{ fontSize: 12, color: "var(--text2)" }}>tap any day for the hour by hour</span>
        </div>
        <div style={{ padding: 16, overflowX: "auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "58px repeat(7, minmax(74px, 1fr))", gap: 6, minWidth: 620 }}>
            <div />
            {DOW.map((d) => (
              <div key={d} style={{ textAlign: "center", fontSize: 11, fontWeight: 700, color: "var(--text3)", letterSpacing: 0.4, paddingBottom: 4 }}>
                {d}
              </div>
            ))}

            {weeks.map(([wk, byDow]) => (
              <div key={wk} style={{ display: "contents" }}>
                <div style={{ fontSize: 10.5, color: "var(--text3)", display: "flex", alignItems: "center", fontWeight: 600 }}>
                  {shortDate(wk)}
                </div>
                {DOW.map((_, i) => {
                  const r = byDow[i];
                  if (!r) {
                    return (
                      <div key={i} style={{ height: 62, borderRadius: 8, border: "1px dashed var(--border2)" }} />
                    );
                  }
                  const bg = cellColor(r.avg_window_time, goal, maxDaily);
                  const isSel = selectedDay === r.business_date;
                  return (
                    <div
                      key={i}
                      onClick={() => setSelectedDay(isSel ? null : r.business_date)}
                      title={`${r.business_date} · ${r.car_count} cars`}
                      style={{
                        height: 62,
                        borderRadius: 8,
                        background: bg,
                        color: textOn(bg),
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: "pointer",
                        outline: isSel ? "3px solid var(--navy)" : "none",
                        outlineOffset: 1,
                      }}
                    >
                      <div style={{ fontSize: 15, fontWeight: 700 }}>{fmtSeconds(r.avg_window_time)}</div>
                      <div style={{ fontSize: 10, opacity: 0.85 }}>{r.car_count} cars</div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: 18, marginTop: 16, fontSize: 12, color: "var(--text2)", flexWrap: "wrap" }}>
            <span><span style={{ display: "inline-block", width: 11, height: 11, borderRadius: 3, background: "#0f6e3e", marginRight: 6 }} />at goal ({goal}s)</span>
            <span><span style={{ display: "inline-block", width: 11, height: 11, borderRadius: 3, background: "#f6d98a", marginRight: 6 }} />closest</span>
            <span><span style={{ display: "inline-block", width: 11, height: 11, borderRadius: 3, background: "#a11d1d", marginRight: 6 }} />furthest</span>
            <span style={{ fontStyle: "italic" }}>above goal, shading spreads across this store's own range</span>
          </div>
        </div>
      </div>

      {/* Hour detail, reacts to the selected day */}
      <div className="tcard" style={{ marginBottom: 22 }}>
        <div className="thead" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span className="ttl">
            {selectedDay ? `Hour by hour · ${shortDate(selectedDay)}` : `Hour by hour · all ${days} days`}
          </span>
          {selectedDay && (
            <button
              onClick={() => setSelectedDay(null)}
              style={{ padding: "4px 12px", borderRadius: 6, border: "1.5px solid var(--border2)", background: "#fff", cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}
            >
              Back to all days
            </button>
          )}
        </div>

        {selectedDayRow && (
          <div style={{ display: "flex", gap: 28, padding: "14px 20px", borderBottom: "1px solid var(--border2)", fontSize: 13, flexWrap: "wrap" }}>
            <span><strong>{selectedDayRow.car_count}</strong> cars</span>
            <span>median <strong>{fmtSeconds(selectedDayRow.median_window_time)}</strong></span>
            <span>p90 <strong>{fmtSeconds(selectedDayRow.p90_window_time)}</strong></span>
            <span style={{ color: "#0f6e3e" }}><strong>{selectedDayRow.pct_green}%</strong> at goal</span>
            <span style={{ color: "#a11d1d" }}><strong>{selectedDayRow.pct_red}%</strong> over {targets.yellow_seconds}s</span>
          </div>
        )}

        <div style={{ padding: 20 }}>
          {hours.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--text2)" }}>No cars recorded for this day.</div>
          ) : (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {hours.map((h) => {
                const bg = cellColor(h.avg, goal, maxHourly);
                return (
                  <div
                    key={h.hour}
                    title={`${h.cars} cars · menu ${fmtSeconds(h.menu)} · ${h.queue?.toFixed(1)} avg in queue`}
                    style={{
                      width: 84,
                      borderRadius: 10,
                      background: bg,
                      color: textOn(bg),
                      padding: "10px 4px",
                      textAlign: "center",
                    }}
                  >
                    <div style={{ fontSize: 11, opacity: 0.85, fontWeight: 600 }}>{h.hour}:00</div>
                    <div style={{ fontSize: 18, fontWeight: 700, margin: "2px 0" }}>{fmtSeconds(h.avg)}</div>
                    <div style={{ fontSize: 10, opacity: 0.85 }}>{h.cars} cars</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Distribution, the calibration question */}
      <div className="tcard">
        <div className="thead"><span className="ttl">How far are we from {goal} seconds</span></div>
        <div style={{ padding: "20px 24px 14px" }}>
          <div style={{ fontSize: 13, color: "var(--text2)", marginBottom: 18 }}>
            Every car at {store.storeName}, grouped by window time. {distTotal.toLocaleString()} cars total.
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 150 }}>
            {buckets.map((b) => {
              const count = distBy[b] || 0;
              const pct = distTotal ? (100 * count) / distTotal : 0;
              const atGoal = b === "00-30s" || b === "31-45s";
              const mid = b === "46-60s" || b === "61-90s";
              return (
                <div key={b} style={{ flex: 1, textAlign: "center" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 5 }}>{pct.toFixed(0)}%</div>
                  <div
                    style={{
                      height: `${Math.max(pct * 1.15, 3)}px`,
                      background: atGoal ? "#0f6e3e" : mid ? "#f0b04a" : "#a11d1d",
                      borderRadius: "5px 5px 0 0",
                    }}
                    title={`${b}: ${count.toLocaleString()} cars`}
                  />
                  <div style={{ fontSize: 11.5, color: "var(--text2)", marginTop: 8, fontWeight: 600 }}>{b}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}