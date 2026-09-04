// Command Center tab - admin only, enforced server-side by
// app/api/command-center/*/route.js (requireAdmin), not just by this tab
// being hidden from non-admin nav in app/page.js. Same pattern as
// components/SSSG.js.
//
// This tab is presentation and comparison only. Every metric it shows
// comes from the existing calc.js/report.js/throughput.js/lib/sssg.js
// (and, where flagged in docs/plans/COMMAND-CENTER-PROGRESS.md,
// lib/leaderboard.js or the existing /api/drive-thru endpoint) - nothing
// here recomputes SPLH, TPLH, a leaderboard score, or any other formula.
// The one genuinely new calculation this file's own logic touches is data
// coverage, and even that is a shared function from lib/coverage.js
// (extracted from lib/sssg.js so there's exactly one definition), not
// something reimplemented here.

"use client";

import { useEffect, useState } from "react";
import Icon from "./Icon";

/**
 * Warns when a comparison is about to span a month daily_sales doesn't
 * have real chain-wide data for. Reads /api/command-center/coverage,
 * which calls the same coverage check lib/sssg.js already relies on for
 * SSSG (lib/coverage.js, extracted from there in this phase).
 *
 * months: optional array of "YYYY-MM" strings. Omit it to check the
 * server's default pair (this calendar month vs. the same month last
 * year) - later phases pass their own list for whatever comparison
 * window they're actually showing.
 */
export function CoverageBanner({ months }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const key = months && months.length ? months.join(",") : "";

  useEffect(() => {
    let dead = false;
    setError(null);
    const qs = key ? `?months=${key}` : "";
    fetch(`/api/command-center/coverage${qs}`)
      .then((r) => r.json())
      .then((json) => {
        if (dead) return;
        if (!json.ok) throw new Error(json.error || "Failed to load coverage");
        setData(json);
      })
      .catch((e) => !dead && setError(e.message));
    return () => {
      dead = true;
    };
  }, [key]);

  // A broken coverage check shouldn't block the rest of the tab - fail
  // quiet rather than replacing useful content with an error banner about
  // a background check.
  if (error || !data || data.allCovered) return null;

  const gaps = data.months.filter((m) => !m.covered);
  const gapText = gaps
    .map((g) => `${g.label} (${g.storeCount} store${g.storeCount === 1 ? "" : "s"})`)
    .join(", ");

  return (
    <div className="note note-warn">
      <Icon name="alert" size={15} />
      <div>
        This comparison includes {gapText} - not enough synced data to trust
        a comparison against {gaps.length === 1 ? "it" : "them"}.
      </div>
    </div>
  );
}

export default function CommandCenter() {
  return (
    <div className="shift-dense">
      <div style={{ marginBottom: 17 }}>
        <div style={{ fontSize: 20, fontWeight: 700 }}>Command Center</div>
        <div style={{ fontSize: 13, color: "var(--text3)", marginTop: 2 }}>
          Cross-metric overview. Built on the existing Dashboard, Leaderboard,
          Throughput, and SSSG calculations - this tab reuses their numbers,
          it doesn't compute its own.
        </div>
      </div>

      <CoverageBanner />

      <div className="empty">
        <Icon name="layers" size={22} />
        <div className="empty-title">More on the way</div>
        <div>
          Goal chips, store accountability, and a metric drill-down are
          shipping here phase by phase - see
          docs/plans/COMMAND-CENTER-PROGRESS.md.
        </div>
      </div>
    </div>
  );
}
