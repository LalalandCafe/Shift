"use client";

import { useState, useEffect } from "react";
import Icon from "./Icon";
import CupMedal from "./CupMedal";
import EfficiencyQuadrant from "./EfficiencyQuadrant";
import { GROUPS, money, int } from "../lib/ui";
import { bandForRating, inkOfBand, REVIEW_TIERS } from "../lib/scale";
import { scoreStores, weightedRating, MIN_REVIEWS_TO_RANK } from "../lib/leaderboard";

/**
 * The main screen. Everything here is a summary of a tab that already exists,
 * so every block is a link rather than a dead end: the number tells you
 * something is off, the click takes you to where you can act on it.
 *
 * Scope is chosen once at the top and drives every block on the page. That is
 * the shape access control will take later: today the picker is open to
 * everyone, and locking a user to their own markets means narrowing this list
 * rather than rebuilding the screen.
 *
 * No block on this screen names a bonus or a dollar amount tied to one. This
 * view is behind reporter mode, but reporter codes get shared, and a store
 * comparison that shows what somebody else is paid stops being a comparison of
 * numbers. The review cutoffs are still here, stated as ratings.
 */

const SCOPES = [
  { key: "All", label: "All stores", match: () => true },
  { key: "TX-TN", label: "TX-TN", match: (s) => s.grp === "TX-TN" },
  { key: "CA-AZ", label: "CA-AZ", match: (s) => s.grp === "CA-AZ" },
  ...Object.values(GROUPS)
    .flat()
    .map((def) => ({
      key: def.label,
      label: def.label,
      match: (s) => def.regions.includes(s.region),
    })),
];

const PLACES = ["gold", "silver", "bronze"];
const SEV_LABEL = { data: "Data issue", critical: "Critical", warning: "Watch" };

// The top review line, read from scale.js rather than typed. It used to appear
// as a bare 4.5 in four separate places in this file, which is four places to
// miss if operations ever moves it.
const TOP_LINE = REVIEW_TIERS.basePlus;

/** A number that means something, and a place to go do something about it. */
function Tile({ label, value, unit, note, tone, onClick, to }) {
  return (
    <button className={"db-tile" + (tone ? " tone-" + tone : "")} onClick={onClick}>
      <div className="db-tile-l">{label}</div>
      <div className="db-tile-v">
        {value}
        {unit && <span className="db-tile-u">{unit}</span>}
      </div>
      <div className="db-tile-s">{note}</div>
      <div className="db-tile-go">
        {to}
        <Icon name="right" size={12} />
      </div>
    </button>
  );
}

function SectionHead({ title, sub, action, onAction }) {
  return (
    <div className="thead">
      <div>
        <div className="ttl">{title}</div>
        {sub && <div className="tsub">{sub}</div>}
      </div>
      {action && (
        <button className="db-link" onClick={onAction}>
          {action}
          <Icon name="right" size={12} />
        </button>
      )}
    </div>
  );
}

