"use client";

import { Fragment, useState } from "react";
import Icon from "./Icon";
import { sectionize, money, int, paren, clockTime } from "../lib/ui";
import { bandForRating, styleOfBand } from "../lib/scale";
import { MIN_REVIEWS_TO_RANK, weightedRating } from "../lib/leaderboard";

/**
 * Sortable columns. Region grouping is the default and is what the daily
 * email mirrors, so sorting is opt in: the moment a column is picked the
 * table flattens into one ranked list, and clearing it puts the regions back.
 */
const SORTS = {
  hours: (s) => s.day.hours,
  sales: (s) => s.day.sales,
  target: (s) => s.day.target,
  splh: (s) => s.day.splh,
  gap: (s) => s.day.splh - s.day.target,
  over: (s) => s.day.overUnder,
  wtdHours: (s) => s.wtd.hours,
  wtdSales: (s) => s.wtd.sales,
  wtdSplh: (s) => s.wtd.splh,
  wtdGap: (s) => s.wtd.splh - s.day.target,
  wtdOver: (s) => s.wtd.overUnder,
  ptdHours: (s) => (s.ptd.empty ? null : s.ptd.hours),
  ptdSales: (s) => (s.ptd.empty ? null : s.ptd.sales),
  ptdSplh: (s) => (s.ptd.empty ? null : s.ptd.splh),
  rating: (s) => s.reviews?.period?.rating ?? null,
  reviewCount: (s) => s.reviews?.period?.count ?? null,
};

/**
 * Deliberately frozen. This table is the daily email, so its layout, column
 * order and cell colors have to match what goes out to the field. Everything
 * here is scoped by .wk-legacy in globals.css, which cancels the new table
 * styling for this view only. Do not "clean it up".
 *
 * The review columns at the end are the exception, and they are the
 * automated replacement for the Tattle Report spreadsheet that used to be
 * pivoted by hand each period. They use the period window, not the week,
 * because that is the window the bonus is paid on. Review count comes first
 * because the count is what tells you whether the rating is worth reading at
 * all. The Bonus column itself has been removed from this table: which tier
 * a rating earns is compensation information, not an operating metric. It
 * does not appear anywhere in this app anymore — the Leaderboard dropped it
 * too, the day after it left this view.
 *
 * The (Over)/Under headers use an explicit <br /> instead of relying on the
 * browser to find a break point. Neither header has a space before the
 * slash, so word-wrap CSS either left it uncut (overflowing the column) or
 * broke it mid-word ("UN-DER"). A hard break after the slash is the one
 * approach that is never ambiguous.
 */

function Th({ label, sortKey, sort, onSort, className = "" }) {
  if (!sortKey) return <th className={className}>{label}</th>;
  const on = sort && sort.key === sortKey;
  return (
    <th
      className={className + " sortable" + (on ? " sorted" : "")}
      onClick={() => onSort(sortKey)}
      title={"Sort by " + (typeof label === "string" ? label : "column")}
    >
      <span className="th-in">
        {label}
        <Icon name={on && sort.dir === "asc" ? "up" : "down"} size={11} className="th-caret" />
      </span>
    </th>
  );
}

function Flag({ flags }) {
  if (!flags || !flags.length) return null;
  return (
    <span className="lc-flag" title={flags.join(" \u00b7 ")}>
      <Icon name="alert" size={11} />
    </span>
  );
}

/**
 * Background for a rating cell. Thin samples get no color at all, so nobody
 * reads a red cell built on two reviews as a real result.
 */
function ratingCellStyle(rev) {
  if (!rev || rev.rating === null) return undefined;
  if (rev.count < MIN_REVIEWS_TO_RANK) return undefined;
  return styleOfBand(bandForRating(rev.rating));
}

