"use client";

import { useState, useEffect } from "react";

const MEDALS = ["🥇", "🥈", "🥉"];

function Row({ s, rank, podium }) {
  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: podium ? "10px 12px" : "6px 12px",
        borderRadius: podium ? 10 : 0, marginBottom: podium ? 8 : 0,
        background: podium ? (rank === 1 ? "#f2f9f3" : "var(--bg3)") : "transparent",
        border: podium && rank === 1 ? "1.5px solid #1a6630" : "1.5px solid transparent",
        fontSize: podium ? 13 : 12,
      }}
    >
      <div style={{ width: 26, textAlign: "center", flexShrink: 0, fontSize: podium ? 20 : 11, fontWeight: 700, color: podium ? "inherit" : "var(--text3)" }}>
        {podium ? MEDALS[rank - 1] : rank}
      </div>
      <div style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: podium ? 700 : 400, color: podium ? "inherit" : "var(--text2)" }}>
        {s.name}
        {podium && (
          <div style={{ fontSize: 10, color: "var(--text3)", fontWeight: 400 }}>
            {s.itemCount.toLocaleString("en-US")} items &middot; {s.stuckRate}% unclosed
          </div>
        )}
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ fontSize: podium ? 16 : 12, fontWeight: podium ? 800 : 700, color: "var(--text)" }}>
          {s.medianMin} <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text3)" }}>min</span>
        </div>
        {podium && s.ratio !== null && (
          <div style={{ fontSize: 9, color: "var(--text3)", fontWeight: 700, letterSpacing: ".03em" }}>
            {s.ratio}× COMPANY
          </div>
        )}
      </div>
    </div>
  );
}

function ExcludedRow({ s, reason }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 9, padding: "8px 12px", fontSize: 12 }}>
      <div style={{ flexShrink: 0, lineHeight: 1.4 }}>⏱</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600 }}>{s.name}</div>
        <div style={{ fontSize: 10.5, color: "var(--text3)", marginTop: 1 }}>{reason}</div>
      </div>
    </div>
  );
}

