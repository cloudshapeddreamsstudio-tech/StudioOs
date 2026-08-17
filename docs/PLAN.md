# StudioOS — phase plan

> **This file covers Phases 0–5 and is now the evidence trail, not the forward
> plan.** Two decisions taken on 2026-08-17 — StudioOS becomes a multi-tenant
> product, and ERPNext becomes the only database — supersede Phase 5's deploy
> shape and retire the D1 storage layer described below. Everything recorded
> here still happened and still verified; read [`PLAN-v2.md`](./PLAN-v2.md) for
> what happens next.

Tracer-bullet phases. Each one ends with something that **runs** and is
committed. One phase per context window; `/clear` between them.

Legend: ✅ done · 🔨 in progress · ⬜ not started

---

## Phase 0 — stabilise the OLD app ⬜

Do this regardless of the migration. None of it is wasted, all of it is small.
**Not started — this is on the old repo, not StudioOS.**

- ⬜ Push `CSDSxERPnext App` to a private remote. It has 11 commits and no
  remote; the ledgers are the studio's only copy of that data.
- ⬜ Commit the dirty tree — `server/routes/payments.js` is untracked *and*
  already mounted in `index.js`. One `git clean` from gone.
- ⬜ Make ledger writes atomic (temp file + rename) — ~15 lines, one helper,
  six call sites.
- ⬜ `git rm --cached server/data/*.json` so a future deploy can't clobber them.

---

## Phase 1 — foundation + first vertical slice ✅

Prove the whole stack end to end with one real page.

- ✅ `StudioOs/` with `frontend/` and `backend/`, independent packages
- ✅ Hono + TS + Wrangler + D1 + Drizzle scaffold
- ✅ `frappeClient.js` → `src/lib/frappe.ts` (config injected, not ambient)
- ✅ `smartAction.js` → `src/lib/smartAction.ts`, behaviour-identical
- ✅ D1 schema for all six ledgers + `0000_init.sql`
- ✅ `routes/projects.js` → `routes/projects.ts` — full port, all four handlers
- ✅ `routes/projectExpenses.js` → D1-backed
- ✅ React + Vite + Tailwind v4 + Router + TanStack Query
- ✅ `AppLayout` / `Sidebar` / `Header` — the sidebar exists **once**
- ✅ `projects-list.html` → `ProjectsListPage.tsx`
- ✅ `scripts/import-ledgers.ts` — JSON → reviewable SQL
- ✅ Vitest suite pinning `smartAction`

**Verified 2026-08-09, not assumed:**

- `bun test` — 13 pass, and **proven**: the `pre`/`production` ordering in
  `stageFromPhase` was deliberately swapped, 3 tests went red (including
  "Pre-Production" misclassifying as `production`, which would have shown the
  wrong next-step button on every project still in prep), then restored.
- `tsc --noEmit` clean on both halves; `vite build` succeeds.
- Worker running locally: `/api/health` returns
  `{ok, frappeConfigured: true, dbBound: true}`.
- `/api/projects` returns **32 projects from the live ERPNext site**, with
  phase, progress and smartAction all computed — matching the count from
  `frappe-ctl`.
- `/api/project-expenses` round-trips a real write through D1, and Zod rejects
  a bad payload with field-level 400s.
- UI loaded in a browser: 32 rows, ₹ lakh-grouped formatting, status badges,
  progress bars, working dark-mode toggle, zero console errors.

### Toolchain landmines found while doing this

1. **Wrangler will not run under Bun.** It exits with "Wrangler does not
   support the Bun runtime". Node 24.19.0 LTS was installed on the Windows side
   to fix this — use `npx wrangler`, never `bunx wrangler`.
2. **Vitest will not run under Bun on Windows** — its forked worker dies with
   `TypeError: File URL path must be an absolute path`. The backend suite uses
   `bun test` (`bun:test` imports) instead.
3. Because tests import `bun:test`, whose globals collide with
   `@cloudflare/workers-types`, `tsconfig.json` type-checks `src` only. Tests
   are checked by running them.

---

