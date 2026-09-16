# Finance source data

Extracted from `Trailing_SSSG.xlsx`, the finance team's own SSSG report.
**Data files are not tracked in git.** They contain chain-wide sales figures.

| File | Contents |
|---|---|
| `period_store_figures.csv` | 652 rows, 19 period sheets, per-store net sales and transactions. Reconciliation target for the 2025 backfill. |
| `cy_location_overview.csv` | Raw Toast export, current year. 27 columns. |
| `py_location_overview.csv` | Raw Toast export, prior year. 27 columns. |
| `comp_basis.csv` | Grand opening dates and comp-entry periods. |
| `layout_report.json` | Per-sheet column mapping and parse status. |

## Known traps

- **Header labels on the 2025 sheets are wrong.** P12 2025 reads
  "2026 Net Sales / 2025 Net Sales"; P9 2025 reads "2026 Transactions".
  The columns sit in the right position, only the text is wrong. Map by
  position using `layout_report.json`, never by header name.
- **Store codes 20001 (Dallas Lab) and 20002 (Test Cafe) are not stores.**
  Exclude them from every total. 20002 has a blank location code in the
  source, so lookups never find it anyway.
- **Toast's identity holds exactly**: net = gross - discounts - refunds,
  verified across all 61 store rows in both overviews. This matches
  `daily_sales.net_sales` as shipped. No schema change is needed.
- Row counts per sheet grow over time (34 -> 35 -> 36) as stores open.
  That is real, not a parse error.
- Only two sheets compute SSSG with correct methodology: P3 2025 and the
  live Sales Summary. P4 through P11 2025 use `=SUM(F4:F37)`, which sums
  percentages and evaluates to #N/A. Several later sheets are hardcoded
  values. Validate per store, not per total. See **Workbook figure
  provenance** below for which sheets, and what SHIFT does about it.
- **The `soft_opening` column in `comp_basis.csv` does not count.**
  Finance confirmed 2026-09-16: ignore it entirely. Comp entry is driven
  by `grand_opening` / `entered_comp_basis` / `enter_comp_period` only.
  It is left in the extract because the extract is a faithful dump, not
  because anything should read it.

## Workbook figure provenance

Recorded for forensics, not for display. SHIFT publishes its own computed
figure for every period, with no UI marker and no dual display - decided by
Finance 2026-09-16. When somebody eventually asks why a SHIFT number differs
from a figure Finance circulated, this is the answer, and it should be
findable here rather than reconstructed from the workbook a year later.

**Periods whose workbook SSSG total was a hardcoded value, not a formula**,
per Finance, 2026-09-16:

    P12 2025
    P2 2026, P3 2026, P4 2026, P5 2026, P6 2026, P7 2026, P8 2026

A hardcoded total is a number somebody typed. It is not reproducible from
the sheet it sits on, so a SHIFT figure that disagrees with one of these is
not evidence that SHIFT is wrong - there is nothing on the sheet to check it
against. Per-store figures on those sheets are still real; it is the total
that was typed.

**P1 2026 is NOT in that set - settled from the workbook 2026-09-16.** An
earlier note here said "P12 2025 through P8 2026 are hardcoded", an inclusive
range that wrongly swept in P1 2026. That range was wrong; the list of eight
above is right. `Sales Summary P1 26` carries real formulas with correct
methodology on total row 38:

    E38 = (SUM(C4:C19)-SUM(D4:D19))/SUM(D4:D19)   => 0.32409
    H38 = (SUM(F4:F19)-SUM(G4:G19))/SUM(G4:G19)   => 0.27005
    I38 = E38-H38

so its comp set is recoverable as rows 4:19, sixteen stores. Its layout
differs from every other sheet - net sales in C/D, transactions in F/G, and
no market column - which is why the extractor flagged it separately. Read it
by position via `layout_report.json`, like the rest.

