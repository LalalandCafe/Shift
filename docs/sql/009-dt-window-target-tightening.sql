-- Drive-thru window-time target: tighten to 2:05 green / 2:15 target / 2:30 red.
--
-- ALREADY EXECUTED IN PRODUCTION on 2026-09-18, by hand in the Supabase SQL
-- editor, together with the refresh_drive_thru_views() call at the bottom.
-- This file is the record, not the trigger. Re-running it is idempotent: it
-- sets the values production already holds.
--
-- WHAT CHANGED
--   green_value   120 (2:00)  ->  125 (2:05)
--   target_value  150 (2:30)  ->  135 (2:15)
--   red_value     165 (2:45)  ->  150 (2:30)
--   unit and lower_is_better are unchanged (seconds, true).
--
-- Exactly one row is affected: metric_targets holds a single chain-wide
-- dt_window row with store_code IS NULL. Drive-thru targets are global, not
-- per store and not per region. The store_code predicate below is load-bearing
-- even though no per-store dt_window row exists today - app/api/drive-thru's
-- loadTarget() uses .single(), so a second dt_window row would break the tab
-- outright rather than degrade.
--
-- WHY THESE NUMBERS
--   The Drive-thru tab bands the DAILY AVERAGE window time, not per-car time.
--   Per car the distribution is heavily right-skewed (median 1:46, mean 2:17
--   over 44,698 cars), so the daily mean sits near the 60th percentile of
--   cars and runs far above the median car.
--
--   Measured over 166 store-days (business_date >= 2026-07-20, the 60 days
--   before the change) the old 120/150/165 put 79.0% of store-days at
--   "at target or better" and only 3.0% red, so the red band carried almost
--   no signal. A first proposal of 105 green / 120 red was rejected: the best
--   single store-day in that window was 1:47, so it would have produced
--   0 green days and 88.4% red.
--
--   These values come from the observed p25/p75 of the daily average and
--   split 22.9% green / 21.7% light green / 34.3% light red / 21.1% red.
--
--   Store 10019 (DFW Camp Bowie) is a known outlier under this target:
--   3.3% green and 88.4% in the two red bands, down from 63.3% at-target.
--   Accepted deliberately - its median is 2:27 against 2:13 and 2:09 at the
--   other two pilot stores, and the target is meant to surface that.
--
-- SCOPE OF EFFECT
--   Drive-thru tab only. dt_window is read in exactly one place in the
--   codebase (app/api/drive-thru/route.js loadTarget()). The daily email
--   (lib/email-generator.js) and the Excel export (lib/excel-export.js) carry
--   their own inline hex, read no targets, and contain no drive-thru content.
--   Only 3 of 35 stores had drive-thru data when this ran.

UPDATE metric_targets
   SET green_value  = 125,   -- 2:05
       target_value = 135,   -- 2:15
       red_value    = 150,   -- 2:30
       updated_at   = now(),
       updated_by   = 'dt-target-tightening-2026-09'
 WHERE metric = 'dt_window'
   AND store_code IS NULL;
-- Expect: UPDATE 1. Anything else, stop and investigate.

-- Required. The band_* / green_cars / yellow_cars / red_cars / pct_green /
-- pct_red columns on drive_thru_daily and drive_thru_hourly, and the bucket
-- labels on drive_thru_distribution, are PRECOMPUTED in Postgres against
-- dt_bands. They do not follow a metric_targets change until this runs.
-- Without it the JS path (headline, store cards, KPI ink) moves to the new
-- thresholds while the SQL path (% at target, band counts, histogram) stays
-- on the old ones, and the tab disagrees with itself.
SELECT refresh_drive_thru_views();

-- VERIFICATION (run after, all three should agree)
--   SELECT * FROM metric_targets WHERE metric='dt_window' AND store_code IS NULL;
--     -> green_value 125, target_value 135, red_value 150
--   SELECT * FROM dt_bands;
--     -> b_comfort 125, b_target 135, b_red 150, b_low 67.50, b_far 225.00
--        (b_low = target*0.5, b_far = target*1.65, so dt_bands is derived,
--         not hardcoded - this is what confirms it.)
--   SELECT DISTINCT bucket, band FROM drive_thru_distribution ORDER BY 1;
--     -> bucket labels regenerated to the new boundaries

-- ROLLBACK (restores the pre-2026-09-18 baseline, then re-derives)
--   UPDATE metric_targets
--      SET green_value  = 120,
--          target_value = 150,
--          red_value    = 165,
--          updated_at   = now(),
--          updated_by   = 'rollback-to-migration-baseline'
--    WHERE metric = 'dt_window'
--      AND store_code IS NULL;
--   SELECT refresh_drive_thru_views();
