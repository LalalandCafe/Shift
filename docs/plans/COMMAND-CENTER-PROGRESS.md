# Command Center — progress log

Branch: `feat/command-center`. Implements `docs/plans/FEATURE-PLAN-2026-09-04.md`.
Everything user-facing ships inside one new admin-gated tab, following the
`feat/sssg-tab` pattern (now merged into `main`). Updated at every phase
checkpoint per the execution order.

**SQL you still need to run:**
- `docs/sql/001-store-managers.sql` (Phase 3) - **ran successfully.**
  `stores.gm_name`/`stores.area_manager_name` confirmed live.
- `docs/sql/003-unify-metric-targets.sql` (Phase 4/4b step 1) - **first run
  failed** (`red_value` NOT NULL violation on the SPLH backfill), confirmed
  fully rolled back, then fixed in place. Cleared to re-run (you confirmed
  the two SQL views directly) - **still not run as of this update**,
  verified live, not assumed. Run this before `004`.
- `docs/sql/004-sssg-target.sql` (Phase 4/4b step 3, new) - adds the SSSG
  chain-wide target (0%, no red-line). Depends on `003`'s `store_code`
  column and partial unique index - will fail if run first. Not run yet.

**Unrelated, flagged not fixed:** `docs/sql/002-store-opened-at.sql`
(untracked), an uncommitted change to `lib/sssg.js` adding weekly SSSG /
`computeWeekComparison()` / `stores.opened_at`, and now also an untracked
`scripts/toast-net-sales-probe.js` - none of this session's doing. All left
exactly as found, uncommitted, not staged, not touched - whoever owns that
work should commit it themselves. These look like real, coherent,
in-progress work (the sssg.js change even correctly reuses
`lib/calendar.js`'s `addDays` from Phase 1) - not something to worry
about, but worth confirming who's driving it so two sessions don't step on
each other's commits on this branch.

**Decisions from your last message, applied:**
1. `lib/leaderboard.js` confirmed in scope for metric reuse (not limited to
   the four originally-named files). Will use it in Phase 4/5 for
   leaderboard score / chain-wide rating.
2. Drive-thru window time deferred - out of the Command Center tab
   entirely for now. See Phase 4 section below.
3. TPLH / SSSG / kitchen ticket time get no goal chip in Phase 4 (no
   stored target to check against, and none invented). They get chips in
   Phase 4b once the unified targets schema gives them real targets.

**Separately flagged, not fixed (you said don't fix, just locate):**
`node --check` silently passes broken JSX in this repo - confirmed by
deliberately breaking a copy of a JSX file and it still exiting 0 (see
Phase 2's verification notes below for how that was found). **It is not
used anywhere in this repo as a syntax gate** - grepped every
`.github/workflows/*.yml`, `package.json`, and the installed git hooks
(`.git/hooks/{post-checkout,post-commit,post-merge,pre-push}`, which are
plain Git LFS hooks, unrelated). So nothing is silently broken today
because of this - there's simply no gate anywhere relying on
`node --check` to catch a JSX mistake. Flagging only because you asked;
no location to point you at since none exists.

---

## Phase 0 — Toast item-data spike ✅ done

**File:** `docs/spikes/TOAST-ITEM-DATA.md`

- **Item name/guid on selections: confirmed available.** Toast's own docs
  show each `selections[]` entry already carries `item.guid`, `displayName`,
  and `quantity`. Our live sync (`app/api/toast/sync-store/route.js:165-168`)
  already receives these fields on every sync and reads only
  `voided`/`deferred`/`preDiscountPrice` before discarding the rest — no
  scope change, no new Toast API needed for Phase 6's schema.
- **Retention window: still open.** Toast's docs give rate-limiting/chunking
  guidance (≤1 month per historical pull, 5-10s apart, 5 req/sec/location
  cap on `ordersBulk`) but state no hard retention cutoff either way. Needs
  a direct answer from Toast support (or a real off-hours historical test
  call) before Phase 6 commits to backfilling any specific past launch.
  Forward-only is the safe assumption until then.
- No live Toast API call was made — answered from Toast's published
  developer docs instead, which was sufficient for question 1 and partial
  for question 2.

**Decides:** Phase 6 stays gated on the retention answer above; the schema
itself (item name/guid/quantity) is no longer a blocker.

---

## Phase 1 — Weekday-matched comparison helper + billable-hours consolidation ✅ done

**Files:** `lib/calendar.js` (new), `lib/calc.js`, `lib/report.js`,
`lib/throughput.js`, `test/calendar.test.mjs` (new),
`test/exclusion-reason.test.mjs` (new), `package.json` (`test` script added).

**Shipped:**

- `lib/calendar.js` — `addDays`, `sameWeekdayNWeeksAgo`,
  `priorNSameWeekdays`, `weekdayAlignedWeekWindows`. Zero dependencies, kept
  separate from `lib/fiscal.js` on purpose (fiscal.js throws at import time
  once its calendar table expires — see the audit's DATA-1 — nothing should
  inherit that crash mode for plain date arithmetic). **Not wired into
  anything yet**, per the instruction to ship the helper standalone. The
  retrofit into `calc.js`/`report.js`/`throughput.js`/`Forecast.js`/
  `dashboard`/`export` is separate, later, opportunistic work — each one
  needs a before/after diff of real output before it ships, same as the
  audit's BIZ-1 guidance.
- **Billable-hours consolidation** — this *did* touch `report.js` and
  `throughput.js`, as the prompt called for (prerequisite cleanup, not
  in-tab work). All three files' exclusion logic now calls one function,
  `exclusionReason()` in `lib/calc.js`.
  - **Decision made on your behalf, flagged here for override:**
    `report.js`/`throughput.js` already agreed with each other (chain-wide
    live path: Week View, Dashboard, daily email). `calc.js`'s copy
    additionally excluded `"Event Support - LA"`, which the other two never
    did — `throughput.js`'s own prior comment called this out as a *known,
    intentional* divergence to avoid touching `report.js`. I standardized
    on the live path's (narrower) list, since changing it would move real
    SPLH numbers on the live dashboard/email for any store with that job
    title, which isn't a decision to make unilaterally. **The only behavior
    change is in the demo endpoints** (`app/api/demo/day`,
    `app/api/demo/email`), which now agree with the live report instead of
    a demo run diverging by several dollars of SPLH for the same shift
    data. **If you actually want "Event Support - LA" excluded everywhere**
    (including the live dashboard/email), say so and I'll do that as its
    own reviewed change — it's a one-line diff in `lib/calc.js`'s
    `exclusionReason`, but it changes real numbers, so it shouldn't happen
    silently.
- Tests: `npm test` (Node's built-in runner, `node --test` — no new
  dependency). 13 tests, all passing, covering the calendar helper's date
  math and the consolidated exclusion logic (including a test that pins
  "Event Support - LA is NOT excluded" as the intentional current
  behavior, so a future change to that decision is a deliberate, visible
  diff, not an accidental regression).
- **Known cosmetic side effect:** `node --test` prints a
  `MODULE_TYPELESS_PACKAGE_JSON` warning for every `.js` file it loads,
  because `package.json` has no `"type"` field. I did **not** add
  `"type": "module"` to fix it — `next.config.js` uses CommonJS
  (`module.exports`) and would break. The warning is cosmetic; tests pass.

**Not done, out of scope for Phase 1:** retrofitting any existing file to
actually call `lib/calendar.js`'s functions. `lib/report.js` and
`lib/throughput.js` still hand-roll their own `addDays`; that's unchanged
and intentional per the "no retrofit" instruction.

**Verification:** `npm test` — 13/13 passing.
`node --check lib/calc.js lib/report.js lib/throughput.js lib/calendar.js`
— all syntactically valid. No WeekView/email files touched.

---

## Phase 2 — Tab scaffold + data coverage banner ✅ done

**Files:** `components/CommandCenter.js` (new), `app/page.js`, `components/Icon.js`,
`lib/coverage.js` (new), `lib/sssg.js`, `app/api/command-center/coverage/route.js` (new),
`test/coverage.test.mjs` (new).

**Shipped:**

- New admin-gated tab, same pattern as `feat/sssg-tab`: registered in
  `app/page.js`'s `VIEWS` array (`roles: ["admin"]`, under "Today"),
  server-side enforcement via `requireAdmin()` in the new route, not just
  client-side nav hiding.
- `lib/coverage.js` — extracted `monthStoreCount`, `comparabilityReason`,
  `monthLabel`, `MIN_COMPARABLE_STORES` out of `lib/sssg.js` verbatim.
  `lib/sssg.js` now imports these instead of keeping its own copies — one
  definition of "comparable" for both SSSG and the new banner, per the
  feature plan's recommendation.
- `app/api/command-center/coverage/route.js` — `GET ?months=YYYY-MM,...`,
  defaults to [this month, same month last year] when omitted. Admin-gated.
- `<CoverageBanner months={...}/>` in `components/CommandCenter.js` —
  reusable (later phases pass their own comparison window), fails quiet on
  error so a broken coverage check never blocks the rest of the tab.
- One new `Icon.js` glyph (`layers`) — nothing existing fit the nav entry.

**Verification (no real Entra session available in this environment, so
verified differently at each layer):**
- `npm test` — 21/21 passing (8 new, covering `lib/coverage.js`'s pure
  logic: month bounds, leap years, the comparability-reason wording).
- **Live read-only smoke test** of `lib/sssg.js`'s `getComparableMonths()`
  against production Supabase, before and after the extraction — confirmed
  identical output (e.g. August 2026 vs August 2025 correctly comparable;
  September 2026 vs September 2025 correctly flagged, since only August
  2025 was ever backfilled).
- **JSX syntax** verified via Next's own bundled SWC compiler
  (`next/dist/build/swc`) directly, since plain `node --check` silently
  passes broken JSX in this project (confirmed by deliberately breaking a
  test copy — it still exited 0). No ESLint config was added; `next lint`
  wanted to scaffold one interactively and was cancelled immediately with
  nothing written.
- **Route logic** exercised end-to-end (admin default, admin explicit
  months, non-admin → 403, malformed input → 400) by invoking the route
  handler directly against live read-only data, working around the `@/`
  import alias plain Node doesn't resolve. All four cases behaved
  correctly.
- **Not done:** an actual browser pass signed in through Entra ID. Please
  do one manual smoke test of the Command Center tab after this ships —
  the "no staging" caution from the audit applies here same as anywhere
  else.

**`package.json` change:** `test` script now runs
`node --env-file=.env.local --test` — needed because `lib/coverage.js`
(like every file that imports `lib/supabase.js`) throws at import time
without `NEXT_PUBLIC_SUPABASE_URL` set, which plain `node --test` doesn't
load on its own. This is the same operational trade-off as the audit's
DATA-3 finding, now visible in the test suite too, not just production.

## Phase 3 — Accountability columns ✅ done

**Files:** `docs/sql/001-store-managers.sql` (new, not run), `lib/data.js`,
`app/api/command-center/managers/route.js` (new), `components/CommandCenter.js`,
`app/page.js`.

**Shipped:**

- `docs/sql/001-store-managers.sql` — additive, reversible (`ADD COLUMN IF
  NOT EXISTS`, rollback commands included in the file's own comment).
  **You need to run this** in the Supabase SQL editor for it to take
  effect; nothing in this codebase runs DDL.
- `lib/data.js`'s new `updateStoreManagers()` — sibling to the existing
  `updateStoreTargets()`/`renameStore()`, same file, same pattern.
- `app/api/command-center/managers/route.js` — GET (reuses
  `getAllStores()`, unchanged) / PATCH (admin-gated), kept as its own route
  rather than extending the shared `/api/stores` PATCH, per the tab
  isolation rule.
- `<AccountabilityTable/>` inside `components/CommandCenter.js` — inline
  edit per store, no deploy needed, mirrors `components/Targets.js`'s
  existing edit-row pattern exactly (dirty tracking, saving/saved states,
  401/403 handling) rather than inventing a new one.
- Source of truth: manual mapping, not Toast employee/labor data - per
  your confirmation and the feature plan's research (no stable per-store
  manager signal exists in what Toast exposes today).

**Ships safely with or without the migration:** `getAllStores()` does
`select("*")`, so the tab and its GET work today - `gm_name`/
`area_manager_name` are just absent keys until the SQL runs, not an error.
Saving (PATCH) will correctly fail with Postgres's real "column does not
exist" error until then, surfaced to the UI, not swallowed.

**Verified end-to-end against live (real) data**, working around the
missing Entra session the same way as Phase 2:
- `GET /api/command-center/managers` as admin → 200, 35 stores, confirmed
  column set (no `gm_name`/`area_manager_name` yet, as expected
  pre-migration).
- `PATCH` as admin, targeting a nonexistent store code (999999) so no real
  row could be touched → correctly failed with Postgres's actual
  "Could not find the 'area_manager_name' column of 'stores' in the
  schema cache" error, confirming no partial write and honest error
  surfacing.
- `PATCH` as non-admin → 403. `PATCH` with no `code` → 400.
- `npm test` — still 21/21 (no new pure logic to pin here; this phase is
  CRUD glue over an already-tested data layer, verified live instead).

**Deferred, not built:** drive-thru window time. Per your instruction,
it's staying out of the Command Center tab entirely - it only covers the 3
HME pilot stores today, and extracting its aggregation out of
`app/api/drive-thru/route.js` isn't worth doing yet. Revisit if/when HME
coverage expands past the pilot.

## Phase 4 + 4b — merged, in progress

Per your last message, Phase 4 (quick-win chips) and 4b (schema
unification) are merged into one phase, sequenced: (1) schema assessment +
SQL [done, below], (2) stop and get real target numbers from you for
TPLH/SSSG/kitchen [done - waiting on your reply], (3) build the goal chip
component wired to the unified schema [not started, blocked on step 2].

### Step 1 — schema assessment + SQL ✅ done

**File:** `docs/sql/003-unify-metric-targets.sql` (new, not run).

- **Kitchen ticket time revision:** `metric_targets` already has a
  chain-wide `expo` row live (`target_value: 300s, red_value: 420s,
  green_value: null`, `updated_by: "migration"`) - confirmed by querying
  the live table directly, not assumed from the earlier audit/plan
  research. It is read by nothing in the current codebase (grepped
  app/lib/components - zero hits). This revises the earlier claim that
  kitchen ticket time has no stored target: it has one, unwired. See Step
  2 below - you need to confirm those numbers, not supply new ones.
- **"Regional weekday/weekend targets" does not exist.** Looked for this
  specifically (grep + a live spot-check of `stores.weekday_target/
  weekend_target`, e.g. store 10001 = 75/85/80) - every target is
  per-store, there is no region-level or grp-level target anywhere in the
  schema or code today.
- **Conclusion: `metric_targets` can become the general table** with one
  additive change (nullable `store_code` - null = chain-wide, set =
  per-store override) plus compound metric keys for SPLH's three
  concurrent weekday/weekend/PTD values, rather than a new `variant`
  column. No structural blocker found.
- The SQL adds `store_code` + two partial unique indexes (a plain
  `UNIQUE(metric, store_code)` would not actually prevent duplicate
  chain-wide rows, since Postgres treats every `NULL` as distinct - this
  needed spelling out and testing carefully in the file's own comments,
  since it could not be executed against the live DB to verify).
- It backfills a **copy** of each store's existing SPLH targets as three
  new rows (`splh_weekday`/`splh_weekend`/`splh_ptd`). This is copying
  real, already-live numbers, not new target-setting - explicitly allowed
  under the "don't invent thresholds" rule.
- **Does not touch `stores.*` or the live SPLH calc path.**
  `lib/calc.js`'s `getTarget()`/`getPtdTarget()` - what the live
  dashboard/email actually call - are unchanged and keep reading from
  `stores` directly. Zero risk to production numbers from running this
  file.
- **Explicitly a mirror, not a merge**, flagged in the file's own
  comments: editing a target through the existing Targets tab
  (`components/Targets.js` → `PATCH /api/stores` → `lib/data.js`'s
  `updateStoreTargets`) will not update this copy until that write path is
  separately cut over - which this file deliberately does not do, since
  it's the live production edit path managers use today.
- One unconfirmed assumption, flagged in the file: the `references
  stores(code)` foreign key assumes `stores.code` is uniquely constrained.
  Every part of the app treats it that way (and a live check found zero
  duplicate codes across 35 rows), but PostgREST doesn't expose
  `information_schema` for a direct check. If wrong, the `ALTER TABLE`
  fails cleanly with no damage - not a silent-corruption case.

### Step 2 — target numbers needed from you

**Stop point, per your instruction — no thresholds below were invented.**

| Metric | Current state | Shape questions needing your answer |
|---|---|---|
| **TPLH** (`lib/throughput.js`) | No target anywhere - only `vsCompanyPct` (vs. chain average) and rank exist. | Single chain-wide number, or per-store (like SPLH, since store volume/ticket mix varies)? Weekday/weekend split like SPLH, or one number? What's the actual target/red-line value(s)? |
| **SSSG** (`lib/sssg.js`) | No target anywhere - purely descriptive (prior vs. current $/%.) | Single chain-wide growth % (e.g. "+3% YoY"), or per-region? (Per-store is unusual for this metric - new/renovated stores skew it - but your call.) What's the actual target %? |
| **Kitchen ticket time** (`expo` in `metric_targets`) | **Already has a value** - chain-wide, `target_value: 300s`, `red_value: 420s`, `green_value: null`. Seeded by `"migration"`, no traceable owner in this codebase. | Not asking for new numbers - **confirm whether 300s/420s are still correct**, or give replacements. Also: stay chain-wide, or move to per-store? |

**Not on your list but relevant, no action needed:** guest rating already
has a working chain-wide target (`RATING_TARGET = 4.5` in
`lib/leaderboard.js`, `REVIEW_TIERS` in `lib/scale.js`) - hardcoded JS, not
DB-backed, but functioning. Since `lib/leaderboard.js` is confirmed in
scope, Step 3 can wire a rating goal chip off these existing values with
no new numbers needed from you, unless you'd rather it move into the
unified `metric_targets` table too (optional, not blocking).

Drive-thru's `dt_window` target also already exists (150s/165s/120s) but
stays out of the tab per your deferral decision - not in this table.

### Step 1 revision — 003 failed in production, fixed in place

First run hit `ERROR 23502: null value in column "red_value" violates
not-null constraint` on the SPLH backfill - confirmed live via PostgREST's
OpenAPI schema that `red_value` is `NOT NULL` with no default, and the
backfill correctly never set it (nobody has set SPLH red-lines; inventing
one was never on the table). Confirmed clean rollback before touching
anything (Supabase's SQL editor runs the file as one transaction -
`metric_targets` had only its original PK and zero `migration-003` rows
afterward).

**Fixed:** added a step 0 to `003-unify-metric-targets.sql` that drops the
`NOT NULL` constraint on `red_value`. Existing `dt_window`/`expo` rows are
completely untouched - only new rows may now have a null `red_value`.
**Ready to re-run.**

**Consumer check, as requested, before changing anything:**
- `components/KitchenTrend.js` - doesn't read `metric_targets` at all.
  Not affected.
- `app/api/drive-thru/route.js` - selects `red_value` but only passes it
  through untouched to the client. Not affected by a null on a different
  metric row.
- **`lib/scale.js`'s `cfgFromTarget()` DOES implicitly assume it's
  present** - `redLine: Number(row.red_value)` turns `null` into `0`, not
  `null`. For a higher-is-better metric this would make `bandFor()`'s
  red-line check almost never fire, silently capping a badly-missed metric
  at "lightRed" (WATCH) instead of ever reaching "red" (ACTION). **Not
  fixed - flagged for your approval, since it's shared code outside this
  migration.** Proposed fix (mirrors the `green_value` line right above
  it): `redLine: row.red_value == null ? null : Number(row.red_value)`.
  Not urgent to land with the migration itself - nothing calls
  `cfgFromTarget()` for the new `splh_*` rows yet, only
  `app/api/drive-thru/route.js`'s `dt_window` row reaches it today, and
  that row is untouched.
- **SQL views - confirmed, no longer just inference.** You checked both
  view definitions directly in the Supabase dashboard:
  - `dt_bands` filters `where metric = 'dt_window'` and already does
    `coalesce(green_value, target_value * 0.85)` - meaning `green_value`
    being nullable with a fallback was already the rule this table lived
    by, and `red_value` being `NOT NULL` was the actual inconsistency, not
    the other way around. The new `splh_*` rows are filtered out by the
    `where metric = 'dt_window'` clause regardless of `red_value`. Even in
    a hypothetical case where it did see a null `red_value`, `b_red`/`b_far`
    would come back null, not zero - no silent misbehavior.
  - `drive_thru_vs_kitchen` doesn't reference `metric_targets` at all - it
    only joins `drive_thru_daily`, `kitchen_metrics`, and
    `daily_transactions`.
  Both views are confirmed unaffected. No open item remains on this file.

### Step 3 — goal chip component ✅ done

**Files:** `lib/scale.js` (`goalStatus()`, `fmtForUnit()` extended, the
`cfgFromTarget` fix), `app/api/command-center/goals/route.js` (new),
`components/CommandCenter.js` (`GoalChips`), `test/goal-status.test.mjs`
(new), `docs/sql/004-sssg-target.sql` (new, not run).

**Threshold decisions, applied:**
1. Kitchen ticket time: kept at 300s/420s, no change.
2. SSSG: target 0% (the growing/shrinking boundary, not invented), no
   red-line, chain-wide only - one comparable month is not a basis for a
   regional split. Written to `docs/sql/004-sssg-target.sql`, not run yet.
3. TPLH: correlation check run (below) - result was "they correlate," so
   per your own rule this needs per-store targets, which you're setting
   separately. No chain-wide 5.75/6.25 row was written, and no per-store
   numbers were invented.
4. 10037 (DFW El Dorado) excluded from the TPLH correlation check and from
   all target-setting - soft opening, gets its own target later.
5. `lib/scale.js`'s null-coercion bug - **fixed**: `cfgFromTarget()` now
   keeps `red_value == null` as `null` instead of `Number(null) → 0`. Only
   consumer is `DriveThru.js`, whose `dt_window` row always has a real
   `red_value` - confirmed unaffected, `npm test` still green (30/30 now).

**TPLH vs. average ticket correlation** (same 8-week window as the
trailing-actuals pull, 10037 excluded): **Pearson r = −0.58** across the 34
remaining stores - a moderate-to-strong negative correlation (r² ≈ 0.34).
Reused the exact same formulas as `lib/throughput.js`
(`transactions / hours` for TPLH, `sales / transactions` for average
ticket) and `lib/calc.js`'s `exclusionReason()`, aggregated as one 8-week
total per store rather than per-week, then correlated - one-off script,
not committed, deleted after use. Full per-store table was given in chat,
not reproduced here.

**`goalStatus()` (new, `lib/scale.js`)** - the actual new logic this step
adds, kept separate from the existing four-band `bandFor()` (which still
needs a `redLine` to classify anything, per the WeekView/DriveThru
contract that was already in place). Three states: `onGoal`, `offGoal`,
`action` - `action` only reachable when `redLine` is non-null, so a
target-only metric (SSSG right now) can never show a false ACTION alarm.
Colors reuse the existing green/red-soft/red tokens - no amber, per
`lib/scale.js`'s own standing rule ("the chain reads red or green, never
orange"). 9 new pure-logic tests in `test/goal-status.test.mjs`, `npm test`
30/30.

**`app/api/command-center/goals/route.js` (new, admin-gated)** - reads
every **chain-wide** row (`store_code is null`) from `metric_targets`,
computes each one's current value from an existing calc function (never a
new one), and returns a chip per row:
- `sssg` → `lib/sssg.js`'s `getComparableMonths()` +
  `computeMonthComparison()` on the latest comparable month, verbatim.
- `expo` (kitchen ticket time) → `lib/report.js`'s `buildKitchenWeek()`,
  verbatim - its `companyMedianMin` (chain-wide, weighted by item volume,
  week to date) × 60 for seconds, to match `expo`'s stored unit.
- `dt_window` (drive-thru) - explicitly excluded, same deferral as
  everywhere else in this tab.
- any row with `store_code` set - explicitly excluded and reported as an
  unwired count, not silently dropped. See the SPLH note below for why.

**Sanity-check finding, not a bug:** chain-wide kitchen ticket time is
currently running **~78s** (median, this week) against the 300s target and
420s red-line - comfortably `onGoal`, not close to either line. Confirmed
this is a real number, not a mismatch in my wiring (`buildKitchenWeek`'s
own `NOTICEABLE_FLOOR_MIN` is 4 minutes/240s - the function itself doesn't
start flagging anything below that, which lines up with a normal baseline
sitting well under it). Flagging only so the first time you see this chip
you know why it reads so far from the line - not asking you to revisit the
300s/420s decision, which you already made.

**Per-store SPLH chips (`splh_weekday`/`splh_weekend`/`splh_ptd`) -
explicitly NOT wired in this step**, for two reasons, not one: (1)
`docs/sql/003-unify-metric-targets.sql` hasn't run yet - live-verified
just before building this (`metric_targets.store_code does not exist`),
so there are no per-store rows to read yet regardless. (2) Wiring them
needs a design decision this step didn't make unilaterally: `lib/report.js`'s
`buildDailyReport()` returns `day`/`wtd`/`ptd` SPLH per store, but which of
those should be checked against `splh_weekday` vs. `splh_weekend` isn't a
1:1 mapping the way `expo`/`sssg` were - and the `metric_targets` copy is
already documented (in 003's own comments) as a mirror that drifts stale
the moment someone edits a target through the existing Targets tab, since
that write path was deliberately left untouched. Flagging this rather than
guessing at the mapping. The `GoalChips` UI already reports how many
per-store rows exist so this isn't invisible once 003 runs.

**Verification:** `npm test` (30/30). JSX/syntax checked via Next's bundled
SWC compiler (`components/CommandCenter.js`, the new route,
`lib/scale.js`). Route logic exercised directly (no Entra session
available, same workaround as every other phase): admin header → correctly
surfaced `metric_targets.store_code does not exist` (003 hasn't run - an
honest failure, not swallowed, same pattern as `AccountabilityTable`'s
pre-migration PATCH failure); no header → 401. The `expo`/`sssg`
`currentValueFor()` branches were verified separately, live, working around
the same missing `store_code` column by querying `metric_targets` without
it - `expo` came back exactly as shown above; `sssg` couldn't be verified
end-to-end yet since its row doesn't exist until `004` runs, but
`getComparableMonths()`/`computeMonthComparison()` were already proven
correct live during the trailing-actuals pull. **Not done:** an actual
browser pass - same standing caution as every phase.

**Still needs your action, in order:** run `003` (unblocks per-store rows
existing at all, though they still won't have a UI yet), then `004`
(lights up the `sssg` chip). The `expo` chip already works today without
either.

**003 cleared to re-run** - you confirmed both `dt_bands` and
`drive_thru_vs_kitchen` directly in the Supabase dashboard (see revision
note above). No open items remain on that file. **Still not run as of this
update** - verified live (`metric_targets` has no `store_code` column,
still only the original 2 rows) rather than assumed.

**Trailing actuals delivered** (plain tables, no proposed targets) so you
can set TPLH and SSSG thresholds yourself - see chat response. TPLH used
`lib/calc.js`'s `exclusionReason()` and `lib/throughput.js`'s exact
`transactions / hours` formula, applied per-day and bucketed into
weekday/weekend instead of a full week (no existing function does that
split - the formula itself is unchanged). SSSG used
`lib/sssg.js`'s `getComparableMonths()`/`computeMonthComparison()`
verbatim, with region rollups computed as a plain re-sum of its own
per-store `comparable` rows. Both pulls were one-off ad hoc scripts run
directly against production (read-only), not added to the app or
committed - deleted after use.

**Correction (was wrong above):** the July 2024 rows for store 10001 in
`daily_sales` are **not** stray demo/seed data - per your correction,
that's the original pilot for that store, real documented history. Not
flagged for cleanup. It still doesn't affect the SSSG output above -
`getComparableMonths()`'s `MIN_COMPARABLE_STORES` rule excludes both July
and August 2024 for having only 1 store's data either way, so August 2026
vs August 2025 remains the only comparable month right now - that part of
the read was correct, only the "why" was wrong.

## Phase 4b — Targets schema unification — not started

## Phase 5 — Metric drill-down drawer — not started

## Phase 6 — Launch incrementality — CHECKPOINT, blocked on your go-ahead

---

## Commits on `feat/command-center` so far

1. `docs: add security/quality audit and Command Center feature plan` —
   baseline docs (also picked up the Phase 0 spike doc; see note above).
2. `feat(command-center): weekday-matched comparison helper, consolidate
   billable-hours exclusion` — Phase 1.
3. `feat(command-center): tab scaffold + data coverage banner` — Phase 2.
4. `feat(command-center): accountability columns (GM / area manager)` —
   Phase 3.
5. `docs(command-center): assess and design unified metric_targets schema`
   — Phase 4/4b step 1.
6. `fix(command-center): make metric_targets.red_value nullable in 003` —
   fixes the failed first run, ready to re-run.
7. `feat(command-center): goal chip component, SSSG target, scale.js
   null-redLine fix` — Phase 4/4b step 3.

Nothing pushed. Nothing merged to `main`.

**SQL pending your review/run:** `docs/sql/003-unify-metric-targets.sql`
(fixed, cleared, still not run) then `docs/sql/004-sssg-target.sql` (new,
depends on 003). `001-store-managers.sql` already ran successfully.

**Not mine, left alone:** an uncommitted change to `lib/sssg.js`, an
untracked `docs/sql/002-store-opened-at.sql`, and an untracked
`scripts/toast-net-sales-probe.js` - all from outside this session's work.
