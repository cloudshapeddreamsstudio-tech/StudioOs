# StudioOS v2 — plan for the remaining build

**Status:** draft, 2026-08-17
**Covers:** everything after Phase 5. Phases 0–5 and their verification records
stay in [`PLAN.md`](./PLAN.md) — that file is the evidence trail and is not
rewritten.

Same rules as before. Tracer-bullet phases: each ends with something that
**runs**, is verified against real data, and is committed. One phase per context
window, `/clear` between them.

Legend: ✅ done · 🔨 in progress · ⬜ not started · ⏸ deliberately deferred

---

## The three decisions this plan is built on

**1. StudioOS is a product for many studios**, not a single-user tool for CSDS.
Recorded in [`SPEC.md`](./SPEC.md) with the verification evidence.

**2. ERPNext is the only database.** No D1, no Postgres, no external store for
business data.

**3. The first release is the Projects surface only.** Everything else — every
other page, and the custom-DocType work that would have carried the non-ERPNext
data — is deferred, not cancelled.

> **A correction to the brief.** The instruction said the data currently sits in
> "an external postgres DB". It does not — the code uses **Cloudflare D1**
> (SQLite), and there is no Postgres anywhere in the source. The decisions are
> unaffected; the work below is written against D1, which is what actually
> exists.

### Why decision 3 changes so much

Six routes read or write D1: `brand`, `projectCrew`, `projectExpenses`,
`studioRental`, `subscriptions`, `transactions`. **None of them is the Projects
list.** `routes/projects.ts` is pure ERPNext already, built and verified in
Phase 1 against 32 live projects.

So the first release does not need a database of ours at all. It does not need
`studioos_core`, custom DocTypes, a data migration, or the retired ledger
scripts. That entire body of work moves behind the release rather than in front
of it — which is exactly why deferring it is the right call and not just a
smaller one.

### The one place the slice runs into the deferred work

`projectDetail.ts` reads the crew roster and project expenses from D1 and feeds
both into `projectFinance.ts`. They are inputs to real money figures:

> Budget remaining ₹9,750 = ₹11,000 sanctioned − ₹0 spend − **₹1,250 expenses**

Drop those inputs silently and the page shows ₹11,000 remaining on a project
where ₹1,250 has been spent. That is a wrong number presented confidently,
which this project has a standing rule against. Phase 7b below handles it by
**declaring the gap in the UI and suppressing the derived figures that depend on
it**, rather than computing them from missing data.

---

## Phase 6 — sign in with ERPNext ⬜

Auth first, before any feature work. The connector half is built and tested;
this is the StudioOS half.

**Why this order is the right one.** Every route currently runs on a single
ERPNext admin key. Build features first and you write them against that key,
then retrofit per-user tokens afterwards and re-verify everything you just
built. Doing auth first means the Projects work in Phase 7 is written against
per-user tokens from its first line, and is never tested twice.

It also costs nothing in provable progress: the projects list already exists and
works from Phase 1, so there is a real page to prove sign-in against on day one.

### 6a — shrink the surface first ✅

Do this before touching auth. It is small, and it makes the rest of the phase
dramatically cheaper — swapping the god-key across **two** routes instead of
twenty-two.

- ⬜ Mount **only** the Projects routes in `src/index.ts`. The other route files
  stay in the repo, unmounted — they are finished work waiting for their phase,
  not dead code
- ⬜ Sidebar reduced to what actually ships; no nav item leads to a page that is
  not in this release
- ⬜ Remove the D1 binding from the Worker
- ⬜ `/api/health` reports `frappeConfigured` only; `dbBound` is gone

**Done when** the Worker runs with no `DB` binding at all and the projects list
still renders 32 live projects — the Phase 1 result, reproduced with the
database removed.

#### Verified 2026-08-17, not assumed

| Check | Result |
|---|---|
| `tsc --noEmit` backend | clean |
| `bun test` | **114 pass**, 0 fail, 7 files — untouched by the change |
| `vite build` | succeeds |
| `/api/health` | `{"ok":true,"frappeConfigured":true}` — no `dbBound` |
| `/api/projects` | **200, 32 projects**, phase / progress / smartAction intact |
| Unmounted routes | `/api/dashboard`, `/api/invoices`, `/api/transactions`, `/api/project/:name` all **404** |
| Browser, `/projects` | 32 rows, sidebar shows **Projects only**, `/` redirects to `/projects`, zero console errors |
| Browser, `/projects/PROJ-0034` | "Not in this release", naming the plan |

**Bundle dropped 548 KB → 362 KB** (176 → 114 KB gzipped). Chart.js left with
the dashboard route, which resolves the size note carried from Phase 3c without
anyone optimising anything.

#### One refactor this forced, and it was overdue

`lib/invoiceHtml.ts` and `lib/payQr.ts` imported the `BrandConfig` **type** from
`routes/brand.ts` — so two renderers depended on a route, and through it on the
database client. Excluding the route from type-checking could not work while
that held. `BrandConfig` moved to `schemas/brand.ts`, where it belonged;
`routes/brand.ts` re-exports it so nothing else changed.

#### The exclusion list is transitive, and that was not obvious

`routes/invoices.ts` had to be excluded too. It calls `readBrand()`, so the
invoice print route is D1-backed even though invoices themselves are pure
ERPNext. Found by `tsc --explainFiles` rather than by reading imports — worth
remembering when Phase 10 re-mounts things.

Everything else unmounted — payables, clients, tasks, dashboard, vendors,
equipment, inventory, insights, lookups, customers — plus every tested pure
lib stays type-checked, so it cannot rot while it waits.

### 6b — the sign-in flow 🔨

- ⬜ **Tenant registry on Cloudflare KV.** Binding `TENANTS`; key is the
  normalised site domain; value is JSON carrying the issuer, `client_id`, the
  **encrypted** `client_secret` and a created timestamp
- ⬜ Encrypt the client secret at application level with `REGISTRY_KEY` before
  writing. Cloudflare encrypts KV at rest, but anyone holding an API token for
  the namespace can read the values — the secret must not be one of them
- ⬜ `GET /auth/start` — read the site's `/.well-known/openid-configuration`,
  redirect with PKCE
- ⬜ `GET /auth/callback` — exchange the code, call `userinfo`, set the session
- ⬜ `POST /auth/logout` — hit the site's revocation endpoint
- ⬜ Encrypted, stateless session cookie carrying tenant, user and refresh token
- ⬜ Silent refresh when the access token expires mid-session

Use `oauth4webapi` — standard OIDC, runs on Workers. Do not hand-roll it.

#### Done so far, verified 2026-08-17

`lib/tenants.ts` (registry on KV, secrets encrypted), `lib/crypto.ts` (shared
AES-GCM), `lib/session.ts` (the sealed round-trip cookie) and `routes/auth.ts`
with `POST /auth/register` and `GET /auth/start`. **139 tests pass.**

Proven against the bench, with `oauth_connector` installed from GitHub:

| Check | Result |
|---|---|
| `POST /auth/register` | 200, tenant stored; **401 on a wrong shared secret** |
| `GET /auth/start?site=localhost:8000` | **302** to the site's own authorize endpoint |
| Redirect params | `client_id`, `redirect_uri`, `response_type=code`, `scope=openid all`, `code_challenge` + `S256`, `state` |
| Cookie | `HttpOnly; SameSite=Lax; Max-Age=600`, contents sealed |
| No site / empty / unregistered / `ftp://` | 400 / 400 / **404 with a fix hint** / 400 |

