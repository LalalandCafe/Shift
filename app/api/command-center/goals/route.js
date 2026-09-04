import { requireAdmin } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { cfgFromTarget, goalStatus } from "@/lib/scale";
import { getComparableMonths, computeMonthComparison } from "@/lib/sssg";
import { buildKitchenWeek, buildDailyReport } from "@/lib/report";
import { buildThroughput } from "@/lib/throughput";
import { WEEKEND, DAYS } from "@/lib/fiscal";

// Admin only, same pattern as every other Command Center route.
//
// GET /api/command-center/goals
//
// Schema-driven for CHAIN-WIDE metrics: reads every chain-wide row
// (store_code is null) out of metric_targets, computes that metric's
// current value from an existing calc function, classifies it with
// lib/scale.js's goalStatus(). A null red_value (a target with no
// red-line yet, e.g. SSSG) is handled the same way everywhere via
// cfgFromTarget() - the same function DriveThru.js already uses.
//
// PER-STORE metrics (splh_weekday/weekend/ptd, tplh_weekday/weekend) are
// handled separately below, once per store, because unlike the chain-wide
// metrics they need a DIFFERENT actual depending on which day-type target
// applies today - see perStoreChipsFor().
//
// Deliberately excludes dt_window (drive-thru) entirely - out of the
// Command Center tab per the deferral decision, pilot-only.
const SKIPPED_METRICS = new Set(["dt_window"]);

function yesterdayIso() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

// Same day-name convention as lib/calc.js's getTarget() (which reads
// lib/fiscal.js's WEEKEND = {Friday, Saturday, Sunday} - NOT calendar
// Saturday/Sunday). Getting this wrong once already shipped a wrong TPLH
// target to production (see docs/sql/006-fix-tplh-weekend-boundary.sql) -
// reusing the app's own WEEKEND set here instead of re-deriving it is the
// fix, not just a style choice.
function dayNameFromISO(iso) {
  const d = new Date(iso + "T12:00:00Z");
  return DAYS[(d.getUTCDay() + 6) % 7]; // DAYS[0] is Monday, getUTCDay() 0 is Sunday
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

/**
 * Per-store SPLH + TPLH chips, one set per store.
 *
 * SPLH gets two chips per store, never three - WTD deliberately has no
 * chip and no target. A week-to-date average compared against a single
 * day's target is a bad comparison (it mixes weekday and weekend actuals
 * against a target that only applies to one day type once the week
 * crosses that boundary) - the live app has never had a WTD target for
 * exactly this reason, and this route does not invent one:
 *   - "SPLH (today)" - lib/report.js's buildDailyReport() day.splh,
 *     against whichever of splh_weekday/splh_weekend matches today's
 *     day-of-week. This is the same target buildDailyReport's own
 *     day.target already computes via getTarget() - reading it from
 *     metric_targets here instead keeps every Command Center chip on one
 *     code path (cfgFromTarget + goalStatus), per the "read from the
 *     unified schema" decision - the tradeoff (metric_targets' copy can
 *     drift from stores.weekday_target/weekend_target if someone edits a
 *     target through the existing Targets tab) is the same one already
 *     documented in docs/sql/003-unify-metric-targets.sql, not new here.
 *   - "SPLH (period to date)" - day-independent, ptd.splh against
 *     splh_ptd. Clean 1:1, no day-type question.
 *
 * TPLH gets one chip per store, whichever of tplh_weekday/tplh_weekend
 * matches today - never both, since a single day is only ever one type.
 * The actual is a SINGLE day's TPLH (lib/throughput.js's buildThroughput,
 * extended with the optional singleDay window added for this), not a
 * week-to-date figure, for the identical reason SPLH has no WTD chip. A
 * store with no TPLH target yet (10037, soft opening - see 005's header)
 * simply gets no TPLH chip, same "don't show a chip with no target"
 * behavior as any other unwired metric.
 *
 * flagLabel is always present on the TPLH chip precisely because the
 * user's instruction was that this cannot be left implied by the metric
 * name - each store's number is relative to ITS OWN 8-week baseline, not
 * the chain's, and nobody should be able to read this list as a ranking.
 */
async function perStoreChipsFor(dayIso) {
  const dayName = dayNameFromISO(dayIso);
  const isWeekend = WEEKEND.has(dayName);
  const splhDayMetric = isWeekend ? "splh_weekend" : "splh_weekday";
  const tplhDayMetric = isWeekend ? "tplh_weekend" : "tplh_weekday";

  const { data: targetRows, error: tErr } = await supabaseAdmin
    .from("metric_targets")
    .select("metric, store_code, label, target_value, red_value, green_value, unit, lower_is_better")
    .in("metric", ["splh_weekday", "splh_weekend", "splh_ptd", "tplh_weekday", "tplh_weekend"])
    .not("store_code", "is", null);
  if (tErr) throw new Error(tErr.message);

  const targetByKey = {};
  targetRows.forEach((r) => { targetByKey[r.metric + "|" + r.store_code] = r; });

  const [report, throughputDay] = await Promise.all([
    buildDailyReport(dayIso),
    buildThroughput(dayIso, { singleDay: dayIso }),
  ]);

  const throughputByCode = {};
  throughputDay.rows.forEach((r) => { throughputByCode[r.code] = r; });

  return report.rows.map((storeReport) => {
    const code = storeReport.code;
    const chips = [];

    const splhDayTarget = targetByKey[splhDayMetric + "|" + code];
    if (splhDayTarget) {
      const cfg = cfgFromTarget(splhDayTarget);
      chips.push({
        metric: "splh_today",
        label: `SPLH (today, ${dayName})`,
        unit: cfg.unit,
        value: storeReport.day.splh,
        target: cfg.target,
        redLine: cfg.redLine,
        status: goalStatus(storeReport.day.splh, cfg),
      });
    }

    const splhPtdTarget = targetByKey["splh_ptd|" + code];
    if (splhPtdTarget) {
      const cfg = cfgFromTarget(splhPtdTarget);
      chips.push({
        metric: "splh_ptd",
        label: "SPLH (period to date)",
        unit: cfg.unit,
        value: storeReport.ptd.splh,
        target: cfg.target,
        redLine: cfg.redLine,
        status: goalStatus(storeReport.ptd.splh, cfg),
      });
    }

    const tplhTarget = targetByKey[tplhDayMetric + "|" + code];
    if (tplhTarget) {
      const cfg = cfgFromTarget(tplhTarget);
      const actual = throughputByCode[code] ? throughputByCode[code].tplh : null;
      chips.push({
        metric: "tplh_today",
        label: `TPLH (today, ${dayName})`,
        unit: cfg.unit,
        value: actual,
        target: cfg.target,
        redLine: cfg.redLine,
        status: goalStatus(actual, cfg),
        flagLabel: "vs. this store's own 8-week baseline - not comparable across stores",
      });
    }

    return {
      code,
      name: storeReport.name,
      region: storeReport.region,
      grp: storeReport.grp,
      chips,
    };
  });
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

    const dayIso = yesterdayIso();
    const perStore = await perStoreChipsFor(dayIso);

    return Response.json({
      ok: true,
      chips,
      perStore,
      dayIso,
      dayName: dayNameFromISO(dayIso),
    });
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}
