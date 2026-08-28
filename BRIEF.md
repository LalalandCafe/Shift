# SHIFT work brief

Ordered work packages. Do them in order. Each package ends with its own commit.
Read the "Ground rules" section before starting anything.

Reference document: `SHIFT-database-audit.md` in the repo root. Section numbers
below (2.2, 6.1, etc.) refer to that document.

---

## Ground rules

**Code**
- All code, comments, commit messages, variable names, and UI copy in English.
- Deliver complete files. Never hand back a partial edit or a diff as the final artifact.
- Match the existing code style. Do not introduce a formatter, a linter config, TypeScript, or a new dependency without asking first.

**Do not touch**
- `components/WeekView.js` and anything under the `.wk-legacy` CSS scope. It is frozen deliberately because `/api/email` mirrors its markup. Changing it breaks the daily email.
- Any `.env*` file, `pepper.txt`, or `*full-dump*`. Never read their values into a commit, a log, or a summary. If a task needs a new environment variable, tell me the name and let me set it.

**Known schema facts** (do not rediscover these the hard way)
- `stores.code` is an integer. No quotes in SQL.
- New store 10037 (DFW El Dorado, Frisco TX) must have `grp = 'TX-TN'`, not `'DFW'`.
- Entra security group membership maps to `stores.grp` with values `TX-TN` and `CA-AZ`. Only `SHIFT-Admin` is live today. Regional and GM groups are still pending on the Entra side, so any code you write must degrade gracefully when a user matches no group.
- Production Supabase project is `epklybaeqzmocmaiekcx`. The older `jtwwqpflsjayvfuplhfj` appears in old notes and is not current.

**Stop and report, do not proceed, when**
- A change would drop, truncate, or rewrite existing production rows.
- A change would run a migration against the production database.
- A package turns out to need a decision I have not made in this brief.

In those cases, write your findings and your proposed plan to the terminal and wait. Do not guess.

**Git**
- One commit per package, conventional commit format.
- Do not push. I will review `git diff` and push myself.

---

## Package 1 — HME drive-thru sync (highest priority)

The `hme-sync.yml` startup failure is already fixed (indentation of the `curl` step). That was only the second of two problems.

**The real problem:** drive-thru data in the dashboard stops around **Aug 19, 2026**, which is BEFORE the workflow broke on Aug 27. The week of Aug 17 has data for Monday and Tuesday only. Weeks of Aug 10, Aug 3, and Jul 27 are complete. So something broke the sync around Aug 19 independent of the YAML.

**Do this:**

1. Run the workflow and read its Step Summary output. It already echoes `Stores processed`, `Cars synced`, and `Failed windows`. Report what it says.
2. Read the HME sync path end to end: `lib/hme.js`, the sync route, and `hme-sync.yml`. Answer these specifically:
   - What date window does a scheduled run request? Is it a rolling "last N days", or "since watermark", or "yesterday only"?
   - If a run fails, does the watermark still advance? If it does, that alone explains a permanent hole: one bad run on Aug 19 would skip those days forever.
   - Are HME DXS credential or token errors swallowed silently, or do they surface as a non-zero exit? Section 5.4 of the audit flags fire-and-forget behavior in serverless; check whether that applies here.
3. Report the root cause before writing any fix.
4. Then write a **backfill path** that can re-pull an explicit date range for an explicit store list, so the Aug 19 to Aug 27 hole can be filled. It must be idempotent: running it twice must not double-count cars. Check how `hme_car_events` is keyed before you assume upsert works.
5. After backfilling, refresh `drive_thru_daily_mv`.

**Verify:** the week of Aug 17 renders Wednesday through Sunday, and total car counts for weeks that already had data are unchanged.

---

## Package 2 — Drive-thru day selection scoping

Clicking a day cell in the "Every day, every week" grid highlights the cell, but the four KPI cards and the banner above still show the 30-day aggregate. A manager reads "2:15 / 5,668 cars" as if it belonged to the day they just clicked. It does not.

**When a day is selected, all of these scope to that single day:**
- The green summary banner headline and its sentence
- The eyebrow label, currently `10008 · DFW RICHARDSON · LAST 30 DAYS`. When a day is selected it reads `10008 · DFW RICHARDSON · FRI, AUG 14`
- Average window time, including the `N cars · target M:SS` subtext
- Cars at target, including the `X% still over M:SS` subtext
- Toughest hour and Best hour, from that day's hourly data only

**Requirements:**
- The banner changes color with the selected day, using the same thresholds the grid cells already use. A day over target must not sit under a green banner.
- Provide a way back to the 30-day view: a `Back to 30 days` control next to the eyebrow, clicking the already-selected cell deselects it, and Escape clears it.
- Empty cells (no data) are not selectable and not focusable.
- Toughest hour and Best hour need a minimum of **10 cars in an hour** for that hour to be eligible. On a slow day this prevents a 3-car hour from being reported as the toughest. If fewer than 2 hours qualify, render a neutral placeholder instead of a misleading value.
- Cells get `aria-pressed`, keyboard activation on Enter and Space, and a visible focus ring.
- Do not change the 30-day math or the existing color band thresholds.