The `originForHost` rule was proven by breaking it: swapping the fixed host list
for "http if it has a port" turned a test red showing
`http://erp.example.com:8443` — a self-hosted studio's client secret and
authorization code on the wire in clear text.

#### Two Frappe-specific traps, both found by running it

1. **`oauth4webapi` refuses plain HTTP outright.** Correct, and it blocks the
   dev bench. Waived through `allowsInsecureTransport()`, a **fixed host list**
   — never inferred from the URL, so a customer site can never reach that path.
   Tested that `localhost.evil.com` does not qualify.
2. **Discovery must follow redirects; the token exchange must not.** Behind
   Frappe Cloud's nginx `/.well-known/openid-configuration` returns 200
   directly, but a bench's own dev server **301s** it to
   `/api/method/frappe.integrations.oauth2.openid_configuration`, and
   `oauth4webapi` fetches with `redirect: 'manual'`. A custom fetch follows
   redirects for discovery only — it is an unauthenticated GET of a public
   document. Following one on the token exchange could leak the code or client
   secret to whatever host the redirect names.

Local dev needs `host_name` set on the bench site (`ezsandesh.dev` now has
`http://localhost:8000`), because the discovery document's `issuer` must match
the origin it was fetched from, and `ezsandesh.dev` does not resolve from
Windows.

#### Sign-in proven end to end, 2026-08-17

Against `studio.os` (ERPNext installed), with `oauth_connector` installed from
GitHub:

```
/auth/start           302 → the site's authorize endpoint, PKCE S256 + state
login on their site   200
consent screen        200 — "StudioOS wants to access…", Allow / Deny
approve               302 → /auth/callback?code=…&state=…
/auth/callback        302 → /projects
                      studioos_auth cleared, studioos_session set (14 days)
/auth/me              {"host":"localhost:8000","user":"studioos-test@example.com"}
/auth/me (no cookie)  401
/auth/logout          {"signedOut":true}, cookie cleared, /auth/me then 401
```

The callback validated `state`, exchanged the code with the PKCE verifier, and
resolved identity from the site itself. **No password ever reached StudioOS.**

#### Four traps, all found by running it

1. **`oauth4webapi` refuses plain HTTP.** Waived only via `allowsInsecureTransport()`,
   a fixed host list, never inferred — `localhost.evil.com` does not qualify.
2. **Discovery must follow redirects; the token exchange must not.** Frappe Cloud
   returns 200 on `/.well-known/openid-configuration`; a bench dev server 301s
   it, and the library fetches with `redirect: 'manual'`.
3. **Do not request the `openid` scope.** Frappe signs ID tokens with **HS256**,
   symmetric, and `oauth4webapi` verifies asymmetric signatures only — an ID
   token in the response fails validation and breaks every sign-in. Identity
   comes from `frappe.auth.get_logged_user` on the token instead, which is a
   stronger claim: the site answering about the token we actually hold.
4. **Frappe shows a consent screen** (`skip_authorization` is 0), which POSTs to
   `oauth2.approve` with a CSRF token. The flow is authorize → consent →
   approve → callback, not authorize → callback.

#### One long detour worth not repeating

Hours went into "web login is broken" on `ezsandesh.dev`: credentials verified
in `bench console` but `POST /api/method/login` returned 401 for every account.
The cause was that **`default_site` had changed to `studio.os`**, so
`localhost:8000` was serving a different site from the one where the users and
OAuth client had been created. `find_by_credentials` was right — those accounts
genuinely did not exist there.

**Check `sites/common_site_config.json` `default_site` before trusting anything
served on `localhost:8000`.**

Still to do in 6b: silent refresh when the access token expires mid-session.
Then 6c, the god-key swap.

### 6c — swap the god-key ✅

- ⬜ Every ERPNext call uses the signed-in user's token
- ⬜ `FRAPPE_API_KEY` / `FRAPPE_API_SECRET` deleted, **not kept as a fallback**.
  A fallback that silently engages when a token expires would restore full
  admin access to every user without anyone noticing

**Done when** you sign in against `cloudshapeddreamsstudio.m.erpnext.com` with
your own ERPNext account and the projects list renders 32 projects with no admin
key configured anywhere.

**The verification that actually matters**, and it has two halves because this
release writes as well as reads. Create a second ERPNext user with a restricted
role, sign in as them, and confirm:

1. **Read** — they see less than the owner does.
2. **Write** — their attempt to edit a project is refused **by ERPNext**, while
   the project manager's succeeds, on the same build, with **zero permission
   code in StudioOS**.

The write half can be proved through the API directly — `POST /api/projects` and
`PUT /api/projects/:name` already exist, so this does not wait for the forms in
Phase 7.

If either half fails, the premise of the whole design is wrong, and it is far
better to learn that here than after a customer. The write half is the stricter
test: a read leak is a bug, an unauthorised write is data corruption in the
studio's real accounting system.

#### Done and proven, 2026-08-17

`middleware/requireSession.ts` gates every `/api/*` route: it opens the session,
looks the studio up in the registry, refreshes the access token **before** the
call if it is close to expiry, and hands the route a Frappe client bound to that
user's bearer token. `createFrappeClient` now takes an origin and an auth header
rather than `Env`; all 16 route files were converted.

The admin key is **gone**, not disabled: no `FRAPPE_API_KEY` or
`FRAPPE_API_SECRET` in `src/`, in `wrangler.toml`, or in `.dev.vars`.

| Check | Result |
|---|---|
| `/api/health` | `{"ok":true,"registryBound":true,…}` — no credentials needed |
| `/api/projects` with no session | **401** `signInRequired: true` |
| Sign in, then `/api/projects` | **200** |
| Same endpoint as a user without the Projects role | **403**, ERPNext's own message |

Refresh happens *before* the call, never as a retry after a 401: replaying a
POST that may already have been applied is how duplicate invoices get created.

#### The acceptance test, in full

On one build, one endpoint, two signed-in people:

- **Projects Manager** → 200
- **Editor with desk access but no Projects role** → 403, *"does not have
  doctype access via role permission for document Project"*

**StudioOS contains no permission code.** ERPNext made both decisions.

#### Three findings that cost real time

1. **`System Manager` does not grant Project access.** The first signed-in
   request 403'd until the user was given `Projects Manager`. Correct behaviour,
   and a good reminder that role names are not intuitions.
2. **`OAuth Client.allowed_roles` defaults to `Desk User`, and an empty list
   rejects everyone.** `validate_client_id` calls `user_has_allowed_role()`,
   which intersects the client's allowed roles with the user's. A user with no
   roles is refused with **"Invalid client_id"** — an error that blames the
   client, not the user. This is a real onboarding trap: a studio's brand-new
   employee cannot sign in, and the message sends you debugging the wrong thing.
   **`oauth_connector` should make `allowed_roles` configurable**; today it
   accepts Frappe's default, so only desk users can sign in.
3. **The schema assumption bit immediately.** The very first cross-site request
   failed with `Field not permitted in query: custom_sales_person`. Eight custom
   fields on `Project` exist on the CSDS site and on no other. They had to be
   created on `studio.os` by hand to get past it — which is precisely the
   normalisation job Phase 8 defers, now with a concrete field list:
   `custom_brand`, `custom_sales_person`, `custom_ad_agency`,
   `custom_production_house`, `custom_poc`, `custom_shoot_date`,
   `custom_commission_percent`, `custom_sanction_amount`.

