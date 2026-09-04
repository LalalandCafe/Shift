-- Command Center Phase 4/4b: assess and prepare metric_targets as the
-- general targets table.
--
-- REVISION: first run of this file failed in production -
--   ERROR 23502: null value in column "red_value" violates not-null
--   constraint (failing row: splh_weekday, store 10001, red_value null).
-- Confirmed rolled back cleanly (Supabase's SQL editor runs a file as one
-- transaction) - metric_targets had only its original PK and zero
-- migration-003 rows afterward. red_value is NOT NULL with no default on
-- the live table (confirmed via PostgREST's OpenAPI schema, read-only -
-- required: [metric, label, target_value, red_value, unit,
-- lower_is_better, updated_at]), and the SPLH backfill below never set it,
-- since red-line values for SPLH have not been set by anyone and must not
-- be invented here. Fixed by dropping the NOT NULL constraint - see the
-- new step 0 below - rather than inventing a red_value.
--
-- CONSUMER CHECK, as requested before changing anything:
--   - components/KitchenTrend.js: does not read metric_targets at all
--     (confirmed by grep - zero references). Not affected either way.
--   - app/api/drive-thru/route.js: selects red_value but only passes it
--     through untouched to the client (its own comment: "this route does
--     not know what 105 seconds means and must never decide it"). Not
--     affected by a null appearing on a DIFFERENT metric row.
--   - lib/scale.js's cfgFromTarget(row) (the only other consumer of this
--     column - grepped the whole repo, these are the only two hits):
--       redLine: Number(row.red_value)
--     THIS DOES assume red_value is always present, but not by crashing -
--     Number(null) is 0, not NaN, so a null red_value would silently
--     become redLine: 0 rather than "no red line." For a higher-is-better
--     metric like SPLH, bandFor()'s red-line check ("v >= redLine") would
--     then almost never fire, so a store far below target would land in
--     lightRed (WATCH) forever instead of ever reaching red (ACTION) -
--     wrong, but not a crash, and NOT changed by this file. Flagging per
--     your instruction rather than fixing lib/scale.js myself - the fix
--     (mirror the green_value line immediately below it: `row.red_value
--     == null ? null : Number(row.red_value)`) is a one-line change I'm
--     holding until you say go, since it's shared code outside this SQL
--     file. Not urgent to land alongside this migration: nothing calls
--     cfgFromTarget() for the new splh_* rows yet - only
--     app/api/drive-thru/route.js's dt_window row reaches it today, and
--     that row's red_value is untouched by this migration.
--   - SQL VIEWS: metric_targets' own live column comment (also read via
--     the OpenAPI schema, not assumed) says "Read by SQL views and by
--     lib/scale.js." I can see view NAMES and OUTPUT COLUMNS through
--     PostgREST's schema introspection, but not view DEFINITIONS (no
--     information_schema/pg_catalog access from here). Found two that are
--     plausibly relevant - dt_bands (columns b_target/b_comfort/b_red/
--     b_low/b_far, no metric or store_code column, so almost certainly
--     scoped to one specific metric already, not an unscoped scan) and
--     drive_thru_vs_kitchen (has store_code + business_date, reads like a
--     per-store daily rollup, also likely metric-scoped) - plus a THIRD,
--     unexpected table, drive_thru_targets (green_seconds=45/
--     yellow_seconds=90, its own separate id=1 config row), which is not
--     metric_targets at all and isn't queried anywhere in this
--     repo's application code either. I cannot confirm from here whether
--     dt_bands is computed from metric_targets, from drive_thru_targets,
--     or both. Best read of the evidence: existing rows (dt_window, expo)
--     are completely untouched by this migration (DROP NOT NULL changes
--     nothing about already-stored values), and any view that filters by
--     a specific known metric name - which every application-code access
--     pattern in this repo does, and which dt_bands' shape strongly
--     suggests - would never even see the new splh_* rows, null red_value
--     or not. But I can't read the view's SQL, so this is a reasoned
--     inference, not a confirmed fact - worth a direct look at dt_bands'
--     definition in the Supabase dashboard before running this if you
--     want certainty rather than reasoned confidence.
--
-- ASSESSMENT (unchanged from the first version - this is what was
-- actually asked - "assess whether metric_targets can become the general
-- targets table"):
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
--   0. Drops the NOT NULL constraint on red_value. A target-only metric
--      (a value with no red-line, because nobody has set one yet) is a
--      real, expected state this table needs to represent - not an error
--      condition. This is schema-only: it changes nothing about the
--      EXISTING dt_window/expo rows, which keep their real red_value
--      exactly as before, and doesn't touch target_value or any other
--      column's constraints.
--   1. Adds the store_code column and the two partial unique indexes that
--      keep "at most one chain-wide row" and "at most one row per store"
--      each enforceable (a plain UNIQUE(metric, store_code) would NOT do
--      this - Postgres treats every NULL store_code as distinct from
--      every other NULL, so nothing would stop two "chain-wide" rows for
--      the same metric under a naive constraint).
--   2. Backfills metric_targets with a COPY of each store's existing
--      weekday/weekend/ptd SPLH targets, as three new metric keys
--      (splh_weekday, splh_weekend, splh_ptd) with store_code set and
--      red_value left null - nobody has set an SPLH red-line, and this
--      file must not invent one. This copies real, already-live target
--      numbers - not new target-setting.
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
-- CONFIRMED (revised from the first version, which flagged this as
-- unconfirmed): "references stores(code)" below is valid - PostgREST's
-- OpenAPI schema explicitly marks stores.code as a Primary Key. Read-only
-- check, not assumed.
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
--   -- red_value is left nullable on rollback rather than restored to NOT
--   -- NULL - re-adding that constraint would fail immediately on the
--   -- dt_window/expo rows' own real values only if one of them were ever
--   -- null, which they aren't, but there's no value in reintroducing a
--   -- constraint this table's own design (a target with no red-line yet)
--   -- needs to not have.

-- Step 0: allow a target with no red-line. DROP NOT NULL is a no-op if
-- already nullable, so this line alone is safe to rerun on its own.
alter table metric_targets
  alter column red_value drop not null;

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
