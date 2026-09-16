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
  percentages and evaluates to #N/A. P12 2025 through P8 2026 are
  hardcoded values. Validate per store, not per total.

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
`daily_sales` holds only 245 rows across P9 2025 (7 stores of 35, the rest
not yet backfilled). Re-pin it the same way once the 2025 backfill lands,
before trusting any CY/PY comparison built on it.

Do not compare these against a full P9 2026, and do not annualize them.
Comparing them against a full P8 2026 is what produced the earlier estimate
of "about 24 of 35 days": P8 is a 4-week period (28 days), not 35, so the
67% net ratio was measuring 21/28, not 24/35.

Comp set SSSG for P9 2026: 21 stores, delta -908.90, -0.0251%. This comes
from the same partial export and therefore covers the same 21 days, not the
period. Prior-year refunds are 103% of that delta, so refund handling alone
can determine the sign. Any approach that cannot capture refunds accurately
is disqualified.
