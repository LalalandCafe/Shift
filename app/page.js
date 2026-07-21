"use client";

import { useState, useEffect } from "react";
import "./globals.css";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const DEFAULT_DATE = "2026-07-19";

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

export default function ShiftApp() {
  const [view, setView] = useState("week");
  const [isoDate, setIsoDate] = useState(DEFAULT_DATE);
  const [groupFilter, setGroupFilter] = useState("All");
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [emailHtml, setEmailHtml] = useState(null);

  const [stores, setStores] = useState(null);
  const [storesLoading, setStoresLoading] = useState(true);
  const [edits, setEdits] = useState({});
  const [savingCode, setSavingCode] = useState(null);
  const [savedFlash, setSavedFlash] = useState(null);
  const [copyStatus, setCopyStatus] = useState("idle");

  async function copyEmailHtml() {
    if (!emailHtml) return;
    try {
      const blobHtml = new Blob([emailHtml], { type: "text/html" });
      const blobText = new Blob([emailHtml], { type: "text/plain" });
      await navigator.clipboard.write([
        new ClipboardItem({ "text/html": blobHtml, "text/plain": blobText }),
      ]);
      setCopyStatus("copied");
    } catch (e) {
      try {
        await navigator.clipboard.writeText(emailHtml);
        setCopyStatus("copied");
      } catch (e2) {
        setCopyStatus("error");
      }
    }
    setTimeout(() => setCopyStatus("idle"), 2000);
  }

  useEffect(() => {
    if (!isoDate) { setReport(null); setLoading(false); return; }
    setLoading(true);
    setError(null);
    fetch(`/api/report?date=${isoDate}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.ok) { setError(d.error); setReport(null); }
        else setReport(d);
        setLoading(false);
      })
      .catch((e) => { setError(String(e)); setLoading(false); });
  }, [isoDate]);

  useEffect(() => {
    if (view === "email" && isoDate) {
      const groupParam = groupFilter !== "All" ? `&group=${encodeURIComponent(groupFilter)}` : "";
      fetch(`/api/email?date=${isoDate}${groupParam}`)
        .then((r) => r.text())
        .then(setEmailHtml);
    }
  }, [view, isoDate, groupFilter]);

  useEffect(() => {
    if (view === "targets" && !stores) {
      setStoresLoading(true);
      fetch("/api/stores")
        .then((r) => r.json())
        .then((d) => {
          if (d.ok) setStores(d.stores);
          setStoresLoading(false);
        });
    }
  }, [view]);

  function groupedSections(rows) {
    const sections = [];
    for (const grp of Object.keys(GROUP_STRUCTURE)) {
      if (groupFilter !== "All" && groupFilter !== grp) continue;
      GROUP_STRUCTURE[grp].forEach((rDef) => {
        const list = rows.filter((r) => r.grp === grp && rDef.regions.includes(r.region));
        if (list.length) sections.push({ label: rDef.label, stores: list });
      });
    }
    return sections;
  }

  function groupedStoreSections(list) {
    const sections = [];
    for (const grp of Object.keys(GROUP_STRUCTURE)) {
      GROUP_STRUCTURE[grp].forEach((rDef) => {
        const s = list.filter((st) => st.grp === grp && rDef.regions.includes(st.region));
        if (s.length) sections.push({ label: `${grp} — ${rDef.label}`, stores: s });
      });
    }
    return sections;
  }

  function editField(code, field, value) {
    setEdits((prev) => ({ ...prev, [code]: { ...prev[code], [field]: value } }));
  }

  async function saveTargets(st) {
    const e = edits[st.code] || {};
    const weekdayTarget = e.weekday_target !== undefined ? Number(e.weekday_target) : st.weekday_target;
    const weekendTarget = e.weekend_target !== undefined ? Number(e.weekend_target) : st.weekend_target;
    const ptdTarget = e.ptd_target !== undefined ? Number(e.ptd_target) : st.ptd_target;
    setSavingCode(st.code);
    const res = await fetch("/api/stores", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: st.code, weekdayTarget, weekendTarget, ptdTarget }),
    });
    const d = await res.json();
    setSavingCode(null);
    if (d.ok) {
      setStores((prev) =>
        prev.map((s) => (s.code === st.code ? { ...s, weekday_target: weekdayTarget, weekend_target: weekendTarget, ptd_target: ptdTarget } : s))
      );
      setSavedFlash(st.code);
      setTimeout(() => setSavedFlash(null), 1500);
    }
  }

  const totals = report?.rows?.reduce(
    (acc, r) => ({ hours: acc.hours + r.day.hours, sales: acc.sales + r.day.sales }),
    { hours: 0, sales: 0 }
  );
  const totalSplh = totals && totals.hours > 0 ? Math.round(totals.sales / totals.hours) : 0;

  return (
    <div className="app">
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
        <div className="nsec">Admin</div>
        <button className={"nbtn" + (view === "targets" ? " active" : "")} onClick={() => setView("targets")}>
          <span className="nbtn-ic">🎯</span>Store Targets
        </button>
      </div>

      <div className="main">
        <div className="topbar">
          <div className="ptitle">
            {view === "week" ? "Week view" : view === "email" ? "HTML email" : "Store Targets"}
          </div>
          <div className="tbr">
            {(view === "week" || view === "email") && (
              <select
                value={groupFilter}
                onChange={(e) => setGroupFilter(e.target.value)}
                style={{ padding: "5px 10px", borderRadius: 8, border: "1.5px solid var(--border2)", fontFamily: "inherit", fontSize: 12.5 }}
              >
                <option value="All">All Regions</option>
                <option value="TX-TN">TX-TN</option>
                <option value="CA-AZ">CA-AZ</option>
              </select>
            )}
            <span className="badge b-info" style={{ marginLeft: 8 }}>
              {report ? `Week ${report.weekNum} · Period ${report.period}` : "34 stores · Toast auto-sync"}
            </span>
          </div>
        </div>

        <div className="content">
          {view === "week" && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 17, flexWrap: "wrap" }}>
                <div>
                  <label style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".05em", display: "block", marginBottom: 4 }}>
                    Report Date
                  </label>
                  <input
                    type="date"
                    value={isoDate}
                    onChange={(e) => setIsoDate(e.target.value)}
                    style={{ padding: "6px 10px", borderRadius: 8, border: "1.5px solid var(--border2)", fontFamily: "inherit", fontSize: 13 }}
                  />
                </div>
                {report && (
                  <div style={{ background: "var(--navy)", color: "#fff", padding: "8px 16px", borderRadius: 10, fontSize: 13 }}>
                    <span style={{ fontWeight: 700 }}>Week {report.weekNum}</span>
                    <span style={{ opacity: 0.85 }}> &middot; {report.dayName} &middot; Period {report.period}</span>
                    <div style={{ fontSize: 10.5, opacity: 0.7, marginTop: 2 }}>Week starts {report.weekStart}</div>
                  </div>
                )}
              </div>

              {loading && <div className="empty">Cargando...</div>}
              {error && <div className="empty">Error: {error}</div>}

              {report && !loading && (
                <>
                  <div className="mc-grid">
                    <div className="mc">
                      <div className="mc-l">Total Hours ({report.dayName})</div>
                      <div className="mc-v">{Math.round(totals.hours).toLocaleString("en-US")}</div>
                    </div>
                    <div className="mc">
                      <div className="mc-l">Total Gross Sales</div>
                      <div className="mc-v">${Math.round(totals.sales).toLocaleString("en-US")}</div>
                    </div>
                    <div className="mc">
                      <div className="mc-l">Blended SPLH</div>
                      <div className="mc-v">${totalSplh}</div>
                      <div className="mc-s">
                        {groupFilter === "All" ? "34 stores" : groupFilter} &middot; {report.dayName}, {report.date}
                      </div>
                    </div>
                  </div>

                  <div className="tcard">
                    <div className="thead">
                      <span className="ttl">Labor Dashboard — {report.dayName}, {report.date}</span>
                    </div>
                    <div className="scx" style={{ overflowX: "auto" }}>
                      <table className="grid">
                        <thead>
                          <tr>
                            <th>Location Name</th>
                            <th className="r">Hours</th>
                            <th className="r">Sales</th>
                            <th className="r">Target</th>
                            <th className="r">SPLH</th>
                            <th className="r">(Over)/Under</th>
                            <th className="r" style={{ borderLeft: "2px solid #999" }}>WTD Hours</th>
                            <th className="r">WTD Sales</th>
                            <th className="r">WTD SPLH</th>
                            <th className="r" style={{ borderLeft: "2px solid #999" }}>Trainee</th>
                            <th className="r">Trainer</th>
                            <th className="r" style={{ borderLeft: "2px solid #999" }}>PTD Hours</th>
                            <th className="r">PTD Sales</th>
                            <th className="r">PTD SPLH</th>
                          </tr>
                        </thead>
                        <tbody>
                          {groupedSections(report.rows).map((section) => (
                            <>
                              <tr className="rrow" key={"h-" + section.label}>
                                <td colSpan={14}>{section.label}</td>
                              </tr>
                              {section.stores.map((s) => (
                                <tr key={s.code}>
                                  <td>
                                    <div className="lc-code">
                                      {s.code}
                                      {s.day.flags && s.day.flags.length > 0 && (
                                        <span title={s.day.flags.join(" · ")} style={{ marginLeft: 6, cursor: "help" }}>⚠️</span>
                                      )}
                                    </div>
                                    <div className="lc-name">{s.name}</div>
                                  </td>
                                  <td className="num">{s.day.hours}</td>
                                  <td className="num">${s.day.sales.toLocaleString("en-US")}</td>
                                  <td className="num">${s.day.target}</td>
                                  <td className={"num " + (s.day.ok ? "cell-ok" : "cell-bad")}>${s.day.splh}</td>
                                  <td className="num">
                                    {s.day.overUnder < 0 ? `(${Math.abs(s.day.overUnder)})` : s.day.overUnder}
                                  </td>
                                  <td className="num" style={{ borderLeft: "2px solid #999" }}>{s.wtd.hours}</td>
                                  <td className="num">${s.wtd.sales.toLocaleString("en-US")}</td>
                                  <td className={"num " + (s.wtd.ok ? "cell-ok" : "cell-bad")}>${s.wtd.splh}</td>
                                  <td className="num" style={{ borderLeft: "2px solid #999" }}>{s.wtd.trainee || "-"}</td>
                                  <td className="num">{s.wtd.trainer || "-"}</td>
                                  {s.ptd.empty ? (
                                    <>
                                      <td className="num" style={{ borderLeft: "2px solid #999", color: "#bbb" }}>—</td>
                                      <td className="num" style={{ color: "#bbb" }}>—</td>
                                      <td className="num" style={{ color: "#bbb" }}>—</td>
                                    </>
                                  ) : (
                                    <>
                                      <td className="num" style={{ borderLeft: "2px solid #999" }}>{s.ptd.hours.toLocaleString("en-US")}</td>
                                      <td className="num">${s.ptd.sales.toLocaleString("en-US")}</td>
                                      <td className={"num " + (s.ptd.ok ? "cell-ok" : "cell-bad")}>${s.ptd.splh}</td>
                                    </>
                                  )}
                                </tr>
                              ))}
                            </>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </>
          )}

          {view === "email" && (
            <div className="tcard">
              <div className="thead" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span className="ttl">Email preview</span>
                <button
                  onClick={copyEmailHtml}
                  disabled={!emailHtml}
                  style={{
                    padding: "6px 14px",
                    borderRadius: 7,
                    border: "none",
                    background: copyStatus === "copied" ? "#1a6630" : copyStatus === "error" ? "#9c0006" : "var(--navy)",
                    color: "#fff",
                    cursor: emailHtml ? "pointer" : "default",
                    fontSize: 12.5,
                    fontWeight: 600,
                  }}
                >
                  {copyStatus === "copied" ? "✓ Copied" : copyStatus === "error" ? "Copy failed" : "📋 Copy"}
                </button>
              </div>
              <div style={{ padding: 14 }}>
                {emailHtml ? (
                  <iframe className="email-frame" srcDoc={emailHtml} style={{ height: 700, width: "100%", border: "none" }} />
                ) : (
                  <div className="empty">Cargando email...</div>
                )}
              </div>
            </div>
          )}

          {view === "targets" && (
            <>
              {storesLoading && <div className="empty">Cargando tiendas...</div>}
              {!storesLoading && stores && (
                <div className="tcard">
                  <div className="thead"><span className="ttl">Store Targets (SPLH)</span></div>
                  <div className="scx" style={{ overflowX: "auto" }}>
                    <table className="grid">
                      <thead>
                        <tr>
                          <th>Location Name</th>
                          <th className="r">Weekday Target</th>
                          <th className="r">Weekend Target</th>
                          <th className="r">PTD Target</th>
                          <th className="r">Save</th>
                        </tr>
                      </thead>
                      <tbody>
                        {groupedStoreSections(stores).map((section) => (
                          <>
                            <tr className="rrow" key={"th-" + section.label}>
                              <td colSpan={5}>{section.label}</td>
                            </tr>
                            {section.stores.map((st) => {
                              const e = edits[st.code] || {};
                              return (
                                <tr key={st.code}>
                                  <td>
                                    <div className="lc-code">{st.code}</div>
                                    <div className="lc-name">{st.name}</div>
                                  </td>
                                  <td className="num">
                                    <input
                                      type="number"
                                      defaultValue={st.weekday_target}
                                      onChange={(ev) => editField(st.code, "weekday_target", ev.target.value)}
                                      style={{ width: 60, textAlign: "right", fontFamily: "monospace" }}
                                    />
                                  </td>
                                  <td className="num">
                                    <input
                                      type="number"
                                      defaultValue={st.weekend_target}
                                      onChange={(ev) => editField(st.code, "weekend_target", ev.target.value)}
                                      style={{ width: 60, textAlign: "right", fontFamily: "monospace" }}
                                    />
                                  </td>
                                  <td className="num">
                                    <input
                                      type="number"
                                      defaultValue={st.ptd_target}
                                      onChange={(ev) => editField(st.code, "ptd_target", ev.target.value)}
                                      style={{ width: 60, textAlign: "right", fontFamily: "monospace" }}
                                    />
                                  </td>
                                  <td className="num">
                                    <button
                                      onClick={() => saveTargets(st)}
                                      disabled={savingCode === st.code}
                                      style={{
                                        padding: "4px 12px",
                                        borderRadius: 6,
                                        border: "none",
                                        background: savedFlash === st.code ? "#1a6630" : "var(--navy)",
                                        color: "#fff",
                                        cursor: "pointer",
                                        fontSize: 11.5,
                                      }}
                                    >
                                      {savingCode === st.code ? "..." : savedFlash === st.code ? "✓ Saved" : "Save"}
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}