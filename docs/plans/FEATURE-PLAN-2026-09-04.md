# SHIFT Feature Plan — 2026-09-04

Architecture analysis only, no code written. Every claim below was checked
against the current source, not assumed from file names. Where the repo
alone can't answer a question (mostly: what Toast's API actually returns),
that's called out explicitly rather than guessed.

Standing context that shapes every recommendation in this document:
`main` deploys straight to all 35 stores with no staging environment, there
is no migrations baseline (`supabase/schema.sql` is a 16-line stale
fragment — real schema lives only in the live Supabase project),
`components/WeekView.js` is frozen because `/api/email` hand-mirrors its
markup, and billable-hours exclusion logic already diverges across
`lib/calc.js`, `lib/report.js`, and `lib/throughput.js` (three independent
copies of the same title-exclusion list; a demo path already disagrees with
the live one by $4 SPLH on a worked example — worth fixing on its own,
separately from anything below).

---

## 1. Weekday-matched comparison primitive

**Current state.** There is no shared helper — the same pattern is
reimplemented independently, at least five times:

- `lib/report.js:16`, `lib/throughput.js:20`, `components/Forecast.js:19`,
  `app/api/dashboard/route.js:6`, `app/api/export/route.js:7` — five
  byte-for-byte-similar local `function addDays(iso, n)` definitions.
- `mondayOf`/`getWeekStart` — three independent implementations:
  `lib/fiscal.js:68-73` (`getWeekStart`), `lib/throughput.js:42-47`, and
  `components/Forecast.js:5-10` — currently mathematically equivalent (all
  three verified to agree), but nothing enforces that they stay that way.
- The actual "weekday-matched" idea already exists ad hoc in three shapes:
  `app/api/dashboard/route.js:32` does a single same-weekday-last-week
  compare (`addDays(isoDate, -7)`), with a comment explaining why a raw
  calendar week-over-week would be wrong for a partial WTD; `lib/report.js:587-605`
  and `throughput.js`'s trend loops step back in multiples of 7 to build
  aligned weekly windows; `components/Forecast.js:87-90`'s `histStart`
  builds an N-week weekday-aligned lookback for the forecast average.
  All three are the same underlying operation — "give me the same weekday
  N weeks back" — written three separate times.
- `lib/sssg.js` is a different kind of comparison (calendar-month, prior
  calendar year, with live data-coverage verification) — not weekday
  alignment, and not a candidate to merge with this primitive.

**Files touched.** New: a small date-math module. Consumers, if retrofitted:
`lib/calc.js`, `lib/report.js`, `lib/throughput.js`, `components/Forecast.js`,
`app/api/dashboard/route.js`, `app/api/export/route.js`.

**Options.**

- **(a) Add the new functions to `lib/fiscal.js`.** It's already the
  zero-dependency date module `calc.js` and `report.js` import from, and
  already owns `getWeekStart`/`getWeekNumber`/`DAYS`/`WEEKEND` — the same
  category of primitive. The problem: `lib/fiscal.js:97-110` throws at
  *module import time* if today falls outside its hardcoded calendar
  table (a real, currently-open issue — see the accompanying security/quality
  audit, finding DATA-1). `Forecast.js`, `dashboard/route.js`, and
  `export/route.js` don't currently import `fiscal.js` at all; routing them
  through it for `addDays` would newly expose them to that crash mode for
  no reason related to what they actually need.
- **(b) New `lib/calendar.js`: pure functions, zero dependencies, zero
  side effects.** `addDays(iso, n)`, `sameWeekdayNWeeksAgo(iso, n)` (=
  `addDays(iso, -7n)`), and `weekdayAlignedWindows(endIso, count)` (an
  array of `{start, end}` 7-day windows stepping back by whole weeks) —
  exactly what `report.js`'s and `throughput.js`'s trend loops and
  `Forecast.js`'s lookback already hand-roll. `fiscal.js` keeps the
  "fiscal periods + import-time guard" concern separate from generic day
  arithmetic.
- **(c) Dedupe onto whichever file already has it** (e.g. have everyone
  import `mondayOf` from `throughput.js`). Rejected — arbitrary coupling to
  a file that has nothing to do with the concern, doesn't fix the actual
  problem (this is a general utility).