export default function ServiceBoard({ isoDate }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!isoDate) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/kitchen-week?date=${isoDate}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (!d.ok) throw new Error(d.error || "Unknown error");
        setData(d);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e.message);
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [isoDate]);

  if (loading && !data) return <div className="empty">Loading service times...</div>;
  if (error) return <div className="empty">Could not load service times: {error}</div>;

  const stores = data?.stores || [];

  const ranked = stores
    .filter((s) => s.medianMin !== null && s.service !== "unreliable" && s.service !== "unknown")
    .sort((a, b) => a.medianMin - b.medianMin);

  const unreliable = stores.filter((s) => s.service === "unreliable");
  const noData = stores.filter((s) => s.service === "unknown");

  const flagged = ranked.filter((s) => s.service === "flagged");
  const watch = ranked.filter((s) => s.service === "watch");

  const top = ranked.slice(0, 3);
  const rest = ranked.slice(3);

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <div style={{ background: "var(--navy)", color: "#fff", padding: "10px 14px", borderRadius: 10, fontSize: 13 }}>
          <span style={{ fontWeight: 700 }}>Service Time Board</span>
          <div style={{ fontSize: 10.5, opacity: 0.8, marginTop: 2 }}>
            Week starting {data.weekStart} &middot; through {data.date}
          </div>
        </div>
      </div>

      <div className="mc-grid">
        <div className="mc">
          <div className="mc-l">Company Median</div>
          <div className="mc-v">
            {data.companyMedianMin === null ? "—" : data.companyMedianMin}
            <span style={{ fontSize: 14, color: "var(--text3)" }}> min</span>
          </div>
          <div className="mc-s">Typical ticket time across all stores</div>
        </div>
        <div className="mc">
          <div className="mc-l">Stores Ranked</div>
          <div className="mc-v">
            {ranked.length} <span style={{ fontSize: 15, color: "var(--text3)" }}>/ {stores.length}</span>
          </div>
          <div className="mc-s">
            {stores.length - ranked.length} excluded for data quality
          </div>
        </div>
        <div className="mc">
          <div className="mc-l">Running Slow</div>
          <div className="mc-v">{flagged.length}</div>
          <div className="mc-s">
            Above {data.thresholds.flagRatio}× the company median
          </div>
        </div>
      </div>

      <div className="infobox">
        <span>ℹ️</span>
        <div>
          Ranked fastest first by <strong>median</strong> ticket time, not average, so a few
          forgotten tickets do not decide the winner. A store needs at least{" "}
          {data.thresholds.minItems.toLocaleString("en-US")} items to be ranked, and is excluded
          if more than 5% of its tickets never closed on the KDS. Times under{" "}
          {data.thresholds.noticeableFloorMin} min are never flagged, no matter the ratio.
        </div>
      </div>

      <div className="tcard">
        <div className="thead">
          <span className="ttl">Fastest Service</span>
          <span style={{ fontSize: 11, color: "var(--text3)", fontWeight: 600 }}>
            {ranked.length} ranked
          </span>
        </div>
        <div style={{ padding: 12 }}>
          {top.map((s, i) => (
            <Row key={s.code} s={s} rank={i + 1} podium />
          ))}

          {rest.length > 0 && (
            <>
              {expanded && (
                <div style={{ marginTop: 10, borderTop: "1px solid var(--border2)", paddingTop: 8 }}>
                  {rest.map((s, i) => (
                    <Row key={s.code} s={s} rank={i + 4} />
                  ))}
                </div>
              )}
              <button
                onClick={() => setExpanded(!expanded)}
                style={{
                  width: "100%", marginTop: 10, padding: "8px 0", borderRadius: 8,
                  border: "1.5px solid var(--border2)", background: "#fff", cursor: "pointer",
                  fontFamily: "inherit", fontSize: 12, fontWeight: 600, color: "var(--text2)",
                }}
              >
                {expanded ? "Show top 3 only" : `Show all ${ranked.length}`}
              </button>
            </>
          )}
        </div>
      </div>

      {watch.length > 0 && (
        <div className="tcard">
          <div className="thead">
            <span className="ttl">Watch</span>
            <span className="badge b-warn">{data.thresholds.watchRatio}× to {data.thresholds.flagRatio}× median</span>
          </div>
          <div style={{ padding: "6px 0" }}>
            {watch.map((s) => (
              <ExcludedRow key={s.code} s={s} reason={s.serviceNote} />
            ))}
          </div>
        </div>
      )}

      {flagged.length > 0 && (
        <div className="tcard">
          <div className="thead">
            <span className="ttl">Running Slow</span>
            <span className="badge" style={{ background: "var(--red-bg)", color: "var(--red)", border: "1px solid var(--red-b)" }}>
              Above {data.thresholds.flagRatio}× median
            </span>
          </div>
          <div style={{ padding: "6px 0" }}>
            {flagged.map((s) => (
              <ExcludedRow key={s.code} s={s} reason={s.serviceNote} />
            ))}
          </div>
        </div>
      )}

      {unreliable.length > 0 && (
        <div className="tcard">
          <div className="thead">
            <span className="ttl">Not Measurable — KDS Discipline</span>
            <span className="badge b-neutral">{unreliable.length} stores</span>
          </div>
          <div style={{ padding: "6px 0" }}>
            {unreliable.map((s) => (
              <ExcludedRow key={s.code} s={s} reason={s.serviceNote} />
            ))}
          </div>
          <div style={{ padding: "0 14px 12px", fontSize: 11, color: "var(--text3)", lineHeight: 1.5 }}>
            These stores are not slow, they are unmeasured. Too many tickets were never
            bumped on the KDS, so the time keeps running until the system closes it out.
            Fix the bumping habit and the number becomes trustworthy.
          </div>
        </div>
      )}

      {noData.length > 0 && (
        <div className="tcard">
          <div className="thead">
            <span className="ttl">No Ticket Data</span>
            <span className="badge b-neutral">{noData.length} stores</span>
          </div>
          <div style={{ padding: "6px 0" }}>
            {noData.map((s) => (
              <ExcludedRow key={s.code} s={s} reason={s.serviceNote || "No kitchen data this week"} />
            ))}
          </div>
        </div>
      )}

      <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 12, lineHeight: 1.6 }}>
        Ticket time is fired-to-fulfilled from the Toast Kitchen API. Items over 30 minutes are
        excluded and counted as unclosed instead. Beverly Hills has no KDS and produces no data.
      </div>
    </>
  );
}