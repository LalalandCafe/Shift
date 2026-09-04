-- Command Center Phase 4/4b: assess and prepare metric_targets as the
-- general targets table.
--
-- REVISION 2: second run failed in production, different error -
--   ERROR 23505: duplicate key value violates unique constraint
--   "metric_targets_pkey". DETAIL: Key (metric)=(splh_weekday) already
--   exists.
-- Confirmed rolled back cleanly again (same one-transaction behavior) -
-- metric_targets had only its original metric_targets_pkey afterward, no
-- new indexes, nothing else changed.
--
-- ROOT CAUSE: the first fix added store_code and two new PARTIAL unique
-- indexes, but never dropped the ORIGINAL primary key - a single-column
-- PK on `metric` alone, enforcing "at most one row per metric, period,"
-- which is exactly the constraint this whole migration exists to relax.
-- That old PK is a different constraint than the new partial indexes, so
-- `ON CONFLICT (metric, store_code) WHERE store_code IS NOT NULL` never
-- had a chance to run - Postgres checks the untargeted PK first and
-- aborts the statement before ON CONFLICT's target index is even
-- considered. Confirming the constraint before changing it, not assuming
-- from the error text alone, per your instruction:
--
--   Confirmed via PostgREST's OpenAPI schema (read-only,
--   /rest/v1/ with Accept: application/openapi+json): of every column on
--   metric_targets, only `metric` carries the schema's primary-key
--   annotation (`"description": "Note:\nThis is a Primary Key.<pk/>"`).
--   No other column in this table's definition carries that annotation,
--   and PostgREST annotates EVERY column that participates in a PK this
--   way (a composite PK would show the annotation on each of its
--   columns) - so `metric_targets_pkey` is confirmed single-column, on
--   `metric` alone, exactly as the error said. This matches the error's
--   own constraint name and column, so nothing here overturns what the
--   error already reported - this is independent confirmation of it, not
--   a first read.
--
--   Also scanned every OTHER table's schema in this same document for any
--   column whose description references metric_targets as a foreign-key
--   target (PostgREST annotates FK columns the same explicit way it
--   annotates PKs) - zero hits, across all ~35 tables/views this project
--   exposes. Nothing in this database has a foreign key pointing at
--   metric_targets.metric, so dropping that PK carries no
--   referential-integrity risk elsewhere in the schema.
--
--   WHAT I CANNOT CONFIRM FROM HERE, and want to be direct about after
--   getting this wrong twice: PostgREST's OpenAPI introspection exposes
--   primary keys (the annotation above) and NOT NULL columns (the
--   `required` list), but it does NOT expose CHECK constraints or any
--   UNIQUE constraint other than the primary key - there is no field for
--   either in this schema format. This environment has REST access only
--   (no information_schema/pg_catalog, no SQL-execution RPC - the only
--   three RPCs this project exposes are purge_login_attempts,
--   refresh_drive_thru_views, and tattle_reviews_rollup, none of them
--   generic). So: PK confirmed, NOT NULL columns confirmed, inbound/
--   outbound foreign keys confirmed absent - but a CHECK constraint (for
--   example, one restricting `unit` to a fixed list - this migration and
--   004/005 introduce 'dollars', 'percent', and 'ratio', where only
--   'seconds' existed before) or an undiscovered UNIQUE constraint cannot
--   be ruled out from this sandboxed environment. Before running this,
--   it's worth running the query below yourself in the Supabase SQL
--   editor - it is a plain SELECT, not DDL, so it changes nothing and
--   carries zero risk - to get a complete, authoritative constraint list
--   directly from pg_catalog rather than my bounded inference:
--
--     select conname, contype, pg_get_constraintdef(oid) as definition
--     from pg_constraint
--     where conrelid = 'metric_targets'::regclass
--     order by contype;
--
--   (contype: 'p' = primary key, 'u' = unique, 'f' = foreign key,
--   'c' = check.) If that comes back with only the primary key this
--   migration already knows about, the read below was complete and 003
--   is safe to run start to finish, including 004 and 005 after it. If
--   it turns up a CHECK constraint on `unit` or anything else unexpected,
--   tell me before running 004/005, since both introduce unit values this
--   table has never stored before.
--
-- CONSUMER CHECK, part 2 - same "does anything assume single-row"
-- question you asked about dt_bands, checked against every consumer of
-- metric_targets in the actual app code (grepped app/, lib/,
-- components/ - metric_targets is read in exactly two places outside
-- this Command Center work):
--   - app/api/command-center/goals/route.js (this project's own new
--     code): selects with no .single() and filters store_code is null
--     explicitly - already written to expect zero-or-more rows. Not at
--     risk.
--   - app/api/drive-thru/route.js's loadTarget(): DOES have exactly the
--     single-row assumption you were worried about -
--       .eq("metric", DT_METRIC).single()
--     .single() throws if PostgREST returns anything other than exactly
--     one row. Today this is safe: the migration below does not add,
--     remove, or touch any dt_window row, so there is still exactly one
--     and this keeps working unchanged immediately after running it. The
--     risk is structural, not immediate - the old PK being dropped is
--     exactly what makes it POSSIBLE for a second dt_window row (a
--     future per-store override) to exist later, and if one ever gets
--     added, this .single() call breaks production's live Drive-Thru tab
--     with a thrown error instead of silently misbehaving. Proposed fix,
--     NOT applied - same as the lib/scale.js finding, holding for your
--     go-ahead since it's shared code outside this SQL file and outside
--     the Command Center tab:
--       .eq("metric", DT_METRIC).is("store_code", null).single()
--     This makes the query correct regardless of whether a per-store
--     dt_window row ever exists, and changes nothing about today's
--     result (store_code is null on the one row that exists now).
--   - dt_bands (the view, not app code): its own definition (confirmed
--     live in your dashboard last time) is `where metric = 'dt_window'`
--     with no aggregation - a plain multi-row-capable SELECT, so the view
--     itself does not error if metric ever stops being unique; it would
--     just start returning more rows. Whether THAT breaks anything
--     depends on whatever queries the view expecting exactly one row,
--     which I cannot see from here - grepped this repo and nothing in
--     it queries dt_bands directly (zero hits), so if something depends
--     on it being single-row, it's outside this codebase (a BI tool, a
--     dashboard chart, something in Supabase itself) and only you can
--     confirm whether that exists. Same caveat as before: not solvable
--     from this environment, flagging rather than guessing. Not an
--     immediate risk either way - this migration adds no dt_window rows.
--
-- FIX: the old single-column PK is dropped and replaced with a surrogate
-- key - a new `id` identity column as the actual primary key - rather
-- than trying to build a composite PK out of (metric, store_code).
-- Postgres does not allow that here: every column in a PK is implicitly
-- NOT NULL, but store_code must stay nullable (null = chain-wide) for the
-- rest of this design to work, so no combination of existing columns can
-- serve as the primary key once a metric needs both a chain-wide row and
-- per-store rows to coexist. The two partial unique indexes already in
-- this file (added in the first revision, unaffected by this fix) are
-- what actually enforces the business rule now - "at most one chain-wide
-- row per metric" and "at most one row per metric per store" - the
-- surrogate `id` PK exists only so the table has SOME primary key, which
-- nothing in this schema currently depends on for a foreign key (confirmed
-- above) but is still good practice to keep. Both the DROP and the ADD
-- are guarded so this stays safe to run more than once.
--
-- ORIGINAL REVISION 1 note, for history - first run of this file failed in
-- production -
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
--   1.5 (added in revision 2). Drops the old single-column PK on `metric`
--      and replaces it with a surrogate `id` primary key - see the
--      revision 2 note above for why a composite (metric, store_code) PK
--      does not work here (store_code must stay nullable). Both steps are
--      guarded to stay rerun-safe.
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
--   alter table metric_targets drop constraint if exists metric_targets_pkey;
--   alter table metric_targets drop column if exists id;
--   alter table metric_targets add constraint metric_targets_pkey primary key (metric);
--   alter table metric_targets drop column if exists store_code;
--   -- red_value is left nullable on rollback rather than restored to NOT
--   -- NULL - re-adding that constraint would fail immediately on the
--   -- dt_window/expo rows' own real values only if one of them were ever
--   -- null, which they aren't, but there's no value in reintroducing a
--   -- constraint this table's own design (a target with no red-line yet)
--   -- needs to not have.
--   -- Restoring the old metric-alone PK only works if every splh_* row is
--   -- deleted first (the DELETE above) - otherwise the duplicate `metric`
--   -- values across stores that make this schema useful will violate the
--   -- very constraint being restored, which is expected: a full rollback
--   -- means going back to "one row per metric," so it should refuse to
--   -- happen while per-store rows still exist.

