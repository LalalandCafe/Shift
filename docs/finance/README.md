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

## Reference totals, P9 2026, 35 real stores

| | Net | Discounts | Refunds | Gross |
|---|---|---|---|---|
| CY | 6,449,963.27 | 246,909.05 | 341.66 | 6,697,213.98 |
| PY (24 stores) | 4,138,820.38 | 159,338.03 | 936.08 | 4,299,094.49 |

Comp set SSSG for P9 2026: 21 stores, delta -908.90, -0.0251%.
Prior-year refunds are 103% of that delta, so refund handling alone can
determine the sign. Any approach that cannot capture refunds accurately
is disqualified.
