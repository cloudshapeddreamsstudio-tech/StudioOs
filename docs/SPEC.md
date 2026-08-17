# StudioOS — migration spec

**Status:** draft, 2026-08-09
**Supersedes:** nothing. The old app in `Erpnext UI Application/CSDSxERPnext App`
stays the working system until this reaches parity.

> **Scope change pending, 2026-08-16.** StudioOS is now intended as a product sold
> to many studio owners, not a single-tenant app for CSDS. The auth model below
> (A6, Cloudflare Access, one server-side API key) does not survive that. See
> [Multi-tenant auth — verified findings](#multi-tenant-auth--verified-findings-2026-08-16)
> at the end of this document. **The rest of this spec is unrevised** and still
> describes the single-tenant v1.

## Goal

Rebuild the CSDSxERPnext dashboard on a stack that can be hosted, secured, and
maintained. **Behaviour parity first, features second.** v1 adds nothing the old
app didn't do.

## Non-goals for v1

- No new features. Client requirements land in v2, after parity.
- No redesign of the data model. The six JSON ledgers move to D1 with their
  shapes unchanged.
- No move of ledger data into ERPNext proper, however tempting studio-rental
  income looks like a Sales Invoice. Noted for later, not now.
- No multi-user model, roles, or permissions. One account.
- No visual redesign. The Mosaic look is kept.

## Assumptions

These were proposed as defaults and not contested. Each is cheap to revisit now
and expensive later.

| # | Assumption |
|---|---|
| A1 | v1 is migration-only; client requirements are v2 |
| A2 | Only pages backed by a live `/api/*` route get ported; the rest are dropped |
| A3 | Tracer bullet is project → invoice |
| A4 | The old app stays in daily use; cutover is per-page, never a freeze |
| A5 | Ledgers lift-and-shift into D1 unchanged |
| A6 | One Cloudflare Access account for the owner, one for the developer |
| A7 | No Mosaic React license — markup is ported by hand |
| A8 | TypeScript throughout |

## Architecture

```
Browser ──► Cloudflare Pages (React SPA)
              │  /api/*
              ▼
            Cloudflare Workers (Hono)
              ├──► ERPNext REST API   — system of record
              └──► D1 (SQLite)        — the six local ledgers
```

**ERPNext keeps its exact previous role.** It owns projects, invoices,
customers, suppliers, tasks, payments. StudioOS never touches its database
directly, only `/api/resource/...` over HTTPS with a server-side API key.

**D1 owns only what ERPNext does not have:** studio rental sessions, ad-hoc
transactions, per-project crew rosters and out-of-pocket expenses,
subscriptions, invoice branding.

**Auth is not in the application.** Cloudflare Access authenticates at the edge
and rejects unauthenticated requests before the Worker runs. There is no login
page, no session table, no password handling.

## What this fixes

Four defects in the old app, each fixed structurally rather than patched.

1. **Torn ledger writes.** `fs.writeFileSync` truncates before writing, so a
   crash mid-write lost the entire ledger. D1 writes a row.
2. **Deploy clobbering data.** The JSON ledgers were tracked in git; any deploy
   that checked out the repo would overwrite live data with stale committed
   copies. D1 is not in the repo.
3. **No authentication.** The Express bridge mounted 22 routers with no
   middleware — anyone reaching `:3001` had full read/write on the live ERPNext
   site. Cloudflare Access closes this.
4. **90-file nav edits.** The sidebar was copy-pasted into every HTML page.
   It is now one component.

## Data integrity & failure handling

- **Money is never guessed.** Ambiguous amounts are surfaced for human
  reconciliation, never inferred. `estimatedAmount` is never back-filled from
  `amount`.
- **ERPNext controllers win.** They silently override some PUTs (Sales Invoice
  `name`, Project `status`/`percent_complete`). The port keeps working *with*
  that, including deliberately dropping an incoming `status: "Completed"` on
  project update, because completion is derived, not chosen.
- **The ledger import is a reviewed step**, not an automatic migration.
  `scripts/import-ledgers.ts` emits SQL to a file; a human applies it.
- **Upstream failures surface.** ERPNext's status codes pass through unchanged
  rather than collapsing into a generic 500.

## Acceptance criteria for v1

1. Every page that had a live API route in the old app works in StudioOS.
2. `/api/health` reports both `frappeConfigured` and `dbBound` true in production.
3. All six ledgers are in D1 with row counts matching the JSON source exactly.
4. The app is reachable only through Cloudflare Access.
5. `smartAction` behaviour is provably identical to the original — tests pass,
   and they have been seen to fail against a deliberately broken port.
6. The old app can be switched off without the owner losing any capability.

## Open questions

- Client's v2 requirements — still not supplied. Blocks nothing in v1, but
  could reorder the phases if a page is due for redesign.
- Mosaic React license — decides whether the frontend is "port components" or
  "rebuild markup". Currently assumed the latter.
- File uploads: R2 versus continuing to pass through to ERPNext. Currently
  assumed pass-through, which needs no new storage.

## Multi-tenant auth — verified findings (2026-08-16)

Recorded because the product decision above makes "log in with your own ERPNext
account" the auth model. Everything in this section was **tested**, not assumed.
Sources: the live Frappe Cloud site `cloudshapeddreamsstudio.m.erpnext.com`, and
the WSL2 dev bench sites `ezsandesh.dev` / `studio.os`.

### The model

Each studio has its own ERPNext. StudioOS is registered on each one as an
`OAuth Client` record, then acts as an OIDC relying party against that site.
Login is a **domain field plus a button**, not a button alone — with no shared
identity provider, StudioOS cannot know where to send an anonymous visitor.

A user's ERPNext access token is used for every read on their behalf, so
**ERPNext enforces its own role permissions** and StudioOS writes none. This
also retires the single god-mode API key, under which one leaked secret would
expose every tenant.

### Verified

| # | Finding | How it was checked |
|---|---|---|
| V1 | Frappe Cloud does **not** block third-party OAuth Client registration | The live site already carries a client for `Raven Mobile`, an outside vendor's app, alongside the one for `frappe-ctl` |
| V2 | Full OIDC discovery is served at `/.well-known/openid-configuration` | Returns `200` with `authorization_endpoint`, `token_endpoint`, `userinfo_endpoint`, `introspection_endpoint`, `revocation_endpoint` |
| V3 | The OAuth endpoints are live and spec-compliant | `authorize` → `302` to `/login?redirect-to=…`; `get_token` → `{"error":"invalid_request","error_description":"Missing code parameter."}`. A nonexistent method returns `417`, so these are real |
| V4 | `after_install` can create the OAuth Client automatically, and is idempotent | `bench --site ezsandesh.dev install-app studioos` created it; calling the function again returned "already present", count stayed 1 |
| V5 | Frappe generates `client_id` and `client_secret` itself | Not supplied by the hook; both populated after insert |

V2 is the one that removes work: given only a domain, StudioOS reads that
document and learns every endpoint. Nothing is hardcoded per customer, and
self-hosted ERPNext is supported through the same code path as Frappe Cloud.

### Constraints found

- **C1 — tokens are HS256-signed**, using the client secret rather than a public
  key. There is no JWKS, so a browser can never verify one. All token handling
  stays server-side in the Worker.
- **C2 — uninstall orphans the credential.** `bench uninstall-app studioos` left
  the `OAuth Client` record in place; it had to be deleted by hand. `OAuth Client`
  is a Frappe core doctype and does not belong to the app's module. Without a
  `before_uninstall` hook that revokes and deletes it, a studio that removes
  StudioOS still has a live credential granting access to its books.
- **C3 — ignore the implicit flows.** The site advertises `token` and `id_token`
  response types. Use `code` + PKCE only.

### The connector app

A small Frappe app installed on each customer's site. It ships no UI. It exists to:

1. create the OAuth Client on `after_install` (V4) and remove it on
   `before_uninstall` (C2);
2. ship the custom fields, naming series and defaults StudioOS depends on, so
   every tenant's site presents the same shape. **This is the more important
   job** — the phase, progress and `smartAction` logic currently reads CSDS's own
   conventions, and will render confident nonsense against a studio that does not
   share them.

Proof of concept lives on the dev bench at
`~/frappe-bench/apps/studioos/studioos/install.py` with the hook enabled in
`hooks.py`. It was installed on `ezsandesh.dev`, verified, then uninstalled and
the record cleaned up. Both bench sites are clean as of 2026-08-16.

### Still open

- **Distribution is now the deciding question.** Everything technical is green.
  Getting the connector onto a customer's Frappe Cloud site requires either a
  Marketplace listing (review, revenue share) or the customer on a private bench
  (pricier plan). Self-hosted studios have no such gate. This determines who can
  be a customer and is a commercial decision, not a technical one.
- **Tenant self-registration.** For zero-paste onboarding, `after_install` should
  POST the site domain and client credentials to the StudioOS API. Needs a shared
  secret so arbitrary parties cannot register tenants. Not yet built or tested.
- **Credential custody.** StudioOS would hold many studios' ERPNext client
  secrets and refresh tokens. Needs encryption at rest and an answer to "what
  happens when you are breached". Unaddressed.
- **Tenant isolation in D1.** The ledger tables have no tenant column. Cheap to
  add now, expensive after real customer data lands.
- **A person at two studios has two identities.** Correct behaviour, but the
  site-switcher needs designing rather than discovering.

### What this contradicts above

Not yet revised, listed so the conflict is not silent:

- Non-goal "No multi-user model, roles, or permissions. One account."
- **A6** — one Cloudflare Access account for owner and developer.
- Architecture — "a server-side API key" and "Auth is not in the application.
  Cloudflare Access authenticates at the edge… no login page, no session table".
  StudioOS will need its own session layer; it still never handles a password.
- Acceptance criterion 4 — "reachable only through Cloudflare Access".
