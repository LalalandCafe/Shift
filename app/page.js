"use client";

import { useState, useEffect } from "react";
import "./globals.css";
import Leaderboard from "../components/Leaderboard";
import Dashboard from "../components/Dashboard";
import StoreTrend from "../components/StoreTrend";
import Throughput from "../components/Throughput";
import ServiceBoard from "../components/ServiceBoard";

function yesterdayISO() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

const DEFAULT_DATE = yesterdayISO();

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
  const [search, setSearch] = useState("");
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

  const [reporterMode, setReporterMode] = useState(false);
  const [showUnlock, setShowUnlock] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [unlockErr, setUnlockErr] = useState("");
  const [saveErr, setSaveErr] = useState(null);
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= 900);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Si ya hay sesion de reporter guardada, abre en el dashboard
  useEffect(() => {
    if (sessionStorage.getItem("shift_reporter_code")) {
      setReporterMode(true);
      setView("dashboard");
    }
  }, []);

  async function unlockReporter() {
    setUnlockErr("");
    try {
      const res = await fetch("/api/auth/reporter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: codeInput }),
      });
      const j = await res.json();
      if (!j.ok) { setUnlockErr("Incorrect code"); return; }
      sessionStorage.setItem("shift_reporter_code", codeInput);
      setReporterMode(true);
      setShowUnlock(false);
      setCodeInput("");
      setView("dashboard");
    } catch (e) {
      setUnlockErr("Connection error");
    }
  }

  function lockReporter() {
    sessionStorage.removeItem("shift_reporter_code");
    setReporterMode(false);
    if (view === "targets" || view === "email" || view === "dashboard" || view === "throughput" || view === "serviceboard") setView("week");
  }

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

  // Auto-refresh cada 5 min cuando se ve el dia de hoy
  useEffect(() => {
    if (!report || !report.isLive) return;
    const id = setInterval(() => {
      fetch(`/api/report?date=${isoDate}`)
        .then((r) => r.json())
        .then((d) => { if (d.ok) setReport(d); })
        .catch(() => {});
    }, 300000);
    return () => clearInterval(id);
  }, [report?.isLive, isoDate]);

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
    const q = search.trim().toLowerCase();
    const sections = [];
    for (const grp of Object.keys(GROUP_STRUCTURE)) {
      if (groupFilter !== "All" && groupFilter !== grp) continue;
      GROUP_STRUCTURE[grp].forEach((rDef) => {
        let list = rows.filter((r) => r.grp === grp && rDef.regions.includes(r.region));
        if (q) list = list.filter((r) => r.name.toLowerCase().includes(q) || String(r.code).includes(q));
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

    const rcode = sessionStorage.getItem("shift_reporter_code");
    if (!rcode) { setSaveErr("Reporter mode required"); return; }

    setSaveErr(null);
    setSavingCode(st.code);
    const res = await fetch("/api/stores", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-reporter-code": rcode },
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
    } else {
      if (res.status === 401) {
        sessionStorage.removeItem("shift_reporter_code");
        setReporterMode(false);
        setSaveErr("Session expired. Please unlock reporter mode again.");
        setView("week");
      } else {
        setSaveErr(d.error || "Could not save");
      }
    }
  }

  const totals = report?.rows?.reduce(
    (acc, r) => ({ hours: acc.hours + r.day.hours, sales: acc.sales + r.day.sales }),
    { hours: 0, sales: 0 }
  );
  const totalSplh = totals && totals.hours > 0 ? Math.round(totals.sales / totals.hours) : 0;

  const money = (n) => "$" + Math.round(n).toLocaleString("en-US");

  const clockTime = (iso) =>
    new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

  const pageTitle =
    view === "dashboard" ? "Dashboard"
      : view === "week" ? "Week view"
      : view === "email" ? "HTML email"
      : view === "leaderboard" ? "Leaderboard"
      : view === "storetrend" ? "Store detail"
      : view === "throughput" ? "Throughput"
      : view === "serviceboard" ? "Service Times"
      : "Store Targets";

  return (
    <div className="app">
      <div className="sidebar">
        <div className="logo">
          <div className="logo-mark">S</div>
          <div>
            <div className="logo-text">SHIFT</div>
            <div className="logo-sub">La La Land</div>
          </div>
        </div>

        <div className="nsec">Reports</div>
        {reporterMode && (
          <button className={"nbtn" + (view === "dashboard" ? " active" : "")} onClick={() => setView("dashboard")}>
            <span className="nbtn-ic">🏠</span>Dashboard
          </button>
        )}
        <button className={"nbtn" + (view === "week" ? " active" : "")} onClick={() => setView("week")}>
          <span className="nbtn-ic">📊</span>Week view
        </button>
        <button className={"nbtn" + (view === "storetrend" ? " active" : "")} onClick={() => setView("storetrend")}>
          <span className="nbtn-ic">🔍</span>Store detail
        </button>
        <button className={"nbtn" + (view === "leaderboard" ? " active" : "")} onClick={() => setView("leaderboard")}>
          <span className="nbtn-ic">🏆</span>Leaderboard
        </button>
        {reporterMode && (
          <button className={"nbtn" + (view === "serviceboard" ? " active" : "")} onClick={() => setView("serviceboard")}>
            <span className="nbtn-ic">⏱️</span>Service Times
          </button>
        )}
        {reporterMode && (
          <button className={"nbtn" + (view === "throughput" ? " active" : "")} onClick={() => setView("throughput")}>
            <span className="nbtn-ic">⚡</span>Throughput
          </button>
        )}

        {isDesktop && (
          <>
            {reporterMode && (
              <button className={"nbtn" + (view === "email" ? " active" : "")} onClick={() => setView("email")}>
                <span className="nbtn-ic">✉️</span>HTML email
              </button>
            )}
            <div className="nsec">Admin</div>
            {reporterMode ? (
              <>
                <button className={"nbtn" + (view === "targets" ? " active" : "")} onClick={() => setView("targets")}>
                  <span className="nbtn-ic">🎯</span>Store Targets
                </button>
                <button className="nbtn" onClick={lockReporter}>
                  <span className="nbtn-ic">🔒</span>Lock reporter mode
                </button>
              </>
            ) : (
              <button className="nbtn" onClick={() => setShowUnlock(true)}>
                <span className="nbtn-ic">🔓</span>Unlock reporter mode
              </button>
            )}
          </>
        )}
      </div>

      {showUnlock && (
        <div
          onClick={() => { setShowUnlock(false); setUnlockErr(""); setCodeInput(""); }}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 999, display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <div
            onClick={(ev) => ev.stopPropagation()}
            style={{ background: "#fff", borderRadius: 12, padding: 24, width: 320, boxShadow: "0 10px 40px rgba(0,0,0,.3)" }}
          >
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>Reporter mode</div>
            <div style={{ fontSize: 12, color: "var(--text2)", marginBottom: 14 }}>
              Enter the code to unlock the dashboard, email, and targets.
            </div>
            <input
              type="password"
              value={codeInput}
              autoFocus
              onChange={(ev) => setCodeInput(ev.target.value)}
              onKeyDown={(ev) => { if (ev.key === "Enter") unlockReporter(); }}
              placeholder="Code"
              style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1.5px solid var(--border2)", fontFamily: "inherit", fontSize: 13, marginBottom: 10, boxSizing: "border-box" }}
            />
            {unlockErr && <div style={{ color: "#9c0006", fontSize: 12, marginBottom: 10 }}>{unlockErr}</div>}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                onClick={() => { setShowUnlock(false); setUnlockErr(""); setCodeInput(""); }}
                style={{ padding: "7px 14px", borderRadius: 8, border: "1.5px solid var(--border2)", background: "#fff", cursor: "pointer", fontFamily: "inherit", fontSize: 12.5 }}
              >
                Cancel
              </button>
              <button
                onClick={unlockReporter}
                style={{ padding: "7px 14px", borderRadius: 8, border: "none", background: "var(--navy)", color: "#fff", cursor: "pointer", fontFamily: "inherit", fontSize: 12.5, fontWeight: 700 }}
              >
                Unlock
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="main">
        <div className="topbar">
          <div className="ptitle">{pageTitle}</div>
          <div className="tbr">
            {view === "week" && (
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="🔍 Search store or code..."
                style={{ padding: "5px 12px", borderRadius: 8, border: "1.5px solid var(--border2)", fontFamily: "inherit", fontSize: 12.5, width: 200 }}
              />
            )}
            {(view === "week" || view === "leaderboard" || view === "dashboard" || view === "storetrend" || view === "serviceboard") && (
              <input
                type="date"
                value={isoDate}
                onChange={(e) => setIsoDate(e.target.value)}
                style={{ padding: "5px 10px", borderRadius: 8, border: "1.5px solid var(--border2)", fontFamily: "inherit", fontSize: 12.5 }}
              />
            )}
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
            {reporterMode && (
              <span className="badge" style={{ marginLeft: 8, background: "#1a6630", color: "#fff" }}>
                🔓 Reporter
              </span>
            )}
            <span className="badge b-info" style={{ marginLeft: 8 }}>
              {report ? `Week ${report.weekNum} · P${report.period}` : "34 stores"}
            </span>
          </div>
        </div>

        <div className="mobile-nav">
          {reporterMode && (
            <button
              className={"mnav-btn" + (view === "dashboard" ? " active" : "")}
              onClick={() => setView("dashboard")}
            >
              🏠 Dashboard
            </button>
          )}
          <button
            className={"mnav-btn" + (view === "week" ? " active" : "")}
            onClick={() => setView("week")}
          >
            📊 Week
          </button>
          <button
            className={"mnav-btn" + (view === "storetrend" ? " active" : "")}
            onClick={() => setView("storetrend")}
          >
            🔍 Store
          </button>
          <button
            className={"mnav-btn" + (view === "leaderboard" ? " active" : "")}
            onClick={() => setView("leaderboard")}
          >
            🏆 Board
          </button>
          {reporterMode && (
            <button
              className={"mnav-btn" + (view === "serviceboard" ? " active" : "")}
              onClick={() => setView("serviceboard")}
            >
              ⏱️ Service
            </button>
          )}
          {reporterMode && (
            <button
              className={"mnav-btn" + (view === "throughput" ? " active" : "")}
              onClick={() => setView("throughput")}
            >
              ⚡ TPLH
            </button>
          )}
        </div>

        <div className="content">
          {view === "dashboard" && reporterMode && <Dashboard isoDate={isoDate} />}

          {view === "storetrend" && <StoreTrend isoDate={isoDate} />}

          {view === "week" && (
            <>
              {report && (
                <div style={{ marginBottom: 17 }}>
                  <div style={{ background: "var(--navy)", color: "#fff", padding: "8px 16px", borderRadius: 10, fontSize: 13, display: "inline-block", verticalAlign: "top" }}>
                    <span style={{ fontWeight: 700 }}>Week {report.weekNum}</span>
                    <span style={{ opacity: 0.85 }}> &middot; {report.dayName} &middot; Period {report.period}</span>
                    <div style={{ fontSize: 10.5, opacity: 0.7, marginTop: 2 }}>Week starts {report.weekStart}</div>
                  </div>
                  {report.isLive ? (
                    <div style={{ display: "inline-block", marginLeft: 10, background: "#1a6630", color: "#fff", padding: "8px 14px", borderRadius: 10, fontSize: 12, verticalAlign: "top" }}>
                      <span style={{ fontWeight: 700 }}>● LIVE</span>
                      <div style={{ fontSize: 10.5, opacity: 0.85, marginTop: 2 }}>
                        {report.lastSyncAt
                          ? "Data as of " + clockTime(report.lastSyncAt)
                          : "Waiting for first sync today"}
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: "inline-block", marginLeft: 10, background: "var(--bg3)", color: "var(--text2)", padding: "8px 14px", borderRadius: 10, fontSize: 12, verticalAlign: "top" }}>
                      <span style={{ fontWeight: 700 }}>Final</span>
                      <div style={{ fontSize: 10.5, opacity: 0.75, marginTop: 2 }}>
                        {report.lastSyncAt ? "Synced " + clockTime(report.lastSyncAt) : "Day closed"}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {loading && <div className="empty">Loading...</div>}
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
                      <div className="mc-v">{money(totals.sales)}</div>
                    </div>
                    <div className="mc">
                      <div className="mc-l">Blended SPLH</div>
                      <div className="mc-v">${totalSplh}</div>
                      <div className="mc-s">
                        {groupFilter === "All" ? "34 stores" : groupFilter} &middot; {report.dayName}, {report.date}
                      </div>
                    </div>
                  </div>

                  <div className="tcard desktop-table">
                    <div className="thead">
                      <span className="ttl">Labor Dashboard — {report.dayName}, {report.date}</span>
                    </div>
                    <div className="scx">
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
                            <th className="r">WTD (Over)/Under</th>
                            <th className="r" style={{ borderLeft: "2px solid #999" }}>Total Training</th>
                            <th className="r">Trainee</th>
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
                                <td colSpan={16}>{section.label}</td>
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
                                  <td className="num">{money(s.day.sales)}</td>
                                  <td className="num">${s.day.target}</td>
                                  <td className={"num " + (s.day.ok ? "cell-ok" : "cell-bad")}>${s.day.splh}</td>
                                  <td className="num">
                                    {s.day.overUnder < 0 ? `(${Math.abs(s.day.overUnder)})` : s.day.overUnder}
                                  </td>
                                  <td className="num" style={{ borderLeft: "2px solid #999" }}>{s.wtd.hours}</td>
                                  <td className="num">{money(s.wtd.sales)}</td>
                                  <td className={"num " + (s.wtd.ok ? "cell-ok" : "cell-bad")}>${s.wtd.splh}</td>
                                  <td className="num">
                                    {s.wtd.overUnder < 0 ? `(${Math.abs(s.wtd.overUnder)})` : s.wtd.overUnder}
                                  </td>
                                  <td className="num" style={{ borderLeft: "2px solid #999" }}>{s.wtd.trainTotal || "-"}</td>
                                  <td className="num">{s.wtd.trainee || "-"}</td>
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
                                      <td className="num">{money(s.ptd.sales)}</td>
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

                  <div className="mobile-cards">
                    {groupedSections(report.rows).map((section) => (
                      <div key={"m-" + section.label}>
                        <div className="scard-region-head">{section.label}</div>
                        {section.stores.map((s) => (
                          <div className={"store-card " + (s.day.ok ? "ok" : "bad")} key={"mc-" + s.code}>
                            <div className="store-card-head">
                              <div>
                                <div className="store-card-code">
                                  {s.code}
                                  {s.day.flags && s.day.flags.length > 0 && (
                                    <span title={s.day.flags.join(" · ")} style={{ marginLeft: 5 }}>⚠️</span>
                                  )}
                                </div>
                                <div className="store-card-name">{s.name}</div>
                              </div>
                              <div className="store-card-splh" style={{ background: "var(--bg3)", color: "var(--text)" }}>
                                ${s.day.target}
                                <div style={{ fontSize: 9, fontWeight: 700, opacity: 0.6, textAlign: "center", marginTop: -2 }}>TARGET</div>
                              </div>
                            </div>

                            <div className="scard-block">
                              <div className="scard-block-label">Day — {report.dayName}</div>
                              <div className="scard-row">
                                <div className="scard-cell">
                                  <div className="scard-cell-lbl">Hours</div>
                                  <div className="scard-cell-val">{s.day.hours}</div>
                                </div>
                                <div className="scard-cell">
                                  <div className="scard-cell-lbl">Sales</div>
                                  <div className="scard-cell-val">{money(s.day.sales)}</div>
                                </div>
                                <div className={"scard-cell " + (s.day.ok ? "splh-ok" : "splh-bad")}>
                                  <div className="scard-cell-lbl">SPLH</div>
                                  <div className="scard-cell-val">${s.day.splh}</div>
                                </div>
                              </div>
                            </div>

                            <div className="scard-block">
                              <div className="scard-block-label">Week to Date</div>
                              <div className="scard-row">
                                <div className="scard-cell">
                                  <div className="scard-cell-lbl">Hours</div>
                                  <div className="scard-cell-val">{s.wtd.hours}</div>
                                </div>
                                <div className="scard-cell">
                                  <div className="scard-cell-lbl">Sales</div>
                                  <div className="scard-cell-val">{money(s.wtd.sales)}</div>
                                </div>
                                <div className={"scard-cell " + (s.wtd.ok ? "splh-ok" : "splh-bad")}>
                                  <div className="scard-cell-lbl">SPLH</div>
                                  <div className="scard-cell-val">${s.wtd.splh}</div>
                                </div>
                              </div>
                              <div className="scard-row" style={{ marginTop: 8 }}>
                                <div className="scard-cell">
                                  <div className="scard-cell-lbl">Trainee</div>
                                  <div className="scard-cell-val">{s.wtd.trainee || "-"}</div>
                                </div>
                                <div className="scard-cell">
                                  <div className="scard-cell-lbl">Trainer</div>
                                  <div className="scard-cell-val">{s.wtd.trainer || "-"}</div>
                                </div>
                                <div className="scard-cell">
                                  <div className="scard-cell-lbl">(Over)/Under</div>
                                  <div className="scard-cell-val">{s.wtd.overUnder < 0 ? `(${Math.abs(s.wtd.overUnder)})` : s.wtd.overUnder}</div>
                                </div>
                              </div>
                            </div>

                            <div className="scard-block">
                              <div className="scard-block-label">Period to Date</div>
                              {s.ptd.empty ? (
                                <div style={{ fontSize: 12, color: "var(--text3)", padding: "4px 2px" }}>No period data</div>
                              ) : (
                                <div className="scard-row">
                                  <div className="scard-cell">
                                    <div className="scard-cell-lbl">Hours</div>
                                    <div className="scard-cell-val">{s.ptd.hours.toLocaleString("en-US")}</div>
                                  </div>
                                  <div className="scard-cell">
                                    <div className="scard-cell-lbl">Sales</div>
                                    <div className="scard-cell-val">{money(s.ptd.sales)}</div>
                                  </div>
                                  <div className={"scard-cell " + (s.ptd.ok ? "splh-ok" : "splh-bad")}>
                                    <div className="scard-cell-lbl">SPLH</div>
                                    <div className="scard-cell-val">${s.ptd.splh}</div>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}

          {view === "leaderboard" && <Leaderboard report={report} />}

          {view === "serviceboard" && reporterMode && <ServiceBoard isoDate={isoDate} />}

          {view === "throughput" && reporterMode && <Throughput />}

          {view === "email" && reporterMode && (
            <div className="tcard">
              <div className="thead" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span className="ttl">Email preview</span>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                
                  href={`/api/export?date=${isoDate}${groupFilter !== "All" ? `&group=${encodeURIComponent(groupFilter)}` : ""}`}
                  style={{
                    padding: "6px 14px",
                    borderRadius: 7,
                    border: "1.5px solid var(--border2)",
                    background: "#fff",
                    color: "var(--text)",
                    cursor: "pointer",
                    fontSize: 12.5,
                    fontWeight: 600,
                    textDecoration: "none",
                  }}
                >
                  ⬇ Excel
                </a>
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
              </div>
              <div style={{ padding: 14 }}>
                {emailHtml ? (
                  <iframe className="email-frame" srcDoc={emailHtml} style={{ height: 700, width: "100%", border: "none" }} />
                ) : (
                  <div className="empty">Loading email...</div>
                )}
              </div>
            </div>
          )}

          {view === "targets" && !reporterMode && (
            <div className="empty">🔒 Reporter mode required to edit targets.</div>
          )}

          {view === "targets" && reporterMode && (
            <>
              {saveErr && (
                <div style={{ background: "#fde8e8", color: "#9c0006", padding: "10px 14px", borderRadius: 8, marginBottom: 14, fontSize: 13 }}>
                  {saveErr}
                </div>
              )}
              {storesLoading && <div className="empty">Loading stores...</div>}
              {!storesLoading && stores && (
                <div className="tcard">
                  <div className="thead"><span className="ttl">Store Targets (SPLH)</span></div>
                  <div className="scx">
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
                                      className="tinput"
                                    />
                                  </td>
                                  <td className="num">
                                    <input
                                      type="number"
                                      defaultValue={st.weekend_target}
                                      onChange={(ev) => editField(st.code, "weekend_target", ev.target.value)}
                                      className="tinput"
                                    />
                                  </td>
                                  <td className="num">
                                    <input
                                      type="number"
                                      defaultValue={st.ptd_target}
                                      onChange={(ev) => editField(st.code, "ptd_target", ev.target.value)}
                                      className="tinput"
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