# Period SSSG Report — specification

Status: **spec only, nothing built.** Written 2026-09-16, decisions frozen
2026-09-16.

**This report is deferred until the number is right.** It does not enter scope
until step 6 below passes. A better-looking view of a wrong number is worth
nothing.

### Frozen build order

    1. Merge the discount fix, deploy, validate both gate days
    2. Refund sweep built and validated against 10037/2026-08-28 -> 9.20
    3. Re-sync everything the new code path has touched
    4. FY2025 backfill, reconciled against period_store_figures.csv
    5. FY2025 into FISCAL_PERIODS, key normalization to YYYY-PP
    6. Period port, validated against P9 2026 -> 21 stores, -0.0251%

Nothing else enters scope until step 6 passes. Step 1 blocks all four gates in
§1, including `net_sales` being NULL on 3,348 of 3,420 rows.

The calendar-month SSSG view is **replaced**, not kept alongside (§10.7), so
its removal is part of step 6 rather than a later cleanup.

Interaction pattern is modelled on the Wingstop Brand Partner Report. Four
formulas are taken from their data dictionary, named below. Everything else —
the comp rule, the ticket derivation, the total-row convention — comes from
our own finance workbook and **differs from theirs deliberately**.

Every number quoted here was measured against the live database or the
extracted workbook on 2026-09-16, not estimated. Where something could not be
measured it says so.

---

## 1. Build order and what blocks what

Nothing in this report is buildable today. Four things gate it, in order:

| # | Gate | Why it blocks | Status |
|---|---|---|---|
| 1 | **`net_sales` populated** | Every currency metric here is defined on NET sales. `daily_sales.net_sales` is non-NULL on **72 of 3,420 rows**. | Blocked on the discount fix reaching production, then a re-sync |
| 2 | **Period port** | SSSG speaks calendar months today. P9 2026 is 2026-08-24..09-27, which is no calendar month. | Scoped, not built |
| 3 | **FY2025 in `FISCAL_PERIODS`** | The prior period for any FY2026 period is an FY2025 period. `lib/fiscal.js` has no FY2025 keys at all. | Not started |
| 4 | **2025 backfill** | `daily_sales` holds 1,085 pre-2026 rows, **all in August 2025**. September 2025: zero rows. | Not started |

There is no fifth gate: the 2-year stack was **dropped from v1** on
2026-09-16, so FY2024 is not backfilled. See §9.

`daily_transactions` is in better shape than `daily_sales` — 3,420 rows, 1,117
of them pre-2026 — but it inherits the same date coverage, so it is blocked by
gate 4 too.

---

## 2. Metric definitions

### 2.1 Taken from the Wingstop data dictionary

These four solve partial periods and new-store normalisation, which we have
no concept of today.

**Average Weekly Sales (AWS)**

    AWS = sum(net_sales in window) / (operational_days / 7)

**Average Weekly Transactions (AWT)**

    AWT = sum(transaction_count in window) / (operational_days / 7)

**Average Ticket ($)**

    Average Ticket = AWS / AWT

Note this is algebraically just `sum(net_sales) / sum(transactions)` — the
weekly normalisation cancels. It is written as AWS/AWT to match the
dictionary, and because the two inputs are already on the card.

**SSS 2Y / SST 2Y — OUT OF SCOPE for v1, decided 2026-09-16.** Recorded here
only so the formulas do not have to be re-derived if Finance asks later. Do
not build these, and do not build a 3Y stack at all (§9).

    SSS 2Y = SSS_change_% + (SSS_prior - SSS_2Y_prior) / SSS_2Y_prior
    SST 2Y = SST_change_% + (SST_prior - SST_2Y_prior) / SST_2Y_prior

This period's growth plus the prior period's own growth. Additive, not
multiplicative — it is a stack, not a compound. The Wingstop document divides
where the SSS formula adds; that is a typo in their document and **SST 2Y uses
the SSS additive structure**, not theirs.

### 2.2 `operational_days` — the definition everything rests on

Not in their dictionary in a form we can use, and the whole point of AWS, so
it must be pinned here.

    operational_days(store, window) =
      count of calendar days d in window where
        store.opened_at <= d  AND  (store.closed_at IS NULL OR d <= store.closed_at)

**Calendar days the store was in operation — not days with a `daily_sales`
row, and not days with sales > 0.** The three differ and the difference is not
academic:

- Counting rows would make a backfill gap look like a shorter week and
  silently inflate AWS.
