"use client";

import { useState, useEffect } from "react";
import Icon from "./Icon";
import { int, dec, median, quantile, railPos } from "../lib/ui";

/**
 * A hand-made drink cannot be produced in less than this many minutes.
 * Anything faster means the ticket was bumped on the KDS before the drink
 * was made, so the number measures bumping habits, not service. Those
 * stores are reported separately instead of winning the board.
 * Move this to the API alongside the other thresholds when convenient.
 */
const PLAUSIBLE_MIN = 1.0;

const BANDS = {
  fast: { label: "Fast", chip: "chip-pos" },
  pace: { label: "On pace", chip: "chip-info" },
  watch: { label: "Watch", chip: "chip-warn" },
  slow: { label: "Slow", chip: "chip-neg" },
};

function bandOf(store, med, th) {
  const r = store.medianMin / med;
  // Business rule kept from the API: nothing under the noticeable floor is
  // ever called slow, however bad the ratio looks.
  if (store.medianMin >= th.noticeableFloorMin) {
    if (r >= th.flagRatio) return "slow";
    if (r >= th.watchRatio) return "watch";
  }
  return r <= 0.7 ? "fast" : "pace";
}

function confidenceOf(store, th) {
  if (store.itemCount >= th.minItems * 2 && store.stuckRate <= 2) {
    return { level: "High", why: "Large sample, almost every ticket closed" };
  }
  if (store.itemCount >= th.minItems && store.stuckRate <= 5) {
    return { level: "Medium", why: "Sample is adequate, some tickets never closed" };
  }
  return { level: "Low", why: "Small sample or many unclosed tickets" };
}