Still to do in 6b/6c: nothing blocking. The frontend does not yet handle the
401 `signInRequired` response — that is 7a.

### 6d — what may this user do? ⬜

The capability query the Phase 7 interface will be built on.

- ⬜ Ask ERPNext what the current user may do with `Project`, rather than
  inferring it from a role name. Role names differ between sites; permissions do
  not
- ⬜ Expose it to the frontend as part of the session

> The exact ERPNext call for reading a user's effective permissions has not been
> verified yet. Confirm it against the live site before building on it, the same
> way the OAuth endpoints were confirmed rather than assumed.

### Session state — the one exception to "ERPNext only"

Sessions can be stateless: an encrypted signed cookie carries everything.

The **tenant registry** cannot. Mapping `moonlightfilms.erpnext.com` to its
client ID and secret has to persist somewhere we can read *before* we are able
to talk to that site. It is a few fields per customer.

**Decided 2026-08-17: Cloudflare KV.** It is the smallest thing that works,
needs no schema or migrations, and reads fast at the edge where the Worker
already runs.

> **KV is eventually consistent, and that has one real consequence.** A write is
> not guaranteed to be visible from every location immediately — propagation can
> take up to about a minute. That is harmless for sign-in, where the tenant was
> registered long before. It is **not** harmless for the zero-paste onboarding in
> Phase 8, where the connector registers a studio and the owner clicks "sign in"
> seconds later: the read can miss the write it just made.
>
> The fix is to not rely on reading it back. The onboarding response carries the
> tenant forward directly into the sign-in redirect, so the first sign-in never
> depends on KV having propagated. Design it that way from the start rather than
> discovering it as an intermittent bug that only appears for new customers —
> the worst possible group to have it appear for.

---

## Phase 7 — the Projects slice ⬜

The first release's actual surface, written on per-user tokens from the start.
Nothing outside Projects ships.

### 7a — projects list on per-user tokens ✅

- ✅ The list renders for a signed-in user rather than for an admin key
- ✅ A sign-in screen: the studio's address plus **Sign in with ERPNext**, with
  no sidebar or header, because there is nothing to navigate to until we know
  which studio this is
- ✅ `RequireSession` checks once at the router, so a signed-out visitor is
  redirected rather than every page discovering its own 401
- ✅ The header names **both the person and the studio**, with sign out
- ✅ A refusal reads as a refusal, not a fault

**Done when** two users of different permission on the same studio both load the
page and each sees their own correct result.

#### Verified in a browser, 2026-08-17

| | Result |
|---|---|
| Signed out, open `/projects` | redirected to `/sign-in` |
| Sign-in screen | address field + "Sign in with ERPNext", matching the mockup |
| Unknown studio | back to `/sign-in` with the reason, the hint, **and the address preserved** |
| `ftp://` address | back to `/sign-in` with "must be http or https" |
| Sign in from the form | consent → approve → `/projects`, 4 rows |
| Header | `studioos-test@example.com · localhost:8000 · Sign out` |
| Sign out | session cleared, back to `/sign-in` |
| Signed in as a user without the Projects role | see below |

The restricted user sees, in the table body rather than in red:

> **You don't have access to this in ERPNext.**
> Your ERPNext roles decide what StudioOS can show you. Ask whoever administers
> your studio's ERPNext to grant access.

**That distinction is the point of the phase.** A 403 here is the permission
model working exactly as designed — StudioOS deliberately has none of its own.
Rendering it beside "is the API Worker running?" would have every studio
reporting it as a bug, and would push owners toward handing out broader ERPNext
roles just to make an alarming red message disappear. The failure StudioOS must
never cause is a studio widening its own permissions because our UI looked
broken.

#### Three things this needed that were not obvious

1. **`/auth` has to be proxied in dev too.** Only `/api` was. Sign-in is a
   browser *navigation*, not XHR, so `/auth/start` was hitting Vite and 404ing.
2. **`/auth/start` must not answer a browser with JSON.** Its failures now
   redirect back to `/sign-in` carrying the message — a raw `{"error":…}` is a
   dead end with nothing to click.
3. **Sign-in has to land on the UI origin.** The callback redirected to a
   relative `/projects`, which resolves to the API origin; correct once 9b puts
   both on one host, a 404 in development. `APP_UI_ORIGIN` makes it explicit.

Signing out clears the whole query cache, not just the session: the cache holds
one studio's projects, and the next person to sign in on that browser must not
be shown them while their own request is still in flight.

### 7b — project detail, honest about what is missing ✅

- ⬜ Four tabs ship as-is: **Checklist, Money, Docs, Activity** — all pure ERPNext
- ⬜ **Crew** and **Expenses** tabs show an explicit "not in this release" state.
  Not hidden, not empty-looking — named, so nobody reads absence as zero
- ⬜ `projectFinance.ts` gains an explicit "inputs unavailable" path. Any figure
  derived from crew or expenses returns **null and renders as "—"**, never as a
  number computed from missing data
- ⬜ The completion banner keeps working: it already handles `noCrewAssigned` as
  a vacuous-truth guard, and this is the same class of problem

**Done when** PROJ-0034 renders with Budget remaining shown as unavailable
rather than as ₹11,000, and a note names why. Verified in a browser.

**Test first, then prove it.** Add a test asserting that a missing-expenses
input yields null rather than a number, then break it to return the sanctioned
amount and watch it go red. That is the exact bug this guard exists to prevent.

#### Done and verified, 2026-08-17

`null` now travels from the route, through `projectFinance.ts`, into the types,
and out to the screen. **145 tests pass.**

Proven by breaking it: replacing the null-guard on `remaining` with
`(input.expenseTotal ?? 0)` — the change any future reader would think harmless
— turned the test red. Restored.

| On PROJ-0001 | Value |
|---|---|
| `crewRoster` / `expenses` | `null`, with an `unavailable` block naming both |
| `finance.remaining` | **null**, not ₹1,10,000 |
| `expenseOverview.plannedTotal` / `actualTotal` | null / null |
| `margin.profitPlanned` / `profitActual` | null / null |
| `completion.noCrewAssigned` | **false** — the roster is unseen, not empty |

In the browser: Money shows **"Budget remaining — Needs expenses"**, Expenses
shows Production and Profit as dashes with an explanation, and Crew says the
rosters are not in this release, spelling out that this is *not* an empty list.

#### The bug the browser caught that the tests did not

The first pass made every **planned** figure nullable and left the **actual**
column alone, on the reasoning that actuals come from purchase invoices and are
therefore known. The page then displayed **Profit ₹1,04,500, 95%** — a
confident, wrong, flattering number.

Logged expenses are actual spend too. Totalling only the visible part
understates spend and so overstates profit, in the one direction that makes an
owner comfortable. `actualTotal`, `profitActual`, `profitActualPercent` and
`meetsTargetActual` are now null when expenses are unavailable, with a note on
the page saying why. Two tests pin it.

**This is the argument for looking at the page.** Every test passed, types were
clean, and the screen still told the owner something untrue.

#### Two traps worth remembering

