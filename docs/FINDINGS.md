# Verified findings

Facts that were proved by running them against a real ERPNext site or bench.
Each design decision in this repository stands on one of these. If a fact here
becomes false, the decision that uses it must be checked again.

These two sections came from `SPEC.md`, the first spec of StudioOS. The rest of
that spec described a plan that was replaced: one server-side API key,
Cloudflare Access instead of sign-in, Cloudflare Pages, and parity with an old
application that was never used. It is in `docs/archive/SPEC-v1.md` as history.

The current architecture is in `docs/SEAM.md`. The current scope is in
`docs/RELEASE-1.md`.

---

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

### What became of the open questions

- **Distribution.** D2: each studio is connected by hand. An owner creates an
  OAuth Client on their own site, so no connector app is necessary. The
  Marketplace question returns when a studio asks to join by itself.
- **Self-registration.** Built: `POST /auth/register`, guarded by
  `CONNECTOR_SHARED_SECRET`.
- **Credential custody.** Client secrets are encrypted in KV with
  `REGISTRY_KEY`. Session tokens are encrypted in D1 with `SESSION_KEY`.
  `docs/SEAM.md` Amendment 4 says what a breach gives.
- **Tenant isolation in D1.** The session tables key each user by studio. The
  ledger tables are parked, not applied.
- **A person at two studios.** Two `user` rows, by ADR-0003 condition 7.

---

## Storage for non-ERPNext data — verified findings (2026-08-18)

Established against `studio.os`, a **stock ERPNext v15** — chosen deliberately,
because the question is what every studio has, not what CSDS added.

### V6 — a studio can be given custom DocTypes without installing anything

A studio's own **System Manager** can create a custom DocType over the API and
write rows to it. No developer mode, no bench access, no Frappe app. Proven end
to end as `studioos-test@example.com` with no `ignore_permissions`, then torn
down. A user without System Manager gets `PermissionError`.

**This removes the distribution blocker from the storage question.** Frappe
Cloud's managed plan does not allow installing custom apps, so a `studioos_core`
*app* was never going to reach most customers. Provisioning DocTypes at
onboarding, as the owner, on the owner's own site, reaches all of them — and the
data stays in the studio's database under the studio's own permissions, so
"ERPNext is the only database" holds without exception.

Note this is a **different question from the connector**, which still needs an
OAuth Client. That can also be created by hand in the desk UI, so it does not
require an app install either — see the distribution note above, which this
narrows but does not close.

### V7 — Timesheet models hourly studio rental, with no Employee

`Timesheet` saved and submitted with `employee: null`. That was the load-bearing
question: this studio has zero Employee records on principle, since all crew are
Suppliers.

It also keeps more than the old JSON did — `hours` is the true duration and
`billing_hours` the studio's rounded figure, where the JSON kept only the
rounded one. `Timesheet.sales_invoice` is native, so invoicing from sessions
stops being hand-rolled.

### C4 — `Expense Claim` does not exist on stock ERPNext

It ships in **HRMS**, a separate app, and is absent from a plain v15. Any design
that assumed it for per-project out-of-pocket expenses is wrong. What remains
native is `Purchase Invoice` (needs a Supplier) or `Journal Entry` (submittable,
GL-impacting) — neither of which is light enough for "₹300 of transport".

### C5 — two mappings exist but change what the data means

- `Subscription` accepts `party_type: Supplier` and generates **Purchase
  Invoices** (confirmed in ERPNext's controller, which picks the invoice type
  from the party). The old ledger was for *visibility* — it carries a ₹0
  placeholder for a bill nobody wants posted monthly.
- The theatre ledger's only native home is `Journal Entry`. It was rejected when
  the old app was built because it "needs a bank Account this line of the
  business does not have" — **that turned out to be wrong.** Every ERPNext
  company is created with a `Cash - ABBR` account already, and a theatre-style
  entry posted and submitted against it with no setup and no new accounts
  (`ACC-JV-2026-00001`, Dr Cash / Cr Service, ₹5,000; deleted afterwards).
  What remains true is different: a submitted Journal Entry cannot be edited,
  only cancelled and re-posted, and every entry lands in the P&L.

Both are the owner's decision, not an implementation detail.

### C6 — the invoice UPI id has no home anywhere in ERPNext

There is no field for one on `Company`, `Bank Account` or `Letter Head`. The
Scan-to-Pay QR therefore does not render at all today (10c). `Letter Head` holds
the logo and header/footer HTML; accent colour, tagline and notes wording have
no field either.
