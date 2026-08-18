"use client";

import { useState, useEffect } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from "recharts";
import Forecast from "./Forecast";
// TICKET TIMES DISABLED: Toast Expo data is not reliable yet. Restore this import
// along with the three blocks marked TICKET TIMES DISABLED below.
// import KitchenTrend from "./KitchenTrend";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function cellStyle(ratio) {
  if (ratio === null || ratio === undefined) return null;
  if (ratio >= 1.15) return { background: "#1a6630", color: "#fff" };
  if (ratio >= 1.05) return { background: "#7ac496", color: "#0f3d24" };
  if (ratio >= 1.0) return { background: "#c6efce", color: "#1a6630" };
  if (ratio >= 0.95) return { background: "#f0f0ec", color: "#5f5f5c" };
  if (ratio >= 0.85) return { background: "#ffc7ce", color: "#9c0006" };
  return { background: "#c9302c", color: "#fff" };
}

function prettyFull(iso) {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", timeZone: "UTC",
  });
}

function ChartTip({ active, payload }) {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0].payload;
  return (
    <div style={{ background: "#1a1a2e", color: "#fff", padding: "10px 13px", borderRadius: 9, fontSize: 12, lineHeight: 1.5, boxShadow: "0 8px 24px rgba(0,0,0,.3)" }}>
      <div style={{ fontWeight: 700 }}>Week {d.weekNum}</div>
      <div style={{ opacity: 0.8 }}>{d.weekStart}</div>
      <div style={{ marginTop: 4 }}>SPLH ${d.splh} &middot; {d.hours} hrs</div>
    </div>
  );
}

function DayPanel({ day, onClose }) {
  const over = day.overUnder < 0;
  return (
    <div className="day-panel">
      <button className="day-panel-close" onClick={onClose} title="Close">×</button>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", opacity: 0.6 }}>
        Day detail
      </div>
      <div style={{ fontSize: 19, fontWeight: 800, marginTop: 4 }}>{prettyFull(day.date)}</div>
      <div className="day-panel-grid">
        <div>
          <div className="day-panel-k">Hours</div>
          <div className="day-panel-v">{day.hours}</div>
        </div>
        <div>
          <div className="day-panel-k">Sales</div>
          <div className="day-panel-v">${Math.round(day.sales).toLocaleString("en-US")}</div>
        </div>
        <div>
          <div className="day-panel-k">SPLH</div>
          <div className="day-panel-v" style={{ color: day.ok ? "#8ce0ac" : "#ff9a91" }}>
            ${day.splh}
          </div>
        </div>
        <div>
          <div className="day-panel-k">Target</div>
          <div className="day-panel-v" style={{ opacity: 0.75 }}>${day.target}</div>
        </div>
        <div>
          <div className="day-panel-k">{over ? "Hours over" : "Hours under"}</div>
          <div className="day-panel-v" style={{ color: over ? "#ff9a91" : "#8ce0ac" }}>
            {Math.abs(day.overUnder)}
          </div>
        </div>
      </div>
      <div style={{ fontSize: 11.5, opacity: 0.75, marginTop: 15, lineHeight: 1.55, maxWidth: 560 }}>
        {over
          ? `Sales of $${Math.round(day.sales).toLocaleString("en-US")} at a $${day.target} target supported about ${Math.round(day.sales / day.target)} hours. You used ${day.hours}, so ${Math.abs(day.overUnder)} hours more than budget.`
          : `Sales of $${Math.round(day.sales).toLocaleString("en-US")} at a $${day.target} target supported about ${Math.round(day.sales / day.target)} hours, and you used ${day.hours}. Good day.`}
      </div>
    </div>
  );
}

