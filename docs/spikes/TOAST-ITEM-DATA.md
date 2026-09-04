# Toast item-level data spike

Phase 0 of the Command Center plan. Answers the two questions that gate
Phase 6 (launch incrementality report) before any of that work is scoped.
No code changed. No live Toast API call was made — Toast's own published
developer docs answered both questions directly, so the "one throwaway API
call if needed" fallback wasn't necessary.

---

## 1. Do the selection objects we already fetch carry item name/guid, or only price/quantity?

**Item name and guid are both present. Confirmed from Toast's own docs, not
guessed.**

Toast's `/orders/v2/ordersBulk` reference
([doc.toasttab.com/doc/devguide/apiOrdersGetDetailedInfoAboutMultipleOrders.html](https://doc.toasttab.com/doc/devguide/apiOrdersGetDetailedInfoAboutMultipleOrders.html))
documents an example response where each check's `selections[]` entry
includes:

- `item.guid` — the menu item's stable identifier (e.g.
  `"guid": "88aebc5f-4635-4141-9c0f-5a9be6324218"`)
- `displayName` — the item's name as it appeared on the order (e.g.
  `"displayName": "Rejected"` in Toast's own example — item names are
  order-time snapshots, not always the current menu name)
- `quantity` — how many of that item on that line

This matches Toast's separate menu-item-selection reference
([doc.toasttab.com/doc/devguide/apiSpecifyingModifiersAndInstructions.html](https://doc.toasttab.com/doc/devguide/apiSpecifyingModifiersAndInstructions.html)),
which describes the same `MenuItemSelection` shape: a `guid` for the
selection itself, an `item` object (with its own `guid`, `entityType:
"MenuItem"`), an optional `itemGroup`, `quantity`, and a `modifiers[]`
array for add-ons.

**What this repo's own code does with that today** — confirmed by direct
read, not inference: `app/api/toast/sync-store/route.js`'s
`computeSalesTransactionsAndHours` (the live, scheduled sync path) iterates
exactly this object shape and reads only three fields before moving on:

```js
// app/api/toast/sync-store/route.js:165-168
(check.selections || []).forEach((sel) => {
  if (sel.voided) return;
  if (sel.deferred) return;
  checkSales += (sel.preDiscountPrice || 0);
```

`sel.item.guid`, `sel.displayName`, and `sel.quantity` are never read here —
they exist in the response Toast already sends on every sync, in memory,
right now, and are discarded the moment this `forEach` callback returns.
`app/api/toast/cron/route.js`'s `computeGrossSales` (the legacy, unscheduled
duplicate — see the accompanying security audit's DATA-2 finding) does the
identical thing at lines 32-35.

**Answer: item name and guid are both available with no scope change and no
new Toast API call.** Feature 5's proposed `toast_order_items` table
(per the feature plan) can use `item.guid` as `item_guid`, `displayName` as
`item_name`, and `quantity` directly — all three are already flowing
through this codebase's memory on every sync, just unread.

---

## 2. How far back does Toast retain order data on the orders endpoint?

**Not stated as a hard number anywhere in Toast's published docs.** This is
the one part of Phase 0 that stays a genuine open question — flagged
explicitly rather than guessed.

What Toast's docs do say, from the integration cookbook
([doc.toasttab.com/doc/cookbook/apiHowToReporting.html](https://doc.toasttab.com/doc/cookbook/apiHowToReporting.html))
and the `ordersBulk` reference:

- No maximum span is enforced between `startDate` and `endDate` — the
  endpoint is paginated and built to handle wide date ranges.
- Toast support's own recommendation for historical backfills is to chunk
  requests to **at most one month** between `startDate`/`endDate`, spaced
  **5-10 seconds apart**, specifically to avoid rate limiting — not because
  of a retention wall.
- `ordersBulk` carries a documented rate limit tighter than most other
  Toast endpoints: **5 requests per location per second**.
- Toast's guidance actively steers integrators toward the orders **webhook**
  for ongoing updates, treating `ordersBulk` as the tool for periodic/bulk
  retrieval rather than continuous polling.

None of this states or implies a retention cutoff (e.g. "orders older than
X are not returned"). It also doesn't confirm the opposite — that
arbitrarily old data is guaranteed available. **This needs a direct
question to Toast support or a real one-off historical query before
committing Phase 6 to a "we can backfill any past launch" assumption.**

**What this means for Phase 6, concretely:**

- The existing `.github/workflows/backfill-sales.yml` 45-day-per-dispatch
  chunking is already close to Toast's own recommended ~30-day chunk size
  for historical pulls — no rework needed there, and its per-store
  parallel dispatch + retry pattern would carry over directly to a new
  item-level backfill route.
- `ordersBulk`'s 5-req/sec/location cap is tighter than whatever the
  existing daily/hourly sync currently assumes for gross-sales computation
  (worth a quick check against the current per-store call cadence before
  Phase 6 adds a second, parallel consumer of the same endpoint).
- Whether a launch from, say, 8 months before the new table ships can be
  backfilled at the item level is **not answerable from documentation
  alone** — resolve this with Toast support (or a real historical
  `ordersBulk` call for a known old date, off-hours, low volume) before
  promising retroactive analysis for any specific past launch.

---

## Bottom line for Phase 6 scoping

- Schema question: **resolved.** `item.guid`, `displayName`, `quantity` are
  real, already-flowing fields — the proposed `toast_order_items` shape in
  the feature plan is buildable as designed.
- Retention question: **still open.** Recommend a direct confirmation from
  Toast (support ticket or a cheap, off-hours test call for a date well in
  the past) before Phase 6 commits to a backfill scope or promises
  retroactive analysis of any specific historical launch. Forward-only
  (data starts accumulating from ship date) remains the safe default
  assumption until that's confirmed either way.

Sources:
- [Getting detailed information about multiple orders](https://doc.toasttab.com/doc/devguide/apiOrdersGetDetailedInfoAboutMultipleOrders.html)
- [Specifying modifiers and instructions for menu item selections](https://doc.toasttab.com/doc/devguide/apiSpecifyingModifiersAndInstructions.html)
- [Building a data warehouse integration](https://doc.toasttab.com/doc/cookbook/apiHowToReporting.html)
