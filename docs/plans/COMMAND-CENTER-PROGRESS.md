# Command Center — progress log

Branch: `feat/command-center`. Implements `docs/plans/FEATURE-PLAN-2026-09-04.md`.
Everything user-facing ships inside one new admin-gated tab, following the
`feat/sssg-tab` pattern (now merged into `main`). Updated at every phase
checkpoint per the execution order.

**SQL you still need to run:** `docs/sql/001-store-managers.sql` (Phase 3,
adds `stores.gm_name`/`stores.area_manager_name`, additive/reversible, not
run by me).

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

## Phase 4 — Goal chips, quick-win pass — not started (scope narrowed)

Per your last message: only KPIs with both a real value function *and* a
real stored target get a chip in this pass. That's SPLH today (`stores.
weekday_target/weekend_target/ptd_target` via `lib/report.js`/`lib/calc.js`)
plus whatever `lib/leaderboard.js` exposes with `RATING_TARGET`/review
tiers. TPLH, SSSG, and kitchen ticket time are explicitly excluded from
this pass (no invented thresholds) and wait for Phase 4b. Drive-thru is
excluded per the deferral above.

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

Nothing pushed. Nothing merged to `main`.

**SQL pending your review/run:** `docs/sql/001-store-managers.sql`.
