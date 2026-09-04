import { requireAdmin } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { cfgFromTarget, goalStatus } from "@/lib/scale";
import { getComparableMonths, computeMonthComparison } from "@/lib/sssg";
import { buildKitchenWeek } from "@/lib/report";

// Admin only, same pattern as every other Command Center route.
//
// GET /api/command-center/goals
//
// Schema-driven: reads every chain-wide row (store_code is null) out of
// metric_targets, computes that metric's current chain-wide value from the
// existing calc functions that already produce it elsewhere in the app
// (never a new calculation), and classifies it with lib/scale.js's
// goalStatus() - the same cfgFromTarget() DriveThru.js already uses, so a
// null red_value (a target with no red-line yet, e.g. SSSG) is handled the
// same way everywhere, not specially here.
//
// Deliberately excludes:
//   - dt_window (drive-thru): out of the Command Center tab entirely per
//     the deferral decision - pilot-only, not worth surfacing here yet.
//   - any row with store_code set (the splh_weekday/weekend/ptd per-store
//     rows from docs/sql/003, once that's run): wiring those needs a
//     decision this route doesn't make on its own - see the code comment
//     below at SKIPPED_NO_SOURCE for why.
const SKIPPED_METRICS = new Set(["dt_window"]);

function yesterdayIso() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

async function currentValueFor(metric) {
  if (metric === "sssg") {
    const months = await getComparableMonths();
    const latest = months.find((m) => m.comparable);
    if (!latest) return { value: null, note: "No comparable month yet" };
    const detail = await computeMonthComparison(latest.month);
    return {
      value: detail.totals.comparable.pctChange,
      note: `${latest.label} vs ${detail.priorMonthLabel}, ${detail.totals.comparable.storeCount} comparable stores`,
    };
  }

  if (metric === "expo") {
    const result = await buildKitchenWeek(yesterdayIso());
    if (result.companyMedianMin === null) return { value: null, note: "No kitchen ticket data this week" };
    return { value: result.companyMedianMin * 60, note: `Chain-wide median, week to date, weighted by item volume (${result.storesJudged} stores judged)` };
  }

  // Any metric_targets row this route doesn't yet know how to compute a
  // current value for (a future chain-wide metric someone adds a target
  // row for) - reported as unwired rather than silently dropped, so a new
  // row doesn't just fail to appear with no explanation.
  return { value: null, note: "No current-value source wired for this metric yet" };
}

export async function GET(request) {
  const denied = requireAdmin(request);
  if (denied) return denied;

  try {
    const { data: rows, error } = await supabaseAdmin
      .from("metric_targets")
      .select("metric, store_code, label, target_value, red_value, green_value, unit, lower_is_better")
      .order("metric");
    if (error) throw new Error(error.message);

    const chainWide = (rows || []).filter((r) => r.store_code == null && !SKIPPED_METRICS.has(r.metric));
    const perStoreCount = (rows || []).filter((r) => r.store_code != null).length;

    const chips = [];
    for (const row of chainWide) {
      const cfg = cfgFromTarget(row);
      const { value, note } = await currentValueFor(row.metric);
      chips.push({
        metric: row.metric,
        label: row.label,
        unit: row.unit,
        value,
        target: cfg.target,
        redLine: cfg.redLine,
        lowerIsBetter: cfg.lowerIsBetter,
        status: goalStatus(value, cfg),
        note,
      });
    }

    return Response.json({
      ok: true,
      chips,
      perStoreTargetsNotYetWired: perStoreCount,
    });
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}