1. **`formatCurrency(null)` returns ₹0.** All the care taken in the backend is
   undone in the last inch before the screen unless a dash-aware formatter is
   used. `formatCurrencyOrDash` exists for exactly this, and the compiler cannot
   catch its absence because the old formatter happily accepts null.
2. **Nullable beats optional in the client types.** Making `expenses: Expense[]
   | null` rather than optional made `tsc` stop at every site that would have
   treated missing as zero — it found two immediately. Leaving the types
   claiming non-null let the code compile while silently lying.

### 7c — writing back to ERPNext ✅

**The release is not read-only.** A project manager, or anyone with full access
to the studio's ERPNext, must be able to create a project and edit its details
from inside StudioOS. Most other users will only read.

The API half is already done and ported: `POST /api/projects` and
`PUT /api/projects/:name` both exist, including the deliberate rule that
**"Completed" is derived and never accepted as a manual choice** — an incoming
`status: "Completed"` is dropped on purpose. Keep that.

What is missing is the interface. There are **no forms anywhere in the frontend**
— `react-hook-form` is a dependency and is unused.

- ⬜ Create-project form — the first form in the codebase, so it sets the
  pattern for every one after it
- ⬜ Edit-project form, sharing the same schema and validation
- ⬜ Zod schema shared between form and route, so the client and server agree on
  what is valid instead of drifting
- ⬜ Surface ERPNext's own rejections usefully. `lib/frappeError.ts` already
  cleans upstream messages; a validation failure from ERPNext must reach the
  field, not collapse into a generic error

**Done when** a project is created from StudioOS by a signed-in project manager,
appears on the live site, and the round trip is confirmed in ERPNext's own UI —
using a project deliberately created for the purpose, not a real one.

#### Done and verified, 2026-08-17

`projectSchema.ts` (shared rules), `ProjectForm.tsx` (the first form in the
codebase), `formApi.ts` (pickers, mutations, error interpretation), and routes
at `/projects/new` and `/projects/:name/edit`. The customer, sales person,
project type and template pickers were re-mounted for it.

| Check | Result |
|---|---|
| Create via the form | **PROJ-0006**, landed on its detail page |
| Written as whom | `owner` and `modified_by` = **the signed-in user**, no admin key |
| Edit round trip | sanctioned ₹90,000 → ₹1,25,000 and brand changed, confirmed in ERPNext |
| Empty submit | "Give the project a name" / "Choose a client", no request sent |
| Commission 150 | "Commission is a percentage, so it cannot exceed 100" |
| Server-side too | `POST` without a name → 400 with field errors, so the client schema is a convenience and not the gate |
| Status choices | **Open / Cancelled only** — "Completed" is derived, and the server drops it anyway |
| Write by a user without the role | **403**, ERPNext's own wording, and the value was unchanged afterwards |

#### Two things found by mounting the pickers

1. **`Project Template.disabled` does not exist on stock ERPNext v15.** It is on
   the CSDS site and not on a plain one, so asking for it returned "Field not
   permitted in query: disabled" and the template picker broke entirely. The
   query now tries the richer form and falls back, so a site that *does* track
   disabled templates keeps hiding them. Same class as `custom_sales_person`,
   and more evidence for Phase 8.
2. **`Projects Manager` does not grant Customer or Sales Person access.** Two
   pickers 403'd until the test user was also given `Sales User`. Nothing was
   wrong — a project manager who cannot read Customers genuinely cannot pick
   one, which is the studio's own access model showing through. Worth knowing
   before telling a customer which roles their staff need.

#### A deliberate non-decision

The "New project" and "Edit" buttons are always shown. Whether this person may
write is ERPNext's answer, and it is given on submit rather than guessed at
render time. Hiding a control because we assume a refusal is how a UI starts
disagreeing with the system it fronts. **Reflecting real permissions is 7d**,
and it will ask ERPNext rather than infer.

### 7d — the interface reflects the signed-in user's permissions ⬜

This is what makes a mixed-role studio work. It consumes the capability query
built in 6d.

- ⬜ Hide or disable create and edit for users without write permission
- ⬜ **Never treat the hidden button as the control.** ERPNext is the authority;
  the UI only avoids offering an action that would be refused. A user who
  reaches the endpoint anyway must still be refused, by ERPNext, not by us
- ⬜ A refusal renders as "you don't have permission to change this project",
  not as a failure

**Done when** the same page, opened by two users of different permission on the
same studio, shows an Edit button to one and not the other — **without StudioOS
containing a role check**.

---

## Phase 8 — many studios ⬜

Phase 6 proves one studio. This makes it plural — still on the Projects surface
only.

- ⬜ Remember the studio per device, so returning users never retype the domain
- ⬜ "Connect your studio" onboarding
- ⬜ `oauth_connector` self-registers the tenant on install (domain and
  credentials posted to our API behind a shared secret) so onboarding is
  zero-paste
- ⬜ Launch-from-ERPNext: a StudioOS tile on their ERPNext workspace, arriving
  with the tenant already known
- ⬜ Invite links for staff, so a second person at a studio never types a domain

**Done when** a second, empty ERPNext site is onboarded from scratch — install
the connector, sign in, see that studio's own projects — with no StudioOS
configuration touched by hand.

### The schema-assumption audit, scoped to Projects ⬜

The open risk from `SPEC.md`, and much smaller now that only Projects ships.

- ⬜ Audit every naming and field assumption in `smartAction.ts` and the parts
  of `projectFinance.ts` that survive without crew and expenses
- ⬜ Anything CSDS-specific becomes a per-tenant setting or a normalising fixture
- ⬜ Prove it against the second site, which will not share those conventions

This is the phase where a `studioos_core` app may finally be justified — as
fixtures for normalising *project* conventions. Build it if the audit shows it
is needed, not before.

---

## Phase 9 — deployment ⬜

Staged. `DEPLOY.md` needs rewriting for the no-D1, multi-tenant shape once
Phases 6 and 7 land.

### 9a — account and first deploy ⬜

Needs your Cloudflare sign-in — the boundary from Phase 5 that was never crossed.

- ⬜ `wrangler login`
- ⬜ `wrangler deploy` the Worker — no D1, no R2, no cron to create
- ⬜ `wrangler pages deploy` the frontend
- ⬜ Confirm `/api/health` in production

Far simpler than the Phase 5 runbook: no database to create, no migrations to
apply remotely, no seed step, no bucket.

### 9b — one origin ⬜

- ⬜ Custom domain: Pages on `app.studioos.com`, a Worker route for `/api/*` on
  the same host

Take the custom domain. The SPA calls `/api/*` same-origin; without one,
`*.pages.dev` and `*.workers.dev` are separate origins and you inherit CORS, a
build-time API base URL, and two of everything to keep in sync. Decisively:
**the OAuth redirect URI is registered on every customer's site**, so it must be
permanent. Changing it later means every customer reinstalling.

### 9c — secrets and the registry ⬜

- ⬜ `wrangler secret put SESSION_KEY` — signs and encrypts session cookies
- ⬜ `wrangler secret put REGISTRY_KEY` — encrypts tenant client secrets at rest
- ⬜ `wrangler secret put CONNECTOR_SHARED_SECRET` — gates self-registration
- ⬜ `wrangler kv namespace create TENANTS` — plus a `--preview` namespace so
  local development never writes into the production registry