**P2 2026 carries an orphaned formula**: `J39 = F39-I39` computes a ticket
figure from two cells that are themselves pasted values. It does not change
P2 2026's status - it is still in the hardcoded set - it just confirms that
values were pasted over formulas on that sheet rather than the sheet having
been built without them.

**What SHIFT does instead.** Nothing special. SSSG is computed uniformly for
every period from `daily_sales`, with no per-period branch anywhere in
`lib/sssg.js` - see the note there. No period is excluded, corrected, or
annotated because its workbook counterpart was typed rather than calculated.

**Stores excluded from every total**: 20001 (Dallas Lab) and 20002 (Test
Cafe), confirmed by Finance 2026-09-16. Already true by construction - see
Known traps above.

**10033 Melrose has not opened yet** (confirmed by Finance 2026-09-16, and
consistent with the data: absent from the `stores` table, all zeros in the
workbook). No action required now, but **`opened_at` must be set when it
opens**, and the failure modes are silent in both directions:

- `opened_at` left NULL: `backfill-sales.yml` filters on
  `opened_at != null and opened_at <= <date>`, so the store is skipped on
  every date forever. It never fails, it just never gets data, and SSSG then
  excludes it as "incomplete data" without anyone being told why.
- `opened_at` set earlier than the real opening: the backfill writes real
  $0 rows for days the store did not trade, which is exactly the phantom-row
  pattern that cost 391 rows across 12 stores in run 33800079982. Once a
  prior-year month mixes those $0 days with real trading days, the store
  enters the comp set on a partial year and drags growth down.

All 35 current stores have `opened_at` and `toast_guid` populated as of
2026-09-16. Keep it that way; there is no alert if a new row lands without
them.

## Reference totals, P9 2026 - PARTIAL PERIOD

**These are not a full period.** The live Sales Summary they came from was
exported mid-period. The window is:

    2026-08-24 .. 2026-09-13   -   21 of P9 2026's 35 days (60%)

That cutoff is pinned empirically, not estimated. Summing
`daily_sales.gross_sales` forward from 2026-08-24 reaches each store's CY
gross exactly on 2026-09-13 - to the cent, for all 35 stores - and
overshoots on 2026-09-14. Our 2026 gross is already validated against
Toast, which is what makes it usable as the ruler here. 21 days is exactly
three fiscal weeks, so the export is week-aligned.

| | Net | Discounts | Refunds | Gross |
|---|---|---|---|---|
| CY, 35 stores, 2026-08-24..2026-09-13 (21d) | 6,449,963.27 | 246,909.05 | 341.66 | 6,697,213.98 |
| PY, 24 stores, window NOT verified | 4,138,820.38 | 159,338.03 | 936.08 | 4,299,094.49 |

The PY column is assumed to cover 2025-08-25 .. 2025-09-14, the same 21
days shifted back 364 days. That is the calendar-equivalent window, not a
measured one: the cumulative-sum test above cannot be run for 2025 because
`daily_sales` covers only the first 7 days of P9 2025. All 35 stores are
present, but only for 2025-08-25..2025-08-31 - 245 rows of the 1,225 a full
period needs. September 2025 has **zero** rows (verified with count:exact,
2026-09-16; a plain select silently caps at 1,000 on this table). Re-pin the
PY window the same way once the 2025 backfill lands, before trusting any
CY/PY comparison built on it.

Do not compare these against a full P9 2026, and do not annualize them.
Comparing them against a full P8 2026 is what produced the earlier estimate
of "about 24 of 35 days": P8 is a 4-week period (28 days), not 35, so the
67% net ratio was measuring 21/28, not 24/35.

Comp set SSSG for P9 2026: 21 stores, delta -908.90, -0.0251%. This comes
from the same partial export and therefore covers the same 21 days, not the
period. Prior-year refunds are 103% of that delta, so refund handling alone
can determine the sign. Any approach that cannot capture refunds accurately
is disqualified.