---

## Package 3 — Login and sign-out screens

The files for this package are not in the repo yet. I am pasting them in separately. When you reach this package, check whether `_incoming/` exists at the repo root. If it does not, stop and tell me, and move on to Package 4.

Once `_incoming/` exists:

**Move:**
```
_incoming/app/auth.css               ->  app/auth.css
_incoming/app/login/page.js          ->  app/login/page.js
_incoming/app/signout/page.js        ->  app/signout/page.js
_incoming/components/AuthShell.js    ->  components/AuthShell.js
_incoming/components/HourBand.js     ->  components/HourBand.js
_incoming/components/LalalandLogo.js ->  components/LalalandLogo.js
```

Then delete `_incoming/`.

**Wiring:**

1. Add a `pages` block to `auth.config.js`: `signIn: '/login'`, `signOut: '/signout'`, `error: '/login'`. Without this, Auth.js keeps serving its own unstyled pages.
2. Allow `/login` and `/signout` through the middleware while signed out. Otherwise `/login` redirects to itself forever.
3. Repoint every link to `/api/auth/signout` at `/signout`. Grep for it.

**Reconcile these against the real repo and fix them to match:**
- The new files import from `@/auth` and `@/components/...`. If `jsconfig.json` has no `@/*` alias, convert them to relative imports.
- `AuthShell` renders `<ShiftLogo />` with no props and sizes it with CSS. If the real `ShiftLogo` requires a `size` prop, pass one.
- `app/auth.css` requests Poppins first. If `globals.css` loads a different face, change the `font-family` on `.auth-page` to match it.
- The files assume Next 14, where `searchParams` is a plain object. If this is Next 15, await it.

**Leave alone:** the placeholder `<text>` inside `components/LalalandLogo.js`. I am pasting the real La La Land SVG in myself.

**Verify:** `/login` signed out renders the styled screen; `/login?error=AccessDenied` shows the red notice; `/login` while signed in redirects to the dashboard; `/signout` shows the user's name and email; signing out lands on the confirmation state; `/api/auth/signout` is no longer the blue default page.

---

## Package 4 — Security P0s from the audit

Three findings, all rated P0. Read audit sections 2.2, 2.3, 2.4 and 9.2 in full first.

- **2.2 Most of the API is unauthenticated.** `reporterGuard` protects only `PATCH /api/stores`. Labor, sales, employee names, and the writes and deletes on `planned_hours` are open to anyone with the URL.
- **2.3 A secret check that fails open.**
- **2.4 Every route uses `SERVICE_ROLE_KEY`,** which bypasses RLS by design. Combined with 2.2, the effective database surface is public.
- **9.2 Authorization lives in the component, not the route.** The sidebar lock is cosmetic and client-side.

**Approach:** the fix is a single server-side guard applied to every route handler, deriving identity from the Entra session, not a per-route patch. Entra SSO is already live and enforced in middleware, so the session is available.

**Before writing code, produce and show me:**
1. A table of every route under `app/api/`, what it does, whether it reads or writes, and what access level it should require (admin, region, store, public).
2. Your proposed guard, and how a route opts into a level.

Wait for my approval on that table. Then implement.

Do **not** attempt the RLS side of 2.4 in this package. Turning on RLS without policies locks the app out of its own data. Note it as follow-up work.

---

## Package 5 — Labor sync data integrity

Audit sections 6.1 and 6.2.

- **6.1** The labor sync deletes before it writes, with no transaction. A failure between the DELETE and the UPSERT leaves that store and day empty.
- **6.2** The delete window is computed from a hardcoded `-0500` offset. This is wrong across DST, and wrong for the CA and AZ stores year round. Note that AZ does not observe DST, so a single "Pacific" assumption is also wrong.

**Fix both together**, since 6.2 determines which rows 6.1 destroys. Prefer a Postgres function that does the delete and the insert in one transaction over trying to coordinate it from Node, since PostgREST has no transactions (audit section 1, preamble).

Timezone must be derived per store. Check whether `stores` already carries a timezone column; if not, propose the column and the per-store values and wait for me to confirm them before writing the migration.

---

## Package 6 — Read amplification

Audit section 1.2: loading the Dashboard runs `buildDailyReport` three times for the same date, each doing several full paginated scans of `toast_labor_shifts` plus two calls to the reviews rollup.

Fix the triple call first, it is the cheapest win. Then look at 1.4 (`/api/export` running 7 full reports in parallel).

Do not start the wider "move aggregation into Postgres" work from section 1.1. That is a separate project.

---

## Not in scope right now

Listed so you do not wander into them: sections 3 (schema types and foreign keys), 4 (indexing), 8 (data modeling), 11 (migrations baseline). Section 11.1 notes the repo has no migrations at all, which is itself a P1, but establishing a migration baseline is its own project and I want it planned, not improvised in the middle of these packages.

---

## Reporting

After each package, print a short summary: what changed, which files, what you verified, and anything you found that is not in this brief and that I should know about. Then move to the next package.