- ⬜ **No ERPNext admin credentials in production.** If `FRAPPE_API_KEY` is set
  anywhere after Phase 6, Phase 6 is not finished

### 9d — the connector, published ⬜

- ⬜ `oauth_connector` pushed to GitHub
- ⬜ Installed on the live CSDS site from GitHub, not from a local path
- ⬜ Production redirect URI confirmed as what the connector registers

### 9e — running it ⬜

- ⬜ Error reporting — a failed token refresh must be visible, not silent
- ⬜ Uptime check on `/api/health`
- ⬜ **Version-drift alarm.** A field rename on a customer's ERPNext breaks us at
  runtime, not at build. A daily probe of the field names we depend on, per
  tenant, turns a silent wrong number into an alert

---

## Phase 10 — widen the surface to full parity with the old app ⬜

**Brief, 2026-08-18:** bring *everything* the old CSDS app does into this stack.
Three answers were given before any code was written:

| Question | Answer |
|---|---|
| Where the six non-ERPNext datasets live | **Investigate native ERPNext homes first.** Custom DocTypes only for what genuinely has none |
| The CSDS-specific account names in the write paths | **Resolve from ERPNext at runtime**, per studio — no configuration to fill in, and it cannot post to the wrong ledger |
| Order | **Unblocked pages first** — everything that needs no storage decision ships before anything that does |

### What the gap actually is

The port is further along than "implement the old app" suggests. All 26 of the
old Express routes already have a TypeScript counterpart. The work splits three
ways, and only the third is a build from nothing:

| | Old app surface | State |
|---|---|---|
| **A — built, unmounted** | dashboard, insights, payables, tasks, clients, vendors, equipment, inventory, invoices | Withdrawn by 6a. Needs mounting and re-verifying **on per-user tokens**, which is not what they were built against |
| **B — built, storage-blocked** | studio rental, transactions/theatre, subscriptions, brand, project crew, project expenses | Read D1, and D1 is gone. Ten files are excluded from `tsc` for this reason |
| **C — never built** | `client-detail`, `analytics`, `fintech`, `invoice-designer`, `equipment-catalogue` | No React page exists |

### 10a — the pure-ERPNext read surface returns ✅

The cheapest real progress there is: eight routes and six pages that need no
decision from anyone.

- ✅ Mount `dashboard`, `insights`, `payables`, `tasks`, `clients`, `vendors`,
  `equipment`, `inventory`
- ✅ Restore their routes and nav items
- ✅ **Re-verify each on the signed-in user's token.** Phases 0–5 proved them
  against an admin key that no longer exists; "it worked in Phase 3" is not
  evidence about a per-user request
- ✅ A 403 on any of them must read as ERPNext's refusal, the way 7a made the
  projects list read

**Done when** every restored page renders real data for a signed-in user, and a
restricted user gets the refusal wording rather than a broken page.

#### Verified on the bench, 2026-08-18

Signed in as `studioos-test@example.com` against `studio.os`. **153 tests pass.**

| Page | Result |
|---|---|
| Dashboard | ₹3,16,000 outstanding, 1 overdue at ₹2,29,000, invoices by status, top customers, projects by status, chart renders |
| Insights | the overdue-invoice card, on real data |
| Tasks | Kanban with the five columns and its cards |
| Payables | ₹1,84,293 across 3 suppliers, oldest due dates named |
| Clients | 3 clients, 2 owing, **₹3,16,000** receivable |
| Vendors | 3 suppliers, group filter |
| Inventory | 0 gear, and it says why — see below |
| Projects | unchanged, 5 rows |

**Clients and Dashboard agree to the rupee on ₹3,16,000** by two separate code
paths, which is the same cross-check that gave Phase 2 its confidence.

Every one of the five restored endpoints returns **403 with ERPNext's own
`PermissionError`** for the restricted user. The *rendering* of that refusal was
not re-proven per page — it comes from `QueryState`, the shared component 7a
verified — so it is inherited evidence, not fresh evidence.

#### Two CSDS-only fields took two pages down completely

`equipment_status` and `rental_source` are custom fields on `Item` that exist on
the CSDS site and on no stock ERPNext v15. Asking for a field a site lacks does
not return null — Frappe rejects **the whole query** with
`DataError: Field not permitted in query`. So `/api/inventory` 417'd outright,
and `/api/insights` 417'd too, taking down three insight cards that had nothing
to do with equipment.

This is the third instance of the same problem (`custom_sales_person`,
`Project Template.disabled`), so it stopped being a per-query patch and became
`lib/optionalFields.ts`: run the query, and when ERPNext names a column, drop it
and run again. The site is asked rather than assumed, and no `DocField` read
permission is needed — the error already carries the answer.

**The distinction the module is built around.** Dropping a missing field from
`fields` is safe; a column we cannot read renders blank, and blank is true.
Dropping it from `filters` is not: `equipment_status in ('In Repair', 'In
Maintenance')` is the only thing making that list mean "broken gear". So a
missing field used in a filter raises `SchemaGapError` and the caller must
answer it deliberately. Insights answers by omitting that one card, and by
changing the "All clear" line — which otherwise ends "all in-house gear
available" about gear it never looked at. Exactly the `noCrewAssigned` shape
from 7b.

**Proven by breaking it**, per the standing rule: commenting out the filter
guard turned the test red. Restored.

**And the number that would have been wrong.** Without `equipment_status` every
item arrives with no status, the Inventory page counts zero items out of
service, and renders that **in green**. It now reads "—, Not tracked on this
site", with a banner saying a blank status means unknown and naming the two
fields an administrator can add. `missingFields` travels from the route to the
page for that single purpose.

#### One measurement worth not misreading

The first run showed `/api/dashboard` taking **126 seconds**. That was the
bench's single-threaded dev server head-of-line blocking under four concurrent
requests, not the route. Run one at a time, each endpoint answers in 2–10s.

### 10b — client detail ✅

`GET /api/client/:name` and `PUT /api/client/:name` are already written and
already pure ERPNext. Only the page is missing.

- ✅ `client-detail.html` → `ClientDetailPage`
- ✅ Keep the old app's honesty: Transactions / Statement / Comments / Mails
  were visible tabs saying "coming soon" rather than fake data. Port that, not
  a mock
- ✅ `Customer.email_id` and `mobile_no` are Frappe *fetch-from* fields sourced
  from the linked Contact — **not directly PATCHable.** Edit goes through the
  Contact's child tables

#### The bug the port found before it wrote a line of UI

`GET /api/client/:name` reported **₹0 outstanding** for West View Software Ltd.
The list page, the dashboard and the client page all read the same books, and
the client page was the one that said the client owed nothing.

The route asked for `custom_invoice_number` — a CSDS field, absent on a plain
site — so Frappe rejected the whole invoice query, and a blanket
`.catch(() => [])` turned that into an empty list, which totalled to zero. The
page then displayed the reassuring number with no indication anything had
failed.

Fixed twice over: the query goes through `getListTolerant`, and what remains of
the catch returns **`null`** rather than `[]`. `salesInvoices`, `projects` and
`outstandingReceivables` are all nullable now, and the page renders a dash and
says the data could not be read. Nothing totals a null.

| On West View Software Ltd. | Before | After |
|---|---|---|
| `outstandingReceivables` | 0 | **229000** |
| `salesInvoices` | `[]` | 2 invoices |
| `missingFields` | — | `['custom_invoice_number']` |

