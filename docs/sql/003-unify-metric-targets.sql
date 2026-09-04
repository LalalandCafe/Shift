-- Command Center Phase 4/4b: assess and prepare metric_targets as the
-- general targets table.
--
-- ASSESSMENT FIRST (this is what was actually asked - "assess whether
-- metric_targets can become the general targets table"):
--
-- Checked live, not assumed:
--   - metric_targets today: 2 rows, both chain-wide (no store scoping at
--     all). "dt_window" (drive-thru, target 150s/red 165s/green 120s) and
--     "expo" (target 300s/red 420s, green null) - "expo" is a kitchen
--     ticket-time target that exists in the database RIGHT NOW and is
--     read by NOTHING in the current codebase (grepped app/, lib/,
--     components/ - zero references). This revises what was reported
--     earlier: kitchen ticket time is not missing a target, it's missing
--     the wire-up between an already-seeded target and
--     components/KitchenTrend.js, which still uses its own hardcoded
--     ladders. Confirm the 300/420 values are still correct before this
--     gets wired to anything - they were seeded by "migration" with no
--     traceable owner in this codebase.
--   - "Regional weekday/weekend targets" - looked for this specifically
--     and it does not exist anywhere. stores.weekday_target/weekend_target
--     are per-STORE only; every one of the 35 stores has its own explicit
--     values (spot-checked live: e.g. store 10001 is 75/85/80, same as
--     10002 and 10003 - common defaults, but still stored per-store, not
--     inherited from a region row). There is no region-level or
--     grp-level target table or column anywhere in the schema or code.
--     If a real region-level target need comes up later, the store_code
--     column added below could be generalized to an optional grp/region
--     column too - not adding one now since nothing today needs it.
--
-- CONCLUSION: metric_targets can become the general table with one
-- additive change - a nullable store_code (null = chain-wide, set =
-- per-store override) - plus using compound metric keys for SPLH's three
-- concurrent weekday/weekend/PTD values, rather than a new "variant"
-- column. No structural blocker found.
--
-- WHAT THIS FILE DOES:
--   1. Adds the store_code column and the two partial unique indexes that
--      keep "at most one chain-wide row" and "at most one row per store"
--      each enforceable (a plain UNIQUE(metric, store_code) would NOT do
--      this - Postgres treats every NULL store_code as distinct from
--      every other NULL, so nothing would stop two "chain-wide" rows for
--      the same metric under a naive constraint).
--   2. Backfills metric_targets with a COPY of each store's existing
--      weekday/weekend/ptd SPLH targets, as three new metric keys
--      (splh_weekday, splh_weekend, splh_ptd) with store_code set. This
--      copies real, already-live numbers - not new target-setting.
--
-- WHAT THIS FILE DELIBERATELY DOES NOT DO:
--   - It does not touch, drop, or stop populating stores.weekday_target/
--     weekend_target/ptd_target. lib/calc.js's getTarget()/getPtdTarget()
--     - the functions the LIVE dashboard/email/Week View actually call -
--     keep reading from stores exactly as before. Zero risk to production
--     SPLH numbers from running this file.
--   - It does not add rows for TPLH, SSSG, or kitchen ticket time. Those
--     need real numbers from a person, not a copy of an existing value -
--     see the accompanying message for the exact list and shapes needed.
--   - It is a MIRROR, not a merge. If someone edits a store's SPLH target
--     through the existing Targets tab (components/Targets.js -> PATCH
--     /api/stores -> lib/data.js's updateStoreTargets), that write still
--     only touches the stores columns - the copy in metric_targets from
--     this backfill will drift out of date immediately and silently.
--     Cutting the write path over so there is one source of truth is a
--     separate, deliberate follow-up, not part of this file - it would
--     mean updating updateStoreTargets/app/api/stores/route.js too, which
--     is the live production edit path managers use today and shouldn't
--     change as a side effect of a schema assessment.
--
-- ASSUMPTION NOT CONFIRMED: "references stores(code)" below assumes
-- stores.code has a unique or primary key constraint. Every part of this
-- app treats it as the natural business key (BRIEF.md calls it out
-- explicitly), and a live check found zero duplicate codes across all 35
-- rows - but PostgREST's REST API doesn't expose information_schema
-- directly, so this could not be confirmed the way everything else in
-- this file was. If code isn't actually constrained unique, this ALTER
-- fails cleanly with a Postgres error and changes nothing - not a
-- silent-damage case - just drop the "references stores(code)" clause
-- and rerun if that happens.
--
-- To run: paste into the Supabase SQL editor for the production project
-- and execute. Safe to run more than once (IF NOT EXISTS / ON CONFLICT
-- DO NOTHING guards throughout). Not run by anything in this codebase.
--
-- To roll back:
--   delete from metric_targets where metric in ('splh_weekday', 'splh_weekend', 'splh_ptd');
--   drop index if exists metric_targets_chainwide_uniq;
--   drop index if exists metric_targets_store_uniq;
--   alter table metric_targets drop column if exists store_code;

alter table metric_targets
  add column if not exists store_code integer references stores(code);

-- At most one chain-wide row (store_code is null) per metric.
create unique index if not exists metric_targets_chainwide_uniq
  on metric_targets (metric)
  where store_code is null;

-- At most one row per metric per store.
create unique index if not exists metric_targets_store_uniq
  on metric_targets (metric, store_code)
  where store_code is not null;

-- Backfill: copy each store's existing SPLH targets in as three new
-- metric rows. ON CONFLICT targets the partial unique index above, so
-- re-running this file does not duplicate rows.
insert into metric_targets (metric, store_code, label, target_value, unit, lower_is_better, updated_by)
select 'splh_weekday', code, 'SPLH (weekday)', weekday_target, 'dollars', false, 'migration-003'
from stores
where weekday_target is not null
on conflict (metric, store_code) where store_code is not null do nothing;

insert into metric_targets (metric, store_code, label, target_value, unit, lower_is_better, updated_by)
select 'splh_weekend', code, 'SPLH (weekend)', weekend_target, 'dollars', false, 'migration-003'
from stores
where weekend_target is not null
on conflict (metric, store_code) where store_code is not null do nothing;

insert into metric_targets (metric, store_code, label, target_value, unit, lower_is_better, updated_by)
select 'splh_ptd', code, 'SPLH (period to date)', ptd_target, 'dollars', false, 'migration-003'
from stores
where ptd_target is not null
on conflict (metric, store_code) where store_code is not null do nothing;
