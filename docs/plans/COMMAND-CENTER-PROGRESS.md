# Command Center — progress log

Branch: `feat/command-center`. Implements `docs/plans/FEATURE-PLAN-2026-09-04.md`.
Everything user-facing ships inside one new admin-gated tab, following the
`feat/sssg-tab` pattern (now merged into `main`). Updated at every phase
checkpoint per the execution order.

**SQL you still need to run: none yet.**

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

## Phase 2 — Tab scaffold + data coverage banner — not started

## Phase 3 — Accountability columns — not started

## Phase 4 — Goal chips, quick-win pass — not started

## Phase 4b — Targets schema unification — not started

## Phase 5 — Metric drill-down drawer — not started

## Phase 6 — Launch incrementality — CHECKPOINT, blocked on your go-ahead

---

## Commits on `feat/command-center` so far

1. `docs: add security/quality audit and Command Center feature plan` —
   baseline docs (also picked up the Phase 0 spike doc; see note above).
2. `feat(command-center): weekday-matched comparison helper, consolidate
   billable-hours exclusion` — Phase 1.

Nothing pushed. Nothing merged to `main`. No SQL run or pending.