**Recommendation: (b).** Given DATA-1 is a live, unresolved finding, don't
give a fiscal-calendar crash a bigger blast radius by routing unrelated
functionality through it.

**Retrofit cost.** The primitive itself is cheap (S: extract `addDays`,
add 1-2 new functions, delete five duplicate local copies). Making every
existing file actually *use* it for its comparisons is separate, optional
work — the current bespoke code isn't wrong, just duplicated, so there's no
urgency to force a migration. Do it opportunistically the next time each
file is touched for another reason.

**Risk of breaking something.** None to add the new file alone — nothing
imports it yet, so no existing output changes, no WeekView/email exposure.
Risk appears only if/when an existing file is switched to import from
`calendar.js` *and* its computed values change as a result — treat that
exactly like the audit's BIZ-1 finding: diff a full week's report output
before/after before shipping.

**Effort:** S (new module) + optional M, spread out (per-file retrofit).

---

## 2. Data coverage banner

**Current state — this is mostly solved already, just not generalized.**
`lib/sssg.js` already answers "is this comparison backed by real data?" with
a **live query**, not a hardcoded month list:

- `monthStoreCount()` (`lib/sssg.js:119-136`) pages through `daily_sales`
  and counts distinct `store_code`s for a calendar month.
- `comparabilityReason()` (`lib/sssg.js:138-147`) requires both the target
  month and its prior-year sibling to clear `MIN_COMPARABLE_STORES = 10`
  (`lib/sssg.js:112`) — a data-quality floor, not a list of known-good
  months. The file's own comment is explicit: *"Nothing here is hardcoded
  to August — it's whatever the data currently supports."*
- `getComparableMonths()` returns every month with a `comparable`/`reason`
  pair; `app/api/sssg/route.js` surfaces that reason verbatim to the client.

A repo-wide grep for `priorYear|yearOverYear|lastYear|\bLY\b` found **zero
hits outside `lib/sssg.js`** — no other tab does a prior-year comparison
today, so there is no existing misleading-number bug to fix. The risk this
feature heads off is prospective: a future Dashboard/StoreTrend LY widget
built without reusing this logic.

**Files touched.** New: `lib/coverage.js` (extracted/generalized from
`lib/sssg.js`'s `monthStoreCount`/`comparabilityReason`, parameterized by
store-or-chain and an arbitrary date range instead of only whole calendar
months), a new `components/CoverageBanner.js`. Changed: `lib/sssg.js`
(refactor to call the shared helper — behavior-preserving), `lib/cache.js`
(reused, not changed).

**Options.**

- **(a) Live COUNT/EXISTS query at request time** — cheap for a single
  store+range; `getComparableMonths()`'s current full-chain month scan
  (one count query per calendar month found) was fine for SSSG's low call
  volume but would multiply if hit from a high-traffic page like the
  Dashboard. Zero staleness.
- **(b) A precomputed coverage table updated at sync time** — cheapest to
  read, but adds a write to every place `daily_sales` is written
  (`sync-store/route.js`, and the two legacy routes flagged in the
  accompanying audit as DATA-2), and a missed spot silently
  *under*-reports coverage — a correctness risk that mirrors the exact
  problem this feature exists to prevent. With no migrations baseline yet,
  this is also the largest lift of the three options.
- **(c) Generalize `lib/sssg.js`'s existing live-query approach and cache
  it.** `lib/cache.js`'s `memo(key, ttlMs, fn)` is already designed for
  exactly this shape of read (see finding PERF-1 in the audit — it's
  currently unused anywhere) — coverage facts only change when a sync
  runs, so a multi-minute TTL is safe, unlike sales totals which need
  short TTLs.

**Recommendation: (c).** Reuses a definition of "covered" that already
exists and is already trusted (SSSG ships on it today), avoids inventing a
second one, and avoids a schema migration. Revisit (b) only once a
migrations pipeline exists.

**Effort:** S–M (mostly extraction plus one UI component).
**Risk:** Low — refactoring `sssg.js`'s internals behind its existing
public functions is safe as long as `/api/sssg`'s output is verified
unchanged before/after.

---

## 3. Goal chips and status verdicts

**Current state.** Targets are genuinely scattered, but the *status engine*
that turns "value vs. target" into a verdict already exists and is already
shared:

- `lib/scale.js:98-117`'s `bandFor()` is a four-tier engine (green /
  light-green / light-red / red, i.e. already an ON-GOAL / WATCH / WATCH /
  ACTION-shaped model) driven by `target`, `redLine`, optional `greenLine`.
  This is the right piece to reuse, not reinvent.
- **Drive-thru** targets live in `metric_targets` (`app/api/drive-thru/route.js:45-58`):
  chain-wide, one row per `metric` name, columns
  `metric, label, target_value, red_value, green_value, unit, lower_is_better`
  — no `store_code` column, `.single()` return, i.e. one target for the
  whole chain.
- **Labor SPLH** targets live directly on `stores`
  (`weekday_target, weekend_target, ptd_target` — `lib/data.js:5-28`),
  per-store, three concurrent values for what's conceptually one metric.
- **Guest rating** targets are hardcoded JS constants:
  `lib/scale.js:252-266`'s `REVIEW_TIERS = {basePlus:4.5, baseOnly:4.0, concern:3.5}`
  and a *second*, duplicate `RATING_TARGET = 4.5` in `lib/leaderboard.js:28`.
  `lib/scale.js` deliberately keeps rating on its own `bandForRating()`
  rather than `bandFor()`, because two independent fixed cutoffs don't fit
  a target±margin model.
- **Kitchen ticket time** targets don't exist in the database at all —
  `components/KitchenTrend.js:8-23` hardcodes its own `if (min <= 1.5)...`
  ladders with inline hex colors, bypassing `lib/scale.js` entirely. This
  is the one tab that doesn't follow the rest of the app's pattern.

**Files touched (for the full unification).** `metric_targets` (schema
change), `stores` (columns to migrate off of), `lib/data.js`,
`lib/leaderboard.js`, `lib/scale.js`, `components/KitchenTrend.js`,
`app/api/stores/route.js`.

**Options.**

- **(a) Extend `metric_targets` into the one general schema.** Add a
  nullable `store_code` (null = chain-wide default, set = per-store
  override) and either a `variant` column or compound metric keys
  (`splh_weekday`, `splh_weekend`, `splh_ptd`, `guest_rating`,
  `kitchen_ticket_time`) — the existing `target_value/red_value/green_value/lower_is_better`
  columns already accommodate both margin-derived bands (drive-thru style)
  and fixed-cutoff bands (reviews, by setting `red_value`/`green_value`
  explicitly and skipping the derived-margin path). Real cost is not the
  schema, it's the **data migration**: copying `stores`' three columns in,
  and — for kitchen time — someone deciding real target/red/green numbers
  for the first time, since none exist today anywhere.
- **(b) Unify only the easy cases** (kitchen joins drive-thru's existing
  `metric_targets` shape) and leave `stores`' labor columns and the
  review tiers alone, since they already work and carry real operational
  risk if touched (other code paths read `stores` columns directly).
- **(c) Ship the visible feature first, without a schema migration.** A
  goal-chip UI component that reads from whichever source a metric
  currently uses via a thin per-metric adapter function (`stores` column
  here, `metric_targets` there, a hardcoded constant there), driven by
  `bandFor`'s existing status engine either way.

**Recommendation: (c) now, (a) as a deliberate follow-on project.** This
matches the "no migrations baseline, no staging" reality — don't bundle a
schema migration with the UI feature people are actually asking for. Ship
the chip using `bandFor`/`BANDS` as-is (it already speaks the right
vocabulary), then revisit unification once there's real appetite for
touching `stores` and `metric_targets` together.

**Effort:** S for (c); L for (a) (schema change, data migration, multiple
component rewires, plus someone has to originate real kitchen-time targets
that have never existed before).
**Risk:** Low for (c) — read-only, additive. Medium–High for (a) — `stores`
columns are read directly by other code (`lib/data.js`, the `stores` PATCH
route); any column deprecation needs a full grep-and-verify pass first.

---

## 4. Standard metric drill-down drawer

