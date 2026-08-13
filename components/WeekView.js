"use client";

import { Fragment } from "react";
import Icon from "./Icon";
import { sectionize, money, int, paren, clockTime } from "../lib/ui";

/**
 * Deliberately frozen. This table is the daily email, so its layout, column
 * order and cell colors have to match what goes out to the field. Everything
 * here is scoped by .wk-legacy in globals.css, which cancels the new table
 * styling for this view only. Do not "clean it up".
 */

function Flag({ flags }) {
  if (!flags || !flags.length) return null;
  return (
    <span className="lc-flag" title={flags.join(" \u00b7 ")}>
      <Icon name="alert" size={11} />
    </span>
  );
}

export default function WeekView({ report, loading, error, groupFilter, search }) {
  if (loading && !report) return <div className="empty">Loading...</div>;
  if (error) return <div className="empty">Error: {error}</div>;
  if (!report) return <div className="empty">Pick a date to load the report.</div>;

  const rows = report.rows || [];
  const sections = sectionize(rows, { group: groupFilter, search });
  const totals = rows.reduce(
    (a, r) => ({ hours: a.hours + r.day.hours, sales: a.sales + r.day.sales }),
    { hours: 0, sales: 0 }
  );
  const totalSplh = totals.hours > 0 ? Math.round(totals.sales / totals.hours) : 0;

  return (
    <div className="wk-legacy">
      <div style={{ marginBottom: 17 }}>
        <div
          style={{
            background: "#1a1a2e",
            color: "#fff",
            padding: "8px 16px",
            borderRadius: 10,
            fontSize: 13,
            display: "inline-block",
            verticalAlign: "top",
          }}
        >
          <span style={{ fontWeight: 700 }}>Week {report.weekNum}</span>
          <span style={{ opacity: 0.85 }}>
            {" \u00b7 "}
            {report.dayName}
            {" \u00b7 "}Period {report.period}
          </span>
          <div style={{ fontSize: 10.5, opacity: 0.7, marginTop: 2 }}>
            Week starts {report.weekStart}
          </div>
        </div>
        {report.isLive ? (
          <div
            style={{
              display: "inline-block",
              marginLeft: 10,
              background: "#1a6630",
              color: "#fff",
              padding: "8px 14px",
              borderRadius: 10,
              fontSize: 12,
              verticalAlign: "top",
            }}
          >
            <span style={{ fontWeight: 700 }}>LIVE</span>
            <div style={{ fontSize: 10.5, opacity: 0.85, marginTop: 2 }}>
              {report.lastSyncAt
                ? "Data as of " + clockTime(report.lastSyncAt)
                : "Waiting for first sync today"}
            </div>
          </div>
        ) : (
          <div
            style={{
              display: "inline-block",
              marginLeft: 10,
              background: "#ededea",
              color: "#5f5f5c",
              padding: "8px 14px",
              borderRadius: 10,
              fontSize: 12,
              verticalAlign: "top",
            }}
          >
            <span style={{ fontWeight: 700 }}>Final</span>
            <div style={{ fontSize: 10.5, opacity: 0.75, marginTop: 2 }}>
              {report.lastSyncAt ? "Synced " + clockTime(report.lastSyncAt) : "Day closed"}
            </div>
          </div>
        )}
      </div>

      <div className="mc-grid cols-3">
        <div className="mc">
          <div className="mc-l">Total Hours ({report.dayName})</div>
          <div className="mc-v">{int(totals.hours)}</div>
        </div>
        <div className="mc">
          <div className="mc-l">Total Gross Sales</div>
          <div className="mc-v">{money(totals.sales)}</div>
        </div>
        <div className="mc">
          <div className="mc-l">Blended SPLH</div>
          <div className="mc-v">${totalSplh}</div>
          <div className="mc-s">
            {groupFilter === "All" ? "34 stores" : groupFilter}
            {" \u00b7 "}
            {report.dayName}, {report.date}
          </div>
        </div>
      </div>

      <div className="tcard desktop-table">
        <div className="thead">
          <span className="ttl">
            Labor Dashboard - {report.dayName}, {report.date}
          </span>
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
                <th className="r sep">WTD Hours</th>
                <th className="r">WTD Sales</th>
                <th className="r">WTD SPLH</th>
                <th className="r">WTD (Over)/Under</th>
                <th className="r sep">Total Training</th>
                <th className="r">Trainee</th>
                <th className="r">Trainer</th>
                <th className="r sep">PTD Hours</th>
                <th className="r">PTD Sales</th>
                <th className="r">PTD SPLH</th>
              </tr>
            </thead>
            <tbody>
              {sections.map((sec) => (
                <Fragment key={sec.label}>
                  <tr className="rrow">
                    <td colSpan={16}>{sec.label}</td>
                  </tr>
                  {sec.stores.map((s) => (
                    <tr key={s.code}>
                      <td>
                        <div className="lc-code">
                          {s.code}
                          <Flag flags={s.day.flags} />
                        </div>
                        <div className="lc-name">{s.name}</div>
                      </td>
                      <td className="num">{s.day.hours}</td>
                      <td className="num">{money(s.day.sales)}</td>
                      <td className="num">${s.day.target}</td>
                      <td className={"num " + (s.day.ok ? "cell-ok" : "cell-bad")}>${s.day.splh}</td>
                      <td className="num">{paren(s.day.overUnder)}</td>

                      <td className="num sep">{s.wtd.hours}</td>
                      <td className="num">{money(s.wtd.sales)}</td>
                      <td className={"num " + (s.wtd.ok ? "cell-ok" : "cell-bad")}>${s.wtd.splh}</td>
                      <td className="num">{paren(s.wtd.overUnder)}</td>

                      <td className="num sep">{s.wtd.trainTotal || "-"}</td>
                      <td className="num">{s.wtd.trainee || "-"}</td>
                      <td className="num">{s.wtd.trainer || "-"}</td>

                      {s.ptd.empty ? (
                        <>
                          <td className="num sep cell-dim">-</td>
                          <td className="num cell-dim">-</td>
                          <td className="num cell-dim">-</td>
                        </>
                      ) : (
                        <>
                          <td className="num sep">{int(s.ptd.hours)}</td>
                          <td className="num">{money(s.ptd.sales)}</td>
                          <td className={"num " + (s.ptd.ok ? "cell-ok" : "cell-bad")}>
                            ${s.ptd.splh}
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mobile-cards">
        {sections.map((sec) => (
          <div key={sec.label}>
            <div className="scard-region-head">{sec.label}</div>
            {sec.stores.map((s) => (
              <div className={"store-card " + (s.day.ok ? "ok" : "bad")} key={s.code}>
                <div className="store-card-head">
                  <div>
                    <div className="store-card-code">
                      {s.code}
                      <Flag flags={s.day.flags} />
                    </div>
                    <div className="store-card-name">{s.name}</div>
                  </div>
                  <div className="store-card-splh">
                    ${s.day.target}
                    <u>TARGET</u>
                  </div>
                </div>

                <div className="scard-block">
                  <div className="scard-block-label">Day - {report.dayName}</div>
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
                      <div className="scard-cell-val">{paren(s.wtd.overUnder)}</div>
                    </div>
                  </div>
                </div>

                <div className="scard-block">
                  <div className="scard-block-label">Period to Date</div>
                  {s.ptd.empty ? (
                    <div style={{ fontSize: 12, color: "#999994", padding: "4px 2px" }}>
                      No period data
                    </div>
                  ) : (
                    <div className="scard-row">
                      <div className="scard-cell">
                        <div className="scard-cell-lbl">Hours</div>
                        <div className="scard-cell-val">{int(s.ptd.hours)}</div>
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
    </div>
  );
}