export default function Dashboard({ isoDate, report, onNavigate }) {
  const [scope, setScope] = useState("All");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  // The scope survives a reload, so a market lead is not re-picking their own
  // region every morning.
  useEffect(() => {
    const saved = localStorage.getItem("shift_dash_scope");
    if (saved && SCOPES.some((s) => s.key === saved)) setScope(saved);
  }, []);

  function pickScope(key) {
    setScope(key);
    localStorage.setItem("shift_dash_scope", key);
  }

  useEffect(() => {
    if (!isoDate) return;
    let dead = false;
    setLoading(true);
    setErr(null);
    fetch(`/api/dashboard?date=${isoDate}`)
      .then((r) => r.json())
      .then((d) => {
        if (dead) return;
        if (!d.ok) setErr(d.error);
        else setData(d);
        setLoading(false);
      })
      .catch((e) => {
        if (dead) return;
        setErr(String(e));
        setLoading(false);
      });
    return () => {
      dead = true;
    };
  }, [isoDate]);

  if (loading && !data) return <div className="empty">Loading dashboard...</div>;
  if (err) return <div className="empty">Error: {err}</div>;
  if (!data) return <div className="empty">No data for this date.</div>;

  const scopeDef = SCOPES.find((s) => s.key === scope) || SCOPES[0];
  const allRows = report?.rows || [];
  const rows = allRows.filter(scopeDef.match);

  // One set of store codes drives every block, so the exceptions list, the
  // movers chart and the podium can never disagree about who is in scope.
  const codes = new Set(rows.map((r) => r.code));
  const inScope = (x) => codes.size === 0 || codes.has(x.code);

  // ---- labor ----
  let curH = 0, curS = 0;
  rows.forEach((r) => {
    curH += r.wtd.hours;
    curS += r.wtd.sales;
  });
  const blended = curH > 0 ? Math.round(curS / curH) : null;

  // The delta is computed only across stores that reported both weeks, and on
  // summed hours and sales rather than an average of ratios.
  const comps = (data.trend.all || []).filter(inScope);
  let cH = 0, cS = 0, pH = 0, pS = 0;
  comps.forEach((t) => {
    cH += t.curHours;
    cS += t.curSales;
    pH += t.priHours;
    pS += t.priSales;
  });
  const delta = cH > 0 && pH > 0 ? Math.round(cS / cH - pS / pH) : null;

  const atTarget = rows.filter((r) => r.wtd.hours > 0 && r.wtd.splh >= r.day.target).length;

  // ---- reviews ----
  const chain = weightedRating(rows, "period");
  const rated = rows.filter(
    (r) => r.reviews?.period?.rating != null && r.reviews.period.count >= MIN_REVIEWS_TO_RANK
  );
  const watchlist = [...rated]
    .filter((r) => r.reviews.period.rating < TOP_LINE)
    .sort((a, b) => a.reviews.period.rating - b.reviews.period.rating)
    .slice(0, 5);

  // ---- podium ----
  const { byScore } = scoreStores(rows, "period");
  const podium = byScore.slice(0, 3);
  // Same scale logic as the Leaderboard goal bar, so 100% lines up in both
  // places: the higher of 120 or the top performer's own efficiency, rounded
  // up to a clean ten.
  const podScale = podium.length
    ? Math.max(120, Math.ceil(Math.max(...podium.map((s) => s.eff)) / 10) * 10)
    : 120;

  // ---- movers ----
  // Two short columns read faster than one list of diverging bars: a glance
  // at "who's up" and "who's down" without decoding bar length against a
  // shared axis.
  const movers = [...comps].sort((a, b) => b.delta - a.delta);
  const up = movers.filter((t) => t.delta > 0).slice(0, 5);
  const down = movers.filter((t) => t.delta < 0).slice(-5).reverse();

  // ---- exceptions ----
  const exceptions = (data.exceptions || []).filter(inScope);
  const urgent = exceptions.filter((e) => e.severity === "critical" || e.severity === "data").length;
  const clean = exceptions.length === 0;

  return (
    <div className="view">
      <div className="db-scopes">
        <div className="lb-chips">
          {SCOPES.map((sc) => {
            const n = allRows.filter(sc.match).length;
            if (!n) return null;
            return (
              <button
                key={sc.key}
                className={"lb-chip" + (scope === sc.key ? " active" : "")}
                onClick={() => pickScope(sc.key)}
              >
                {sc.label}
                <span className="lb-chip-n">{n}</span>
              </button>
            );
          })}
        </div>
        <span className={"chip " + (data.isLive ? "chip-live" : "chip-mute")}>
          {data.isLive
            ? "Live · " +
              (data.lastSyncAt
                ? new Date(data.lastSyncAt).toLocaleTimeString("en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                  })
                : "syncing")
            : "Final"}
        </span>
      </div>

      <div className={"db-rail" + (clean ? " clear" : "")}>
        <div className="db-rail-main">
          <div className="db-rail-eyebrow">
            {scopeDef.label} · Week {data.weekNum} · {data.dayName} · Period {data.period}
          </div>
          <div className="db-rail-num">
            {blended === null ? "--" : "$" + blended}
            <span className="db-rail-unit">blended WTD SPLH</span>
          </div>
          <div className="db-rail-sub">
            {delta === null ? (
              <>No comparable week to measure against yet.</>
            ) : (
              <>
                <b className={delta >= 0 ? "up" : "down"}>
                  {delta >= 0 ? "+" : ""}
                  {delta}
                </b>{" "}
                vs Week {data.trend.priorWeekNum}, across {comps.length} comparable{" "}
                {comps.length === 1 ? "store" : "stores"}
              </>
            )}
          </div>
        </div>
        <button className="db-rail-cta" onClick={() => onNavigate("week")}>
          <div className="db-rail-cta-num">{clean ? "0" : urgent}</div>
          <div className="db-rail-cta-lbl">
            {clean
              ? "nothing to flag"
              : urgent === 1
              ? "store needs attention"
              : "stores need attention"}
          </div>
          <div className="db-rail-cta-go">
            Open week view
            <Icon name="right" size={12} />
          </div>
        </button>
      </div>

      <div className="db-tiles">
        <Tile
          label="At or above SPLH"
          value={atTarget}
          unit={"/ " + rows.length}
          note="Week to date SPLH vs each store's own target"
          tone={rows.length && atTarget / rows.length >= 0.6 ? "pos" : "neg"}
          to="Week view"
          onClick={() => onNavigate("week")}
        />
        <Tile
          label={"Guest rating · period " + data.period}
          value={chain.rating === null ? "--" : chain.rating.toFixed(2)}
          note={
            chain.count
              ? `${int(chain.count)} Google and Yelp reviews, weighted by count`
              : "No reviews in this period yet"
          }
          tone={
            chain.rating === null
              ? null
              : chain.rating >= TOP_LINE
              ? "pos"
              : chain.rating >= REVIEW_TIERS.baseOnly
              ? "warn"
              : "neg"
          }
          to="Leaderboard"
          onClick={() => onNavigate("leaderboard")}
        />
        <Tile
          label="Hours logged, week to date"
          value={int(curH)}
          note={money(curS) + " in sales behind them"}
          to="Store detail"
          onClick={() => onNavigate("storetrend")}
        />
      </div>

      <div className="db-cols">
        <div className="tcard">
          <SectionHead
            title="Leading the board"
            sub="Half labor efficiency, half guest reviews"
            action="Full board"
            onAction={() => onNavigate("leaderboard")}
          />
          {podium.length ? (
            <div className="db-podium">
              {podium.map((s, i) => (
                <button
                  key={s.code}
                  className={"lb-pod " + PLACES[i]}
                  onClick={() => onNavigate("leaderboard")}
                >
                  <CupMedal place={PLACES[i]} rank={i + 1} size={34} />
                  <div className="lb-pod-body">
                    <div className="lb-pod-name">{s.name}</div>
                    <div className="lb-pod-meta">
                      {Math.round(s.eff)}% eff
                      {s.rev?.rating != null && (
                        <>
                          {" · "}
                          <b style={{ color: inkOfBand(bandForRating(s.rev.rating)) }}>
                            {s.rev.rating.toFixed(2)}
                          </b>
                        </>
                      )}
                      {" · "}
                      {s.region}
                    </div>
                    <div className="lb-goal">
                      <div
                        className={"lb-goal-fill " + (s.eff >= 100 ? "up" : "down")}
                        style={{ width: Math.min(100, (s.eff / podScale) * 100) + "%" }}
                      />
                      <div className="lb-goal-mark" style={{ left: (100 / podScale) * 100 + "%" }} />
                    </div>
                  </div>
                  <div className="lb-pod-pct neutral">{Math.round(s.score)}</div>
                </button>
              ))}
            </div>
          ) : (
            <div className="empty" style={{ padding: 28 }}>
              No store in this scope has reported hours and sales yet.
            </div>
          )}
        </div>

        <div className="tcard">
          <SectionHead
            title="Week over week movers"
            sub={
              data.trend.priorWeekNum
                ? `WTD SPLH against Week ${data.trend.priorWeekNum}, same weekday`
                : "Needs the same weekday from last week"
            }
            action="Store detail"
            onAction={() => onNavigate("storetrend")}
          />
          {up.length || down.length ? (
            <div className="db-movers-cols">
              <div className="db-movers-col">
                <div className="db-movers-col-head up">
                  <Icon name="up" size={11} />
                  Improving
                </div>
                {up.length ? (
                  up.map((t) => (
                    <button
                      key={t.code}
                      className="db-mover-row"
                      onClick={() => onNavigate("storetrend")}
                      title={`$${t.prior} to $${t.current} SPLH`}
                    >
                      <span className="db-mover-row-name">{t.name}</span>
                      <span className="db-mover-pill up">+{t.delta}</span>
                    </button>
                  ))
                ) : (
                  <div className="db-movers-empty">Nobody comparable moved up.</div>
                )}
              </div>
              <div className="db-movers-col">
                <div className="db-movers-col-head down">
                  <Icon name="down" size={11} />
                  Declining
                </div>
                {down.length ? (
                  down.map((t) => (
                    <button
                      key={t.code}
                      className="db-mover-row"
                      onClick={() => onNavigate("storetrend")}
                      title={`$${t.prior} to $${t.current} SPLH`}
                    >
                      <span className="db-mover-row-name">{t.name}</span>
                      <span className="db-mover-pill down">{t.delta}</span>
                    </button>
                  ))
                ) : (
                  <div className="db-movers-empty">Nobody comparable moved down.</div>
                )}
              </div>
            </div>
          ) : (
            <div className="empty" style={{ padding: 28 }}>
              Not enough history in this scope yet.
            </div>
          )}
        </div>
      </div>

      <div className="db-cols">
        <div className="tcard">
          <SectionHead
            title="Needs attention"
            sub={exceptions.length + (exceptions.length === 1 ? " item" : " items")}
            action="Week view"
            onAction={() => onNavigate("week")}
          />
          {clean ? (
            <div className="empty" style={{ padding: 28 }}>
              Every store in {scopeDef.label} is at target and every sync came through clean.
            </div>
          ) : (
            <div className="db-list">
              {exceptions.slice(0, 6).map((e, i) => (
                <button
                  key={e.code + "-" + i}
                  className={"dash-row sev-" + e.severity}
                  onClick={() => onNavigate("week")}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="dash-row-name">{e.name}</div>
                    <div className="dash-row-label">{e.label}</div>
                    <div className="dash-row-detail">{e.detail}</div>
                  </div>
                  <span className={"chip sev-chip-" + e.severity}>{SEV_LABEL[e.severity]}</span>
                </button>
              ))}
              {exceptions.length > 6 && (
                <div className="db-more">
                  {exceptions.length - 6} more in the week view
                </div>
              )}
            </div>
          )}
        </div>

        <div className="tcard">
          <SectionHead
            title="Reviews to work on"
            sub={`Under ${TOP_LINE.toFixed(2)} in period ${data.period}`}
            action="Leaderboard"
            onAction={() => onNavigate("leaderboard")}
          />
          {watchlist.length ? (
            <div className="db-list">
              {watchlist.map((s) => {
                const rev = s.reviews.period;
                return (
                  <button
                    key={s.code}
                    className="db-watch"
                    onClick={() => onNavigate("leaderboard")}
                  >
                    <div className="db-watch-main">
                      <div className="db-watch-name">{s.name}</div>
                      <div className="db-watch-sub">{rev.count} reviews in the window</div>
                    </div>
                    <div
                      className="db-watch-rating"
                      style={{ color: inkOfBand(bandForRating(rev.rating)) }}
                    >
                      {rev.rating.toFixed(2)}
                      <span>
                        {rev.rating >= REVIEW_TIERS.baseOnly
                          ? `+${(TOP_LINE - rev.rating).toFixed(2)} to ${TOP_LINE.toFixed(2)}`
                          : `under ${REVIEW_TIERS.baseOnly.toFixed(2)}`}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="empty" style={{ padding: 28 }}>
              {rated.length
                ? `Every rated store in ${scopeDef.label} is at ${TOP_LINE.toFixed(2)} or better.`
                : `No store has ${MIN_REVIEWS_TO_RANK} or more reviews in this period yet.`}
            </div>
          )}
        </div>
      </div>

      <EfficiencyQuadrant isoDate={isoDate} report={report} />
    </div>
  );
}