## Phase 2 — prove the tests, then the money routes ✅

- ✅ Break `smartAction.ts` deliberately, watch the suite go red, restore
- ✅ `lib/invoiceNumber.js` → port **with tests first** (12 tests), then proven:
  dropping the `+ 1` on both sequences turned 6 tests red — the first invoice
  of a year would have been numbered `_00_` and the second would have
  collided. Restored.
- ✅ `lib/invoiceHtml.js` → port, markup and CSS byte-identical
- ✅ `routes/brand.js` → D1-backed, nested `address`/`bank` shape preserved so
  the renderer and the designer see the same contract as before
- ✅ `buildPayQr` → `lib/payQr.ts`, **switched from PNG to SVG**
- ✅ `routes/invoices.js` → `routes/invoices.ts` — all 8 handlers
- ✅ `invoices.html` → `features/invoices/InvoicesListPage.tsx`

Three deliberate departures from the original page, all recorded rather than
silent:

1. **Dropped the "select all" checkbox column.** It was Alpine demo code bound
   to nothing — there were no bulk actions to select *for*.
2. **The empty row-menu column is now a working Print link**, pointing at the
   branded print route ported above. The old page had the column but never
   filled it.
3. **Added search, a status filter, and totals.** The old page rendered all 47
   rows with no way to narrow them. Totals follow the current filter, and
   **exclude cancelled invoices** — they have been reversed in the ledger, so
   counting them overstates both figures. A note under the tiles says so
   whenever any are hidden from the totals.

Also reconciled `StatusBadge`: the old app had two independent copies of
`statusBadgeClass`, and they had drifted — the projects table rendered Draft
grey while the invoices table rendered it blue. One mapping now, invoice
colours winning.

### Verified against the live site

- `bun test` — 25 pass across 2 files; `tsc --noEmit` clean.
- `/api/invoices` returns **47 invoices**, matching the live count.
- `/api/invoices/service-items` returns 265 catalogue items.
- `/api/brand` round-trips from D1 with the nested shape intact.
- `/api/invoices/SINV-26-00047/print` renders 12 KB of HTML; loaded in a
  browser, the **UPI QR decodes at 200×200**, bank block, line items, totals
  and balance (₹10,000.00) all correct.
- Every money guard rail holds: re-submitting → 400, editing a submitted
  invoice → 400, amending without a reason → 400 field error, empty items →
  400, zero-qty line → 400.