**₹2,29,000 now agrees with the list page and the dashboard**, which is what
made the original wrong.

#### Verified in a browser, 2026-08-18

| Check | Result |
|---|---|
| Page | To collect ₹2,29,000 · Total invoiced ₹2,61,000 · 1 project |
| Arithmetic | ₹32,000 + ₹2,29,000 = ₹2,61,000 |
| Tabs | all five switch; the four stubs carry the old app's own wording |
| History | derived from invoice and project creation, newest first |
| Edit → save | Contact **created and linked**, Address created, page refetched and showed all of it |
| Written as whom | Contact and Address `owner` = **studioos-test@example.com** |
| Restricted user, GET | **403** |
| Restricted user, PUT | **403**, ERPNext's own `PermissionError` |

Test data removed afterwards. Note that deleting the Contact left
`Customer.email_id` and `mobile_no` still populated — a fetch-from field keeps
its copied value when the source goes away — so those had to be cleared
separately. Worth knowing before anyone treats those fields as a live mirror of
the Contact.

`describeSaveError` moved to `lib/saveError.ts` rather than being copied for the
second form. The old app had `statusBadgeClass` defined per page and the copies
had drifted; one is enough.

#### An environment limitation, not a page bug

Synthetic mouse clicks do not reach the page in this Browser pane (screenshots
fail for the same reason — it is not compositing). Tab switching and form
submission were driven through the DOM instead, which exercises the same React
handlers. Anything needing a real screenshot has to wait for the pane.

### 10c — invoices, on the studio's own accounts ✅

Merged with what was planned as 10d. They could not sensibly be separated:
mounting the invoice writes while `Sales - CSDS` was still hardcoded would have
shipped a landmine, so the coordinates had to be resolved in the same change.

- ✅ Mount the list, detail, service-items, create, submit, amend and payment
  routes
- ✅ Brand comes from **ERPNext at runtime** — Company, its Address, its Bank
  Account — with the cosmetic remainder (accent colour, tagline, notes) falling
  back to defaults until 10f decides where studio-owned presentation lives
- ✅ Draft-first stays absolute: `POST` creates `docstatus: 0`, and submitting
  is a separate deliberate call. **The owner's hard rule**
- ✅ Income, receivable and cost-centre accounts read from the Company record
- ✅ Invoice-number prefix from the company abbreviation, not the letters `CSDS`

#### The bench had two companies, and that turned out to matter

`studio.os` carries **Cloud Shaped Dreams Studio** and **Cloud Shaped Dreams
Studio (Demo)**, and they disagree in exactly the way that is dangerous:

```
Global Defaults default_company : Cloud Shaped Dreams Studio        (Debtors - CSDS)
the signed-in user's own default: Cloud Shaped Dreams Studio (Demo) (Debtors - CSDSD)
every invoice that actually exists: Cloud Shaped Dreams Studio (Demo)
```

Resolving from Global Defaults — the obvious implementation — would have posted
new invoices into one ledger while every existing invoice sat in another,
splitting a studio's books with nothing on screen to show it. `lib/companyProfile.ts`
therefore **does not guess**: an explicitly named company wins, a site with one
company is unambiguous, and anything else is refused with the choices listed.

For most paths nothing has to be inferred at all, because the document already
says: printing reads `invoice.company`, amending stays in the original's books,
and a payment takes both the company and the receivable account off the invoice
it settles — `payments.ts` used `c.env.COMPANY` and `Debtors - CSDS`, which on a
two-company site could post a payment into different books from its own invoice.

#### Verified against the bench, 2026-08-18

| Check | Result |
|---|---|
| `/api/invoices` | **5 rows**, `custom_invoice_number` dropped tolerantly |
| Invoices page | ₹3,63,000 billed, **₹3,16,000 outstanding**, filters, Print links |
| Cross-check | that ₹3,16,000 matches the dashboard **and** the clients page — three paths, one number |
| `/:name/print` | 200, and the header reads **"Cloud Shaped Dreams Studio (Demo)"** — the invoice's own company, not the site default |
| Bank block / QR | **suppressed**, because that company has no bank account and ERPNext holds no UPI id anywhere |
| Create, no company named | **400**, listing both companies, nothing written |
| Create, company named | `SINV-26-00001`, `docstatus 0`, `debit_to: Debtors - **CSDSD**`, `cost_center: Main - CSDSD`, line `income_account: Sales - CSDSD` |
| Written as whom | `owner` = **studioos-test@example.com** |
| Studio number | **omitted**, because this site has no `custom_invoice_number` field |
| Submit | `docstatus 1`, status Unpaid, outstanding ₹5,000 |
| Submit twice | refused, "invoice is already submitted" |
| Amend with no reason | **400** with a field error on `reason` |

**Create and submit are verified end to end for the first time.** That has been
a carried-forward item since Phase 2. It is proven on a stock bench, not on the
live site, and the invoice was cancelled and deleted afterwards.

#### The duplicate-invoice-number generator

`computeInvoiceNumber` counted existing numbered invoices and caught every
failure as `0`. On a site without the `custom_invoice_number` field that is not
a missing feature — the count is *always* zero, so **every invoice ever created
comes out as `_01_`**. Worse, on a working site a single unreachable moment
mints a number that is already in a client's hands.

The two cases are now distinguished, because they are genuinely different:

- **field absent** → `null`, and the number is simply left off. ERPNext's own
  invoice name still identifies it
- **read failed** → throws. Failing to count is not evidence that the count is
  zero

A test pinned the old behaviour and had to be replaced; the replacement says so.

#### Two findings to carry forward

1. **Amend needs cancel permission, which `Accounts User` does not have.** The
   attempt returned 403 from ERPNext and, importantly, **failed on the first
   step**, leaving the invoice submitted and untouched.
2. **But the ordering is a real hazard.** Amend cancels the original and then
   re-issues. If the cancel succeeds and the re-issue fails, the studio is left
   with a cancelled invoice and no replacement. Nothing exercised that path, and
   it should be closed before amend is offered in the UI.

### 10e — analytics and fintech ✅

The two dashboard tabs that were never ported. `insights.ts` already computes
the rule-based cards analytics.html renders.

- ✅ `analytics.html` → insight cards on their own route
- ✅ `fintech.html` → the financial KPI and chart view
- ⬜ Chart.js returns with them, so the bundle note from 3c comes back with it —
  a dynamic import, not a different library

Backend work: none. Both pages read `/api/dashboard` and `/api/insights`, which
have existed since Phase 3a — the whole gap was three HTML files nobody had
turned into components.

#### One nav item, three URLs

The old app reached these through a Dashboard dropdown, as three separate
130–170 KB files each carrying its own copy of the sidebar. Here they are three
routes under one nav item with a tab strip. They are `NavLink`s rather than
local state, so the Fintech view has an address that can be sent to someone.

#### Verified in a browser, 2026-08-18

| Check | Result |
|---|---|
| `/dashboard/analytics` | the overdue-invoice card with its severity colour and a working **View** link |
| `/dashboard/fintech` | all five charts render — receivables, commission, billed vs purchase cost, billed vs outstanding, and the three-line six-month trend |
| Receivables | **₹3,16,000 · 1 overdue**, agreeing with Main, Clients and Invoices |
| Tabs | Main / Analytics / Fintech all reachable, active state follows the URL |
| `tsc`, build | clean |

