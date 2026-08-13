"use client";

import { useState, useEffect } from "react";
import "./globals.css";

import Icon from "../components/Icon";
import UnlockModal from "../components/UnlockModal";
import WeekView from "../components/WeekView";
import Targets from "../components/Targets";
import EmailPreview from "../components/EmailPreview";
import Dashboard from "../components/Dashboard";
import Leaderboard from "../components/Leaderboard";
import StoreTrend from "../components/StoreTrend";
import ServiceBoard from "../components/ServiceBoard";
import TPLH from "../components/TPLH";
import DriveThru from "../components/DriveThru";
import { yesterdayISO } from "../lib/ui";

/**
 * One source of truth for navigation, page titles and which topbar controls
 * appear. Adding a view means adding a row here, nothing else.
 *   lock    reporter mode required
 *   desktop hidden on narrow screens
 *   date / group / search  which controls the topbar shows
 */
const VIEWS = [
  { key: "dashboard", label: "Dashboard", short: "Dashboard", icon: "dashboard", group: "Today", lock: true, date: true },
  { key: "week", label: "Week view", short: "Week", icon: "table", group: "Today", date: true, region: true, search: true },
  { key: "storetrend", label: "Store detail", short: "Store", icon: "search", group: "Stores", date: true },
  { key: "leaderboard", label: "Leaderboard", short: "Board", icon: "rank", group: "Stores", date: true },
  { key: "service", label: "Service times", short: "Service", icon: "timer", group: "Operations", lock: true, date: true },
  { key: "tplh", label: "TPLH", short: "TPLH", icon: "activity", group: "Operations", lock: true },
  { key: "drivethru", label: "Drive-thru", short: "Drive", icon: "car", group: "Operations", lock: true },
  { key: "email", label: "HTML email", short: "Email", icon: "mail", group: "Share", lock: true, desktop: true, date: true, region: true },
  { key: "targets", label: "Store targets", short: "Targets", icon: "target", group: "Share", lock: true, desktop: true },
];

const NAV_GROUPS = ["Today", "Stores", "Operations", "Share"];