-- Step 0: allow a target with no red-line. DROP NOT NULL is a no-op if
-- already nullable, so this line alone is safe to rerun on its own.
alter table metric_targets
  alter column red_value drop not null;

alter table metric_targets
  add column if not exists store_code integer references stores(code);

-- Step 1.5 (revision 2 fix): drop the old single-column PK on `metric` -
-- it enforces "at most one row per metric, ever," which is exactly what
-- this migration needs to relax so a metric can have one chain-wide row
-- plus per-store rows. Guarded to only fire if the PK is still in its
-- OLD shape (defined on `metric`), so re-running this file after it
-- already succeeded does not touch the new surrogate PK added below.
do $$
begin
  if exists (
    select 1
    from pg_constraint con
    join pg_attribute att
      on att.attrelid = con.conrelid and att.attnum = any(con.conkey)
    where con.conrelid = 'metric_targets'::regclass
      and con.contype = 'p'
      and att.attname = 'metric'
  ) then
    alter table metric_targets drop constraint metric_targets_pkey;
  end if;
end $$;

-- Surrogate primary key. Nothing in this database has a foreign key
-- pointing at metric_targets.metric (confirmed above via schema scan), so
-- nothing breaks by metric no longer being the identity column. Existing
-- rows get id values backfilled automatically by ADD COLUMN ... IDENTITY.
alter table metric_targets
  add column if not exists id bigint generated always as identity;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'metric_targets'::regclass
      and contype = 'p'
  ) then
    alter table metric_targets add constraint metric_targets_pkey primary key (id);
  end if;
end $$;

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