function Section({ title, count, children, note }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={"disc" + (open ? " open" : "")}>
      <button className="disc-btn" onClick={() => setOpen(!open)}>
        <span className="disc-title">{title}</span>
        <span className="chip chip-mute">{count}</span>
        <Icon name="down" size={16} className="ic-caret" />
      </button>
      {open && (
        <div className="disc-body">
          {children}
          {note && (
            <div style={{ padding: "10px 16px 14px", fontSize: 11, color: "var(--text3)", lineHeight: 1.6 }}>
              {note}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ReasonList({ stores }) {
  return (
    <>
      {stores.map((s) => (
        <div className="lrow" key={s.code}>
          <div className="lrow-main">
            <div className="lrow-name">{s.name}</div>
            <div className="lrow-sub">{s.serviceNote || "No kitchen data this week"}</div>
          </div>
        </div>
      ))}
    </>
  );
}

export default function ServiceBoard({ isoDate }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isoDate) return;
    let dead = false;
    setLoading(true);
    setError(null);

    fetch(`/api/kitchen-week?date=${isoDate}`)
      .then((r) => r.json())
      .then((d) => {
        if (dead) return;
        if (!d.ok) throw new Error(d.error || "Unknown error");
        setData(d);
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
  }, [isoDate]);

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
        <div className="empty-title">Could not load service times</div>
        <div>{error}</div>
      </div>
    );
  }

  const th = data.thresholds;
  const stores = data.stores || [];

  const measured = stores.filter(
    (s) => s.medianMin !== null && s.service !== "unreliable" && s.service !== "unknown"
  );
  const credible = measured
    .filter((s) => s.medianMin >= PLAUSIBLE_MIN)
    .sort((a, b) => a.medianMin - b.medianMin);
  const implausible = measured.filter((s) => s.medianMin < PLAUSIBLE_MIN);
  const unreliable = stores.filter((s) => s.service === "unreliable");
  const noData = stores.filter((s) => s.service === "unknown");

  if (!credible.length) {
    return (
      <div className="empty">
        <div className="empty-title">Nothing measurable this week</div>
        <div>
          Every store either has no kitchen data or a ticket time too low to be real. Check the
          KDS bumping habit before reading this board.
        </div>
      </div>
    );
  }

  const values = credible.map((s) => s.medianMin);
  const med = median(values);
  const p25 = quantile(values, 0.25);
  const p75 = quantile(values, 0.75);
  const lo = values[0];
  const hi = values[values.length - 1];

  const withBand = credible.map((s) => ({ ...s, band: bandOf(s, med, th) }));
  const slow = withBand.filter((s) => s.band === "slow");
  const watch = withBand.filter((s) => s.band === "watch");
  const excluded = implausible.length + unreliable.length + noData.length;

  return (
    <div className="view">
      <div className="ctx">
        <div className="ctx-block">
          <div>
            <b>Ticket time</b>
            <span> · week of {data.weekStart} through {data.date}</span>
          </div>
        </div>
      </div>

      <div className="mc-grid">
        <div className="mc">
          <div className="mc-l">Company median</div>
          <div className="mc-v">
            {dec(med, 1)} <span className="mc-u">min</span>
          </div>
          <div className="mc-s">Half the stores are faster than this, half are slower</div>
        </div>
        <div className="mc">
          <div className="mc-l">Middle 50% of stores</div>
          <div className="mc-v">
            {dec(p25, 1)}–{dec(p75, 1)} <span className="mc-u">min</span>
          </div>
          <div className="mc-s">Normal range for the chain this week</div>
        </div>
        <div className="mc">
          <div className="mc-l">Running slow</div>
          <div className="mc-v">
            {slow.length}
            {watch.length > 0 && <span className="mc-u"> +{watch.length} watch</span>}
          </div>
          <div className="mc-s">
            At or above {th.flagRatio}× the median, and over {th.noticeableFloorMin} min
          </div>
        </div>
        <div className="mc">
          <div className="mc-l">Measured</div>
          <div className="mc-v">
            {credible.length} <span className="mc-u">/ {stores.length}</span>
          </div>
          <div className="mc-s">{excluded} stores are not comparable this week</div>
        </div>
      </div>

      <div className="rail">
        <div className="rail-head">
          <div>
            <div className="ttl">Where every store sits</div>
            <div className="tsub">One dot per store. Hover to read the name.</div>
          </div>
          <span className="chip chip-mute">
            {dec(lo, 1)} to {dec(hi, 1)} min
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
            data-label={`median ${dec(med, 1)}`}
            style={{ left: railPos(med, lo, hi) + "%" }}
          />
          {withBand.map((s, i) => (
            <div
              key={s.code}
              className={"rail-dot " + s.band}
              style={{
                left: railPos(s.medianMin, lo, hi) + "%",
                "--i": i,
              }}
              title={`${s.name} · ${dec(s.medianMin, 1)} min`}
            />
          ))}
        </div>

        <div className="rail-axis">
          <span>{dec(lo, 1)} min</span>
          <span>{dec(hi, 1)} min</span>
        </div>

        <div className="rail-legend">
          <span>
            <i style={{ background: "var(--pos)" }} />
            Fast, under 0.7× median
          </span>
          <span>
            <i style={{ background: "var(--accent)" }} />
            On pace
          </span>
          <span>
            <i style={{ background: "var(--warn)" }} />
            Watch, {th.watchRatio}×
          </span>
          <span>
            <i style={{ background: "var(--neg)" }} />
            Slow, {th.flagRatio}×
          </span>
          <span style={{ marginLeft: "auto" }}>Shaded band holds the middle 50%</span>
        </div>
      </div>

      <div className="tcard">
        <div className="thead">
          <div>
            <div className="ttl">Ticket time by store</div>
            <div className="tsub">Fastest first. Compare each store to the median, not to first place.</div>
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
                <th className="r">Median</th>
                <th style={{ width: 190 }}>vs company median</th>
                <th className="r sep">Items</th>
                <th className="r">Unclosed</th>
                <th className="r">Confidence</th>
                <th className="r">Status</th>
              </tr>
            </thead>
            <tbody>
              {withBand.map((s, i) => {
                const ratio = s.medianMin / med;
                const conf = confidenceOf(s, th);
                return (
                  <tr key={s.code}>
                    <td className="num cell-dim">{i + 1}</td>
                    <td>
                      <div className="lc-code">{s.code}</div>
                      <div className="lc-name">{s.name}</div>
                    </td>
                    <td className="num" style={{ fontWeight: 700, fontSize: 13.5 }}>
                      {dec(s.medianMin, 1)}
                      <span style={{ color: "var(--text3)", fontWeight: 500 }}> min</span>
                    </td>
                    <td>
                      <div className="bar">
                        <span
                          className="cell-dim"
                          style={{ fontSize: 11, minWidth: 52, textAlign: "right" }}
                        >
                          {dec(ratio, 2)}×
                        </span>
                        <div className="bar-track">
                          <div
                            className={
                              "bar-fill " +
                              (s.band === "slow"
                                ? "neg"
                                : s.band === "watch"
                                ? "warn"
                                : s.band === "fast"
                                ? "pos"
                                : "cobalt")
                            }
                            style={{ width: railPos(s.medianMin, 0, hi) + "%" }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="num sep">{int(s.itemCount)}</td>
                    <td className="num">{dec(s.stuckRate, 1)}%</td>
                    <td className="num cell-dim" title={conf.why}>
                      {conf.level}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <span className={"chip " + BANDS[s.band].chip}>{BANDS[s.band].label}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {implausible.length > 0 && (
        <Section
          title="Times too low to be real"
          count={implausible.length}
          note={`A median under ${PLAUSIBLE_MIN} min means the ticket was closed on the KDS before the drink was made. These stores are not the fastest in the chain, they are the fastest at pressing the button. Fix the bumping habit and they rejoin the board.`}
        >
          {implausible
            .sort((a, b) => a.medianMin - b.medianMin)
            .map((s) => (
              <div className="lrow" key={s.code}>
                <div className="lrow-main">
                  <div className="lrow-name">{s.name}</div>
                  <div className="lrow-sub">
                    {int(s.itemCount)} items · {dec(s.stuckRate, 1)}% unclosed
                  </div>
                </div>
                <div className="lrow-val">
                  {dec(s.medianMin, 1)}
                  <span style={{ fontSize: 10.5, color: "var(--text3)" }}> min</span>
                </div>
              </div>
            ))}
        </Section>
      )}

      {unreliable.length > 0 && (
        <Section
          title="Not measurable, KDS discipline"
          count={unreliable.length}
          note="These stores are not slow, they are unmeasured. Too many tickets were never bumped, so the clock kept running until the system closed them out."
        >
          <ReasonList stores={unreliable} />
        </Section>
      )}

      {noData.length > 0 && (
        <Section title="No ticket data" count={noData.length}>
          <ReasonList stores={noData} />
        </Section>
      )}

      <div className="footnote">
        Ticket time is fired to fulfilled, straight from the Toast Kitchen API, and reported as a
        median so a handful of forgotten tickets cannot decide the order. A store needs at least{" "}
        {int(th.minItems)} items to appear, and drops out above 5% unclosed tickets. Items over 30
        minutes count as unclosed rather than slow. Beverly Hills has no KDS and produces no data.
      </div>
    </div>
  );
}
