"use client";

import { useState, useEffect, useCallback } from "react";
import "./globals.css";

import Icon from "../components/Icon";
import ShiftLogo from "../components/ShiftLogo";
import Login from "../components/Login";
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
 * Una sola fuente de verdad para la navegacion, los titulos y que controles
 * aparecen en la barra superior.
 *
 *   roles    quien puede abrir la vista. El servidor impone lo mismo: esta
 *            lista decide que se DIBUJA, el middleware y requireRole deciden
 *            que se PUEDE. Antes solo existia la primera mitad.
 *   desktop  se oculta en pantallas angostas
 *   date / region / search  que controles muestra la barra superior
 */
const ALL = ["admin", "region", "store"];

const VIEWS = [
  { key: "dashboard",   label: "Dashboard",     short: "Dashboard", icon: "dashboard", group: "Today",      roles: ["admin"], date: true },
  { key: "week",        label: "Week view",     short: "Week",      icon: "table",     group: "Today",      roles: ALL, date: true, region: true, search: true },
  { key: "storetrend",  label: "Store detail",  short: "Store",     icon: "search",    group: "Stores",     roles: ALL, date: true },
  { key: "leaderboard", label: "Leaderboard",   short: "Board",     icon: "rank",      group: "Stores",     roles: ALL, date: true },
  { key: "service",     label: "Service times", short: "Service",   icon: "timer",     group: "Operations", roles: ["admin"], date: true },
  { key: "tplh",        label: "TPLH",          short: "TPLH",      icon: "activity",  group: "Operations", roles: ["admin"] },
  { key: "drivethru",   label: "Drive-thru",    short: "Drive",     icon: "car",       group: "Operations", roles: ["admin"] },
  { key: "email",       label: "HTML email",    short: "Email",     icon: "mail",      group: "Share",      roles: ["admin"], desktop: true, date: true, region: true },
  { key: "targets",     label: "Store targets", short: "Targets",   icon: "target",    group: "Share",      roles: ["admin"], desktop: true },
];

const NAV_GROUPS = ["Today", "Stores", "Operations", "Share"];

const ROLE_LABEL = { admin: "Admin", region: "Region lead", store: "Store" };

