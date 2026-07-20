"use client";

import { useState, useEffect } from "react";
import "./globals.css";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export default function ShiftApp() {
  const [view, setView] = useState("week");
  const [selDay, setSelDay] = useState("Sunday");
  const [storeCode] = useState(10002); // demo: Oak Lawn
  const [date] = useState("2026-07-19"); // demo: dia ya sincronizado
  const [dayData, setDayData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [emailHtml, setEmailHtml] = useState(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/demo/day?storeCode=${storeCode}&date=${date}&day=${selDay}`)
      .then((r) => r.json())
      .then((d) => { setDayData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [selDay]);

  useEffect(() => {
    if (view === "email" && dayData?.ok) {
      fetch(`/api/demo/email?storeCode=${storeCode}&date=${date}&day=${selDay}`)
        .then((r) => r.text())
        .then(setEmailHtml);
    }
  }, [view, dayData]);

  return (
    <div className="app">
      {/* Sidebar */}
      <div className="sidebar">
        <div className="logo">
          <div className="logo-mark">S</div>
          <div>
            <div className="logo-text">SHIFT</div>
            <div className="logo-sub">Lalaland Cafe</div>
          </div>
        </div>
        <div className="nsec">Reports</div>
        <button className={"nbtn" + (view === "week" ? " active" : "")} onClick={() => setView("week")}>
          <span className="nbtn-ic">📊</span>Week view
        </button>
        <button className={"nbtn" + (view === "email" ? " active" : "")} onClick={() => setView("email")}>
          <span className="nbtn-ic">✉️</span>HTML email
        </button>
      </div>

      {/* Main */}
      <div className="main">
        <div className="topbar">
          <div className="ptitle">
            {view === "week" ? "Week view" : "HTML email"}
          </div>
          <div className="tbr">
            <span className="badge b-info">DEMO &middot; Toast API auto-sync</span>
          </div>
        </div>

        <div className="content">
          {view === "week" && (
            <>
              <div className="dpills">
                {DAYS.map((d) => (
                  <button
                    key={d}
                    className={"dpill" + (selDay === d ? " active" : "") + (d === "Sunday" ? " has" : "")}
                    onClick={() => setSelDay(d)}
                  >
                    {d.slice(0, 3)}
                  </button>
                ))}
              </div>

              {loading && <div className="empty">Loading...</div>}

              {!loading && dayData && !dayData.ok && (
                <div className="empty">
                  <div style={{ fontSize: 32 }}>📭</div>
                  <p>No data for {selDay}. Sync this day first.</p>
                  <p style={{ fontSize: 11 }}>{dayData.error}</p>
                </div>
              )}

              {!loading && dayData?.ok && (
                <>
                  <div className="mc-grid">
                    <div className="mc">
                      <div className="mc-l">Hours Worked</div>
                      <div className="mc-v">{Math.round(dayData.metrics.hours)}</div>
                    </div>
                    <div className="mc">
                      <div className="mc-l">Gross Sales</div>
                      <div className="mc-v">${dayData.metrics.sales.toLocaleString("en-US")}</div>
                    </div>
                    <div className="mc">
                      <div className="mc-l">SPLH</div>
                      <div className="mc-v" style={{ color: dayData.metrics.ok ? "#1d7d4a" : "#b83228" }}>
                        ${dayData.metrics.splh}
                      </div>
                      <div className="mc-s">Target: ${dayData.metrics.target}</div>
                    </div>
                  </div>

                  <div className="tcard">
                    <div className="thead">
                      <span className="ttl">{dayData.store.name}</span>
                    </div>
                    <div className="scx">
                      <table className="grid">
                        <thead>
                          <tr>
                            <th>Location Name</th>
                            <th className="r">Hours Worked</th>
                            <th className="r">Gross Sales</th>
                            <th className="r">Target</th>
                            <th className="r">SPLH</th>
                            <th className="r">Hours (Over)/Under</th>
                            <th className="r">Trainee Hrs</th>
                            <th className="r">Trainer Hrs</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="rrow"><td colSpan={8}>Demo Store</td></tr>
                          <tr>
                            <td>
                              <div className="lc-code">{dayData.store.code}</div>
                              <div className="lc-name">{dayData.store.name}</div>
                            </td>
                            <td className="num">{Math.round(dayData.metrics.hours)}</td>
                            <td className="num">${dayData.metrics.sales.toLocaleString("en-US")}</td>
                            <td className="num">${dayData.metrics.target}</td>
                            <td className={"num " + (dayData.metrics.ok ? "cell-ok" : "cell-bad")}>
                              ${dayData.metrics.splh}
                            </td>
                            <td className="num">
                              {dayData.metrics.overUnder < 0 ? `(${Math.abs(dayData.metrics.overUnder)})` : dayData.metrics.overUnder}
                            </td>
                            <td className="num">{dayData.training.trainee || "-"}</td>
                            <td className="num">{dayData.training.trainer || "-"}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {dayData.excludedCount > 0 && (
                    <div className="infobox" style={{ marginTop: 14 }}>
                      ℹ️ {dayData.excludedCount} employee record(s) excluded from hours (GM / NSO Trainer / Event Support - LA).
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {view === "email" && (
            <div className="tcard">
              <div className="thead"><span className="ttl">Email preview</span></div>
              <div style={{ padding: 14 }}>
                {emailHtml ? (
                  <iframe
                    className="email-frame"
                    srcDoc={emailHtml}
                    style={{ height: 500 }}
                  />
                ) : (
                  <div className="empty">Loading email...</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}