export default function ShiftApp() {
  const [view, setView] = useState("week");
  const [isoDate, setIsoDate] = useState(yesterdayISO());
  const [region, setRegion] = useState("All");
  const [search, setSearch] = useState("");

  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [reporter, setReporter] = useState(false);
  const [showUnlock, setShowUnlock] = useState(false);
  const [notice, setNotice] = useState(null);

  const cfg = VIEWS.find((v) => v.key === view) || VIEWS[1];
  const visible = VIEWS.filter((v) => !v.lock || reporter);

  // Restore a reporter session and land on the dashboard
  useEffect(() => {
    if (sessionStorage.getItem("shift_reporter_code")) {
      setReporter(true);
      setView("dashboard");
    }
  }, []);

  // The week view and the leaderboard share one report payload
  useEffect(() => {
    if (!isoDate) return;
    let dead = false;
    setLoading(true);
    setError(null);

    fetch(`/api/report?date=${isoDate}`)
      .then((r) => r.json())
      .then((d) => {
        if (dead) return;
        if (!d.ok) {
          setError(d.error);
          setReport(null);
        } else {
          setReport(d);
        }
        setLoading(false);
      })
      .catch((e) => {
        if (dead) return;
        setError(String(e));
        setLoading(false);
      });

    return () => {
      dead = true;
    };
  }, [isoDate]);

  // Today's numbers keep moving, so refresh every five minutes
  useEffect(() => {
    if (!report?.isLive) return;
    const id = setInterval(() => {
      fetch(`/api/report?date=${isoDate}`)
        .then((r) => r.json())
        .then((d) => d.ok && setReport(d))
        .catch(() => {});
    }, 300000);
    return () => clearInterval(id);
  }, [report?.isLive, isoDate]);

  function lock(message) {
    sessionStorage.removeItem("shift_reporter_code");
    setReporter(false);
    setNotice(message || null);
    if (VIEWS.find((v) => v.key === view)?.lock) setView("week");
  }

  return (
    <div className="app">
      <nav className="sidebar">
        <div className="logo">
          <div className="logo-mark">S</div>
          <div>
            <div className="logo-text">SHIFT</div>
            <div className="logo-sub">La La Land</div>
          </div>
        </div>

        {NAV_GROUPS.map((g) => {
          const items = visible.filter((v) => v.group === g);
          if (!items.length) return null;
          return (
            <div key={g}>
              <div className="nsec">{g}</div>
              {items.map((v) => (
                <button
                  key={v.key}
                  className={"nbtn" + (view === v.key ? " active" : "")}
                  onClick={() => setView(v.key)}
                >
                  <Icon name={v.icon} />
                  {v.label}
                </button>
              ))}
            </div>
          );
        })}

        <div className="sidebar-spacer" />

        <button
          className="nbtn"
          onClick={() => (reporter ? lock() : setShowUnlock(true))}
        >
          <Icon name={reporter ? "lock" : "unlock"} />
          {reporter ? "Lock reporter mode" : "Unlock reporter mode"}
        </button>
        <div className="nfoot">
          <span className={"ndot" + (reporter ? " on" : "")} />
          {reporter ? "Reporter access on" : "Read only"}
        </div>
      </nav>

      {showUnlock && (
        <UnlockModal
          onClose={() => setShowUnlock(false)}
          onUnlocked={() => {
            setReporter(true);
            setShowUnlock(false);
            setNotice(null);
            setView("dashboard");
          }}
        />
      )}

      <div className="main">
        <header className="topbar">
          <div>
            <div className="ptitle">{cfg.label}</div>
            {report && (
              <div className="psub">
                Week {report.weekNum} · Period {report.period} · 34 stores
              </div>
            )}
          </div>

          <div className="tbr">
            {cfg.search && (
              <label className="field field-search">
                <Icon name="search" size={14} />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Store or code"
                />
              </label>
            )}
            {cfg.date && (
              <label className="field">
                <Icon name="calendar" size={14} />
                <input type="date" value={isoDate} onChange={(e) => setIsoDate(e.target.value)} />
              </label>
            )}
            {cfg.region && (
              <label className="field">
                <select value={region} onChange={(e) => setRegion(e.target.value)}>
                  <option value="All">All regions</option>
                  <option value="TX-TN">TX-TN</option>
                  <option value="CA-AZ">CA-AZ</option>
                </select>
                <Icon name="down" size={14} />
              </label>
            )}
          </div>
        </header>

        <div className="mobile-nav">
          {visible
            .filter((v) => !v.desktop)
            .map((v) => (
              <button
                key={v.key}
                className={"mnav-btn" + (view === v.key ? " active" : "")}
                onClick={() => setView(v.key)}
              >
                <Icon name={v.icon} size={14} />
                {v.short}
              </button>
            ))}
        </div>

        <main className="content">
          {notice && (
            <div className="note note-warn">
              <Icon name="alert" size={15} />
              <div>{notice}</div>
            </div>
          )}

          {view === "week" && (
            <WeekView
              report={report}
              loading={loading}
              error={error}
              groupFilter={region}
              search={search}
            />
          )}
          {view === "leaderboard" && <Leaderboard report={report} />}
          {view === "storetrend" && <StoreTrend isoDate={isoDate} />}
          {view === "dashboard" && reporter && <Dashboard isoDate={isoDate} />}
          {view === "service" && reporter && <ServiceBoard isoDate={isoDate} />}
          {view === "tplh" && reporter && <TPLH />}
          {view === "drivethru" && reporter && <DriveThru />}
          {view === "email" && reporter && (
            <EmailPreview isoDate={isoDate} groupFilter={region} />
          )}
          {view === "targets" && reporter && <Targets onAuthExpired={lock} />}

          {cfg.lock && !reporter && (
            <div className="empty">
              <Icon name="lock" size={22} />
              <div className="empty-title">Reporter mode required</div>
              <div>Unlock from the sidebar to open this view.</div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
