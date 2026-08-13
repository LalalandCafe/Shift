"use client";

import { Fragment, useState, useEffect } from "react";
import Icon from "./Icon";
import {
  sectionize,
  int,
  dec,
  money,
  pct,
  median,
  quantile,
  railPos,
  addDays,
  shortDate,
} from "../lib/ui";

/**
 * There is no TPLH target yet, on purpose. Every judgement on this screen is
 * relative: to the rest of the chain this week, or to the same store last week.
 */

const MIX = {
  both: { label: "Volume + ticket", chip: "chip-pos", why: "Above the chain on speed and on ticket size" },
  speed: { label: "Speed-led", chip: "chip-info", why: "Serves more people per hour, smaller tickets" },
  ticket: { label: "Ticket-led", chip: "chip-info", why: "Fewer transactions per hour, bigger tickets" },
  under: { label: "Behind on both", chip: "chip-neg", why: "Below the chain on speed and on ticket size" },
  even: { label: "Even", chip: "chip-mute", why: "Close to the chain on both" },
};

function mixOf(tplh, avgTicket, cTplh, cTicket) {
  if (!tplh || !avgTicket || !cTplh || !cTicket) return null;
  const t = tplh / cTplh;
  const k = avgTicket / cTicket;
  const hiT = t >= 1.05;
  const loT = t <= 0.95;
  const hiK = k >= 1.05;
  const loK = k <= 0.95;
  if (hiT && hiK) return "both";
  if (hiT && loK) return "speed";
  if (loT && hiK) return "ticket";
  if (loT && loK) return "under";
  return "even";
}

function Delta({ value }) {
  if (value === null || value === undefined) return <span className="cell-dim">—</span>;
  const cls = value > 2 ? "cell-ok" : value < -2 ? "cell-bad" : "cell-dim";
  return <span className={cls}>{pct(value)}</span>;
}