**Current state.** Every tab already computes something close to
headline/goal/prior/delta per store (`report.js`'s row shape:
`day`/`wtd`/`ptd` each carrying `hours, sales, splh, target, overUnder`;
drive-thru's per-store daily rows; kitchen-trend's per-station medians;
leaderboard's per-store `eff`/`splh`/`rev`) — but each shape is bespoke to
its tab. The closest existing precedent for "headline + trend + delta in
one payload" is `app/api/dashboard/route.js`'s `trend` object
(`blendedCurrent`/`blendedPrior`/`blendedDelta` plus a per-store `trends`
array with `declining`/`improving` slices) — that's already most of what a
drawer needs, for exactly one metric (blended SPLH). Nothing in the
codebase generates a "what changed" natural-language line today; it would
be new, simple templated-string logic (the daily email's string templating
in `lib/email-generator.js` is the closest existing pattern — no real NLG
needed).

**A workable contract**, close to what's already half-built in
`dashboard/route.js`:

```
{
  metric, unit,
  headline: { value, goal, prior, delta, status },
  trend: [{ date, value }],
  breakdown: [{ region, value, goal, delta }],
  stores: [{ code, name, value, goal, prior, delta, status }],
  whatChanged: string,
}
```

**Files touched.** A new `components/MetricDrawer.js` (or similar), plus
either new endpoints per metric or per-tab adapter functions that reshape
each existing response into the contract above.

**Options.**

- **(a) One generic `/api/metric?name=...&scope=...` endpoint every tab
  migrates to.** The architecturally "correct" long-term answer, but a
  big-bang migration touching every route — exactly the kind of change
  that shouldn't happen without a staging environment.
- **(b) A drawer component with a per-tab client-side adapter** mapping
  each existing, unchanged API response into the shared shape. No backend
  changes; ships incrementally, one tab at a time; a broken adapter only
  breaks that one tab's drawer, not the underlying data.
- **(c) Hybrid: define the contract now, require new metrics/endpoints to
  emit it natively going forward** (Feature 3's targets work and Feature
  5's item-level report both get new endpoints — build those against the
  contract from day one), and retrofit existing tabs onto adapters
  opportunistically, never as a forced migration.

**Recommendation: (c).**

**Effort:** M for the drawer component plus the first 2-3 adapters; S per
additional adapter after that.
**Risk:** Low if adapters are purely additive client-side reshaping of
already-working endpoints.

---

## 5. Product launch incrementality report (largest feature)

**Current state.** Item-level order data is already fetched into memory on
every sync, and almost all of it is thrown away. `app/api/toast/sync-store/route.js`'s
`computeSalesTransactionsAndHours` and `app/api/toast/cron/route.js`'s
`computeGrossSales` both iterate `order.checks[].selections[]` but read
only `sel.voided`, `sel.deferred`, and `sel.preDiscountPrice` before moving
on — no item name, guid, or quantity is ever read, though the selection
object plainly exists as a discrete line-item record right now, once per
sync, for every store. **What this repo cannot confirm**: whether Toast's
`/orders/v2/ordersBulk` response actually includes an item name/guid/quantity
field on each selection, and how far back Toast's API will return
historical order data for a launch that already happened. Both need
checking against Toast's API docs / a support conversation before
committing to an implementation plan — flagged, not guessed.

**Row volume.** Estimated 35 stores × ~150-300 checks/day × ~2-4
items/check ≈ 10,500–42,000 rows/day, roughly 300K–1.3M rows/month. For
comparison, the biggest existing table (`hourly_sales`) writes 840
rows/day (24/store); `daily_sales`/`daily_transactions` write 35/day. This
is a genuine order-of-magnitude jump in write volume — still small by
Postgres standards, but the first table in this codebase with per-line-item
cardinality.

**Can it be derived at read time, like `hourly_sales`?** No.
`hourly_sales` works as a write-time aggregate because its bucketing
dimension (hour of day, 0-23) is fixed and exhaustive — no future question
needs the original orders back. A launch's "before/after" window is chosen
*after the fact*, and cannibalization needs to know what else was on the
same check at the time — that can't be reconstructed from any aggregate
computed before the launch date was known. **Raw item-level rows must be
persisted.**

**Backfill.** `.github/workflows/backfill-sales.yml`'s existing mechanics
(45-day chunking per dispatch, per-store parallel calls, retry + body-`ok`
verification) would work unchanged for a new item-level sync route or
route flag — the date-range walking logic doesn't care what it's
backfilling. What's unverified: whether Toast's API will actually return
order detail for a launch that happened before this table existed. If it
won't, the realistic minimum viable version is **item-level data starts
accumulating from ship date forward only** — any launch that already
happened before the table exists can't be retroactively analyzed at the
item level, only at whatever aggregate level `daily_sales`/`hourly_sales`
already provide.

**Proposed shape** (planning only, matching existing conventions — `store_code`
int join per `daily_sales`/`hourly_sales`, not a `store_id` FK):
`toast_order_items(store_code, business_date, order_guid, check_guid,
selection_guid, item_guid, item_name, quantity, price, voided, deferred,
synced_at)`, idempotency key `selection_guid` (or a compound key with
`store_code` if Toast doesn't guarantee global selection-guid uniqueness —
needs verification).

**Files touched.** A new Supabase table (this repo's first real migration —
worth doing deliberately, given none exist yet), `app/api/toast/sync-store/route.js`
(a new, independently fault-isolated write block — following the same
pattern already used for `daily_transactions`/`hourly_sales`/kitchen, which
are each in their own try/catch and don't block labor/sales on failure),
a new `lib/incrementality.js`, a new `app/api/launch-report/route.js`, a new
component, and a change to `backfill-sales.yml` (or a dedicated new
workflow) to backfill the new table going forward.

**Options.**

- **(a) Full raw selection rows**, as above — necessary for real
  cannibalization analysis (needs check-level co-occurrence), highest
  storage/write cost.
- **(b) Coarser pre-aggregated item×store×day counts** — cheaper, but
  loses the "what else was on this check" signal the cannibalization ask
  specifically needs — likely insufficient for the stated goal.
- **(c) Raw rows, but only a rolling window** (e.g. 180 days), aggregating
  or dropping older detail — balances storage against the reality that
  launch analysis is usually done within months of a launch.

**Recommendation: (a), implemented as an independently fault-isolated,
feature-flagged write.** Correctness of the actual ask requires raw
check-level detail; the risk of that write volume is fully contained by
following the pattern the codebase already uses (isolate it in its own
try/catch, never let it block or slow the labor/sales writes 60 managers
depend on daily), plus a flag to disable or gradually roll it out per store
without a redeploy if it destabilizes sync timing.

**Effort:** L — genuinely the largest of the six (schema + migration, new
sync logic, new analysis logic, new UI, new backfill path). Estimate
1-2+ weeks, and don't finalize that estimate until the Toast API spike
below is done.
**Risk of breaking something existing:** Medium if wired into the same
flow as labor/sales; Low if kept independently fault-isolated and
feature-flagged as recommended. No WeekView/email blast radius — this is
new data, not a change to any existing report shape.
**Do first, before estimating further:** a short Toast API spike to
confirm (1) the selection object's actual item-name/guid/quantity fields
and (2) how far back historical order data is queryable. Both gate whether
this feature's scope is what's assumed above.

---

## 6. Accountability layer (GM / area manager)

**Current state.** Toast's labor data has no stable manager identity — the
only manager-adjacent signal anywhere in the codebase is a per-shift,
per-punch text match on the job title `"general manager"`
(`lib/calc.js:23`, `lib/report.js:88`, `lib/throughput.js:101`), used to
*exclude* that shift's hours from labor%, not to identify who runs a
store. It's not a durable assignment — someone could hold that title at
multiple stores, a store could run without a filled GM slot for a stretch,
and title text is already known to need normalization (a trailing `*` is
stripped in three places, suggesting Toast job titles aren't perfectly
clean strings to match against). `labor.employees:read` is already used
today (`lib/toast-labels.js:49-54`, `/labor/v1/employees`) — but only four
fields are read (`firstName, lastName, guid, name`) to build a display-name
map; whether Toast's employee object carries any role/manager designation
at all is unconfirmed by this repo (would need Toast's docs).

The live `stores` table (confirmed from a captured production `/api/stores`
snapshot, `snap/antes/stores.json`, not just code) has these columns:
`active, code, created_at, grp, hme_store_number, is_custom,
max_staff_capacity, name, ptd_target, region, tattle_location_id,
timezone, toast_guid, weekday_target, weekend_target` — **no GM/manager
column exists today.**

**Files touched.** Either a new small table or two new `stores` columns;
`lib/data.js`; `app/api/stores/route.js` (or a new dedicated route); a
small admin-only edit UI (can piggyback on wherever targets are already
edited); every display surface that currently shows only a store code/name
(Leaderboard, StoreTrend, Dashboard — **not** WeekView, see below).

**Options.**

- **(a) A new `store_managers(store_code, gm_name, area_manager_name)`
  table**, manually maintained the same way `stores.grp` already is —
  supports effective-dated history later (who was GM as of a given date)
  if that's ever needed, at the cost of one more join everywhere it's
  displayed.
- **(b) Add `gm_name`/`area_manager_name` directly as columns on
  `stores`.** Simpler — one migration, no new join, same admin PATCH
  pattern already used for targets (`app/api/stores/route.js`). Mixes
  "who runs this store" with "sync configuration" on an already-wide,
  `select("*")`-read table, which is a modeling nitpick more than a real
  cost.
- **(c) Source it from Toast employee data.** Not recommended — there is
  no stable per-store manager signal in what Toast exposes today, per the
  evidence above; this would need re-deriving from recent shift history on
  every read and would silently break on any title/staffing change.

**Recommendation: (b),** unless there's a known need to track manager
history over time (promotions, transfers) — in which case (a). Do **not**
source this from Toast (c).

**Effort:** S–M.
**Risk:** Low overall — additive columns/table, admin-gated writes like
existing target edits. **One explicit callout:** if GM/area-manager labels
are ever added to `WeekView.js`'s table specifically, that touches the
frozen file and its hand-mirrored email (see the accompanying audit's
MAINT-1 finding) — ship this to Dashboard/Leaderboard/StoreTrend first,
and treat any WeekView addition as its own carefully-scoped follow-up, not
part of this feature's first cut.

---

## Sequenced plan, by value ÷ effort

1. **Feature 1 (calendar primitive, new module only) + Feature 2 (coverage
   banner).** Ship together — Feature 2 wants the same kind of small,
   pure, zero-dependency helper module Feature 1 proposes, and both are
   S–M effort, additive, and safe to verify with a straightforward
   before/after diff. No schema changes, no WeekView exposure.
2. **Feature 6, option (b) (accountability layer).** S–M effort, high
   visible value to leadership, no dependency on anything else, low risk.
   Good early win. Keep it out of WeekView on this pass.
3. **Feature 3, option (c) (goal chips using the existing `bandFor` engine,
   no schema change).** S effort, high visible value, ships fast because it
   reuses `lib/scale.js` as-is rather than waiting on a targets migration.
4. **Feature 4 (drill-down drawer, contract + first 2-3 adapters).** M
   effort. Sequence after 1-3 so it can lean on the trend primitive and the
   goal-chip status model those established.
5. **Feature 3, option (a) (full targets schema unification).** L effort —
   defer until there's real appetite to establish the migrations baseline
   this repo doesn't have yet (a known, separate gap). Do not bundle with
   item 3 above.
6. **Feature 5 (incrementality report).** L effort, most external
   unknowns, biggest schema/storage footprint, most strategically valuable
   but least shovel-ready. Start with the Toast API spike (item schema +
   retention window) before committing to a timeline. Sequence last, and
   scope it as its own project rather than folding it into a sprint with
   the others.

**Feature flags.**

- **Feature 5's new item-level sync write** — flag to disable or roll out
  gradually per store, independent of a redeploy, given it's the
  highest-volume new write path this app will have shipped.
- **Feature 3 option (a)'s schema migration**, if/when undertaken — flag
  the old-vs-new target lookup during cutover so a bad migration can be
  reverted by flipping a flag rather than writing another migration.
- **Feature 4's contract adoption for any *retrofitted* existing tab** —
  keep the old fetch path available behind a flag until the new adapter is
  verified in production for that tab; new tabs built directly against the
  contract need no flag, since there's nothing yet to regress.
- Everything else (Features 1, 2, 6, and Feature 3's quick-win UI) is
  additive/read-only enough not to need a flag — but given there's no
  staging environment, still do a full manual smoke-test pass after each
  one ships, the same discipline the accompanying audit recommends for its
  own fixes.