- Counting non-zero days would treat a genuine one-day closure as if the store
  did not exist. There is a real one: **10011 CA Calabasas, 2025-08-27**, which
  has a full 24-row zero `hourly_sales` breakdown and
  `daily_transactions.transaction_count = 0` — a real closure, not a missing
  sync. That day should divide, not disappear.

This makes AWS depend entirely on `opened_at` being correct, which ties
directly to the 10033 Melrose note in `docs/finance/README.md`.

**`closed_at` — DECIDED 2026-09-16: add it now, inert.** Nothing has closed
yet, and the formula above already reads it, so adding the column makes code
and spec agree from day one instead of leaving a clause that references a
column that does not exist.

The objection to an always-NULL column is that it invites the assumption that
something maintains it. That is a real trap, and it is fixed by documenting it
rather than by deferring the column. **The migration must carry a comment
stating plainly:**

- nothing populates this column, and nothing ever will automatically;
- it must be set **by hand** when a store closes;
- `operational_days` already reads it, so leaving it NULL for a store that has
  actually closed will overstate that store's AWS for every period after the
  closure — silently, because a closed store's zero days will divide as if it
  were trading.

### 2.3 Kept from our workbook — do not substitute the Wingstop equivalents

**Dollars are summed before the percentage is taken.**

    SSS % = (sum(net_sales current) - sum(net_sales prior)) / sum(net_sales prior)

Never an average of per-store percentages. That is exactly the error on the
P4–P11 2025 sheets (`=SUM(F4:F37)` over a column of percentages, evaluating to
`#N/A`). The P1 2026 sheet shows the correct form:
`E38 = (SUM(C4:C19)-SUM(D4:D19))/SUM(D4:D19)`.

**Ticket SSSG is derived by subtraction, never computed independently.**

    Ticket SSSG = SSS % - SST %

**`Ticket SSSG` and `Average Ticket ($)` are different metrics and must never
be conflated.** One is a growth rate derived from two other growth rates; the
other is a dollar value. Both may appear on the same screen. They must never
share a label, a colour, or a tooltip, and `Ticket SSSG` must never be
computed as a year-over-year change in `Average Ticket ($)` — that would be a
third, different number.

**Comp store count travels with every SSSG figure.** Non-negotiable: the comp
base grew 12 → 21 stores and SSSG fell from +75% to flat *because of the base
change*. An SSSG number without its store count is unreadable. Rendered as
part of the figure, not as a footnote — `-0.03% (21 stores)`.

---

## 3. Comp rule — ours, not theirs

**Ours: 15 months.** `comp_entry = EDATE(opening_date, 15)`. A store is comp
for a period if `comp_entry <= period.end`.

**Not** Wingstop's 367 days. Their own guide warns the rule differs by
organisation.

**The cutoff is period END, and this is measured, not assumed.** Finance
reports 21 comp stores for P9 2026. Measured against `stores.opened_at`:

| cutoff | comp stores |
|---|---|
| period start (2026-08-24) | 20 |
| **period end (2026-09-27)** | **21** ✅ |

The difference is **10021 DFW Southlake**, opened 2025-06-06, comp entry
2026-09-06 — mid-period. Period-end reproduces Finance's number exactly.

**DECIDED 2026-09-16, and it must be defended in code.** Period-end is not an
implementation detail; it is the difference between 20 and 21 comp stores and
it reproduces Finance exactly. It is also precisely the thing someone
"corrects" to period start in six months because start looks more principled.

Required at step 6, not optional:

- The comp-membership function carries a comment giving the reason and the
  measured evidence (20 at start, 21 at end, Finance reports 21).
- A test pins **P9 2026 to 21 comp stores**, naming **10021 DFW Southlake**
  (opened 2025-06-06, comp entry 2026-09-06) as the boundary case, so the
  failure message points straight at the store that moves.

*Known consequence, flag in the tooltip:* a store entering comp mid-period
contributes a full period of sales against a prior period in which it was
open but still ramping. That inflates its growth. It is what Finance does, so
we do it, but the tooltip should say the store entered comp during the period.

**Source of the opening date — DECIDED 2026-09-16: compute from
`stores.opened_at`.** `comp_basis.csv` is reference material. It is never a
runtime input and is never joined to at runtime. Reconcile it by hand once
and record the outcome in `docs/finance/README.md`.

Why it cannot be an input: it is keyed by `dba_store_name` with **0 of 30
exact matches** against `stores.name` (their `Addison (Belt-line)` vs our
`DFW Addison`), only 18 loose substring matches, 30 rows against 35 stores,
and at least one row with an unescaped quote. Computing from
`stores.opened_at` reproduces Finance's 21 without any of that.