export default function TPLH() {
  const [weekStart, setWeekStart] = useState(null);
  const [data, setData] = useState(null);
  const [prev, setPrev] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Current week
  useEffect(() => {
    let dead = false;
    setLoading(true);
    setError(null);
    setPrev(null);

    fetch(weekStart ? `/api/throughput?weekStart=${weekStart}` : "/api/throughput")
      .then((r) => r.json())
      .then((j) => {
        if (dead) return;
        if (!j.ok) throw new Error(j.error || "Unknown error");
        setData(j);
        setLoading(false);
      })
      .catch((e) => {
        if (dead) return;
        setError(e.message);
        setLoading(false);
      });

    return () => {
      dead = true;
    };
  }, [weekStart]);

  // Previous week, loaded after so it never blocks the table
  useEffect(() => {
    if (!data?.weekStart) return;
    let dead = false;
    fetch(`/api/throughput?weekStart=${addDays(data.weekStart, -7)}`)
      .then((r) => r.json())
      .then((j) => {
        if (dead || !j.ok) return;
        const map = {};
        (j.rows || []).forEach((r) => {
          if (r.tplh !== null) map[r.code] = r.tplh;
        });
        setPrev(map);
      })
      .catch(() => {});
    return () => {
      dead = true;
    };
  }, [data?.weekStart]);

  if (loading && !data) {
    return (
      <div className="mc-grid">
        <div className="skel" />
        <div className="skel" />
        <div className="skel" />
        <div className="skel" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="empty">
        <div className="empty-title">Could not load TPLH</div>
        <div>{error}</div>
        <div style={{ maxWidth: 440, fontSize: 11.5 }}>
          If the message mentions daily_transactions, the table has not been created yet. No other
          report depends on this view.
        </div>
      </div>
    );
  }

  const rows = data.rows || [];
  const sections = sectionize(rows);
  const reporting = rows.filter((r) => r.tplh !== null && r.hasTxnData);
  const missing = rows.filter((r) => !r.hasTxnData);
  const partial = rows.filter((r) => r.hasTxnData && r.daysWithTxn < r.daysInWeek);

  const totalTxn = rows.reduce((a, r) => a + (r.transactions || 0), 0);
  const totalSales = rows.reduce((a, r) => a + (r.sales || 0), 0);
  const companyTicket = totalTxn > 0 ? totalSales / totalTxn : null;

  const values = reporting.map((r) => r.tplh).sort((a, b) => a - b);
  const med = values.length ? median(values) : null;
  const p25 = values.length ? quantile(values, 0.25) : null;
  const p75 = values.length ? quantile(values, 0.75) : null;
  const lo = values[0];
  const hi = values[values.length - 1];

  const ranked = [...reporting].sort((a, b) => b.tplh - a.tplh);
  const rank = {};
  ranked.forEach((r, i) => (rank[r.code] = i + 1));

  // Group the partial-week noise into one sentence instead of 34 names.
  const partialByDays = partial.reduce((acc, p) => {
    const k = `${p.daysWithTxn}/${p.daysInWeek}`;
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});

  const isCurrent = !weekStart || weekStart === data.weekStart;

  return (
    <div className="view">
      <div className="ctx">
        <div className="seg">
          <button
            className="seg-btn"
            onClick={() => setWeekStart(addDays(data.weekStart, -7))}
            aria-label="Previous week"
          >
            <Icon name="left" size={15} />
          </button>
          <div className="seg-label">
            <b>
              {shortDate(data.weekStart)} to {shortDate(data.weekEnd)}
            </b>
            <span>Week starting {data.weekStart}</span>
          </div>
          <button
            className="seg-btn"
            onClick={() => setWeekStart(addDays(data.weekStart, 7))}
            aria-label="Next week"
          >
            <Icon name="right" size={15} />
          </button>
        </div>
        {!isCurrent && (
          <button className="btn btn-sm" onClick={() => setWeekStart(null)}>
            Back to current week
          </button>
        )}
        {loading && <span className="chip chip-mute">Refreshing</span>}
      </div>

      <div className="mc-grid">
        <div className="mc">
          <div className="mc-l">Company TPLH</div>
          <div className="mc-v">{dec(data.companyTplh)}</div>
          <div className="mc-s">All transactions divided by all labor hours</div>
        </div>
        <div className="mc">
          <div className="mc-l">Typical store</div>
          <div className="mc-v">{dec(med)}</div>
          <div className="mc-s">
            Middle 50% run {dec(p25)} to {dec(p75)}
          </div>
        </div>
        <div className="mc">
          <div className="mc-l">Transactions</div>
          <div className="mc-v">{int(totalTxn)}</div>
          <div className="mc-s">
            Closed checks · avg ticket {money(companyTicket)}
          </div>
        </div>
        <div className="mc">
          <div className="mc-l">Reporting</div>
          <div className="mc-v">
            {reporting.length} <span className="mc-u">/ {data.storesTotal}</span>
          </div>
          <div className="mc-s">
            {missing.length ? `${missing.length} without transaction data` : "Every store reported"}
          </div>
        </div>
      </div>

      {values.length > 1 && (
        <div className="rail">
          <div className="rail-head">
            <div>
              <div className="ttl">Spread across the chain</div>
              <div className="tsub">
                Slower on the left, faster on the right. Hover to read the name.
              </div>
            </div>
            <span className="chip chip-mute">
              {dec(lo)} to {dec(hi)} TPLH
            </span>
          </div>

          <div className="rail-track">
            <div className="rail-line" />
            <div
              className="rail-band"
              style={{
                left: railPos(p25, lo, hi) + "%",
                width: railPos(p75, lo, hi) - railPos(p25, lo, hi) + "%",
              }}
            />
            <div
              className="rail-median"
              data-label={`median ${dec(med)}`}
              style={{ left: railPos(med, lo, hi) + "%" }}
            />
            {reporting.map((r, i) => (
              <div
                key={r.code}
                className={
                  "rail-dot " + (r.tplh >= p75 ? "fast" : r.tplh <= p25 ? "watch" : "pace")
                }
                style={{
                  left: railPos(r.tplh, lo, hi) + "%",
                  transform: "translate(-50%, -50%)",
                  "--i": i,
                }}
                title={`${r.name} · ${dec(r.tplh)} TPLH`}
              />
            ))}
          </div>

          <div className="rail-axis">
            <span>{dec(lo)}</span>
            <span>{dec(hi)}</span>
          </div>

          <div className="rail-legend">
            <span>
              <i style={{ background: "var(--pos)" }} />
              Top quarter
            </span>
            <span>
              <i style={{ background: "var(--cobalt)" }} />
              Middle half
            </span>
            <span>
              <i style={{ background: "var(--warn)" }} />
              Bottom quarter
            </span>
            <span style={{ marginLeft: "auto" }}>
              No target set, so every read is relative to the chain
            </span>
          </div>
        </div>
      )}

      {(missing.length > 0 || partial.length > 0) && (
        <div className="note note-warn" style={{ marginTop: 16, marginBottom: 0 }}>
          <Icon name="alert" size={15} />
          <div>
            {partial.length > 0 && (
              <div>
                <b>Partial week:</b>{" "}
                {Object.entries(partialByDays)
                  .map(([days, n]) => `${n} store${n > 1 ? "s" : ""} at ${days} days`)
                  .join(", ")}
                . TPLH is correct for the days present but is not comparable to a full week.
              </div>
            )}
            {missing.length > 0 && (
              <div style={{ marginTop: partial.length ? 4 : 0 }}>
                <b>No transaction data:</b> {missing.length} store
                {missing.length > 1 ? "s" : ""} ({missing.map((m) => m.name).join(", ")}). Counts
                only exist from the day this view shipped, so earlier weeks stay blank until a
                backfill runs.
              </div>
            )}
          </div>
        </div>
      )}

      <div className="tcard desktop-table">
        <div className="thead">
          <div>
            <div className="ttl">TPLH by store</div>
            <div className="tsub">
              Transactions divided by labor hours. SPLH equals TPLH times average ticket, so the
              mix column shows which half is carrying the store.
            </div>
          </div>
        </div>
        <div className="scx tall">
          <table className="grid">
            <thead>
              <tr>
                <th style={{ width: 34 }} className="r">
                  #
                </th>
                <th>Location</th>
                <th style={{ width: 168 }}>TPLH</th>
                <th className="r">vs chain</th>
                <th className="r">vs last week</th>
                <th className="r sep">Transactions</th>
                <th className="r">Hours</th>
                <th className="r">Avg ticket</th>
                <th className="r">SPLH</th>
                <th className="r">Mix</th>
              </tr>
            </thead>
            <tbody>
              {sections.map((sec) => (
                <Fragment key={sec.label}>
                  <tr className="rrow">
                    <td colSpan={10}>{sec.label}</td>
                  </tr>
                  {sec.stores.map((s) => {
                    const mix = mixOf(s.tplh, s.avgTicket, data.companyTplh, companyTicket);
                    const last = prev && prev[s.code];
                    const wow = last && s.tplh ? ((s.tplh - last) / last) * 100 : null;
                    return (
                      <tr key={s.code}>
                        <td className="num cell-dim">{rank[s.code] || "—"}</td>
                        <td>
                          <div className="lc-code">
                            {s.code}
                            {!s.hasTxnData && (
                              <span className="lc-flag" title="No transaction data this week">
                                <Icon name="alert" size={12} />
                              </span>
                            )}
                          </div>
                          <div className="lc-name">{s.name}</div>
                        </td>
                        <td>
                          <div className="bar">
                            <span
                              style={{
                                fontSize: 13,
                                fontWeight: 700,
                                minWidth: 38,
                                textAlign: "right",
                                fontVariantNumeric: "tabular-nums",
                              }}
                            >
                              {dec(s.tplh)}
                            </span>
                            <div className="bar-track">
                              {s.tplh !== null && (
                                <div
                                  className={
                                    "bar-fill " +
                                    (s.tplh >= p75 ? "pos" : s.tplh <= p25 ? "warn" : "cobalt")
                                  }
                                  style={{ width: railPos(s.tplh, 0, hi) + "%" }}
                                />
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="num">
                          <Delta value={s.vsCompanyPct} />
                        </td>
                        <td className="num">
                          <Delta value={wow} />
                        </td>
                        <td className="num sep">{int(s.transactions)}</td>
                        <td className="num">{dec(s.hours, 1)}</td>
                        <td className="num">{s.avgTicket === null ? "—" : "$" + dec(s.avgTicket)}</td>
                        <td className="num">{s.splh === null ? "—" : "$" + dec(s.splh, 0)}</td>
                        <td style={{ textAlign: "right" }}>
                          {mix ? (
                            <span className={"chip " + MIX[mix].chip} title={MIX[mix].why}>
                              {MIX[mix].label}
                            </span>
                          ) : (
                            <span className="cell-dim">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
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
            {sec.stores.map((s, i) => {
              const mix = mixOf(s.tplh, s.avgTicket, data.companyTplh, companyTicket);
              const last = prev && prev[s.code];
              const wow = last && s.tplh ? ((s.tplh - last) / last) * 100 : null;
              const top = s.tplh !== null && s.tplh >= p75;
              const bottom = s.tplh !== null && s.tplh <= p25;
              return (
                <div
                  className={"store-card " + (top ? "ok" : bottom ? "bad" : "")}
                  key={s.code}
                  style={{ "--i": i }}
                >
                  <div className="store-card-head">
                    <div>
                      <div className="store-card-code">
                        {rank[s.code] ? `#${rank[s.code]} · ` : ""}
                        {s.code}
                      </div>
                      <div className="store-card-name">{s.name}</div>
                      {mix && (
                        <span className={"chip " + MIX[mix].chip} style={{ marginTop: 6 }}>
                          {MIX[mix].label}
                        </span>
                      )}
                    </div>
                    <div className="store-card-splh">
                      {dec(s.tplh)}
                      <u>TPLH</u>
                    </div>
                  </div>

                  <div className="scard-block">
                    <div className="scard-block-label">This week</div>
                    <div className="scard-row">
                      <div className="scard-cell">
                        <div className="scard-cell-lbl">Transactions</div>
                        <div className="scard-cell-val">{int(s.transactions)}</div>
                      </div>
                      <div className="scard-cell">
                        <div className="scard-cell-lbl">Hours</div>
                        <div className="scard-cell-val">{dec(s.hours, 1)}</div>
                      </div>
                      <div className="scard-cell">
                        <div className="scard-cell-lbl">Avg ticket</div>
                        <div className="scard-cell-val">
                          {s.avgTicket === null ? "—" : "$" + dec(s.avgTicket)}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="scard-block">
                    <div className="scard-block-label">Comparisons</div>
                    <div className="scard-row">
                      <div className="scard-cell">
                        <div className="scard-cell-lbl">vs chain</div>
                        <div className="scard-cell-val">
                          <Delta value={s.vsCompanyPct} />
                        </div>
                      </div>
                      <div className="scard-cell">
                        <div className="scard-cell-lbl">vs last week</div>
                        <div className="scard-cell-val">
                          <Delta value={wow} />
                        </div>
                      </div>
                      <div className="scard-cell">
                        <div className="scard-cell-lbl">SPLH</div>
                        <div className="scard-cell-val">
                          {s.splh === null ? "—" : "$" + dec(s.splh, 0)}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className="footnote">
        TPLH counts closed checks divided by labor hours, so it does not move when prices change or
        when average ticket runs high. Labor hours use the same exclusions as the week view: NSO
        trainer, general manager and the excluded employee list. Open shifts count elapsed time,
        capped at 18 hours. There is no TPLH target yet, so nothing here is scored against a goal.
        {data.generatedAt ? ` Generated ${new Date(data.generatedAt).toLocaleString()}.` : ""}
      </div>
    </div>
  );
}