- **Invoices page loaded in a browser**: 47 rows, 47 working Print links, status
  filter narrowing to 10 Paid, outstanding column flipping green at zero. No
  app console errors (only Vite's HMR socket).
- **Independent cross-check on the money.** The page's own totals —
  ₹7,32,724 billed / ₹5,62,450 outstanding — match, to the rupee, the figures
  computed straight from `frappe-ctl` earlier via a completely separate path
  (CLI → JSON → PowerShell sum, versus Worker → React). Two routes to the same
  number is the strongest evidence available that the port didn't quietly
  change any arithmetic.

### Deliberately not done

- **No invoice was created against the live site.** Create / submit / amend are
  unverified end-to-end because exercising them writes into the studio's real
  accounting system. They need a test invoice on a throwaway customer, run
  knowingly.
- `POST /api/invoices/:name/payment` returns **501**. The old app delegates it
  to `routes/payments.js`, which is still *untracked in git* there despite
  being mounted — in-flight work, not settled behaviour. Porting it half
  understood is exactly the wrong move for the one route that writes to the GL.

### Note carried forward

The `qrcode` package's `toDataURL()` produces a PNG through `pngjs`, which
needs Node's zlib and stream — unavailable on Workers. `payQr.ts` uses
`toString({type:'svg'})` instead and wraps it as a data: URL, so the
`<img src>` in the template is unchanged. This was the exact risk flagged
before the migration started; it is resolved, and it also prints sharper.
`nodejs_compat` is enabled in wrangler.toml.

---

## Phase 3 — the rest of the ERPNext-backed routes 🔨

Too large for one pass, so split. **3a is the read surface** (done); **3b is the
big stateful files**; **3c is the pages**.

### 3a — read surface ✅

- ✅ `vendors.js` → `vendors.ts`
- ✅ `equipment.js` → `equipment.ts`
- ✅ `inventory.js` → `inventory.ts`, including the file-attachment join and the
  authenticated download proxy
- ✅ `tasks.js` → `tasks.ts`
- ✅ `dashboard.js` → `dashboard.ts` + `lib/dashboardAggregate.ts`
- ✅ `salesPersons.js` + `projectTypes.js` + `projectTemplates.js` → one
  `lookups.ts` (three ~20-line files that differed only in doctype; mount paths
  unchanged)
- ✅ `cleanErrorMessage` → `lib/frappeError.ts`, now shared and tested

**Tests: 43 pass across 3 files, and proven.** Removing the cancelled-invoice
filter from the dashboard aggregate turned 2 tests red — outstanding would have
read **₹1,09,999 instead of ₹10,000**, counting a reversed invoice as money
owed. Restored.

**Verified live**, and every figure cross-checks against numbers pulled
independently through `frappe-ctl` earlier in this project:

| Endpoint | Result | Cross-check |
|---|---|---|
| `/api/vendors` | 15 | = supplier count |
| `/api/equipment` | 16 | = In-House Equipment group |
| `/api/inventory` | 209 | = 16 in-house + 193 rental-house |
| `/api/tasks` | 183 | 261 total less templates and phase headers |
| `/api/sales-persons` | 2 | — |
| `/api/project-types` | 12 | — |
| `/api/project-templates` | 2 | — |
| `/api/dashboard` | outstanding **₹5,62,450** | exact match |
| `/api/dashboard` | purchase cost **₹1,54,529** | exact match |
| `/api/dashboard` | Overdue 29 / Paid 10 / Cancelled 7 / Unpaid 1 | exact match |
| `/api/dashboard` | 32 projects, 28 open | exact match |

Note `kpis.totalBilled` (₹4,20,324) is the sum of each Project's
`total_billed_amount` rollup, which is a **different measure** from summing
Sales Invoices (₹7,32,724). Both are correct and the old app behaved the same
way; they diverge because not every invoice is attached to a project. Worth
labelling clearly whenever both appear on one screen.

### 3b — the big stateful files ✅

- ✅ `projectDetail.js` (28 KB) → `routes/projectDetail.ts` + `lib/projectFinance.ts`
- ✅ `projectCrew.js` → D1-backed `routes/projectCrew.ts` (a projectDetail dependency)
- ✅ `payments.js` → `routes/payments.ts` + `lib/paymentRules.ts` (T-021)
- ✅ `payables.js` → `routes/payables.ts` + `lib/payablesAggregate.ts`
- ✅ `insights.js` → `routes/insights.ts`
- ✅ `clients.js` → `routes/clients.ts`

#### payables, insights, clients

**92 tests pass, and proven.** Changing the owner check from `supplier` to
`supplier_name` turned 2 tests red: "owed to others" jumped from ₹3,000 to
₹25,000, i.e. the owner believing he owed external crew money that is actually
owed to himself. Note those two ERPNext fields are usually identical, so that
bug would have looked correct until the day it didn't.

**Removed a duplicated money rule.** The commission formula was written out
twice in the old app — in `projectDetail.js` and again in `payables.js`, whose
comment admitted it was "copied here rather than reinvented". Both callers now
share `computeCommission()` in `lib/projectFinance.ts`.

**Insights links were rewritten.** The old cards pointed at page filenames
(`tasks-kanban.html`, `invoices.html`), which don't exist in an SPA. They now
point at StudioOS routes. Cards whose destination isn't built yet still carry
the route, so the router 404s rather than silently doing nothing.

**Verified against the live site**, and payables reproduces the old repo's own
T-014 record exactly — RELAY.md logged "33 POs, ₹58,600 owner / ₹90,929 others"
and flagged PINV-26-00017:

| | Result | Cross-check |
|---|---|---|
| `/api/payables` | 33 POs, **₹90,929** others / **₹58,600** owner | exact match to T-014 |
| `/api/payables` | PINV-26-00017 conflict-flagged | exact match to T-014 |
| `/api/insights` | 3 cards: 132 overdue tasks, 30 overdue invoices, 21 stale projects | — |
| `/api/clients` | 19 clients, receivables sum **₹5,62,450** | exact |
| `/api/client/:name` | Magic Peacock Studio: 11 invoices, 8 projects, ₹2,06,850 | 8 projects matches dashboard topCustomers |

**Four independent code paths now agree on ₹5,62,450** outstanding — the
dashboard aggregate, the invoices page, the clients directory, and the insights
card. Each computes it differently from different queries.

Commission reads ₹750 against T-014's ₹250. Not drift in the port: RELAY.md
itself records it moving to ₹800 on 2026-07-27 from new PROJ-0034 data, and
billed amounts have changed again since. The formula is shared and tested.

**One apparent discrepancy, chased and explained.** Insights reported 30 overdue
invoices where the dashboard had said 29. `SINV-26-00047` was due 2026-08-09 and
ERPNext flipped it Unpaid → Overdue overnight; Unpaid went 1 → 0. Both readings
were correct when taken, and the ₹5,62,450 total is unchanged because both
statuses count as outstanding.

#### payments (T-021)

First committed in the old repo before porting, so there was a settled
reference: branch `feat/record-payments`, commits `16ac690` (feature) and
`8f642c2` (docs). The old working tree is now clean.

Draft-first preserved exactly: `POST /api/invoices/:name/payment` only ever
creates `docstatus: 0`. Nothing reaches the ledger until the separate,
confirm-gated `POST /api/payments/:name/submit`.

10 tests on `validatePayment`, **proven**: changing the ceiling from
`outstanding` to `grand_total` — a realistic confusion between an invoice's
total and its remaining balance — turned the over-allocation test red. On
SINV-26-00002 that would have allowed ₹1,10,000 against a ₹55,000 remaining
balance, double-charging the client.

Verified live (read-only): deposit accounts return Kotak Bank + Cash (the
T-021 `account_type: 'Bank'` prerequisite is in place), 6 modes of payment,
and every guard rail rejects — over-allocation, zero, negative, unknown
deposit account, missing mode, already-submitted.

> **Incident, 2026-08-09.** While testing guard rails I assumed
> `SINV-26-00003` was cancelled. It was not — submitted, ₹14,000 outstanding —
> so the request was valid and created a real draft Payment Entry
> (`ACC-PAY-2026-00019`, ₹100) plus its Timeline comment. Both were deleted and
> the invoice verified unchanged (`modified` still 2026-05-27, outstanding
> still ₹14,000).
>
> Two things this proves. First, **draft-first is why this was recoverable** —
> nothing touched the general ledger, and a draft can simply be deleted. That
> design decision earned its keep. Second, **negative-path tests against a live
> financial system need a fixture whose state has been confirmed first**, not
> one assumed from memory. Create/submit/amend on both invoices and payments
> remain unverified end-to-end for exactly this reason; they need a throwaway
> customer, deliberately set up.

**This GET writes, deliberately.** The aggregate auto-ticks milestone tasks,
renames legacy task subjects, creates "Vendor Payment Made" when vendor
involvement first appears, and syncs the derived project status back to
ERPNext. That was true of the original and is preserved — the sync is what
keeps status honest without anyone remembering to click. Every write is
best-effort: a failure is logged and the page still renders.

**Tests: 68 pass across 4 files, and proven.** Removing the `hasActivity`
guard turned a test red showing that every untouched project would be marked
Complete — and since this route writes status back, that is data corruption on
the live site, not a display bug. Restored.

The rules pinned are the ones that are *vacuously true* in an edge case, since
those fail silently and in the wrong direction:

- an untouched project must not count as complete
- `crewFullyPaid` is trivially true with no crew — hence `noCrewAssigned`
- Draft invoices are not money owed
- "planned" is never back-filled from "actual"
- percentages return null rather than dividing by zero on an unsanctioned project

**Verified against live projects:**

| | Result | Cross-check |
|---|---|---|
| PROJ-0003 | ₹1,10,000 billed, **₹55,000 outstanding**, 2 payments, 0 purchases | matches the original July analysis exactly; the purchase is absent because `PINV-26-00002` is cancelled |
| PROJ-0034 | 3 roster entries, vendor involvement detected, Crew planned ₹5,000 / Vendor ₹3,400 / Transport actual ₹1,250 | planned-vs-actual split correct, and "never back-fill" visible (Transport planned 0) |
| PROJ-0031 | tasksRemaining 0 but `ready=false`, client owes ₹5,000 | completion correctly blocked on payment |

**No live data was mutated.** After hitting three real projects, every Task and
Project `modified` timestamp is still May or July — the sync found everything
already in its desired state. That is itself evidence the port agrees with what
the old app had already written; a disagreement anywhere would have produced a
write with today's date.

### 3c — pages ✅ (one optional item deferred)

- ✅ `DashboardPage` now uses the real `/api/dashboard` + `/api/insights`,
  with a Chart.js billed/collected/overdue bar chart
- ✅ `payables.html` → `features/payables/PayablesPage.tsx`
- ✅ `tasks-kanban.html` → `features/tasks/TasksKanbanPage.tsx`
- ✅ `client-list.html` → `features/directory/ClientsPage.tsx`
- ✅ `vendors-list.html` → `features/directory/VendorsPage.tsx`
- ✅ `inventory.html` → `features/directory/InventoryPage.tsx`
- ✅ `project-detail.html` → `features/projects/ProjectDetailPage.tsx` +
  `detailTabs.tsx` — six tabs (Checklist, Money, Expenses, Crew, Docs,
  Activity), reached by clicking a project name on the list

The page leads with a **completion banner** that names the specific blockers
rather than just showing a status, because completion is derived and the owner
otherwise has no way to see *why* a project isn't done. On PROJ-0003 it reads:
"28 tasks still open · client owes ₹55,000 across 1 invoice", plus the
`noCrewAssigned` note — "no crew is on the roster, so 'crew paid' can't be
confirmed" — which is the UI surfacing the vacuous-truth guard from
`projectFinance.ts`.

Checklist rebuilds ERPNext's phase grouping from `lft` ordering and `is_group`
headers rather than flattening the list.

**Verified in a browser on PROJ-0034, and the arithmetic reconciles end to end:**

| Figure | Value | Reconciles as |
|---|---|---|
| Budget remaining | ₹9,750 | ₹11,000 sanctioned − ₹0 spend − ₹1,250 expenses |
| Commission | ₹500 | 5% of ₹10,000 billed |
| Profit | ₹9,250 | ₹11,000 − ₹500 − ₹1,250 |
| Production ceiling | ₹8,300 | leaves exactly the 20% (₹2,200) target |
| Crew/Vendor planned | ₹5,000 / ₹3,400 | matches the 3 roster entries |
| Transport | planned ₹0, actual ₹1,250 | the "never back-fill" rule, visible in the UI |

**One security fix, not a port.** The Activity timeline renders note content as
HTML — that is how the struck-through edit history displays. The old app
escaped the *superseded* text but stored the *new* text raw, so a note
containing markup was an injection vector. Both legs are now escaped on write
in `projectDetail.ts`; only the `ch-hist` wrapper the server generates is real
markup. Existing notes written by the old app are unaffected and still render
as before.

**Note on refetching.** `GET /api/project/:name` has side effects — it syncs
milestone tasks and project status back to ERPNext. The query therefore sets
`refetchOnMount: false` and a 60s `staleTime`, so idly revisiting the page
doesn't re-run those writes.
- ⬜ `equipment-catalogue.html` — largely subsumed by Inventory (same Item
  doctype, narrower filter). Worth confirming with the owner whether it still
  needs to exist separately before rebuilding it.

Shared UI extracted along the way: `PageHeader`, `StatTile`, `Card`,
`TableShell` — so the eight pages share one header, one tile, one card and one
table shell instead of eight copies.

**Verified in a browser, all figures matching their endpoints:**

| Page | Result |
|---|---|
| Dashboard | Chart renders; ₹5,62,450 outstanding, ₹2,65,795 margin (63%), 32 projects / 28 open; 3 insight cards |
| Payables | 7 supplier cards; owner row carries a **"you"** badge; conflict banner names PINV-26-00017 with the "never netted out" explanation; expanding Chaitanya Dahake shows all 15 bills |
| Tasks | 5 columns — Open 9, Working 0, Pending Review 0, Overdue 132, Completed 42 = **183 cards**, matching `/api/tasks` exactly; 132 overdue matches the insights card |
| Clients | 19 clients, 12 owing, **₹5,62,450** receivable |
| Vendors | 15 suppliers, group filter |
| Inventory | 209 items, 16 in-house, 0 out of service, per-item document links |

No app console errors (only Vite's HMR socket). `tsc` clean, production build
succeeds.

**Two notes carried forward:**

1. **Bundle is 548 KB (176 KB gzipped)** and Vite warns about it — Chart.js is
   most of it. Not a problem at this scale (the old app shipped a 152 KB
   stylesheet and 100–245 KB per page), but the fix when it matters is a
   dynamic import of the chart, not a different chart library.
2. **A Tailwind trap worth remembering.** `StatTile` was first written with
   `xl:col-span-${span}`. Tailwind only emits classes it finds as literal
   strings, so that class would have been purged and every tile would have
   silently gone full-width. Grid widths are now spelled out in a lookup map.
   Any interpolated class name in this codebase is a bug.

---

## Phase 4 — the remaining D1-backed routes ✅

- ✅ `studioRental.js` → `routes/studioRental.ts` + `lib/rentalBilling.ts`
- ✅ `transactions.js` → `routes/transactions.ts`
- ✅ `subscriptions.js` → `routes/subscriptions.ts`
- ✅ Pages for all three, wired into the sidebar (11 nav items now)
- *(`projectCrew.js`, `brand.js` and `clients.js` were done earlier — in
  Phase 2 and 3b respectively.)*

**All 22 old routes are now ported.** 17 route files plus three consolidated
into `lookups.ts`.

### Two bugs found and fixed rather than ported

1. **`parseTimeToHours` accepted impossible times.** Its regex allowed any one-
   or two-digit hour, so `"25:00 am"` parsed as hour 25 and `"6:99 am"` as
   7.65 — each producing a nonsense duration and therefore a nonsense charge,
   silently. Now range-checked to 1–12 and 0–59, rejecting rather than guessing.
   My own test caught this while porting.
2. **`rental_bookings` had no `created_at`.** The old app stamped one on
   creation; the initial schema omitted it because no *existing* booking carries
   one. Added via migration `0001`, nullable — back-filling a creation date for
   the two historical bookings would mean inventing data.

### Tests: 114 pass across 7 files, proven

Changing the hour rounding from `Math.max(1, Math.round(h))` to
`Math.floor(h)` turned 2 tests red: a 3½-hour session would bill as 3 hours,
and a 20-minute session would bill as **zero** — free use of the hall.

The rule pinned hardest is that **paid and billed are independent**. A session
can be paid in cash with no invoice raised, or invoiced and still unpaid.
`totalPending` tracks money; `unbilledAmount` tracks paperwork. The UI shows
them as two separate tiles for the same reason.

### Verified against the real seeded data

| Check | Result |
|---|---|
| Bookings / sessions | 2 bookings, **103 sessions** (87 + 16) — matches `verify-ledgers` |
| Rental payable | **₹13,550** — matches `verify-ledgers` exactly |
| Rental owed vs unbilled | ₹7,300 owed · ₹13,550 not yet invoiced — correctly different numbers |
| Transactions | 92 entries · ₹1,12,856 in · ₹38,885 out · ₹73,971 net (in + out = the ₹1,51,741 the verify script sums) |
| Subscriptions | USD $20/mo and INR ₹0/mo kept **separate** — no FX rate invented |
| Rounding, visible in the UI | 5:57–8:04 am shows *2.12h actual, 2h billed* |

`bun run ledgers:verify` still passes 10/10 after the new migration.

### Note on the roll-up

`POST /studio-rental/bookings/:id/invoice` stamps sessions with the invoice
name **only after** ERPNext confirms the invoice. If that call fails, nothing is
marked billed and the roll-up can simply be retried — the failure mode is a
retry, never a session that silently becomes unbillable.

Not exercised against the live site: it would create a real draft invoice.
Same open item as create/submit/amend elsewhere.

---

## Phase 5 — deploy 🔨 (prepared and verified; execution needs the account)

**Everything up to the Cloudflare account boundary is done and tested. The
deploy itself is not, and cannot be from here:** `wrangler login` is a browser
sign-in to the studio's Cloudflare account, which is not mine to perform.
`docs/DEPLOY.md` is the runbook — every command in order, nothing hand-wavy.

### Built and verified locally ✅

- ✅ **`scripts/verify-ledgers.ts`** — compares row counts **and money totals**
  between the source JSON and D1, exits non-zero on mismatch so it can gate the
  deploy. Proven: it caught a stray test expense on the first run, and passes
  10/10 once removed.

  | Table | Rows | Total |
  |---|---|---|
  | expenses | 0 | — |
  | crew_entries | 5 | ₹14,400 |
  | subscriptions | 2 | — |
  | transactions | 92 | ₹1,51,741 |
  | rental_bookings | 2 | — |
  | rental_sessions | 103 | ₹13,550 |
  | brand | 1 | — |

  Money totals matter more than counts here: a row count alone would not catch
  a value that imported as zero.

- ✅ **Nightly off-box backup** — `lib/backup.ts` + a `scheduled` handler, cron
  at 19:30 UTC (01:00 IST, after the working day). Dumps all seven tables to
  R2 as plain JSON, deliberately not a SQL dump, so it can be read and
  re-imported by hand with no tooling available. Verified end to end: 67,594
  bytes written, row counts matching `verify-ledgers` exactly, object confirmed
  on disk and readable.

  If the bucket isn't bound it reports **skipped** with what it would have
  written, rather than silently doing nothing — a backup that quietly fails is
  worse than none, because it is believed.

- ✅ `POST /api/admin/backup` to force a run without waiting for the cron.
- ✅ `docs/DEPLOY.md` — the runbook, including rollback and its limits.

### Needs the Cloudflare account ⬜

- ⬜ `wrangler login`
- ⬜ Create D1, paste `database_id`, apply migrations remotely
- ⬜ Seed + `ledgers:verify:remote`
- ⬜ `wrangler secret put` the two ERPNext credentials
- ⬜ Create the R2 bucket, `wrangler deploy`
- ⬜ Build and `wrangler pages deploy`
- ⬜ Routing (see the decision below), then Cloudflare Access

### Open decision: custom domain

The SPA calls `/api/*` as a same-origin relative path.

- **With a custom domain** — Pages on `studioos.yourdomain.com`, a Worker route
  for `/api/*` on the same host. One origin, no CORS, one Access application.
- **Without one** — `*.pages.dev` and `*.workers.dev` are different origins:
  CORS on the Worker, a build-time API base URL, and two Access applications
  kept in sync.

Both work. The first is materially less to get wrong.

### Note

An earlier plan said "Pages + Workers". I briefly moved toward consolidating
into a single Worker with static assets (one deploy, one origin) and backed it
out: it would have churned a working dev environment for deploy-time behaviour
that cannot be verified without the account. Worth revisiting after the first
successful deploy, not before.

---

## Phase 6 — cutover ⬜

- ⬜ Run both apps side by side; owner uses StudioOS for real work
- ⬜ Compare outputs on the same data, page by page
- ⬜ Freeze writes to the old app once parity is confirmed
- ⬜ Archive the old repo (do not delete)

---

## Then: v2

The client's actual requirements, which have not been supplied yet.
