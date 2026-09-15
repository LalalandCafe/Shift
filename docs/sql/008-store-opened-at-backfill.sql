-- Weekly SSSG: store opening dates (data backfill for 002).
--
-- ALREADY EXECUTED IN PRODUCTION on 2026-09-15, under the filename
-- 003-store-opened-at-backfill.sql, before it was ever committed to this
-- repo. That file was generated outside the working tree, downloaded, run
-- directly in the Supabase SQL editor, and never saved - so production
-- carried a migration the repo had no record of. This file closes that gap.
-- Running it again is a harmless no-op: every statement sets the value
-- production already holds.
--
-- THIS FILE IS A RECONSTRUCTION. The UPDATE statements below were generated
-- from the LIVE production values in stores.opened_at as they stood on
-- 2026-09-15, not transcribed from the original file (which no longer
-- exists anywhere) and not from memory. By construction it matches what is
-- actually in the database. It is committed under 008, not 003, because
-- feat/command-center already holds a different 003
-- (003-unify-metric-targets.sql) and docs/sql/ numbering is a shared
-- namespace across branches that both land in main - see docs/sql/README.md
-- for the authoritative run-order and run-status ledger.
--
-- Provenance of the dates: the finance team's comp basis register plus the
-- store list. Supplied by hand as a business fact. NEVER inferred from
-- sales data - MIN(business_date) in daily_sales cannot be trusted for this
-- (live sync only since 2026-07-13, prior-year backfill covering only
-- 2025-08-01..2025-08-31), which is the entire reason 002 added the column
-- rather than deriving opening dates from what had been synced.
--
-- Why 10033 and 10035 are absent: stores only ever contains locations that
-- have actually opened - a row is inserted by hand on opening day, and
-- there is no active/inactive flag. 10033 (Melrose) and 10035 (DFW Airport
-- Terminal B) have no row at all because neither has opened yet, so neither
-- can be updated here. All 35 rows that do exist have a non-null opened_at;
-- that was verified against production immediately before this file was
-- generated.
--
-- KNOWN UNRESOLVED CONFLICT, 10032 (CA Lido Marina Village): the comp basis
-- register says 2026-03-14, the store list says 2026-03-13. Production
-- holds 2026-03-13 and this file reproduces that. Not resolved with finance
-- as of this writing. Immaterial in practice until mid-2027, when 10032
-- first approaches the 455-day comparability line and a one-day difference
-- could change which week it enters the weekly SSSG comparable set.
--
-- To run: paste into the Supabase SQL editor for the production project
-- (epklybaeqzmocmaiekcx per BRIEF.md) and execute. Idempotent - each
-- statement assigns a fixed value to one store, so re-running changes
-- nothing.
--
-- Depends on: docs/sql/002-store-opened-at.sql (adds the column).
--
-- To roll back the data (the column itself is 002's to drop):
--   update stores set opened_at = null;

update stores set opened_at = '2019-03-25' where code = 10001; -- DFW Bell
update stores set opened_at = '2020-06-01' where code = 10002; -- DFW Oak Lawn
update stores set opened_at = '2021-01-01' where code = 10003; -- DFW Lovers
update stores set opened_at = '2021-07-26' where code = 10004; -- CA Santa Monica
update stores set opened_at = '2021-12-04' where code = 10005; -- DFW Addison
update stores set opened_at = '2022-05-07' where code = 10006; -- HTX MKT
update stores set opened_at = '2022-08-20' where code = 10007; -- HTX Montrose
update stores set opened_at = '2022-09-17' where code = 10008; -- DFW Richardson
update stores set opened_at = '2022-11-19' where code = 10009; -- DFW North Park
update stores set opened_at = '2023-01-21' where code = 10010; -- CA The Grove
update stores set opened_at = '2023-04-01' where code = 10011; -- CA Calabasas
update stores set opened_at = '2023-11-11' where code = 10012; -- CA 3rd St (CDL)
update stores set opened_at = '2024-02-24' where code = 10013; -- DFW Park & Preston
update stores set opened_at = '2024-07-13' where code = 10014; -- HTX S Shepherd
update stores set opened_at = '2024-08-17' where code = 10015; -- CA Americana
update stores set opened_at = '2024-09-28' where code = 10016; -- CA Westlake Village
update stores set opened_at = '2024-11-16' where code = 10017; -- DFW Royal Lane
update stores set opened_at = '2024-12-07' where code = 10018; -- DFW Fitzhugh
update stores set opened_at = '2025-02-08' where code = 10019; -- DFW Camp Bowie
update stores set opened_at = '2025-01-18' where code = 10020; -- DFW Shops at Legacy
update stores set opened_at = '2025-06-06' where code = 10021; -- DFW Southlake
update stores set opened_at = '2025-07-12' where code = 10022; -- NSH 12th South
update stores set opened_at = '2025-07-04' where code = 10023; -- ATX SoCo
update stores set opened_at = '2025-09-20' where code = 10024; -- DFW McKinney
update stores set opened_at = '2025-11-22' where code = 10025; -- CA Brentwood
update stores set opened_at = '2025-12-13' where code = 10026; -- CA Beverly Hills
update stores set opened_at = '2025-12-19' where code = 10027; -- HTX La La x Lulu
update stores set opened_at = '2025-12-06' where code = 10028; -- SATX La Cantera
update stores set opened_at = '2026-05-02' where code = 10029; -- CA Irvine Spectrum
update stores set opened_at = '2026-01-03' where code = 10030; -- AZ Kierland Commons
update stores set opened_at = '2026-02-07' where code = 10031; -- AZ Camelback
update stores set opened_at = '2026-03-13' where code = 10032; -- CA Lido Marina Village
update stores set opened_at = '2026-06-20' where code = 10034; -- ATX Burnet Rd
update stores set opened_at = '2026-06-27' where code = 10036; -- HTX Cypress
update stores set opened_at = '2026-08-15' where code = 10037; -- DFW El Dorado