#### What looking at the page caught

Fintech's Financials summary read **Total billed +₹0** directly beneath
**Accounts receivable ₹3,16,000**. Both are correct: the summary rolls up each
*project's* `total_billed_amount`, and on this bench no invoice is attached to a
project. Main already carries a footnote explaining that distinction; Fintech
did not, so on real data it read as a contradiction. The row is now labelled
"Total billed (project rollup)" and the note explains the ₹0 explicitly.

#### Backup and Savings are deliberately not shipped

The old page ended its summary with "Backup (20% of margin)" and "Savings (80%
of margin)". That split is **CSDS's own policy**, recorded in its handoff notes,
with no source in ERPNext — it was arithmetic on a constant.

For CSDS it is true. For any other studio it is a confident statement about
money they never agreed to, set in the same type as figures that came from their
books. There is nowhere to store a per-studio split, so the rows are omitted and
the page says why. **Carried into 10f as a named item**, not dropped.

### 10f — where the non-ERPNext data lives 🔨

**The investigation, and it comes before any of 10g.** The rule from the answer
above: map onto what ERPNext already has, and build custom DocTypes only for
what genuinely has no home.

Run against `studio.os`, which is a **stock ERPNext v15** — deliberately, since
the question is what every studio has, not what CSDS added.

#### The finding that changes the architecture

**A studio's own System Manager can create a custom DocType at runtime, over the
API, and write rows to it.** No developer mode, no bench access, no app install.
Proven end to end and then torn down:

| Check | Result |
|---|---|
| DocType created as `studioos-test@example.com`, no `ignore_permissions` | **created**, `custom: 1`, module Custom |
| Row written and queried back | **yes** |
| Same attempt as a user without System Manager | **PermissionError** |

This matters more than any single mapping. It means **`studioos_core` does not
have to be a Frappe app that customers install** — which was never going to work
anyway, because Frappe Cloud's managed plan does not allow installing custom
apps. StudioOS can provision what it needs at onboarding, as the owner, on the
owner's own site, and the data stays in the studio's database under the studio's
own permissions. Decision 2 — "ERPNext is the only database" — survives intact.

#### What each of the six actually maps onto

| Dataset | Native home | Verdict |
|---|---|---|
| **Studio rental sessions** | `Timesheet` + `Timesheet Detail` | **Strong fit, proven** — see below |
| **Subscriptions** (recurring overheads) | `Subscription` with `party_type: Supplier` | Exists, but changes what the data *means* — see below |
| **Theatre Education ledger** | `Journal Entry` only | Forced fit. Submittable and GL-impacting, which the owner explicitly rejected once already |
| **Project crew roster** | `Purchase Order` per crew member; `project` is on both the order and its lines | Plausible — planned spend becomes a real procurement document, and the Purchase Invoice against it is the actual |
| **Project expenses** | **None that is light.** `Expense Claim` **does not exist** on stock ERPNext — it ships in HRMS, a separate app. Only `Purchase Invoice` (needs a Supplier) or `Journal Entry` remain | Custom DocType |
| **Brand config** | `Letter Head` holds the logo and header/footer HTML; `Company` holds name, address, bank | Partial — accent colour, tagline, notes wording and **UPI id** have no field anywhere |

#### Timesheet is a better model than the JSON it replaces

Proven on the bench, created and submitted and then deleted:

```
Timesheet with NO employee      saved and submitted   (employee: null)
2026-08-01 18:30 → 20:37        hours: 2.116667       the true duration
                                billing_hours: 2      the studio's rounded hour
                                billing_amount: ₹100  2 × ₹50, its own rate card
```

Three things follow.

1. **No `Employee` is required.** That was the load-bearing question — this
   studio has zero Employee records on principle, because all crew are
   Suppliers. Timesheet saves and submits without one.
2. **It keeps the truth and the bill separately.** `studioRental.json` stored
   only the rounded hours, so 2h07m became "2" and the real duration was gone.
   Here `hours` is exact and `billing_hours` is the rounded figure, and the
   studio's rule — nearest whole hour, ties up — is simply `Math.round(hours)`.
   2h07m → 2, 4h30m → 5, unchanged.
3. **ERPNext already invoices from it.** `Timesheet.sales_invoice` and the
   per-log `sales_invoice` exist natively, which is what
   `POST /api/studio-rental/:id/invoice` currently hand-rolls.

A booking maps to one Timesheet, its sessions to `time_logs`. Flat-rate sessions
are `billing_hours: 1` at the flat rate. The 103 real sessions become two
Timesheets of 87 and 16 rows.

#### The two mappings that are decisions, not facts

Both exist natively. Both change the meaning of the data, so neither is mine to
choose:

- **Subscriptions.** `Subscription` accepts `party_type: Supplier` and generates
  **Purchase Invoices** — confirmed in ERPNext's own controller, which picks the
  invoice type from the party. That is real bookkeeping on a schedule. The old
  ledger was for visibility: it carries a **₹0 placeholder** for the
  grandmother's electricity bill, which is a perfectly good note and not a
  posting anyone wants generated monthly.
- **Theatre Education.** The only native home is `Journal Entry`, which is
  submittable and hits the general ledger, and needs a bank Account this line of
  the business does not have. That is exactly why it was rejected when the old
  app was built. Nothing has changed.

#### Decisions taken, 2026-08-18

The owner's steer was **prefer whatever ERPNext already has**, driven by a
concern worth quoting: *"they are non-tech users, they can not create that
custom doctypes."*

That concern rests on a misreading worth correcting in the record, because it
cuts the other way. **No studio owner ever creates a DocType by hand.** StudioOS
creates them through the API on the owner's own session at connect time — the
owner approves the same consent screen they already approve to sign in, and sees
a progress line, not a form. The real argument for native doctypes is different
and still good: a custom DocType is unfamiliar inside their own ERPNext, and if
a studio stops using StudioOS the data sits in a shape only StudioOS
understands. Native is portable.

| Dataset | Decision | Why |
|---|---|---|
| **Crew roster** | **Purchase Orders**, one per crew member | Owner's decision. Planned spend becomes a real procurement document and ERPNext computes planned-versus-actual against the Purchase Invoice |
| **Theatre ledger** | **Journal Entry** | Native, and the original objection turned out to be wrong — see below |
| **Rental sessions** | **Timesheet** | Proven above |
| **Overheads** | still open, and native is the *worse* answer here — see below |
| **Project expenses** | custom DocType; nothing light exists |
| **Brand** | Letter Head + Company; accent, tagline, notes and UPI have no field |

#### The theatre ledger's original rejection does not hold

It was refused when the old app was built because a Journal Entry "needs a bank
Account this line of the business does not have". **Every ERPNext company is
created with a `Cash - ABBR` account already.** Proven by posting one:

```
Journal Entry   ACC-JV-2026-00001   submitted, docstatus 1, ₹5,000
                Dr  Cash - CSDSD        5,000
                Cr  Service - CSDSD     5,000
                no bank account, no setup, no new accounts created
```

Created, submitted and deleted. So the theatre ledger can be real bookkeeping
with **zero configuration by the owner**. What is genuinely true, and different
from the old objection: a submitted Journal Entry cannot be edited — correcting
one means cancel and re-post — and every entry lands in the P&L alongside the
video business. That is a feature if the owner wants one set of books, which
their answer says they do.