Per Finance 2026-09-16, the `soft_opening` column is ignored entirely.

---

## 4. Filters

Three. Nothing else. No DMA, brand partner, or concept filter — we have no
such dimensions and inventing them to mirror the reference report would
promise data that does not exist.

**State** — TX, TN, CA, AZ.

⚠️ **There is no `state` column.** `stores` has `region`, with seven values.
The mapping is unambiguous but has to be written down and stored:

| state | regions | stores |
|---|---|---|
| TX | DFW (14), HTX (5), ATX (2), SATX (1) | 22 |
| CA | CA | 10 |
| AZ | AZ | 2 |
| TN | NSH | 1 |

**DECIDED 2026-09-16: add a real `state` column to `stores`**, backfilled from
the seven existing regions. Not a region→state map in code — a hardcoded map
is the kind of thing that silently omits a new region, and TN is a single
store (NSH), so that bug would hide inside a rounding error.

**Store** — one, many, or all. Multi-select.

**Comp / Non-Comp** — comp, non-comp, or both. Derived per §3, evaluated
against the selected period, not against today.

### Filter behaviour

- Filters compose (AND).
- **Selecting stores recalculates the KPI cards.** This is the core
  interaction. Cards reflect the current selection, never a fixed chain total.
- Recalculation re-derives every figure from summed dollars — it never
  averages the per-store percentages already on screen (§2.3).
- The comp store count on each card reflects the **selection**, so selecting
  three non-comp stores must show comp count 0 and blank SSSG figures rather
  than `0.00%`.
- Filtering is applied *after* the period aggregation, the same way
  `app/api/sssg/route.js` already filters region after `computeMonthComparison`.

---

## 5. KPI cards

Six cards. Each recalculates on selection. Each carries a tooltip with its
exact formula — the tooltip is the documentation, and is mandatory.

| Card | Shows | Tooltip must state |
|---|---|---|
| **Net Sales** | `sum(net_sales)` CY, PY, $ change | Net = gross − discounts − refunds. Discounts exclude ones Toast voided. |
| **SSS %** | `%` + **comp store count** | Dollars summed before the ratio. Comp = opened + 15 months, at period end. |
| **SST %** | `%` + comp store count | Same population as SSS %. |
| **Ticket SSSG** | `SSS % − SST %` | Derived by subtraction. **Not** a change in Average Ticket. |
| **Average Weekly Sales** | `$` | `sum(net_sales) / (operational_days / 7)`. Operational days = days open, including zero-sales closure days. |
| **Average Ticket ($)** | `$` | `AWS / AWT`. **Not** Ticket SSSG. |

Cards 5 and 6 are period-length-neutral, which is what makes a 28-day period
comparable to a 35-day one and a mid-period opening comparable to a full one.
Cards 1–4 are not.

**Partial periods — DECIDED 2026-09-16: show only the length-neutral cards.**
While a period is still running, render **Average Weekly Sales, Average Weekly
Transactions and Average Ticket ($) only**. Net Sales, SSS %, SST % and Ticket
SSSG are withheld until the period closes, then revealed.

Not a marker on a misleading number, and not a refusal to show the period at
all. AWS and Average Ticket are *designed* to be period-length-neutral — they
are correct on day 3 of a period, which is the entire reason those formulas
were taken from the Wingstop dictionary. The other four are not, and a warning
label does not survive a screenshot. Withholding is honest by construction;
labelling depends on the reader.

The withheld cards must show *why* they are withheld — "available when P9 2026
closes on 2026-09-27" — not render blank or zero. A blank card reads as a data
failure and generates a support question; a zero reads as a real number.

---

## 6. Table columns

One row per store, below the cards, respecting the filters.

| Column | Source | Notes |
|---|---|---|
| Code | `stores.code` | |
| Store | `stores.name` | |
| State | derived from `region` | §4 |
| Comp | derived | badge; show comp entry date on hover |
| Op. days | `operational_days` | §2.2; flag when < period length |
| Net Sales CY | `sum(net_sales)` | |
| Net Sales PY | `sum(net_sales)` prior period | |
| $ Change | CY − PY | |
| SSS % | per store | |
| Txns CY / PY | `daily_transactions` | |
| SST % | per store | |
| Ticket SSSG | SSS % − SST % | per store, same subtraction |
| AWS | §2.1 | |
| AWT | §2.1 | |
| Avg Ticket $ | AWS / AWT | |
| Excluded / reason | `classifyStore` | verbatim reason string, never blank |

