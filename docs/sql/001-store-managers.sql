-- Command Center Phase 3: GM / area manager labels per store.
--
-- Additive and reversible. Both columns are nullable text with no default,
-- so this does not touch, backfill, or reinterpret any existing row, and
-- every existing `select("*")` on stores (lib/data.js's getAllStores,
-- lib/report.js, lib/throughput.js, lib/sssg.js, lib/forecast.js) picks
-- these up automatically the moment this runs - no code deploy needed on
-- the read side, since that code already ships on feat/command-center.
--
-- Source of truth decision (see docs/plans/FEATURE-PLAN-2026-09-04.md,
-- feature 6): manually maintained, same pattern as stores.grp - NOT
-- sourced from Toast employee/labor data, which has no stable per-store
-- manager signal (confirmed in that plan's research).
--
-- To run: paste into the Supabase SQL editor for the production project
-- (epklybaeqzmocmaiekcx per BRIEF.md) and execute. Safe to run more than
-- once (IF NOT EXISTS guards both columns).
--
-- To roll back, if ever needed:
--   alter table stores drop column if exists gm_name;
--   alter table stores drop column if exists area_manager_name;

alter table stores
  add column if not exists gm_name text,
  add column if not exists area_manager_name text;
