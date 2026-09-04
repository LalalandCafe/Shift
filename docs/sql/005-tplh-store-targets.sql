-- Command Center Phase 4/4b: per-store TPLH targets.
--
-- DECISION, per your instruction - not a hand-set number, not invented by
-- me: each store's weekday/weekend target is its OWN trailing 8-week
-- average TPLH, rounded to the nearest 0.25. Rationale you gave: TPLH vs.
-- average ticket correlated at r = -0.58 (see docs/plans/
-- COMMAND-CENTER-PROGRESS.md, Phase 4/4b step 3), so TPLH isn't comparable
-- across stores - product mix explains too much of the spread. A store's
-- chip should measure it against its own recent baseline, not against
-- other stores. No red-line is set here either - the same "don't invent a
-- threshold" rule applies to a red-line as it does to the target itself,
-- and none was asked for.
--
-- Source data: the exact same 8-week window (last 8 complete Mon-Sun
-- weeks as of 2026-09-04), the exact same formula (lib/throughput.js's
-- transactions / hours) and the exact same exclusion rule
-- (lib/calc.js's exclusionReason()) as the trailing-actuals pull already
-- given to you in chat - averaged per week per store per weekday/weekend
-- bucket, then that average rounded to the nearest 0.25. Computed by a
-- one-off script against production (read-only), not committed.
--
-- EXCLUDED: store 10037 (DFW El Dorado) - soft opening, only 5 of 8 weeks
-- have any transaction data and one of those 5 came back a real zero.
-- Per your instruction, it gets no TPLH target until it has a full run of
-- normal weeks. It is not present in either INSERT below.
--
-- UI REQUIREMENT for whenever these get wired to a chip (not done yet -
-- this file only writes the schema rows): label the chip so nobody reads
-- it as a cross-store ranking. Each store's number is relative to its OWN
-- baseline, not the chain's. This has to be visible on the chip itself,
-- not left implied by the metric name - flagging here so it isn't lost
-- between now and whenever tplh_weekday/tplh_weekend get a
-- currentValueFor() branch in app/api/command-center/goals/route.js (the
-- route does not have one yet - it would report these as "No current-value
-- source wired for this metric yet" if queried today).
--
-- Depends on docs/sql/003-unify-metric-targets.sql having run (adds
-- store_code + the per-store partial unique index this relies on). Run
-- 003, then 004, then this, per your instruction.
--
-- Idempotent: ON CONFLICT targets the per-store partial unique index from
-- 003, so re-running this file (e.g. after recomputing a fresher 8-week
-- window later) updates the same rows instead of duplicating them.

insert into metric_targets (metric, store_code, label, target_value, red_value, unit, lower_is_better, updated_by)
values
  ('tplh_weekday', 10001, 'TPLH (weekday) - vs. own 8-week baseline', 6, null, 'ratio', false, 'migration-005'),
  ('tplh_weekday', 10002, 'TPLH (weekday) - vs. own 8-week baseline', 7, null, 'ratio', false, 'migration-005'),
  ('tplh_weekday', 10003, 'TPLH (weekday) - vs. own 8-week baseline', 6.5, null, 'ratio', false, 'migration-005'),
  ('tplh_weekday', 10004, 'TPLH (weekday) - vs. own 8-week baseline', 6.5, null, 'ratio', false, 'migration-005'),
  ('tplh_weekday', 10005, 'TPLH (weekday) - vs. own 8-week baseline', 6, null, 'ratio', false, 'migration-005'),
  ('tplh_weekday', 10006, 'TPLH (weekday) - vs. own 8-week baseline', 5.75, null, 'ratio', false, 'migration-005'),
  ('tplh_weekday', 10007, 'TPLH (weekday) - vs. own 8-week baseline', 5.25, null, 'ratio', false, 'migration-005'),
  ('tplh_weekday', 10008, 'TPLH (weekday) - vs. own 8-week baseline', 6, null, 'ratio', false, 'migration-005'),
  ('tplh_weekday', 10009, 'TPLH (weekday) - vs. own 8-week baseline', 7.5, null, 'ratio', false, 'migration-005'),
  ('tplh_weekday', 10010, 'TPLH (weekday) - vs. own 8-week baseline', 6.25, null, 'ratio', false, 'migration-005'),
  ('tplh_weekday', 10011, 'TPLH (weekday) - vs. own 8-week baseline', 6, null, 'ratio', false, 'migration-005'),
  ('tplh_weekday', 10012, 'TPLH (weekday) - vs. own 8-week baseline', 6, null, 'ratio', false, 'migration-005'),
  ('tplh_weekday', 10013, 'TPLH (weekday) - vs. own 8-week baseline', 6.25, null, 'ratio', false, 'migration-005'),
  ('tplh_weekday', 10014, 'TPLH (weekday) - vs. own 8-week baseline', 4.75, null, 'ratio', false, 'migration-005'),
  ('tplh_weekday', 10015, 'TPLH (weekday) - vs. own 8-week baseline', 6.25, null, 'ratio', false, 'migration-005'),
  ('tplh_weekday', 10016, 'TPLH (weekday) - vs. own 8-week baseline', 6.25, null, 'ratio', false, 'migration-005'),
  ('tplh_weekday', 10017, 'TPLH (weekday) - vs. own 8-week baseline', 6.25, null, 'ratio', false, 'migration-005'),
  ('tplh_weekday', 10018, 'TPLH (weekday) - vs. own 8-week baseline', 6, null, 'ratio', false, 'migration-005'),
  ('tplh_weekday', 10019, 'TPLH (weekday) - vs. own 8-week baseline', 5.75, null, 'ratio', false, 'migration-005'),
  ('tplh_weekday', 10020, 'TPLH (weekday) - vs. own 8-week baseline', 6.75, null, 'ratio', false, 'migration-005'),
  ('tplh_weekday', 10021, 'TPLH (weekday) - vs. own 8-week baseline', 6.25, null, 'ratio', false, 'migration-005'),
  ('tplh_weekday', 10022, 'TPLH (weekday) - vs. own 8-week baseline', 6.25, null, 'ratio', false, 'migration-005'),
  ('tplh_weekday', 10023, 'TPLH (weekday) - vs. own 8-week baseline', 5.25, null, 'ratio', false, 'migration-005'),
  ('tplh_weekday', 10024, 'TPLH (weekday) - vs. own 8-week baseline', 6.5, null, 'ratio', false, 'migration-005'),
  ('tplh_weekday', 10025, 'TPLH (weekday) - vs. own 8-week baseline', 5.75, null, 'ratio', false, 'migration-005'),
  ('tplh_weekday', 10026, 'TPLH (weekday) - vs. own 8-week baseline', 7.25, null, 'ratio', false, 'migration-005'),
  ('tplh_weekday', 10027, 'TPLH (weekday) - vs. own 8-week baseline', 7.5, null, 'ratio', false, 'migration-005'),
  ('tplh_weekday', 10028, 'TPLH (weekday) - vs. own 8-week baseline', 5.75, null, 'ratio', false, 'migration-005'),
  ('tplh_weekday', 10029, 'TPLH (weekday) - vs. own 8-week baseline', 6, null, 'ratio', false, 'migration-005'),
  ('tplh_weekday', 10030, 'TPLH (weekday) - vs. own 8-week baseline', 5.5, null, 'ratio', false, 'migration-005'),
  ('tplh_weekday', 10031, 'TPLH (weekday) - vs. own 8-week baseline', 5.5, null, 'ratio', false, 'migration-005'),
  ('tplh_weekday', 10032, 'TPLH (weekday) - vs. own 8-week baseline', 5, null, 'ratio', false, 'migration-005'),
  ('tplh_weekday', 10034, 'TPLH (weekday) - vs. own 8-week baseline', 4.25, null, 'ratio', false, 'migration-005'),
  ('tplh_weekday', 10036, 'TPLH (weekday) - vs. own 8-week baseline', 4.5, null, 'ratio', false, 'migration-005')
on conflict (metric, store_code) where store_code is not null do update set
  target_value = excluded.target_value,
  label = excluded.label,
  unit = excluded.unit,
  lower_is_better = excluded.lower_is_better,
  updated_by = excluded.updated_by,
  updated_at = now();

insert into metric_targets (metric, store_code, label, target_value, red_value, unit, lower_is_better, updated_by)
values
  ('tplh_weekend', 10001, 'TPLH (weekend) - vs. own 8-week baseline', 7.25, null, 'ratio', false, 'migration-005'),
  ('tplh_weekend', 10002, 'TPLH (weekend) - vs. own 8-week baseline', 7.25, null, 'ratio', false, 'migration-005'),
  ('tplh_weekend', 10003, 'TPLH (weekend) - vs. own 8-week baseline', 7.25, null, 'ratio', false, 'migration-005'),
  ('tplh_weekend', 10004, 'TPLH (weekend) - vs. own 8-week baseline', 7, null, 'ratio', false, 'migration-005'),
  ('tplh_weekend', 10005, 'TPLH (weekend) - vs. own 8-week baseline', 6.25, null, 'ratio', false, 'migration-005'),
  ('tplh_weekend', 10006, 'TPLH (weekend) - vs. own 8-week baseline', 6.75, null, 'ratio', false, 'migration-005'),
  ('tplh_weekend', 10007, 'TPLH (weekend) - vs. own 8-week baseline', 6, null, 'ratio', false, 'migration-005'),
  ('tplh_weekend', 10008, 'TPLH (weekend) - vs. own 8-week baseline', 6, null, 'ratio', false, 'migration-005'),
  ('tplh_weekend', 10009, 'TPLH (weekend) - vs. own 8-week baseline', 8.5, null, 'ratio', false, 'migration-005'),
  ('tplh_weekend', 10010, 'TPLH (weekend) - vs. own 8-week baseline', 6.25, null, 'ratio', false, 'migration-005'),
  ('tplh_weekend', 10011, 'TPLH (weekend) - vs. own 8-week baseline', 6.25, null, 'ratio', false, 'migration-005'),
  ('tplh_weekend', 10012, 'TPLH (weekend) - vs. own 8-week baseline', 6.25, null, 'ratio', false, 'migration-005'),
  ('tplh_weekend', 10013, 'TPLH (weekend) - vs. own 8-week baseline', 7.5, null, 'ratio', false, 'migration-005'),
  ('tplh_weekend', 10014, 'TPLH (weekend) - vs. own 8-week baseline', 5.5, null, 'ratio', false, 'migration-005'),
  ('tplh_weekend', 10015, 'TPLH (weekend) - vs. own 8-week baseline', 6.25, null, 'ratio', false, 'migration-005'),
  ('tplh_weekend', 10016, 'TPLH (weekend) - vs. own 8-week baseline', 6.5, null, 'ratio', false, 'migration-005'),
  ('tplh_weekend', 10017, 'TPLH (weekend) - vs. own 8-week baseline', 7.25, null, 'ratio', false, 'migration-005'),
  ('tplh_weekend', 10018, 'TPLH (weekend) - vs. own 8-week baseline', 6.75, null, 'ratio', false, 'migration-005'),
  ('tplh_weekend', 10019, 'TPLH (weekend) - vs. own 8-week baseline', 5.75, null, 'ratio', false, 'migration-005'),
  ('tplh_weekend', 10020, 'TPLH (weekend) - vs. own 8-week baseline', 6.5, null, 'ratio', false, 'migration-005'),
  ('tplh_weekend', 10021, 'TPLH (weekend) - vs. own 8-week baseline', 6.75, null, 'ratio', false, 'migration-005'),
  ('tplh_weekend', 10022, 'TPLH (weekend) - vs. own 8-week baseline', 6, null, 'ratio', false, 'migration-005'),
  ('tplh_weekend', 10023, 'TPLH (weekend) - vs. own 8-week baseline', 7.25, null, 'ratio', false, 'migration-005'),
  ('tplh_weekend', 10024, 'TPLH (weekend) - vs. own 8-week baseline', 6.75, null, 'ratio', false, 'migration-005'),
  ('tplh_weekend', 10025, 'TPLH (weekend) - vs. own 8-week baseline', 6.25, null, 'ratio', false, 'migration-005'),
  ('tplh_weekend', 10026, 'TPLH (weekend) - vs. own 8-week baseline', 7, null, 'ratio', false, 'migration-005'),
  ('tplh_weekend', 10027, 'TPLH (weekend) - vs. own 8-week baseline', 8.75, null, 'ratio', false, 'migration-005'),
  ('tplh_weekend', 10028, 'TPLH (weekend) - vs. own 8-week baseline', 6, null, 'ratio', false, 'migration-005'),
  ('tplh_weekend', 10029, 'TPLH (weekend) - vs. own 8-week baseline', 6, null, 'ratio', false, 'migration-005'),
  ('tplh_weekend', 10030, 'TPLH (weekend) - vs. own 8-week baseline', 6.25, null, 'ratio', false, 'migration-005'),
  ('tplh_weekend', 10031, 'TPLH (weekend) - vs. own 8-week baseline', 6.5, null, 'ratio', false, 'migration-005'),
  ('tplh_weekend', 10032, 'TPLH (weekend) - vs. own 8-week baseline', 5.75, null, 'ratio', false, 'migration-005'),
  ('tplh_weekend', 10034, 'TPLH (weekend) - vs. own 8-week baseline', 5, null, 'ratio', false, 'migration-005'),
  ('tplh_weekend', 10036, 'TPLH (weekend) - vs. own 8-week baseline', 5, null, 'ratio', false, 'migration-005')
on conflict (metric, store_code) where store_code is not null do update set
  target_value = excluded.target_value,
  label = excluded.label,
  unit = excluded.unit,
  lower_is_better = excluded.lower_is_better,
  updated_by = excluded.updated_by,
  updated_at = now();

-- To roll back:
--   delete from metric_targets where metric in ('tplh_weekday', 'tplh_weekend');