Exclusion reasons come from the existing `classifyStore` rule in
`lib/sssg.js` — that rule is the single definition of "comparable" and must
not be re-implemented here.

---

## 7. The dual-population total row

The workbook's total row carries **two different populations at once**:

- **dollar columns span all stores** in the selection
- **percentage columns span the comp set only**

This confuses everyone who meets it for the first time. It is also correct,
and it is what Finance publishes, so the design must make it legible rather
than either replicating it silently or quietly "fixing" it into one
population.

**Required treatment:**

1. The total row is **visually split** — dollar cells and percentage cells
   carry different backgrounds, with a labelled boundary between them.
2. Each group is **labelled in the row itself**: `All 35 stores` over the
   dollar group, `Comp set: 21 stores` over the percentage group.
3. The percentage group's label is **live** — it changes with the selection.
4. Hovering either group highlights exactly the table rows feeding it. This is
   the single clearest way to show that the two totals are computed over
   different sets of rows.
5. The tooltip on the boundary states the reason plainly: including non-comp
   stores in a growth percentage compares a store against a period in which it
   did not exist.

Do **not** offer a toggle that recomputes percentages over all stores. That
number is meaningless and someone would screenshot it.

---

## 8. Not supported — state plainly, do not imply otherwise

Present in the reference report, impossible for us. Listed so nobody expects
them and nobody files them as bugs:

| Reference metric | Why not |
|---|---|
| **COGS / food cost / margin** | No cost data anywhere in the schema. Not a query away — needs an invoicing or inventory source we do not have. |
| **Channel mix** (dine-in / takeout / delivery / digital) | Toast carries `diningOption` and order source per order, but nothing extracts or stores it. `daily_sales` has no channel dimension. New extraction + schema + full re-backfill. |
| **QSC scores** | Operational audit data. We have a Tattle integration (`stores.tattle_location_id`) which is guest feedback, not QSC. Different instrument; do not present one as the other. |
| **DMA** | No such dimension. |
| **Brand partner / franchisee** | Single operator. Not applicable. |
| **Concept** | Single concept. Not applicable. |

Labour data *does* exist (`toast_labor_shifts`, and SPLH/TPLH work on other
branches), so labour metrics are out of scope for this report but not
impossible later.

---

## 9. FY2024 — OUT OF SCOPE. 2Y and 3Y stack dropped from v1

**DECIDED 2026-09-16: FY2024 is not backfilled, and the 2Y and 3Y stacks are
dropped from the first version entirely.**

Reason: a P9 2026 2Y stack rests on **11 comp stores against today's 21**. It
describes half the chain, and most readers will take it for a statement about
the whole one. Not worth 2.3 hours and a second year of data for a number that
misleads by default. The data stays in Toast if Finance asks later; the costing
below is kept so the decision does not have to be re-derived.

The FY2025 costing in the table **remains live** — it is step 4 of the frozen
build order.

---

### Costing, retained for reference

FY2024 = 2024-01-01 .. 2024-12-29 (364 days, opens on a Monday, closes the day
before FY2025 starts).

Volume basis is measured, not guessed: the FY2025 workbook sheets carry
prior-year columns, which *are* 2024. Ten periods are present (P3–P12 2025),
totalling **2,077,857 transactions** over 2024, mean 207,785/period,
extrapolating to **~2.49M transactions for FY2024**. Store count over 2024
runs 13 → 18.

Request model is the one already validated: `ceil(orders / 100) + 1`
terminating page, per store-day.

| | store-days | orders/store-day | sales backfill | refund sweep | **total** |
|---|---|---|---|---|---|
| **FY2024** | 5,143 | ~455 | 30,858 | 5,400 | **~36,300** |
| **FY2025** | 7,961 | ~550 | 55,727 | 8,359 | **~64,100** |
| **both** | 13,104 | | 86,585 | 13,759 | **~100,300** |

Store-days come from real `opened_at` values, so they already account for the
chain being smaller in 2024 — FY2024 is **65% of FY2025's store-days**, which
is why adding a whole extra year costs well under double.

**Wall clock.** `backfill-sales.yml` runs `xargs -P 4` within each day, sleeps
2s between days, chunks at 45 days, and the job times out at 360 minutes.
At an assumed 6s per store-day call:

- **FY2024**: ~5,143 / 4 × 6s + 364 × 2s ≈ **2.3 hours**, 9 chunks. (Moot — out
  of scope.)