export default function StoreTrend({ isoDate }) {
  const [stores, setStores] = useState([]);
  const [code, setCode] = useState(null);
  const [weeks, setWeeks] = useState(4);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [selDay, setSelDay] = useState(null);
  const [tab, setTab] = useState("history");

  useEffect(() => {
    fetch("/api/store-trend")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok && d.stores) {
          setStores(d.stores);
          if (!code && d.stores.length) setCode(d.stores[0].code);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!code || !isoDate) return;
    setLoading(true);
    setErr(null);
    setSelDay(null);
    fetch(`/api/store-trend?store=${code}&date=${isoDate}&weeks=${weeks}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.ok) setErr(d.error);
        else setData(d);
        setLoading(false);
      })
      .catch((e) => { setErr(String(e)); setLoading(false); });
  }, [code, isoDate, weeks]);

  const currentStore = stores.find((s) => s.code === code);

  const controls = (
    <>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 16 }}>
        <div>
          <label style={{ fontSize: 10, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".07em", display: "block", marginBottom: 5 }}>
            Store
          </label>
          <select
            value={code || ""}
            onChange={(e) => setCode(Number(e.target.value))}
            style={{ padding: "9px 13px", borderRadius: 9, border: "1.5px solid var(--border2)", fontFamily: "inherit", fontSize: 14, fontWeight: 600, minWidth: 240, background: "#fff" }}
          >
            {stores.map((s) => (
              <option key={s.code} value={s.code}>{s.code} — {s.name}</option>
            ))}
          </select>
        </div>
        {/* TICKET TIMES DISABLED: was (tab === "history" || tab === "kitchen") */}
        {tab === "history" && (
          <div>
            <label style={{ fontSize: 10, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".07em", display: "block", marginBottom: 5 }}>
              Weeks
            </label>
            <select
              value={weeks}
              onChange={(e) => setWeeks(Number(e.target.value))}
              style={{ padding: "9px 13px", borderRadius: 9, border: "1.5px solid var(--border2)", fontFamily: "inherit", fontSize: 14, fontWeight: 600, background: "#fff" }}
            >
              <option value={2}>2</option>
              <option value={4}>4</option>
              <option value={6}>6</option>
              <option value={8}>8</option>
            </select>
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 7, marginBottom: 18, flexWrap: "wrap" }}>
        <button
          onClick={() => setTab("history")}
          style={{
            padding: "9px 17px", borderRadius: 100, cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 600,
            border: tab === "history" ? "1.5px solid var(--navy)" : "1.5px solid var(--border2)",
            background: tab === "history" ? "var(--navy)" : "#fff",
            color: tab === "history" ? "#fff" : "var(--text2)",
          }}
        >
          What happened
        </button>
        {/* TICKET TIMES DISABLED: restore this button to bring the sub tab back.
        <button
          onClick={() => setTab("kitchen")}
          style={{
            padding: "9px 17px", borderRadius: 100, cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 600,
            border: tab === "kitchen" ? "1.5px solid var(--navy)" : "1.5px solid var(--border2)",
            background: tab === "kitchen" ? "var(--navy)" : "#fff",
            color: tab === "kitchen" ? "#fff" : "var(--text2)",
          }}
        >
          Ticket times
        </button>
        */}
        <button
          onClick={() => setTab("plan")}
          style={{
            padding: "9px 17px", borderRadius: 100, cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 600,
            border: tab === "plan" ? "1.5px solid var(--navy)" : "1.5px solid var(--border2)",
            background: tab === "plan" ? "var(--navy)" : "#fff",
            color: tab === "plan" ? "#fff" : "var(--text2)",
          }}
        >
          Plan next week
        </button>
      </div>
    </>
  );

  if (tab === "plan") {
    return (
      <>
        {controls}
        {code ? (
          <Forecast storeCode={code} storeName={currentStore ? currentStore.name : ""} />
        ) : (
          <div className="empty">Pick a store.</div>
        )}
      </>
    );
  }

  {/* TICKET TIMES DISABLED: restore this block along with the button above.
  if (tab === "kitchen") {
    return (
      <>
        {controls}
        {code ? <KitchenTrend code={code} weeks={weeks} /> : <div className="empty">Pick a store.</div>}
      </>
    );
  }
  */}

  if (loading && !data) return <>{controls}<div className="empty">Loading trend...</div></>;
  if (err) return <>{controls}<div className="empty">Error: {err}</div></>;
  if (!data) return <>{controls}<div className="empty">Pick a store to see its pattern.</div></>;

  const v = data.verdict;
  const heroClass = v.type === "clean" ? "good" : v.type === "nodata" ? "none" : "bad";
  const flagged = new Set(v.days || []);

  const totalOver = data.byWeekday.reduce((s, d) => s + (d.overUnder < 0 ? -d.overUnder : 0), 0);
  const bestDay = data.byWeekday
    .filter((d) => d.hasData && d.best)
    .sort((a, b) => b.best.splh - a.best.splh)[0];

  // Most recent week on top, oldest at the bottom. The API returns oldest first,
  // so this is a display-only reversal. slice() keeps the source array untouched.
  const weeksNewestFirst = data.weekList.slice().reverse();

  // The line chart stays oldest to newest so time still reads left to right.
  const chartData = data.weekList.filter((w) => w.daysWithData >= 4).map((w) => ({
    weekNum: w.weekNum,
    label: "W" + w.weekNum,
    weekStart: w.weekStart,
    splh: w.totals.splh,
    hours: w.totals.hours,
  }));

  const target = data.store.weekdayTarget;

  return (
    <>
      {controls}

      <div className={"st-verdict " + heroClass}>
        <div className="st-verdict-eyebrow">
          {data.store.code} &middot; {data.store.name} &middot; last {data.weeks} weeks
        </div>
        <div className="st-verdict-head">{v.headline}</div>
        <div className="st-verdict-detail">{v.detail}</div>
      </div>

      {selDay && <DayPanel day={selDay} onClose={() => setSelDay(null)} />}

      <div className="mc-grid">
        <div className="mc">
          <div className="mc-l">SPLH over {data.weeks} weeks</div>
          <div className="mc-v" style={{ fontSize: 32 }}>${data.overall.splh}</div>
          <div className="mc-s">
            {Math.round(data.overall.hours).toLocaleString("en-US")} hours &middot; target ${target}
          </div>
        </div>
        <div className="mc">
          <div className="mc-l">Hours over budget</div>
          <div className="mc-v" style={{ fontSize: 32, color: totalOver > 0 ? "#9c0006" : "#1a6630" }}>
            {totalOver > 0 ? Math.round(totalOver) : 0}
          </div>
          <div className="mc-s">
            {totalOver > 0
              ? `${((totalOver / data.overall.hours) * 100).toFixed(1)}% of hours worked`
              : "within budget"}
          </div>
        </div>
        <div className="mc">
          <div className="mc-l">Your best day</div>
          <div className="mc-v" style={{ fontSize: 32, color: "#1a6630" }}>
            {bestDay ? "$" + bestDay.best.splh : "—"}
          </div>
          <div className="mc-s">
            {bestDay ? `${bestDay.dayName}, week ${bestDay.best.weekNum}` : "no data yet"}
          </div>
        </div>
      </div>

      <div className="tcard">
        <div className="thead">
          <span className="ttl">Every day, every week</span>
          <span style={{ fontSize: 11, color: "var(--text3)", fontWeight: 600 }}>tap any day for detail</span>
        </div>
        <div style={{ padding: "18px 18px 16px" }}>
          <div className="st-grid">
            <div className="st-corner" />
            {DAYS.map((d) => (
              <div key={d} className={"st-colhead" + ([...flagged].some((f) => f.startsWith(d)) ? " flagged" : "")}>
                {d}
              </div>
            ))}

            {weeksNewestFirst.map((w) => (
              <div key={w.weekStart} style={{ display: "contents" }}>
                <div className="st-rowhead">
                  W{w.weekNum}
                  <small>
                    {w.totals.splh > 0 ? "$" + w.totals.splh : "—"}
                    {w.partial ? " ·" : ""}
                  </small>
                </div>
                {w.days.map((d) => {
                  const s = cellStyle(d.ratio);
                  if (!s) {
                    return (
                      <div key={d.date} className="st-cell empty">
                        {d.isFuture ? "" : "–"}
                      </div>
                    );
                  }
                  const isSel = selDay && selDay.date === d.date;
                  return (
                    <div
                      key={d.date}
                      className="st-cell"
                      style={{
                        ...s,
                        cursor: "pointer",
                        boxShadow: isSel ? "0 0 0 3px var(--navy)" : undefined,
                      }}
                      onClick={() => setSelDay(isSel ? null : d)}
                      title={`${d.shortDay} ${d.date} — tap for detail`}
                    >
                      ${d.splh}
                      <small>{d.hours}h</small>
                    </div>
                  );
                })}
              </div>
            ))}

            <div className="st-rowhead" style={{ paddingTop: 8, color: "var(--text2)" }}>
              Avg
            </div>
            {data.byWeekday.map((b) => {
              const s = cellStyle(b.ratio);
              return (
                <div
                  key={b.dayName}
                  className={s ? "st-cell" : "st-cell empty"}
                  style={s ? { ...s, marginTop: 8, opacity: 0.92 } : { marginTop: 8 }}
                  title={b.hasData ? `${b.dayName} average across ${b.weeksWithData} week(s): $${b.splh} vs target $${b.target}` : "No data"}
                >
                  {b.hasData ? "$" + b.splh : "–"}
                  {b.hasData && <small>{b.weeksWithData}w</small>}
                </div>
              );
            })}
          </div>

          <div className="st-legend">
            <span style={{ fontWeight: 600 }}>Below target</span>
            <div className="st-legend-scale">
              <div className="st-legend-sw" style={{ background: "#c9302c" }} />
              <div className="st-legend-sw" style={{ background: "#ffc7ce" }} />
              <div className="st-legend-sw" style={{ background: "#f0f0ec" }} />
              <div className="st-legend-sw" style={{ background: "#c6efce" }} />
              <div className="st-legend-sw" style={{ background: "#7ac496" }} />
              <div className="st-legend-sw" style={{ background: "#1a6630" }} />
            </div>
            <span style={{ fontWeight: 600 }}>Above target</span>
            <span style={{ marginLeft: "auto" }}>Dashed cell means no data</span>
          </div>
        </div>
      </div>

      {chartData.length >= 2 && (
        <div className="tcard">
          <div className="thead">
            <span className="ttl">Week to week</span>
            <span style={{ fontSize: 11, color: "var(--text3)", fontWeight: 600 }}>full weeks only</span>
          </div>
          <div style={{ padding: "20px 20px 12px", height: 230 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 6, right: 16, bottom: 4, left: -12 }}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11.5, fill: "var(--text3)" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "var(--text3)" }} axisLine={false} tickLine={false} />
                <ReferenceLine
                  y={target}
                  stroke="#9c0006"
                  strokeDasharray="5 4"
                  label={{ value: "target $" + target, position: "insideTopRight", fontSize: 10.5, fill: "#9c0006" }}
                />
                <Tooltip content={<ChartTip />} />
                <Line type="monotone" dataKey="splh" stroke="#1a1a2e" strokeWidth={2.5} dot={{ r: 4, fill: "#1a1a2e" }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="tcard">
        <div className="thead"><span className="ttl">Week totals</span></div>
        <div>
          {weeksNewestFirst.map((w) => (
            <div className="st-wk" key={w.weekStart}>
              <span className="st-wk-num">Week {w.weekNum}</span>
              <span
                className="st-wk-splh"
                style={{ color: w.totals.splh === 0 ? "var(--text3)" : w.totals.splh >= target ? "#1a6630" : "#9c0006" }}
              >
                {w.totals.splh > 0 ? "$" + w.totals.splh : "—"}
              </span>
              {w.partial && <span className="st-partial">partial</span>}
              <span className="st-wk-meta">
                {w.totals.hours > 0 ? (
                  <>
                    {Math.round(w.totals.hours).toLocaleString("en-US")} hrs &middot; ${Math.round(w.totals.sales).toLocaleString("en-US")}
                    <div style={{ fontSize: 10.5 }}>
                      {w.totals.overUnder < 0
                        ? Math.abs(w.totals.overUnder) + " hrs over budget"
                        : w.totals.overUnder + " hrs under budget"}
                    </div>
                  </>
                ) : (
                  "no data"
                )}
              </span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}