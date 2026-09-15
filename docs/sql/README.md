# docs/sql run ledger

There is no migrations runner in this repo (see BRIEF.md §11.1). Every file
here is executed by hand in the Supabase SQL editor against the production
project (`epklybaeqzmocmaiekcx`). Nothing tracks what has actually been applied
— so this file does.

**The number in a filename records intent, not application.** Filenames are a
shared namespace across branches that all eventually land in `main`, and `003`
is already contested: `feat/command-center` holds `003-unify-metric-targets.sql`,
while the opened_at data backfill was originally executed in production under
the name `003-store-opened-at-backfill.sql` and is committed here as `008`
instead. Read this table, not the numbers, to know what ran.

**This ledger was built by querying production directly**, not from memory or
from progress docs. The "How verified" column says how to re-check each row
independently — do that rather than trusting this file, which goes stale the
moment someone runs something without updating it.

## Status as of 2026-09-15

| File | Branch | What it does | Depends on | Applied? | How verified |
|---|---|---|---|---|---|
| `001-store-managers.sql` | `feat/command-center` | Adds `stores.gm_name`, `stores.area_manager_name` (nullable text) | — | **Yes** (date not recorded) | Both columns select without error |
| `002-store-opened-at.sql` | `feat/sssg-filters` | Adds `stores.opened_at` (nullable date) | — | **Yes** (date not recorded) | Column selects without error |
| `003-unify-metric-targets.sql` | `feat/command-center` | Adds `metric_targets.store_code`, drops the old single-column PK for a surrogate `id`, makes `red_value` nullable, rewrites the `metric_targets_direction` CHECK to be null-safe, backfills `splh_weekday`/`splh_weekend`/`splh_ptd` per store | — | **Yes** (date not recorded) | `metric_targets.store_code` selects without error; 105 rows carry `updated_by = 'migration-003'` (35 stores × 3 SPLH metrics) |
| `004-sssg-target.sql` | `feat/command-center` | Inserts the chain-wide `sssg` target row (0%, no red-line) | `003` | **Yes** (date not recorded) | 1 row with `metric = 'sssg'`, `updated_by = 'migration-004'` |
| `005-tplh-store-targets.sql` | `feat/command-center` | Inserts per-store `tplh_weekday`/`tplh_weekend` targets from each store's own trailing 8-week baseline (34 stores; 10037 deliberately excluded) | `003` | **Yes** (date not recorded) | 68 rows with `updated_by = 'migration-005'` (34 stores × 2 metrics) |
| `006-fix-tplh-weekend-boundary.sql` | `feat/command-center` | Overwrites all 68 of 005's TPLH values, which were computed with calendar Sat/Sun as "weekend" instead of this app's real Fri/Sat/Sun (`lib/fiscal.js`'s `WEEKEND`) | `003`, `005` | **NO — still pending** | Zero rows with `updated_by = 'migration-006'`; store 10002's `tplh_weekday` is still `7` (005's value) rather than `6.75` (006's correction) |
| `007-daily-sales-net-sales.sql` | `feat/sssg-filters` | Adds `daily_sales.discounts_amount`, `.refunds_amount` (nullable numeric) and `.net_sales` (STORED GENERATED, `gross - discounts - refunds`, no COALESCE so it stays NULL until both components are populated) | — | **Yes**, 2026-09-15 | All three columns select without error; `net_sales` non-null on 0 of 3,385 rows, consistent with columns added but nothing backfilled yet |
| `008-store-opened-at-backfill.sql` | `feat/sssg-filters` | Sets `opened_at` for all 35 store rows | `002` | **Yes**, 2026-09-15 — but see note | All 35 rows have non-null `opened_at` |

## Notes

**`006` is the one outstanding action.** Production currently holds TPLH
weekday/weekend targets computed against the wrong weekend boundary. Anything
reading `tplh_weekday`/`tplh_weekend` is comparing against known-incorrect
numbers until it runs. It is idempotent (`ON CONFLICT ... DO UPDATE`) and
depends on `003` and `005`, both already applied.

**`008` was executed under a different filename.** The UPDATE statements were
run in production on 2026-09-15 as `003-store-opened-at-backfill.sql`, a file
generated outside the working tree and never saved into it — so production
carried a migration the repo had no record of. `008` is a *reconstruction*
generated from the live production values, so it provably matches what is in
the database rather than reproducing a file that no longer exists. Re-running
it is a no-op.

**Two stores have no `opened_at` because they have no row at all.** `stores`
only ever contains locations that have opened (a row is inserted by hand on
opening day; there is no active/inactive flag). 10033 (Melrose) and 10035 (DFW
Airport Terminal B) have not opened.

**Unresolved data conflict, 10032 (CA Lido Marina Village):** the finance comp
basis register says `2026-03-14`, the store list says `2026-03-13`. Production
holds `2026-03-13`. Not resolved with finance. Immaterial until mid-2027, when
10032 approaches the 455-day weekly-SSSG comparability line and one day could
change which week it becomes comparable.

**Two `metric_targets` rows predate this project** (`updated_by = 'migration'`):
`dt_window` and `expo`. Origin not traceable in this repo.

## When adding a file here

1. Use the next number no file on **any** branch has claimed.
2. Add a row to the table above, with `Applied? = No` until it actually runs.
3. Update that row the day it runs, with the date.
4. Prefer a verification that reads production state (a column that now exists,
   a row count, an `updated_by` stamp) over "I remember running it."