export default function WeekView({ report, loading, error, groupFilter, search }) {
  // null means the original region grouping, untouched.
  const [sort, setSort] = useState(null);

  function onSort(key) {
    setSort((cur) => {
      if (!cur || cur.key !== key) return { key, dir: "asc" };
      if (cur.dir === "asc") return { key, dir: "desc" };
      return null; // third click returns to the region view
    });
  }

  if (loading && !report) return <div className="empty">Loading...</div>;
  if (error) return <div className="empty">Error: {error}</div>;
  if (!report) return <div className="empty">Pick a date to load the report.</div>;

  const rows = report.rows || [];
  let sections = sectionize(rows, { group: groupFilter, search });

  if (sort) {
    const get = SORTS[sort.key];
    const flat = sections
      .flatMap((sec) => sec.stores)
      .sort((a, b) => {
        const av = get(a);
        const bv = get(b);
        if (av === null) return 1; // stores with no data always sink
        if (bv === null) return -1;
        return sort.dir === "asc" ? av - bv : bv - av;
      });
    sections = flat.length ? [{ label: null, stores: flat }] : [];
  }
  // Summary tiles must reflect whatever is actually in the table below them,
  // region filter and search included - not the whole chain regardless of view.
  const visibleStores = sections.flatMap((sec) => sec.stores);
  const totals = visibleStores.reduce(
    (a, r) => ({ hours: a.hours + r.day.hours, sales: a.sales + r.day.sales }),
    { hours: 0, sales: 0 }
  );
  const totalSplh = totals.hours > 0 ? Math.round(totals.sales / totals.hours) : 0;

  // Chain rating for the period, weighted by review count so a store with
  // four reviews does not swing the company number. Company-wide by design,
  // not scoped to the region filter - shared with the Leaderboard so the two
  // never quietly disagree.
  const { rating: chainRating, count: reviewTotal } = weightedRating(rows, "period");

  return (
    <div className="wk-legacy">
      <div style={{ marginBottom: 17 }}>
        <div
          style={{
            background: "var(--surface-3)",
            color: "var(--text)",
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
              background: "var(--band-green)",
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
              background: "var(--surface-3)",
              color: "var(--text2)",
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
            {groupFilter === "All" ? rows.length + " stores" : groupFilter}
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
          <div className="thead-tools">
            {chainRating !== null && (
              <span
                className="chip"
                style={{
                  ...styleOfBand(bandForRating(chainRating)),
                  border: "none",
                }}
                title={`${reviewTotal} Google and Yelp reviews in period ${report.period}`}
              >
                P{report.period} {chainRating.toFixed(2)} ★
              </span>
            )}
            <div className="seg">
              <button
                className={"seg-btn" + (!sort ? " active" : "")}
                onClick={() => setSort(null)}
              >
                By region
              </button>
              <button
                className={
                  "seg-btn seg-green" +
                  (sort && sort.key === "gap" && sort.dir === "desc" ? " active" : "")
                }
                onClick={() => setSort({ key: "gap", dir: "desc" })}
              >
                <span className="seg-dot green" />
                Green first
              </button>
              <button
                className={
                  "seg-btn seg-red" +
                  (sort && sort.key === "gap" && sort.dir === "asc" ? " active" : "")
                }
                onClick={() => setSort({ key: "gap", dir: "asc" })}
              >
                <span className="seg-dot red" />
                Red first
              </button>
            </div>
          </div>
        </div>
        <div className="scx">
          <table className="grid">
            <thead>
              <tr>
                <th>Location Name</th>
                <Th label="Hours" sortKey="hours" className="r" sort={sort} onSort={onSort} />
                <Th label="Sales" sortKey="sales" className="r" sort={sort} onSort={onSort} />
                <Th label="Target" sortKey="target" className="r" sort={sort} onSort={onSort} />
                <Th label="SPLH" sortKey="splh" className="r" sort={sort} onSort={onSort} />
                <Th
                  label={<>(Over)/<br />Under</>}
                  sortKey="over"
                  className="r"
                  sort={sort}
                  onSort={onSort}
                />
                <Th label="WTD Hours" sortKey="wtdHours" className="r sep" sort={sort} onSort={onSort} />
                <Th label="WTD Sales" sortKey="wtdSales" className="r" sort={sort} onSort={onSort} />
                <Th label="WTD SPLH" sortKey="wtdSplh" className="r" sort={sort} onSort={onSort} />
                <Th
                  label={<>WTD (Over)/<br />Under</>}
                  sortKey="wtdOver"
                  className="r"
                  sort={sort}
                  onSort={onSort}
                />
                <th className="r sep">Total Training</th>
                <th className="r">Trainee</th>
                <th className="r">Trainer</th>
                <Th label="PTD Hours" sortKey="ptdHours" className="r sep" sort={sort} onSort={onSort} />
                <Th label="PTD Sales" sortKey="ptdSales" className="r" sort={sort} onSort={onSort} />
                <Th label="PTD SPLH" sortKey="ptdSplh" className="r" sort={sort} onSort={onSort} />
                <Th label="Reviews Count" sortKey="reviewCount" className="r sep" sort={sort} onSort={onSort} />
                <Th label="PTD Rating" sortKey="rating" className="r" sort={sort} onSort={onSort} />
              </tr>
            </thead>
            <tbody>
              {sections.map((sec) => (
                <Fragment key={sec.label || "ranked"}>
                  {sec.label && (
                    <tr className="rrow">
                      <td colSpan={18}>{sec.label}</td>
                    </tr>
                  )}
                  {sec.stores.map((s) => {
                    const rev = s.reviews?.period || null;
                    const thin = rev && rev.count < MIN_REVIEWS_TO_RANK;
                    return (
                      <tr key={s.code}>
                        <td>
                          <div className="lc-code">
                            {s.code}
                            {sort && <span className="lc-region">{s.region}</span>}
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

                        {!rev || rev.rating === null ? (
                          <>
                            <td className="num sep cell-dim">-</td>
                            <td className="num cell-dim">-</td>
                          </>
                        ) : (
                          <>
                            <td
                              className="num sep"
                              title={
                                rev.unanswered
                                  ? `${rev.unanswered} with no reply`
                                  : "All replied to"
                              }
                            >
                              {rev.count}
                            </td>
                            <td
                              className={"num" + (thin ? " cell-dim" : "")}
                              style={ratingCellStyle(rev)}
                              title={
                                thin
                                  ? `Only ${rev.count} reviews, too few to judge`
                                  : `${rev.google} Google, ${rev.yelp} Yelp`
                              }
                            >
                              {rev.rating.toFixed(2)}
                            </td>
                          </>
                        )}
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
          <div key={sec.label || "ranked"}>
            {sec.label && <div className="scard-region-head">{sec.label}</div>}
            {sec.stores.map((s) => {
              const rev = s.reviews?.period || null;
              const thin = rev && rev.count < MIN_REVIEWS_TO_RANK;
              return (
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
                      <div style={{ fontSize: 12, color: "var(--text3)", padding: "4px 2px" }}>
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

                  <div className="scard-block">
                    <div className="scard-block-label">
                      Guest Reviews - Period {report.period}
                    </div>
                    {!rev || rev.rating === null ? (
                      <div style={{ fontSize: 12, color: "var(--text3)", padding: "4px 2px" }}>
                        No Google or Yelp reviews this period
                      </div>
                    ) : (
                      <div className="scard-row" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
                        <div className="scard-cell">
                          <div className="scard-cell-lbl">Reviews Count</div>
                          <div className="scard-cell-val">{rev.count}</div>
                        </div>
                        <div
                          className="scard-cell"
                          style={ratingCellStyle(rev)}
                          title={thin ? `Only ${rev.count} reviews` : undefined}
                        >
                          <div className="scard-cell-lbl">PTD Rating</div>
                          <div className="scard-cell-val">{rev.rating.toFixed(2)}</div>
                        </div>
                      </div>
                    )}
                    {rev && rev.unanswered > 0 && (
                      <div style={{ fontSize: 10.5, color: "var(--text3)", marginTop: 5 }}>
                        {rev.unanswered} of {rev.count} still have no reply
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}