export default function ShiftApp() {
  const [session, setSession] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  const [view, setView] = useState("week");
  const [isoDate, setIsoDate] = useState(yesterdayISO());
  const [region, setRegion] = useState("All");
  const [search, setSearch] = useState("");

  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [notice, setNotice] = useState(null);
  const [collapsed, setCollapsed] = useState(false);

  const visible = VIEWS.filter((v) => session && v.roles.includes(session.role));
  const cfg = VIEWS.find((v) => v.key === view) || VIEWS[1];
  const allowed = session ? cfg.roles.includes(session.role) : false;

  // La sesion vive en una cookie HttpOnly, asi que el cliente no puede
  // leerla: se la tiene que preguntar al servidor.
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok && d.session) {
          setSession(d.session);
          if (d.session.role === "admin") setView("dashboard");
        }
      })
      .catch(() => {})
      .finally(() => setAuthChecked(true));

    if (localStorage.getItem("shift_nav_collapsed") === "1") setCollapsed(true);
  }, []);

  function toggleNav() {
    setCollapsed((c) => {
      localStorage.setItem("shift_nav_collapsed", c ? "0" : "1");
      return !c;
    });
  }

  // Una sesion vencida a media manana devuelve 401 en la siguiente peticion.
  // Sin esto, la pantalla se quedaria mostrando "Error: Not signed in" en
  // vez de pedir el codigo otra vez.
  const expired = useCallback((message) => {
    setSession(null);
    setReport(null);
    setView("week");
    setNotice(message || "Your session expired. Enter your code again.");
  }, []);

  // El week view y el leaderboard comparten un solo payload de reporte.
  useEffect(() => {
    if (!isoDate || !session) return;
    let dead = false;
    setLoading(true);
    setError(null);

    fetch(`/api/report?date=${isoDate}`)
      .then(async (r) => {
        if (r.status === 401) {
          if (!dead) expired();
          return null;
        }
        return r.json();
      })
      .then((d) => {
        if (dead || !d) return;
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
  }, [isoDate, session, expired]);

  // Los numeros de hoy siguen moviendose, refresca cada cinco minutos.
  useEffect(() => {
    if (!report?.isLive || !session) return;
    const id = setInterval(() => {
      fetch(`/api/report?date=${isoDate}`)
        .then((r) => {
          if (r.status === 401) {
            expired();
            return null;
          }
          return r.json();
        })
        .then((d) => d?.ok && setReport(d))
        .catch(() => {});
    }, 300000);
    return () => clearInterval(id);
  }, [report?.isLive, isoDate, session, expired]);

  async function logout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {}
    setSession(null);
    setReport(null);
    setView("week");
    setNotice(null);
  }

  if (!authChecked) {
    return (
      <div className="empty" style={{ minHeight: "100vh" }}>
        <ShiftLogo variant="mark" size={38} crown />
      </div>
    );
  }

  if (!session) {
    return (
      <Login
        onSignedIn={(s) => {
          setSession(s);
          setNotice(null);
          setView(s.role === "admin" ? "dashboard" : "week");
        }}
      />
    );
  }

  return (
    <div className="app">
      <nav className={"sidebar" + (collapsed ? " collapsed" : "")}>
        <button
          className="logo"
          onClick={toggleNav}
          title={collapsed ? "Show the menu" : "Hide the menu"}
          aria-expanded={!collapsed}
        >
          <ShiftLogo variant="mark" size={34} crown={!collapsed} />
          <div className="logo-words">
            <div className="logo-text">SHIFT</div>
            <img
              className="logo-lockup"
              src="/logo/lalaland.png"
              alt="La La Land"
              width={90}
              height={13}
            />
          </div>
        </button>

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
                  title={collapsed ? v.label : undefined}
                >
                  <Icon name={v.icon} />
                  <span className="nbtn-label">{v.label}</span>
                </button>
              ))}
            </div>
          );
        })}

        <div className="sidebar-spacer" />

        <button className="nbtn" onClick={logout} title={collapsed ? "Sign out" : undefined}>
          <Icon name="lock" />
          <span className="nbtn-label">Sign out</span>
        </button>
        <div
          className="nfoot"
          title={`${session.name} · ${ROLE_LABEL[session.role] || session.role}`}
        >
          <span className="ndot on" />
          <span className="nbtn-label">
            {session.name}
            <div style={{ fontSize: 10, color: "var(--text3)", fontWeight: 500 }}>
              {ROLE_LABEL[session.role] || session.role}
              {session.scope ? ` · ${session.scope}` : ""}
              {session.storeCode ? ` · ${session.storeCode}` : ""}
            </div>
          </span>
        </div>
      </nav>

      <div className="main">
        <header className="topbar">
          <div className="topbar-id">
            <button className="mobile-logo" onClick={toggleNav} title="SHIFT" aria-label="SHIFT">
              <ShiftLogo variant="mark" size={30} crown />
            </button>
            <div>
              <div className="ptitle">{cfg.label}</div>
              {report && (
                <div className="psub">
                  Week {report.weekNum} · Period {report.period} ·{" "}
                  {(report.rows || []).length} stores
                </div>
              )}
            </div>
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

          {!allowed ? (
            <div className="empty">
              <Icon name="lock" size={22} />
              <div className="empty-title">This view is not available for your access</div>
              <div>If you need it, ask technology for access.</div>
            </div>
          ) : (
            <>
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
              {view === "dashboard" && (
                <Dashboard isoDate={isoDate} report={report} onNavigate={setView} />
              )}
              {view === "service" && <ServiceBoard isoDate={isoDate} />}
              {view === "tplh" && <TPLH />}
              {view === "drivethru" && <DriveThru />}
              {view === "email" && <EmailPreview isoDate={isoDate} groupFilter={region} />}
              {view === "targets" && <Targets onAuthExpired={expired} />}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