- **FY2025**: ≈ **3.5 hours**. Fits, but at 10s per call it exceeds the
  360-minute timeout.

**DECIDED 2026-09-16: FY2025 is split into two dispatches, unconditionally.**

**And the split is sized on measurement, not on this estimate.** The 6s figure
is the softest number in this document — there is no recorded per-pair timing
anywhere in the repo. Before the full run, time **20 real store-day calls** and
report the actual per-pair figure.

The route already returns `elapsedSeconds` on every response. The cheapest way
to get this is to log it in `backfill-sales.yml` the same way
`discountsSkippedVoidAmount` is logged, then dispatch a single store over a
20-day range — roughly 2 minutes of wall clock, and it also exercises the
chunk planner. That two-line workflow change is a prerequisite of step 4, not
a separate piece of work.

The 6s figure is an assumption — there is no recorded per-pair timing in the
repo. The merged chunking work makes a long run survivable either way: a
failed pair no longer kills the run, and `dry_run` prints the chunk plan
first.

### What 2Y actually buys, measured

A 2Y stack for P9 2026 needs the P9 2024 comp set as its base. Comp set sizes:

| period | stores open | comp stores |
|---|---|---|
| P9 2023 | 11 | 6 |
| P9 2024 | 15 | **11** |
| P9 2025 | 23 | 13 |
| P9 2026 | 35 | 21 |

So a P9 2026 2Y stack would rest on **11 comp stores against today's 21** —
it describes roughly half the current chain, and a materially different one.
That is not an argument against it; a 2-year stack is *supposed* to hold the
base fixed. It is an argument for the store count being rendered next to the
2Y figure exactly as it is next to the 1Y figure (§2.3), and for the tooltip
naming both bases.

A 3Y stack would rest on **6 comp stores**. Recommend ruling 3Y out on those
grounds whatever is decided about 2Y.

---

## 10. Decisions

Closed 2026-09-16:

| # | Decision | Outcome |
|---|---|---|
| 1 | 2Y stack in v1? | **Out.** 2Y and 3Y both dropped; FY2024 not backfilled. §9 |
| 2 | Comp entry source | **Compute `EDATE(opened_at, 15)`.** `comp_basis.csv` is reference only, never joined at runtime. §3 |
| 3 | Comp cutoff | **Period end.** Reproduces Finance's 21. Comment + test required at step 6. §3 |
| 4 | FY2025 backfill shape | **Two dispatches**, sized on a measured per-pair timing, not the 6s estimate. §9 |
| 5 | Partial-period marker | **Show only the length-neutral cards** (AWS, AWT, Average Ticket) while a period is running; reveal the rest when it closes. §5 |
| 6 | `state` column vs code map | **Real `state` column on `stores`**, backfilled from the seven regions. §4 |
| 7 | Monthly view: keep or replace | **Replace with periods.** Not only tidiness — the calendar-month comparison is distorted (8 of 12 months carry a weekend-day mismatch against their prior year, worth ~1.28% of a month against a signal of −0.0251%). Keeping both would mean publishing a number known to be wrong beside one that is not. |
| 8 | `closed_at` column | **Add now, inert**, with a migration comment stating that nothing populates it, that it is set by hand, and that `operational_days` already reads it. §2.2 |

All decisions are closed. Nothing in this spec is awaiting an answer.

## 11. Traceability

Every non-obvious number in this document, and where it came from:

| Claim | Source |
|---|---|
| `net_sales` non-NULL on 72/3,420 rows | live `daily_sales`, count:exact, 2026-09-16 |
| Sept 2025 has zero rows; Aug 2025 has 1,085 | live, count:exact |
| 2024 volume 2,077,857 txns over 10 periods | `period_store_figures.csv`, `py_transactions` on the 2025 sheets |
| store-days 5,143 / 7,961 | live `stores.opened_at` |
| comp 20 at period start, 21 at period end | live `opened_at` + `EDATE(·,15)`; matches Finance's 21 |
| comp sets 6 / 11 / 13 / 21 for P9 2023–26 | same |
| region → state mapping, 22/10/2/1 | live `stores.region` |
| `comp_basis.csv` 0/30 exact name matches | `comp_basis.csv` vs `stores.name` |
| 10011 closed 2025-08-27 | `backfill-report.md`, corroborated by zero `hourly_sales` + zero transactions |
| P1 2026 formulas, comp rows 4:19 | `Trailing_SSSG.xlsx`, read by Finance 2026-09-16 |
