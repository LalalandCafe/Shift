-- Command Center Phase 4/4b: fix wrong weekend boundary in 005's TPLH
-- targets.
--
-- BUG FOUND, my mistake, not yours: the script that computed 005's
-- tplh_weekday/tplh_weekend values used calendar Saturday/Sunday as
-- "weekend." That is NOT what this app means by weekend anywhere else.
-- lib/fiscal.js exports:
--
--   export const WEEKEND = new Set(["Friday", "Saturday", "Sunday"]);
--
-- and lib/calc.js's getTarget() - the function that picks a store's
-- weekday_target vs. weekend_target for every SPLH target in the live
-- app - uses exactly that set. Friday is a weekend day in this business,
-- not a weekday. 005's script never imported or checked this; it used a
-- plain getUTCDay() === 0 || 6 test instead, so every Friday in the
-- 8-week window was bucketed as "weekday" when it should have been
-- "weekend."
--
-- IMPACT, quantified before writing this file, not assumed: recomputed
-- the same 8-week window (2026-07-06..2026-08-30) with the correct
-- Friday/Saturday/Sunday boundary, same formula
-- (lib/throughput.js's transactions / hours), same exclusion rule
-- (lib/calc.js's exclusionReason()), same rounding (nearest 0.25), same
-- exclusion of store 10037. Of the 34 stores 005 wrote:
--   - 9 stores' tplh_weekday target changes
--   - 18 stores' tplh_weekend target changes
--   - 7 stores are unaffected at this rounding (their Friday numbers
--     happened to round the same either way)
-- This is not a rounding-noise difference - moving a heavy trading day
-- (Friday) from the weekday bucket to the weekend bucket measurably shifts
-- both averages for most stores. Full per-store before/after values are
-- in docs/plans/COMMAND-CENTER-PROGRESS.md.
--
-- FIX: this file overwrites all 68 tplh_weekday/tplh_weekend rows with
-- the values computed using the correct boundary. It does not touch
-- red_value (still null, no red-line was ever set), unit, lower_is_better,
-- or which stores are included (10037 is still excluded, same reason as
-- 005 - soft opening). Only target_value changes, per store.
--
-- Nothing else this project has shipped uses the wrong boundary: the
-- earlier TPLH-vs-ticket correlation check (r = -0.58, the basis for the
-- "per-store, not chain-wide" decision) summed each store's whole 8-week
-- window as one total with no weekday/weekend split at all, so that
-- number is unaffected and the decision built on it does not change.
-- SPLH's splh_weekday/splh_weekend/splh_ptd rows (003) were copied
-- directly from stores.weekday_target/weekend_target/ptd_target, not
-- computed from a day-by-day split, so they were never exposed to this
-- bug either.
--
-- Depends on 003 (store_code + partial unique index) and 005 (the rows
-- this file corrects) having already run.
--
-- Idempotent: ON CONFLICT targets the same per-store partial unique index
-- as 005, so re-running this file updates the same rows instead of
-- duplicating them.

insert into metric_targets (metric, store_code, label, target_value, red_value, unit, lower_is_better, updated_by)
values
  ('tplh_weekday', 10001, 'TPLH (weekday) - vs. own 8-week baseline', 6, null, 'ratio', false, 'migration-006'),
  ('tplh_weekday', 10002, 'TPLH (weekday) - vs. own 8-week baseline', 6.75, null, 'ratio', false, 'migration-006'),
  ('tplh_weekday', 10003, 'TPLH (weekday) - vs. own 8-week baseline', 6.5, null, 'ratio', false, 'migration-006'),
  ('tplh_weekday', 10004, 'TPLH (weekday) - vs. own 8-week baseline', 6.25, null, 'ratio', false, 'migration-006'),
  ('tplh_weekday', 10005, 'TPLH (weekday) - vs. own 8-week baseline', 6, null, 'ratio', false, 'migration-006'),
  ('tplh_weekday', 10006, 'TPLH (weekday) - vs. own 8-week baseline', 5.5, null, 'ratio', false, 'migration-006'),
  ('tplh_weekday', 10007, 'TPLH (weekday) - vs. own 8-week baseline', 5, null, 'ratio', false, 'migration-006'),
  ('tplh_weekday', 10008, 'TPLH (weekday) - vs. own 8-week baseline', 5.75, null, 'ratio', false, 'migration-006'),
  ('tplh_weekday', 10009, 'TPLH (weekday) - vs. own 8-week baseline', 7.5, null, 'ratio', false, 'migration-006'),
  ('tplh_weekday', 10010, 'TPLH (weekday) - vs. own 8-week baseline', 6.25, null, 'ratio', false, 'migration-006'),
  ('tplh_weekday', 10011, 'TPLH (weekday) - vs. own 8-week baseline', 6, null, 'ratio', false, 'migration-006'),
  ('tplh_weekday', 10012, 'TPLH (weekday) - vs. own 8-week baseline', 6, null, 'ratio', false, 'migration-006'),
  ('tplh_weekday', 10013, 'TPLH (weekday) - vs. own 8-week baseline', 6.25, null, 'ratio', false, 'migration-006'),
  ('tplh_weekday', 10014, 'TPLH (weekday) - vs. own 8-week baseline', 4.75, null, 'ratio', false, 'migration-006'),
  ('tplh_weekday', 10015, 'TPLH (weekday) - vs. own 8-week baseline', 6.25, null, 'ratio', false, 'migration-006'),
  ('tplh_weekday', 10016, 'TPLH (weekday) - vs. own 8-week baseline', 6.25, null, 'ratio', false, 'migration-006'),
  ('tplh_weekday', 10017, 'TPLH (weekday) - vs. own 8-week baseline', 6.25, null, 'ratio', false, 'migration-006'),
  ('tplh_weekday', 10018, 'TPLH (weekday) - vs. own 8-week baseline', 6, null, 'ratio', false, 'migration-006'),
  ('tplh_weekday', 10019, 'TPLH (weekday) - vs. own 8-week baseline', 5.75, null, 'ratio', false, 'migration-006'),
  ('tplh_weekday', 10020, 'TPLH (weekday) - vs. own 8-week baseline', 6.75, null, 'ratio', false, 'migration-006'),
  ('tplh_weekday', 10021, 'TPLH (weekday) - vs. own 8-week baseline', 6.25, null, 'ratio', false, 'migration-006'),
  ('tplh_weekday', 10022, 'TPLH (weekday) - vs. own 8-week baseline', 6, null, 'ratio', false, 'migration-006'),
  ('tplh_weekday', 10023, 'TPLH (weekday) - vs. own 8-week baseline', 5.25, null, 'ratio', false, 'migration-006'),
  ('tplh_weekday', 10024, 'TPLH (weekday) - vs. own 8-week baseline', 6.25, null, 'ratio', false, 'migration-006'),
  ('tplh_weekday', 10025, 'TPLH (weekday) - vs. own 8-week baseline', 5.75, null, 'ratio', false, 'migration-006'),
  ('tplh_weekday', 10026, 'TPLH (weekday) - vs. own 8-week baseline', 7, null, 'ratio', false, 'migration-006'),
  ('tplh_weekday', 10027, 'TPLH (weekday) - vs. own 8-week baseline', 7.5, null, 'ratio', false, 'migration-006'),
  ('tplh_weekday', 10028, 'TPLH (weekday) - vs. own 8-week baseline', 5.75, null, 'ratio', false, 'migration-006'),
  ('tplh_weekday', 10029, 'TPLH (weekday) - vs. own 8-week baseline', 6, null, 'ratio', false, 'migration-006'),
  ('tplh_weekday', 10030, 'TPLH (weekday) - vs. own 8-week baseline', 5.25, null, 'ratio', false, 'migration-006'),
  ('tplh_weekday', 10031, 'TPLH (weekday) - vs. own 8-week baseline', 5.5, null, 'ratio', false, 'migration-006'),
  ('tplh_weekday', 10032, 'TPLH (weekday) - vs. own 8-week baseline', 5, null, 'ratio', false, 'migration-006'),
  ('tplh_weekday', 10034, 'TPLH (weekday) - vs. own 8-week baseline', 4.25, null, 'ratio', false, 'migration-006'),
  ('tplh_weekday', 10036, 'TPLH (weekday) - vs. own 8-week baseline', 4.5, null, 'ratio', false, 'migration-006')
on conflict (metric, store_code) where store_code is not null do update set
  target_value = excluded.target_value,
  label = excluded.label,
  unit = excluded.unit,
  lower_is_better = excluded.lower_is_better,
  updated_by = excluded.updated_by,
  updated_at = now();

insert into metric_targets (metric, store_code, label, target_value, red_value, unit, lower_is_better, updated_by)
values
  ('tplh_weekend', 10001, 'TPLH (weekend) - vs. own 8-week baseline', 7, null, 'ratio', false, 'migration-006'),
  ('tplh_weekend', 10002, 'TPLH (weekend) - vs. own 8-week baseline', 7.5, null, 'ratio', false, 'migration-006'),
  ('tplh_weekend', 10003, 'TPLH (weekend) - vs. own 8-week baseline', 7, null, 'ratio', false, 'migration-006'),
  ('tplh_weekend', 10004, 'TPLH (weekend) - vs. own 8-week baseline', 7.25, null, 'ratio', false, 'migration-006'),
  ('tplh_weekend', 10005, 'TPLH (weekend) - vs. own 8-week baseline', 6.5, null, 'ratio', false, 'migration-006'),
  ('tplh_weekend', 10006, 'TPLH (weekend) - vs. own 8-week baseline', 6.5, null, 'ratio', false, 'migration-006'),
  ('tplh_weekend', 10007, 'TPLH (weekend) - vs. own 8-week baseline', 6, null, 'ratio', false, 'migration-006'),
  ('tplh_weekend', 10008, 'TPLH (weekend) - vs. own 8-week baseline', 6.25, null, 'ratio', false, 'migration-006'),
  ('tplh_weekend', 10009, 'TPLH (weekend) - vs. own 8-week baseline', 8.25, null, 'ratio', false, 'migration-006'),
  ('tplh_weekend', 10010, 'TPLH (weekend) - vs. own 8-week baseline', 6, null, 'ratio', false, 'migration-006'),
  ('tplh_weekend', 10011, 'TPLH (weekend) - vs. own 8-week baseline', 6, null, 'ratio', false, 'migration-006'),
  ('tplh_weekend', 10012, 'TPLH (weekend) - vs. own 8-week baseline', 6, null, 'ratio', false, 'migration-006'),
  ('tplh_weekend', 10013, 'TPLH (weekend) - vs. own 8-week baseline', 7.5, null, 'ratio', false, 'migration-006'),
  ('tplh_weekend', 10014, 'TPLH (weekend) - vs. own 8-week baseline', 5.25, null, 'ratio', false, 'migration-006'),
  ('tplh_weekend', 10015, 'TPLH (weekend) - vs. own 8-week baseline', 6.25, null, 'ratio', false, 'migration-006'),
  ('tplh_weekend', 10016, 'TPLH (weekend) - vs. own 8-week baseline', 6.5, null, 'ratio', false, 'migration-006'),
  ('tplh_weekend', 10017, 'TPLH (weekend) - vs. own 8-week baseline', 7, null, 'ratio', false, 'migration-006'),
  ('tplh_weekend', 10018, 'TPLH (weekend) - vs. own 8-week baseline', 6.75, null, 'ratio', false, 'migration-006'),
  ('tplh_weekend', 10019, 'TPLH (weekend) - vs. own 8-week baseline', 5.75, null, 'ratio', false, 'migration-006'),
  ('tplh_weekend', 10020, 'TPLH (weekend) - vs. own 8-week baseline', 6.5, null, 'ratio', false, 'migration-006'),
  ('tplh_weekend', 10021, 'TPLH (weekend) - vs. own 8-week baseline', 6.5, null, 'ratio', false, 'migration-006'),
  ('tplh_weekend', 10022, 'TPLH (weekend) - vs. own 8-week baseline', 6.25, null, 'ratio', false, 'migration-006'),
  ('tplh_weekend', 10023, 'TPLH (weekend) - vs. own 8-week baseline', 6.75, null, 'ratio', false, 'migration-006'),
  ('tplh_weekend', 10024, 'TPLH (weekend) - vs. own 8-week baseline', 6.75, null, 'ratio', false, 'migration-006'),
  ('tplh_weekend', 10025, 'TPLH (weekend) - vs. own 8-week baseline', 6.25, null, 'ratio', false, 'migration-006'),
  ('tplh_weekend', 10026, 'TPLH (weekend) - vs. own 8-week baseline', 7, null, 'ratio', false, 'migration-006'),
  ('tplh_weekend', 10027, 'TPLH (weekend) - vs. own 8-week baseline', 8.25, null, 'ratio', false, 'migration-006'),
  ('tplh_weekend', 10028, 'TPLH (weekend) - vs. own 8-week baseline', 6, null, 'ratio', false, 'migration-006'),
  ('tplh_weekend', 10029, 'TPLH (weekend) - vs. own 8-week baseline', 6, null, 'ratio', false, 'migration-006'),
  ('tplh_weekend', 10030, 'TPLH (weekend) - vs. own 8-week baseline', 6.25, null, 'ratio', false, 'migration-006'),
  ('tplh_weekend', 10031, 'TPLH (weekend) - vs. own 8-week baseline', 6.25, null, 'ratio', false, 'migration-006'),
  ('tplh_weekend', 10032, 'TPLH (weekend) - vs. own 8-week baseline', 5.75, null, 'ratio', false, 'migration-006'),
  ('tplh_weekend', 10034, 'TPLH (weekend) - vs. own 8-week baseline', 5, null, 'ratio', false, 'migration-006'),
  ('tplh_weekend', 10036, 'TPLH (weekend) - vs. own 8-week baseline', 5, null, 'ratio', false, 'migration-006')
on conflict (metric, store_code) where store_code is not null do update set
  target_value = excluded.target_value,
  label = excluded.label,
  unit = excluded.unit,
  lower_is_better = excluded.lower_is_better,
  updated_by = excluded.updated_by,
  updated_at = now();

-- To roll back (restores 005's WRONG values - only useful for reverting
-- this specific fix, not a general-purpose rollback):
--   see docs/sql/005-tplh-store-targets.sql for the original values.
