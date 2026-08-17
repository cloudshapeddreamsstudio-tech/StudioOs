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

### 7a — projects list on per-user tokens ⬜

- ⬜ Confirm the list renders for a signed-in user rather than for an admin key
- ⬜ Empty and unauthorised states — a user with no project access must see a
  clear message, not a blank table

**Done when** two users of different permission on the same studio both load the
page and each sees their own correct result.

### 7b — project detail, honest about what is missing ⬜

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

### 7c — writing back to ERPNext ⬜

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

## Phase 10 — widen the surface ⬜

Only now does the deferred work come back, and in the order the owner actually
needs it rather than the order it was built.

Each of these is its own phase when it starts. The storage question has to be
answered before any of the D1-backed ones can move:

- ⏸ **Where the non-ERPNext data lives.** Rental sessions, transactions,
  subscriptions, brand, crew and expenses have no native ERPNext home. Some of
  it may map onto existing ERPNext documents in a form not yet identified —
  that investigation is the first task of this phase, and it is what makes a
  `studioos_core` app either necessary or unnecessary
- ⏸ Dashboard, Invoices, Payables, Tasks, Clients, Vendors, Inventory — all
  built and verified, all waiting
- ⏸ Crew and Expenses tabs on project detail, restoring the suppressed figures
- ⏸ Studio Rental, Transactions, Subscriptions
- ⏸ `equipment-catalogue.html` — probably subsumed by Inventory; confirm before
  rebuilding

Nothing here is lost work. It is finished, tested code sitting behind a release
boundary.

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

- ⬜ **Create / submit / amend are unverified end to end.** They write into a
  real accounting system and need a throwaway customer set up deliberately. The
  Phase 3b incident is the reason to do it that way rather than improvise.
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
