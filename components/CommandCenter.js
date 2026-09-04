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

import { Fragment, useEffect, useState } from "react";
import Icon from "./Icon";
import { sectionize } from "../lib/ui";

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

const ACCOUNTABILITY_FIELDS = [
  { key: "gm_name", payloadKey: "gmName", label: "GM" },
  { key: "area_manager_name", payloadKey: "areaManagerName", label: "Area Manager" },
];

/**
 * GM / area manager per store (Command Center Phase 3). Rows key on store
 * code everywhere else in the app; this is purely a label lookup so
 * leadership can read those tables without translating codes - it is not
 * a metric and computes nothing. Source of truth is a manual mapping
 * (gm_name/area_manager_name on stores, docs/sql/001-store-managers.sql),
 * not Toast employee data - see docs/plans/FEATURE-PLAN-2026-09-04.md,
 * feature 6, for why Toast's labor data has no stable per-store manager
 * signal to source this from instead.
 *
 * Editable inline with no deploy needed, same pattern as
 * components/Targets.js's SPLH target table.
 */
export function AccountabilityTable({ onAuthExpired }) {
  const [stores, setStores] = useState(null);
  const [loading, setLoading] = useState(true);
  const [edits, setEdits] = useState({});
  const [saving, setSaving] = useState(null);
  const [saved, setSaved] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    fetch("/api/command-center/managers")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setStores(d.stores);
        else setErr(d.error || "Could not load stores");
        setLoading(false);
      })
      .catch((e) => {
        setErr(e.message);
        setLoading(false);
      });
  }, []);

  const dirty = (st) => {
    const e = edits[st.code];
    if (!e) return false;
    return ACCOUNTABILITY_FIELDS.some(
      (f) => e[f.key] !== undefined && (e[f.key] || "") !== (st[f.key] || "")
    );
  };

  async function save(st) {
    const e = edits[st.code] || {};
    const payload = { code: st.code };
    ACCOUNTABILITY_FIELDS.forEach((f) => {
      payload[f.payloadKey] = (e[f.key] ?? st[f.key] ?? "").trim();
    });

    setErr(null);
    setSaving(st.code);

    const res = await fetch("/api/command-center/managers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const d = await res.json().catch(() => ({ ok: false, error: "Bad response" }));
    setSaving(null);

    if (d.ok) {
      setStores((prev) =>
        prev.map((s) =>
          s.code === st.code
            ? { ...s, gm_name: payload.gmName, area_manager_name: payload.areaManagerName }
            : s
        )
      );
      setEdits((prev) => ({ ...prev, [st.code]: {} }));
      setSaved(st.code);
      setTimeout(() => setSaved(null), 1600);
      return;
    }

    if (res.status === 401) {
      onAuthExpired?.("Your session expired. Enter your code again.");
      return;
    }
    if (res.status === 403) {
      setErr("Your access does not allow changing store accountability.");
      return;
    }
    // The one column-does-not-exist case: docs/sql/001-store-managers.sql
    // hasn't been run yet. Surface the real Postgres error rather than a
    // generic message, since "what do I do about this" differs from every
    // other failure here.
    setErr(d.error || "Could not save that store.");
  }

  if (loading) return <div className="empty">Loading stores…</div>;
  if (!stores) return <div className="empty">{err || "No stores returned."}</div>;

  return (
    <div className="tcard">
      <div className="thead">
        <div>
          <div className="ttl">Accountability</div>
          <div className="tsub">GM and area manager per store. Saved immediately, no deploy needed.</div>
        </div>
        <span className="chip chip-mute">{stores.length} stores</span>
      </div>
      {err && (
        <div className="note note-warn">
          <Icon name="alert" size={15} />
          <div>{err}</div>
        </div>
      )}
      <div className="scx tall">
        <table className="grid">
          <thead>
            <tr>
              <th>Location</th>
              {ACCOUNTABILITY_FIELDS.map((f) => (
                <th key={f.key}>{f.label}</th>
              ))}
              <th className="r" style={{ width: 96 }}>{""}</th>
            </tr>
          </thead>
          <tbody>
            {sectionize(stores, { withGroup: true }).map((sec) => (
              <Fragment key={sec.label}>
                <tr className="rrow">
                  <td colSpan={4}>{sec.label}</td>
                </tr>
                {sec.stores.map((st) => {
                  const e = edits[st.code] || {};
                  const changed = dirty(st);
                  return (
                    <tr key={st.code}>
                      <td>
                        <div className="lc-code">{st.code}</div>
                        <div className="lc-name">{st.name}</div>
                      </td>
                      {ACCOUNTABILITY_FIELDS.map((f) => (
                        <td key={f.key}>
                          <input
                            className="tinput"
                            type="text"
                            placeholder="Unassigned"
                            value={e[f.key] ?? st[f.key] ?? ""}
                            onChange={(ev) =>
                              setEdits((prev) => ({
                                ...prev,
                                [st.code]: { ...prev[st.code], [f.key]: ev.target.value },
                              }))
                            }
                          />
                        </td>
                      ))}
                      <td className="num">
                        <button
                          className={"btn btn-sm " + (saved === st.code ? "btn-green" : "btn-primary")}
                          onClick={() => save(st)}
                          disabled={saving === st.code || (!changed && saved !== st.code)}
                        >
                          {saving === st.code ? "Saving" : saved === st.code ? "Saved" : "Save"}
                        </button>
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
  );
}

export default function CommandCenter({ onAuthExpired }) {
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

      <div style={{ marginTop: 17 }}>
        <AccountabilityTable onAuthExpired={onAuthExpired} />
      </div>

      <div className="empty" style={{ marginTop: 17 }}>
        <Icon name="layers" size={22} />
        <div className="empty-title">More on the way</div>
        <div>
          Goal chips and a metric drill-down are shipping here phase by
          phase - see docs/plans/COMMAND-CENTER-PROGRESS.md. Drive-thru
          window time is deferred (pilot-only, see that doc) and won't
          appear in this tab yet.
        </div>
      </div>
    </div>
  );
}
