-- Command Center Phase 4/4b: SSSG goal chip target.
--
-- Your decision: target = 0% (the natural growing/shrinking boundary - not
-- an invented number), chain-wide only (one comparable month right now, so
-- no basis for a regional split), no red-line. Revisit once more 2025
-- months are backfilled and there's more than one data point to set a
-- red-line from.
--
-- Depends on docs/sql/003-unify-metric-targets.sql already having run
-- (adds store_code + the nullable red_value this row relies on). Run 003
-- first if it hasn't landed yet.
--
-- Idempotent: ON CONFLICT targets the chain-wide partial unique index from
-- 003, so re-running this file updates the same row instead of duplicating
-- it.

insert into metric_targets (metric, store_code, label, target_value, red_value, unit, lower_is_better, updated_by)
values ('sssg', null, 'Same-Store Sales Growth', 0, null, 'percent', false, 'migration-004')
on conflict (metric) where store_code is null
do update set
  target_value = excluded.target_value,
  red_value = excluded.red_value,
  unit = excluded.unit,
  lower_is_better = excluded.lower_is_better,
  updated_by = excluded.updated_by,
  updated_at = now();

-- To roll back:
--   delete from metric_targets where metric = 'sssg';