#### Overheads are the case where native costs the owner *more*

`Subscription` needs a **Subscription Plan** per overhead, and every plan needs
an **Item** and a **Supplier**. So "track the electricity bill" becomes: create
a supplier, create an item, create a plan, create a subscription — four records
of setup, by the owner, per overhead. A custom DocType StudioOS provisions
silently is *less* work for a non-technical owner, not more.

It also cannot hold what the ledger currently holds: the **₹0 placeholder** for
the grandmother's electricity bill is a useful note and an impossible invoice.

**Recommendation: lightweight, provisioned automatically.** This is the one
place where the owner's stated principle and the owner's stated concern point in
opposite directions, so it goes back to them named rather than decided quietly.

#### An empty `studioos` app is already installed on the bench

`frappe.get_installed_apps()` returns `frappe, erpnext, studioos,
oauth_connector`. The `studioos` app has a `StudioOS` module and **zero
DocTypes** — a scaffold from an earlier session. It is not load-bearing, and
nothing above depends on it. Decide whether to keep it as the home for
fixtures or remove it, but do not let it linger as a half-thing.

#### Still to do in 10f

- ⬜ Settle overheads with the owner
- ⬜ Design the custom DocTypes for what has no home, and **how they are
  provisioned** — at onboarding, by the signing-in owner, idempotently
- ⬜ **Migration is part of it.** `studioRental.json` holds 103 real sessions and
  `transactions.json` the entire theatre ledger; both exist nowhere else
- ✅ ~~the **crew roster**~~ — resolved by the 2026-08-18 decision above:
  one Draft `Purchase Order` per crew/vendor member. The old app's concern
  (a person can be crew on one project and a billed vendor on another) turned
  out not to be a blocker: the role is read off the *booking* (which
  `supplier_group` the Purchase Order's Supplier is in), not stored as a fixed
  property of the person, so the same Supplier can be Crew on one project's PO
  and Vendor on another's. Implemented — `routes/projectCrew.ts`,
  `readCrewForProject` wired into `projectDetail.ts`. **Verified live**
  2026-08-24 against `cloudshapeddreamsstudio.m.erpnext.com`: created,
  inspected, edited, and deleted a real Draft Purchase Order end to end
  (same proof pattern as Timesheet/Journal Entry above). Two assumptions the
  first draft of this code got wrong, caught only by the live create, not by
  `frappe_describe`'s required-fields list:
  - `Purchase Order` has no `remarks` field (unlike Sales Invoice) — the
    free-text home is `terms`.
  - `Purchase Order Item.item_code` is a mandatory Link to a real `Item`; a
    free-text line (which works on Sales Invoice Item on this site) silently
    fails to persist here. A roster entry's designation is therefore a real
    Item, reusing this studio's own existing convention (`Cinematographer`,
    `Director`, ... in the `Services` group) rather than a fabricated
    string. New Items also need a `gst_hsn_code` (an India Compliance
    validation, not visible in the schema's `reqd` flags) — `998431`,
    matching what this studio's own service Items already use.
- ⬜ Record what has **no** home. Two remain:
  - a **UPI id** for the invoice Scan-to-Pay QR. 10c looked; ERPNext has no
    field for one anywhere, so the QR does not render at all today
  - **studio-owned presentation and policy** — invoice accent colour, tagline
    and notes wording, and the margin split the old Fintech page showed as
    "backup 20% / savings 80%". That split is one studio's policy, so it is
    withheld rather than shown to every studio (see 10e)
- ⬜ Only then decide whether `studioos_core` is necessary
- ⬜ Whatever the answer, **migration is part of it.** `studioRental.json` holds
  103 real sessions and `transactions.json` the entire theatre ledger; both
  exist nowhere else

### 10g — the six restored ⬜

Blocked on 10f. Each is its own phase.

- ⬜ Studio rental — bookings, session logs, invoice generation. Watch the
  round-to-nearest-hour rule: `Math.round`, ties up, never `Math.ceil`
- ⬜ Transactions / theatre education
- ⬜ Subscriptions
- ✅ Crew tab on project detail — implemented and verified live via
  `Purchase Order`, see 10f above.
- ⬜ Expenses tab on project detail, **restoring the figure 7b suppressed** —
  this is what turns "Budget remaining —" back into a number (crew alone
  doesn't: `computeFinance`'s `remaining` is driven by `expenseTotal`, not the
  roster)
- ⬜ Invoice designer, once brand has somewhere to be saved

### 10h — equipment catalogue ⬜

- ⬜ Confirm with the owner whether it still needs to exist separately from
  Inventory before rebuilding it. The old app unlinked it from nav as
  superseded, which is evidence but not an answer

---

## Phase 11 — cutover and the second customer ⬜

- ⬜ Run both apps side by side; owner uses StudioOS for real project work
- ⬜ Compare outputs page by page on the same data
- ⬜ Freeze writes to the old app once parity on the shipped surface is confirmed
- ⬜ Archive the old repo — do not delete
- ⬜ Onboard a studio that is not CSDS; measure onboarding time rather than
  estimating it

Note cutover cannot complete until Phase 10 restores the surface the owner uses
daily. Phase 11 begins the moment Projects reaches parity, but finishes later.

---

## Carried forward, still open

- 🔨 **Create / submit are verified end to end as of 10c**, on the bench, with
  the invoice cancelled and deleted afterwards. **Amend is still unproven** — it
  returned 403 because `Accounts User` cannot cancel a submitted invoice, and
  its cancel-then-reissue ordering can strand a studio with a cancelled invoice
  and no replacement. Neither has been run against the live site.
- ⬜ **Phase 0 on the old repo** — still no remote, and its ledgers are the
  studio's only copy of the deferred data. Deferring the migration makes this
  *more* urgent, not less: that data now sits unbacked for longer.
- Bundle is 548 KB, Chart.js most of it. Chart.js is not in the Projects slice,
  so this may resolve itself for the first release.

---

## Open decisions

| # | Decision | Blocks | Note |
|---|---|---|---|
| ~~D1~~ | ~~Where the tenant registry lives~~ | — | **Resolved 2026-08-17: Cloudflare KV**, binding `TENANTS`, client secrets encrypted at application level. Note the eventual-consistency caveat in Phase 6 |
| D2 | **Distribution** — Marketplace listing, or customers on private benches | 8, 11 | Unchanged, and now the only thing between a built product and a second customer |
| D3 | **Domain** — is `app.studioos.com` real? | 9b | Baked into every customer's OAuth registration; expensive to change later |
| ~~D4~~ | ~~Is the first release read-only?~~ | — | **Resolved 2026-08-17: no.** Privileged users create and edit projects from StudioOS; see 7c and 7d |
| D5 | **Does "the Projects tab" include project detail**, or the list alone? | 7b | The plan assumes detail is included, with crew and expenses declared missing |
| D6 | **Can a project manager delete a project from StudioOS?** | 7c | No delete handler exists today, and deletion in an accounting system is rarely what is wanted. Assumed **no** unless you say otherwise |

---

## Deliberately not in this plan

- **The client's v2 feature requirements.** Still not supplied.
- **Billing for StudioOS itself.** Out of scope until there is a second customer.
- **Any external database**, with the tenant registry as the one named exception.
