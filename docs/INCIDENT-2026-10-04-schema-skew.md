# Incident 2026-10-04 — production fails on fields that only the old site has

**For:** Malhar
**From:** Sandesh
**State:** Open. Production is deployed and is partly broken. Nothing is changed
since the fault was found. Part B of `docs/tasks/r1-production.md` is stopped at
P2. Part C (Shubham signs in) is not started.

Written in ASD-STE100 Simplified Technical English. See `docs/adr/README.md`.

Each statement in this document has one of three marks:

- **Observed** — seen on a screen, in a log, or in the code, on 2026-10-04.
- **Recorded** — written in this repository before today.
- **Not verified** — a conclusion that has no direct evidence yet. Section 8
  says how to get the evidence.

Times are UTC. India time is UTC + 5:30.

---

## 1. Summary

1. `v1.0.0` is in production. Sign-in operates. Seven pages load.
2. **Projects and Payables do not load.** Each shows `ERPNext API error 417`.
3. The cause is schema skew between the two ERPNext sites. StudioOS asks ERPNext
   for custom fields that a person added by hand to the old site
   (`cloudshapeddreamsstudio.m.erpnext.com`). The production site
   (`csdstudio.frappe.cloud`) does not have all of them. **Not verified** by the
   text of the ERPNext error. Section 4 gives the evidence that is available,
   and section 8.1 gives a check that takes one minute.
4. Staging signs in on the old site, which has each field. So the test of 29
   items on staging could not find this fault.
5. This is not a new problem. `docs/PLAN-v2.md` recorded it in August and
   deferred it to Phase 8. Projects and Payables were never protected.
6. **The old site was read on 2026-10-04.** It has 567 custom fields. Apps
   installed 554 of them. A person added 13. Twelve of those 13 are exactly the
   fields that StudioOS asks for. Appendix A.
7. No data is changed or lost. StudioOS failed to read. It wrote nothing.
8. Two more faults were found on the way. The Worker does not log the reason
   that ERPNext gives, and the app shows a development hint in production.
   Section 6.
9. Three decisions are necessary. Section 9.

---

## 2. The deployment — it is correct

| Fact | Value | Mark |
|---|---|---|
| Tag | `v1.0.0` = commit `79e74f6`, on `main` and on `release/v1.0.0` | Observed |
| Worker | `studioos-production` | Observed |
| Address | `studioos.cloudshapeddreamsstudio.com` only. No `workers.dev` address | Observed |
| D1 | `studioos-production-db`, id `ab380f30-6b13-44fd-b254-fa3c7d1f8bcf`, migration `0000_sessions.sql` applied | Observed |
| KV | `production-TENANTS`, id `f60b45c3d6224c84b8395109f4437c45` | Observed |
| `COMPANY` | `Cloud Shaped Dreams Studio`, confirmed by Sandesh on the Company list | Observed |
| Secrets | `SESSION_KEY`, `REGISTRY_KEY`, `CONNECTOR_SHARED_SECRET`. New values, not the staging ones | Observed |
| `/api/health` | `{"ok":true,"registryBound":true,"appOrigin":"https://studioos.cloudshapeddreamsstudio.com"}` | Observed |
| `check-one-origin.ts` | 5 of 5 pass | Observed |
| `/auth/start?site=csdstudio.frappe.cloud` | 302 to `https://csdstudio.frappe.cloud/api/method/frappe.integrations.oauth2.authorize`, with `redirect_uri=https://studioos.cloudshapeddreamsstudio.com/auth/callback` | Observed |
| The staging ERPNext site, on production | refused: "is not connected to StudioOS yet" | Observed |
| Sign-in with `csdstudio.frappe.cloud` | arrives on the dashboard. P1 passes | Observed |
| Staging after the production work | `/api/health` ok, its three secrets unchanged | Observed |

### The versions of the Worker

Each `wrangler secret put` makes a new version of the Worker. So the version
that runs is the fourth one, not the one that the deploy printed.

| Time (UTC) | Source | Version |
|---|---|---|
| 11:06:07 | the deploy, `bun run deploy:production` | `9e713de3-b151-42c1-838f-d3067f7b1c67` |
| 11:14:23 | Secret Change | `e101ff1d-58f4-4a47-b5df-f7b418bdcde3` |
| 11:15:04 | Secret Change | `51e244d9-4769-4ea9-9933-3dfd3c1f1a4d` |
| 11:15:29 | Secret Change | **`82f0020b-e4e1-4a89-a660-62593f2c1cfd`** — this one runs |

The code is the same in the four versions. Each log event in section 3 names
version `82f0020b`.

### The tools

| Tool | Version |
|---|---|
| Bun | 1.4.2 |
| Wrangler, in the repository | 4.145.0 |
| `@cloudflare/vite-plugin` | 1.62.3 |
| `compatibility_date` | `2025-01-15`, with `nodejs_compat` |
| Workers observability | enabled, `worker/wrangler.jsonc:78` |

One of the `secret put` commands was first run from the repository root, where
there is no Wrangler configuration. `bunx` then used Wrangler 4.147.0 from the
network, and it stopped with "No environment found". Nothing was uploaded. The
command was run again from `worker/`.

---

## 3. The log of the production Worker

Source: `wrangler tail studioos-production --format json`, from 11:28 to 11:33
UTC, while Sandesh opened each page. 29 events. Each event had outcome `ok`,
no exception, and version `82f0020b`. The two log lines of each event are from
the Hono `logger()` middleware in `worker/src/index.ts:71`.

The dashboard was opened before the log started. So `/api/dashboard` and
`/api/insights` are not in it. Sandesh saw the dashboard load. **Observed** by
eye, not by the log.

### 3.1 Each event

| Time | Method | Path | Status | Wall ms | CPU ms | Colo | Hono log |
|---|---|---|---|---|---|---|---|
| 11:28:25.828 | GET | `/api/clients` | 200 | 913 | 11 | MRS | `--> GET /api/clients 200 903ms` |
| 11:28:29.950 | GET | `/api/payables` | **417** | 388 | 5 | MRS | `--> GET /api/payables 417 380ms` |
| 11:28:31.563 | GET | `/api/payables` | **417** | 378 | 2 | MRS | `--> GET /api/payables 417 373ms` |
| 11:28:34.808 | GET | `/api/vendors` | 200 | 356 | 2 | MRS | `--> GET /api/vendors 200 351ms` |
| 11:28:37.003 | GET | `/api/inventory` | 200 | 1204 | 6 | MRS | `--> GET /api/inventory 200 1s` |
| 11:30:25.831 | GET | `/api/projects` | **417** | 506 | 3 | MRS | `--> GET /api/projects 417 499ms` |
| 11:30:27.504 | GET | `/api/projects` | **417** | 662 | 2 | MRS | `--> GET /api/projects 417 658ms` |
| 11:30:46.699 | GET | `/auth/me` | 200 | 161 | 1 | MRS | `--> GET /auth/me 200 157ms` |
| 11:30:47.051 | GET | `/api/projects` | **417** | 377 | 2 | MRS | `--> GET /api/projects 417 371ms` |
| 11:30:48.665 | GET | `/api/projects` | **417** | 355 | 2 | MRS | `--> GET /api/projects 417 349ms` |
| 11:30:54.920 | GET | `/api/customers` | 200 | 377 | 2 | MRS | `--> GET /api/customers 200 372ms` |
| 11:30:54.920 | GET | `/api/project-types` | 200 | 388 | 2 | MRS | `--> GET /api/project-types 200 383ms` |
| 11:30:54.921 | GET | `/api/sales-persons` | 200 | 377 | 2 | MRS | `--> GET /api/sales-persons 200 370ms` |
| 11:30:54.921 | GET | `/api/project-templates` | 200 | 609 | 4 | MRS | `--> GET /api/project-templates 200 601ms` |
| 11:31:20.468 | GET | `/api/projects` | **417** | 759 | 2 | MRS | `--> GET /api/projects 417 756ms` |
| 11:31:22.470 | GET | `/api/projects` | **417** | 437 | 2 | MRS | `--> GET /api/projects 417 433ms` |
| 11:31:36.229 | GET | `/api/invoices` | 200 | 793 | 3 | MRS | `--> GET /api/invoices 200 788ms` |
| 11:31:40.485 | GET | `/api/tasks` | 200 | 364 | 2 | MRS | `--> GET /api/tasks 200 360ms` |
| 11:31:43.699 | GET | `/api/payables` | **417** | 591 | 3 | MRS | `--> GET /api/payables 417 586ms` |
| 11:31:45.480 | GET | `/api/payables` | **417** | 357 | 2 | MRS | `--> GET /api/payables 417 353ms` |
| 11:32:02.205 | POST | `/api/graphql` | 401 | 7 | 6 | FRA | `--> POST /api/graphql 401 0ms` |
| 11:32:02.330 | POST | `/api/graphql`, over `http://` | 401 | 4 | 3 | BOM | `--> POST /api/graphql 401 0ms` |
| 11:32:02.345 | POST | `/api/gql` | 401 | 4 | 4 | FRA | `--> POST /api/gql 401 0ms` |
| 11:32:02.468 | POST | `/api/gql`, over `http://` | 401 | 4 | 4 | BOM | `--> POST /api/gql 401 0ms` |
| 11:32:03.685 | POST | `/api/graphql` | 401 | 4 | 4 | EWR | `--> POST /api/graphql 401 0ms` |
| 11:32:04.243 | POST | `/api/gql` | 401 | 3 | 3 | EWR | `--> POST /api/gql 401 0ms` |
| 11:32:28.225 | GET | `/api/clients` | 200 | 558 | 3 | MRS | `--> GET /api/clients 200 553ms` |
| 11:32:30.656 | GET | `/api/vendors` | 200 | 788 | 5 | MRS | `--> GET /api/vendors 200 783ms` |
| 11:32:32.964 | GET | `/api/inventory` | 200 | 1372 | 5 | MRS | `--> GET /api/inventory 200 1s` |

### 3.2 The count for each endpoint

| Endpoint | 200 | 417 | Page |
|---|---|---|---|
| `/api/projects` | 0 | **6** | Projects |
| `/api/payables` | 0 | **4** | Payables |
| `/api/clients` | 2 | 0 | Clients |
| `/api/vendors` | 2 | 0 | Vendors |
| `/api/inventory` | 2 | 0 | Inventory |
| `/api/invoices` | 1 | 0 | Invoices |
| `/api/tasks` | 1 | 0 | Tasks |
| `/api/customers`, `/api/sales-persons`, `/api/project-types`, `/api/project-templates` | 1 each | 0 | the pickers of the project form |
| `/auth/me` | 1 | 0 | the session check |

### 3.3 What the log tells us

1. **The fault is always the same two endpoints.** `/api/projects` failed 6 of
   6 times. `/api/payables` failed 4 of 4 times. No endpoint failed one time and
   passed a different time. So this is not a network fault and not a load fault.
2. **ERPNext answered, and refused.** Each 417 took 349 to 756 ms. That is the
   same time as a request that passes. It is not a timeout. The Worker reached
   `csdstudio.frappe.cloud`, sent the token of the person, and got a refusal.
3. **The token is good.** The same session got 200 from seven other endpoints,
   in the same minute. So the 417 is not about permission. A permission
   refusal from ERPNext is 403, and the app shows a different message for it.
4. **The Worker did not fail.** Each event has outcome `ok` and no exception.
   CPU time is 2 to 5 ms. The Worker passed the status of ERPNext to the
   browser, as `middleware/errorHandler.ts` is written to do.
5. **Each failed page made two requests.** They are 1.6 to 2.0 seconds apart.
   That is the one retry of TanStack Query (`app/src/main.tsx`, `retry`:
   `failureCount < 1`). It retries a 417, which cannot pass the second time.
6. **The pickers of the project form load.** At 11:30:54 the four lookups
   answered 200. So the form to create a project opens on production. No
   project was created. Section 7.3 says why that form is a risk.
7. **Six requests are not from a person.** `/api/graphql` and `/api/gql`, by
   POST, from Frankfurt, Mumbai and Newark, in two seconds, two of them over
   `http://`. They are scanners that look for a GraphQL endpoint. They arrived
   26 minutes after the first deploy. `requireSession` refused each one with 401
   in 0 ms. This is correct, and it shows that the address is found by scanners
   at once.
8. **The log does not hold the reason.** See section 6.1.

The Inventory page loaded and showed this message. It is the proof that the
production site lacks custom fields that the old site has:

> Some columns are blank because your ERPNext does not have them. There is no
> equipment_status field on Item, so StudioOS cannot tell which gear is
> available, rented out or in the shop ... There is no rental_source field ...

---

## 4. The cause

### 4.1 What Frappe does

When a list query names a field that the site does not have, Frappe does not
return an empty value. It refuses the whole query with
`DataError: Field not permitted in query: <field>`, as HTTP 417. One absent
column stops one whole page. **Recorded** in `docs/PLAN-v2.md`, lines 692 to
702.

### 4.2 The two queries that fail

Both are plain `getList` calls on `Project`. Neither uses
`lib/optionalFields.ts`. **Observed** in the code at `v1.0.0`.

**Projects.** `worker/src/routes/projects.ts:111`:

```ts
const data = await frappe.getList<ProjectRow>('Project', {
  fields: [...PROJECT_LIST_FIELDS],
  limit: 200,
  orderBy: 'creation desc',
});
```

`PROJECT_LIST_FIELDS`, `worker/src/schemas/project.ts:5`, is 20 fields. Eight
are custom:

```
name, project_name, customer, status, project_type, project_template,
custom_sales_person, custom_commission_percent, custom_sanction_amount,
custom_shoot_date, custom_brand, custom_ad_agency, custom_production_house,
custom_poc,
expected_start_date, expected_end_date, total_billed_amount,
total_purchase_cost, gross_margin, per_gross_margin
```

**Payables.** `worker/src/routes/payables.ts:42`:

```ts
frappe.getList<PayableProjectRow>('Project', {
  fields: [
    'name', 'project_name', 'custom_sales_person', 'custom_commission_percent',
    'custom_sanction_amount', 'total_billed_amount', 'department',
  ],
  limit: 1000,
}),
```

### 4.3 The path of the error, from ERPNext to the screen

| Step | Where | What occurs |
|---|---|---|
| 1 | `worker/src/lib/frappe.ts`, `request()` | ERPNext answers 417. The body holds the exception text. The code does `throw new FrappeError(res.status, data)` |
| 2 | `worker/src/lib/errors.ts:33` | `FrappeError` sets the message to `ERPNext API error 417` and keeps the body in `details` |
| 3 | `worker/src/middleware/errorHandler.ts` | It answers `{ "error": "ERPNext API error 417", "details": <the ERPNext body> }` with status 417. It writes no log line |
| 4 | `app/src/lib/api.ts:56` to `66` | It makes an `ApiError` with the message from `error`. It keeps `details` on the error object |
| 5 | `app/src/components/ui/QueryState.tsx:68` to `71`, and `features/payables/PayablesPage.tsx:28` | Each shows only `error.message`. No page reads `error.details` |

So the reason reaches the browser, and the app keeps it in `ApiError.details`.
No screen shows it and no log holds it.

### 4.4 Why this was known

**Recorded** in `docs/PLAN-v2.md`, lines 312 to 319, from August 2026:

> The very first cross-site request failed with `Field not permitted in query:
> custom_sales_person`. Eight custom fields on `Project` exist on the CSDS site
> and on no other. They had to be created on `studio.os` by hand to get past
> it — which is precisely the normalisation job Phase 8 defers.

So the fields were added by hand to the local bench, and the code was not
changed. `lib/optionalFields.ts` was written later, for Inventory, Insights,
Invoices and Clients. Projects and Payables did not get it.

### 4.5 What is not verified

- The exact field that the production ERPNext names in its error.
- Which of the 12 fields in section 5 exist on the production site.
- Anything about the production site. No tool has access to it. Section 8.1
  is the check.

The old site is no longer in this list. Its custom fields, its master records
and the data in them were read on 2026-10-04. **Observed.** Appendix A.

---

## 5. Everything that StudioOS expects from an ERPNext site

This is the full list, read from the code at `v1.0.0`. It is the list to compare
both sites against.

"Protected" means the query uses `getListTolerant`: if the field is absent, the
page loads and says that the column is not available. "Not protected" means a
plain `getList`: if the field is absent, the page fails with 417.

How `getListTolerant` operates, `worker/src/lib/optionalFields.ts`: it runs the
query. If the error text matches `/Field not permitted in query:\s*([A-Za-z0-9_]+)/`,
it removes that field and runs the query again. It returns the rows and a list
`missingFields`. If the absent field is in a filter, it does not remove it. It
throws `SchemaGapError`, because a filter that is removed changes the answer.

### 5.1 Custom fields on `Project` — 8

`custom_sales_person`, `custom_commission_percent`, `custom_sanction_amount`,
`custom_shoot_date`, `custom_brand`, `custom_ad_agency`,
`custom_production_house`, `custom_poc`.

| Where | Call | Protected | If a field is absent |
|---|---|---|---|
| `routes/projects.ts:111` | list | **No** | **Projects fails, 417. Observed** |
| `routes/payables.ts:42` | list, 3 of the fields | **No** | **Payables fails, 417. Observed** |
| `routes/clients.ts:136` | list, `custom_brand`, `custom_shoot_date` | Yes | the column is blank |
| `routes/projectDetail.ts:406` and `409` | reads the whole document | — | **no error. See 7.2** |
| `routes/projects.ts:229` to `236` | create a project | — | **no error. See 7.3** |
| `routes/projects.ts:325` to `341` | edit a project | — | **no error. See 7.3** |
| `routes/projectCrew.ts:261` to `271` | reads the whole document, for `custom_shoot_date` | — | no error. It uses `expected_start_date`, then today. That fallback is correct |

### 5.2 Custom field on `Sales Invoice` — 1

`custom_invoice_number`. It holds the studio's own invoice number, such as
`CSDS_SINV_02_260630`.

| Where | Call | Protected | If the field is absent |
|---|---|---|---|
| `routes/invoices.ts:94` | list | Yes | Invoices loads. **Observed**: 200 |
| `routes/clients.ts:118` | list | Yes | the column is blank |
| `routes/projectDetail.ts:159` | list | **No** | **the project page fails, 417. Not verified** |
| `lib/invoiceNumber.ts:105` | list, to find the next number | **No** | to create an invoice fails. Release 2 |

### 5.3 Custom fields on `Item` — 2

`equipment_status`, `rental_source`. Both are protected, in
`routes/inventory.ts:55` and `routes/insights.ts:73`. **Observed**: the
production site does not have them, and Inventory loads with the message.

### 5.4 Field on `Project Template` — 1

`disabled`. Protected in `routes/lookups.ts`. **Observed**: 200.

### 5.5 Master records that the code names

A site that does not have a record with this exact name gives a wrong result or
an error. None of these is verified on the production site.

| Name in the code | Kind | Where | Effect if absent |
|---|---|---|---|
| `Freelance Crew` | Supplier Group | `routes/projectCrew.ts:62` | to add a crew member fails or uses the wrong group |
| `Rental House` | Supplier Group | `projectCrew.ts:63`, `lib/projectFinance.ts:52`, `lib/payablesAggregate.ts:31` | each supplier counts as crew, and none as vendor |
| `Services` | Item Group | `projectCrew.ts:65` | to add a crew role fails |
| `In-House Equipment`, `Rental House Catalogue` | Item Groups | `routes/inventory.ts:21` | Inventory is empty |
| `998431` | HSN code, needs the India Compliance app | `projectCrew.ts:66` | to make a role Item fails |
| `Shubham Chauhan` | Supplier name of the owner | `lib/payablesAggregate.ts:18` | money owed to the owner counts as a debt to an outside party |
| `Theatre Education - CSDS` | Department | `routes/projectDetail.ts:355` | theatre projects get the checklist of a film project |
| `PROJ-.####`, `SINV-.YY.-`, `ACC-PAY-.YYYY.-`, `PUR-ORD-.YYYY.-` | naming series | projects, invoices, payments, crew | the create action fails if the series is not allowed |
| `Nos` | UOM | `routes/invoices.ts:69` | an invoice line fails |
| `Cloud Shaped Dreams Studio` | Company, in `wrangler.jsonc` | project creation | **Confirmed** by Sandesh on 2026-10-04 |

`Sales - CSDS`, `Debtors - CSDS` and `Main - CSDS` are named only in
`routes/studioRental.ts`, which is not mounted. They are not a risk in
release 1.

**Each name in this table exists on the old site. Observed.** Appendix A.4. A
person made most of them by hand, so the production site has them only if a
person made them there too.

### 5.6 The list calls in each route file

| Route file | Protected list calls | Not protected |
|---|---|---|
| `projects.ts` | 0 | 7 |
| `projectDetail.ts` | 0 | 5 |
| `dashboard.ts` | 0 | 3 |
| `payments.ts` | 0 | 3 |
| `lookups.ts` | 0, it has its own fallback for `disabled` | 4 |
| `payables.ts` | 0 | 2 |
| `projectCrew.ts` | 0 | 2 |
| `clients.ts` | 3 | 3 |
| `insights.ts` | 2 | 3 |
| `invoices.ts` | 2 | 1 |
| `inventory.ts` | 2 | 1 |

A call that is not protected is a fault only when it names a field that the
site does not have. Sections 5.1 and 5.2 give the ones that do.

---

## 6. Two faults that made this difficult to diagnose

Neither one caused the incident. Each one made it slower to find.

### 6.1 The Worker does not log the reason that ERPNext gives

`middleware/errorHandler.ts` writes `console.error` only for an error that is
not an `AppError`. A `FrappeError` is an `AppError`. So a 417 from ERPNext
leaves no line in the log except the Hono status line. Workers observability is
enabled, and it has nothing to show.

The exception text of ERPNext names the field. It is in `details` of the
response. To read it, a person must open the developer tools of the browser, on
the page that fails, at the moment that it fails.

A correction: log the status, the path, and the `exception` text of ERPNext for
each `FrappeError` of 4xx that is not 401, 403 or 404. The text names a field.
It holds no secret and no studio data.

### 6.2 The app shows a development hint in production

`app/src/components/ui/QueryState.tsx:68` to `71`. A table that uses
`QueryState`, such as the Projects list, shows this for each error that is not
a 403. Sandesh saw it on Projects in production:

> Couldn't load: ERPNext API error 417
> Is the API Worker running? Try `bun run dev` in `worker/`.

Payables has its own message and no hint: `Couldn't load payables: ERPNext API
error 417`. Nine more pages have their own message of the same kind. None of
them shows `details`.

The second line is for a developer on a laptop. In production it is wrong, and
it sends a person to look for the wrong fault. It also names a command that
ADR-0004 changed: the command is `bun run dev` from the repository root.

A correction: show the hint only in development (`import.meta.env.DEV`). In
production, show the reason from `details` when it is a missing field, in the
same words that Inventory uses.

### 6.3 The app retries a request that cannot pass

Section 3.3, item 5. A 417 is a refusal of the query, and the same query gets
the same refusal. `app/src/main.tsx` stops the retry for 401 and 403. Add each
other 4xx.

---

## 7. The problems, in order of importance

### 7.1 Two pages do not load — the reason production is stopped

Projects and Payables fail with 417. **Observed.** Projects is the first page
that Shubham must see. `docs/tasks/r1-production.md` says release 1 is done
"when Shubham sees his own projects".

### 7.2 A project page can show a wrong money figure, with no error

`routes/projectDetail.ts:406` and `409`:

```ts
sanctioned: Number(project.custom_sanction_amount || 0),
commissionPercent: Number(project.custom_commission_percent || 0),
```

If the site has no `custom_sanction_amount`, the value is not "not available".
It is **0**. The Money tab then shows a sanctioned amount of ₹0 and calculates
the commission and the remaining budget from 0. That is a number that looks
correct and is not. It breaks the studio's rule "never guess money"
(`routes/projectCrew.ts:16`). `lib/optionalFields.ts` gives the same rule for
this case: say that the figure is not available, and do not calculate one from
data that is absent. **Observed** in the code. **Not verified** on the
production screen, because the Projects list does not load and so no project
was opened.

This is more serious than 7.1. A page that fails is reported. A wrong number is
believed.

### 7.3 To create or edit a project can lose what the person typed, with no error

`routes/projects.ts:229` to `236` writes the 8 custom fields. The Frappe REST
API is expected to ignore a field that the DocType does not have. If it does,
then on a site without the fields the person types a sales person, a commission
and a budget, the save succeeds, and the values are not kept. **Not verified**,
for the behaviour of Frappe and for the production site. Do not test it on
production, which holds real data. Test it on a site without the fields.

The form opens on production today. Section 3.3, item 6.

### 7.4 The project page can fail a second time

`routes/projectDetail.ts:159` asks for `custom_invoice_number` on
`Sales Invoice`, not protected. If the production site lacks it, each project
page fails with 417, after 7.1 is corrected. **Not verified.** A hint that the
field can be present: `/api/invoices` answered 200, but that call is protected,
so the 200 does not prove it.

### 7.5 The master records of section 5.5 are not checked

Each name can be absent on the production site. The effect is small for a page
that only reads, and a failed action for a page that writes. Crew (add, edit,
remove) is in release 1 and depends on four of them.

### 7.6 The data itself can be incomplete on the production site

This is the question behind all the others. If `csdstudio.frappe.cloud` does
not have `custom_sanction_amount`, then the budget, the commission, the brand
and the shoot date of each project, which the studio typed on the old site,
are not on the new site. That is a question about the data of the studio, not
about StudioOS. Shubham must know the answer before he uses the new site as
the record.

What is in those fields on the old site, **Observed**, Appendix A.2: 30 of 34
projects have a sanctioned amount, and the total is ₹3,66,334. That is the
budget figure of almost each project. 193 of 270 items have a rental source.

### 7.7 The test could not find this

Staging and production sign in on two different ERPNext sites with two
different schemas. A test on staging proves the code against the old site only.
`docs/WORKFLOW.md` says "the code that a person tests is exactly the code that
ships". That is true for the code. It is not true for the site behind it.

---

## 8. The evidence that is missing, and how to get it

### 8.1 The check that takes one minute — do this first

A System Manager signs in on `https://csdstudio.frappe.cloud`, then opens each
address below in the same browser. Each one is the query that StudioOS sends,
with a limit of one row. Each is a GET. It changes nothing.

The Projects query:

```
https://csdstudio.frappe.cloud/api/resource/Project?fields=["name","project_name","customer","status","project_type","project_template","custom_sales_person","custom_commission_percent","custom_sanction_amount","custom_shoot_date","custom_brand","custom_ad_agency","custom_production_house","custom_poc","expected_start_date","expected_end_date","total_billed_amount","total_purchase_cost","gross_margin","per_gross_margin"]&limit_page_length=1
```

The Payables query:

```
https://csdstudio.frappe.cloud/api/resource/Project?fields=["name","project_name","custom_sales_person","custom_commission_percent","custom_sanction_amount","total_billed_amount","department"]&limit_page_length=1
```

The answer is one of two:

- An exception that contains `Field not permitted in query: <field>`. That
  names the first field that is absent. This confirms the cause.
- One row of data. Then the cause in this document is wrong, and the diagnosis
  starts again from the `details` of the response in the browser.

Frappe names only one field for each query. To find each absent field, remove
the named field from the address and open it again, until a row comes back.
That is what `getListTolerant` does.

A second way, with no address to type: on the production site, open Customize
Form for `Project`, and look for the 8 fields of section 5.1.

A third way: on the Projects page of production, open the developer tools,
Network, the `projects` request in red, Response. Read `details`.

### 8.2 The full comparison of the two sites

**The old site is done.** Appendix A. The files are in
`E:\Swadharma\skew\old-site\`, outside the repository.

**The production site is not done.** A System Manager opens each address below
on `https://csdstudio.frappe.cloud`, and saves the page as a file. The answers
are schema and names. They hold no secret.

| # | Address, after the site name | Save as |
|---|---|---|
| 1 | `/api/resource/Custom Field?fields=["dt","fieldname","label","fieldtype","options","insert_after","reqd"]&limit_page_length=5000` | `custom-fields.json` |
| 2 | `/api/resource/DocType?filters=[["custom","=",1]]&fields=["name","module","istable"]&limit_page_length=1000` | `custom-doctypes.json` |
| 3 | `/api/resource/Property Setter?fields=["doc_type","field_name","property","value"]&limit_page_length=5000` | `property-setters.json` |
| 4 | `/api/resource/Supplier Group?limit_page_length=500` | `supplier-groups.json` |
| 5 | `/api/resource/Item Group?limit_page_length=500` | `item-groups.json` |
| 6 | `/api/resource/Department?limit_page_length=500` | `departments.json` |
| 7 | `/api/method/frappe.utils.change_log.get_versions` | `versions.json` |

Put the files in `skew/production/`, beside `skew/old-site/`. Then the two
lists are compared, and each "Not verified" in this document becomes a fact.

To the first address, add `"owner","creation","module","is_system_generated"`
in the list of fields. `is_system_generated` is what separates a field that an
app installed from a field that a person added.

---

## 9. The decisions

### D-A. How production gets its Projects page — decide first

| Option | What | For | Against |
|---|---|---|---|
| **A1** | Add the missing custom fields to the production ERPNext, by hand | No code change. Minutes. Corrects 7.1 to 7.4 together | `docs/SEAM.md` section 3 forbids a dependency on a custom field of a stock DocType in version 1. The next studio has the same fault. A person must do it again on each site |
| **A2** | Make the code tolerant: `getListTolerant` in `projects.ts`, `payables.ts` and `projectDetail.ts`, and "not available" in place of 0 | Correct for each site. Uses code that exists and is tested | A `fix/` branch, `release/v1.0.1`, a demo test, a tag, a deploy. Hours, not minutes. It does not bring the data of 7.6 |
| **A3** | A1 now, then A2 as `v1.0.1` | Shubham starts today, and the code becomes correct | Two changes. The custom fields stay on the production site |

Recommendation: **A3, if the studio wants those fields on the new site**, which
7.6 decides. If the studio does not want them, A2 only.

In each option, `v1.0.1` also takes the three corrections of section 6. They are
small, and they make the next fault of this kind visible in one minute.

### D-B. How `v1.0.1` is tested, if A2 or A3

Demo signs in on the old site, which has each field. So demo cannot show the
fault, and cannot show that it is corrected. The local bench `studio.os` got
the 8 fields by hand in August, so it cannot show it either. A test needs a
site **without** the fields. Options: a new empty site on the local bench, or
unit tests that give `getListTolerant` a fake site that refuses the field. The
second one exists as a pattern in `worker/tests/optionalFields.test.ts`.

### D-C. Is the data on the production site complete — 7.6

Shubham and Malhar. The answers of section 8.2 show the difference in schema. A
count of projects, invoices and customers on each site shows the difference in
data.

---

## 10. What was done and what was not

Done on 2026-10-04:

- Production deployed from `v1.0.0`, steps 1 to 8 of `docs/DEPLOY.md`.
- P1 passed. P2 failed on Projects and Payables.
- The live log was read. The code was read. This document was written.
- The old site was read with `frappe-ctl`, in read-only mode. Appendix A.

Not done, on purpose:

- No change to the production ERPNext site.
- No change to the old ERPNext site. It was read only.
- No change to the code, and no new deploy.
- No record created, edited or deleted in production.
- No rollback. There is no earlier version to roll back to, and the seven pages
  that operate are of use.
- Shubham has not signed in.

---

## Appendix A — the old site, read on 2026-10-04

Site: `cloudshapeddreamsstudio.m.erpnext.com`. Read with `frappe-ctl` 0.3.0, as
`tangadesandesh2001@gmail.com`, with `FRAPPE_CTL_READONLY=1`, which stops each
write. Only the verbs `get`, `count` and `describe` were used. Each statement in
this appendix is **Observed**.

The files are in `E:\Swadharma\skew\old-site\`, outside the repository.

### A.1 The custom fields: 567, and who made them

Frappe marks a custom field `is_system_generated = 1` when an app or the system
installed it. A field with `0` was added by a person, in Customize Form.

| Origin | Count |
|---|---|
| India Compliance app, module `GST India` | 522 |
| Module `Income Tax India` | 9 |
| Module `Audit Trail` | 2 |
| System, no module: Print Designer (9), impersonation (3), print settings (3), others (6) | 21 |
| **Added by a person** | **13** |
| Total | 567 |

**The 13 fields that a person added.** This is the schema skew.

| DocType | Field | Type | Options | Added by | Date | StudioOS asks for it |
|---|---|---|---|---|---|---|
| Project | `custom_sanction_amount` | Currency | | Malhar | 2026-02-09 | Yes |
| Project | `custom_sales_person` | Link | Sales Person | Shubham | 2026-07-09 | Yes |
| Project | `custom_commission_percent` | Percent | | Shubham | 2026-07-09 | Yes |
| Project | `custom_brand` | Data | | Shubham | 2026-07-10 | Yes |
| Project | `custom_production_house` | Data | | Shubham | 2026-07-10 | Yes |
| Project | `custom_poc` | Data | | Shubham | 2026-07-10 | Yes |
| Project | `custom_shoot_date` | Date | | Shubham | 2026-07-10 | Yes |
| Project | `custom_ad_agency` | Data | | Shubham | 2026-07-10 | Yes |
| Sales Invoice | `custom_invoice_number` | Data | | Shubham | 2026-07-10 | Yes |
| Item | `equipment_status` | Select | Available, Rented Out, In Repair, In Maintenance | Shubham | 2026-07-05 | Yes, protected |
| Item | `rental_source` | Link | Supplier | Shubham | 2026-07-05 | Yes, protected |
| Company | `custom_authorized_signature` | Attach Image | | Sandesh | 2026-07-15 | **No** |
| Company | `custom_upi_qr_code` | Attach Image | | Sandesh | 2026-07-15 | **No** |

So the 12 fields of section 5 are not a guess from the code. They are 12 of the
13 fields that three people added by hand to one site, from February to July
2026. No app, no fixture and no script creates them. A site gets them only when
a person adds them.

`Project Template.disabled` (section 5.4) is not in this list. On the old site
it is a field of the DocType itself, not a custom field. `docs/PLAN-v2.md` says
that a stock ERPNext v15 does not have it. So that one is a difference of
ERPNext version, not a field that a person added. The version of each site is
not collected. See A.6.

### A.2 What is in those fields — the data at stake

34 projects, 47 sales invoices, 270 items.

| Field | Has a value in | Note |
|---|---|---|
| `Project.custom_sanction_amount` | **30 of 34** projects | The total is ₹3,66,334. This is the budget of almost each project |
| `Project.custom_sales_person` | 4 of 34 | |
| `Project.custom_commission_percent` | 3 of 34 | |
| `Project.custom_shoot_date` | 3 of 34 | |
| `Project.custom_poc` | 3 of 34 | |
| `Project.custom_brand` | 1 of 34 | |
| `Project.custom_production_house` | 1 of 34 | |
| `Project.custom_ad_agency` | **0 of 34** | Never used |
| `Sales Invoice.custom_invoice_number` | 3 of 47 | |
| `Item.rental_source` | 193 of 270 | Each item in `Rental House Catalogue` |
| `Item.equipment_status` | 16 of 270 | Each one is `Available`. Each item in `In-House Equipment` |
| `Company.custom_authorized_signature` | set | An image |
| `Company.custom_upi_qr_code` | set | An image |

Only one field holds much data: the sanctioned amount. Five of the eight Project
fields have a value in three projects or fewer. One has none.

### A.3 The number of records

| DocType | Count | DocType | Count |
|---|---|---|---|
| Project | 34 | Customer | 20 |
| Task | 270 | Supplier | 16 |
| Sales Invoice | 47 | Item | 270 |
| Purchase Invoice | 45 | Payment Entry | 17 |
| Purchase Order | 8 | Sales Order | 4 |
| Quotation | 2 | Comment | 373 |
| File | 17 | Journal Entry, Timesheet | 0 |

Count the same DocTypes on the production site. The difference is the answer
to decision D-C.

### A.4 The master records that the code names

Each one exists on the old site.

| Name in the code | On the old site | Made by |
|---|---|---|
| Supplier Group `Freelance Crew` | Yes. It is a group node. Its children are `Direction & Production` and `Theatre & Performance` | Malhar, 2026-03-25 |
| Supplier Group `Rental House` | Yes, under `Vendor Companies`. 3 suppliers | Shubham, 2026-07-05 |
| Item Group `Services` | Yes. It is a group node. 5 items | ERPNext setup |
| Item Group `In-House Equipment` | Yes. 16 items | Shubham, 2026-07-05 |
| Item Group `Rental House Catalogue` | Yes. 193 items | Shubham, 2026-07-05 |
| Supplier `Shubham Chauhan` | Yes | — |
| Department `Theatre Education - CSDS` | Yes. 2 projects use it | Shubham, 2026-07-07 |
| UOM `Nos` | Yes | ERPNext setup |
| Company `Cloud Shaped Dreams Studio` | Yes. `abbr` is `CSDS` | ERPNext setup |
| Company accounts | `Sales - CSDS`, `Debtors - CSDS`, `Main - CSDS`, `Creditors - CSDS` | ERPNext setup |
| HSN `998431`, India Compliance | The app is installed: 522 of its fields are present | — |

Two facts about the Supplier Groups that the code does not know:

- `Freelance Crew` is a group node. The 7 crew suppliers are in its two child
  groups, not in `Freelance Crew` itself. `routes/projectCrew.ts:62` makes a new
  crew supplier in `Freelance Crew`. The split between crew and vendor still
  operates, because it tests only for `Rental House`.
- 2 of the 16 suppliers have no group.

Other master records, for the comparison with production:

| Kind | On the old site |
|---|---|
| Project Type | 13. Ten were added by a person: Advertisement, Documentary, Feature Film, Podcast, Promotional, Short Film, Social Media Reel, Theatre Education, TV/DV Commercial, and `Software`, which Sandesh added on 2026-10-02, the day of the staging test |
| Project Template | 2: `Ad Film Production`, `Workshop / Education`. 5 of 34 projects use one |
| Sales Person | 2, and the group: `Prem Kumar Boinwad`, `Shubham Chauhan` |
| Mode of Payment | 6. One is not a standard ERPNext record: `UPI \| Kotak 811` |
| Supplier Group | 16. Eight were added by a person: `Freelance Crew` and `Vendor Companies`, and six groups under them |
| Item Group | 24. Eighteen were added by a person: a tree of 15 under `Services`, and `In-House Equipment`, `Rental House Catalogue` and `Equipment Rental` |

### A.5 The other things that a person changed on the old site

StudioOS reads none of these. They are listed so that the comparison with the
production site is complete.

| Kind | What |
|---|---|
| Property setters, 9 by hand | On `Project`: the label of `customer` is "Client", of `project_type` is "Project Category", of `project_template` is "Sub-Category Template", of `users` is "Crew". A field order. Quick entry for two fields. On `Sales Invoice`: the default print format is `GST Tax Invoice` |
| Property setters, 26 from list settings | Which columns show in the list of Project, Sales Invoice, Purchase Invoice and Payment Entry |
| Custom DocType | `Resource Booking`, module `Custom`. 0 records |
| Client Script | `Resource Booking - Overlap Warning`, enabled |
| Server Script | `Resource Booking - Prevent Overlap`, disabled |
| Print Format | `CSDS Invoice` and `Custom_Invoice`, on Sales Invoice, 2026-07-15. The Print Designer app is installed |
| Workflow, custom Role, custom Report | None |

### A.6 What was not collected from the old site

- **The versions of ERPNext and of each app.** The read-only mode of the tool
  stops the method call that gives them, and `Installed Application` answered
  403 for this user. India Compliance and Print Designer are known to be
  installed, from their fields.
- **The full list of custom DocTypes.** The tool cannot list the DocType
  `DocType`. One is known: `Resource Booking`.

### A.7 Two facts that this reading found, outside the incident

1. **The old site has an image of the UPI QR code.** `Company.custom_upi_qr_code`
   and `Company.custom_authorized_signature` are both set. StudioOS reads
   neither: `lib/companyProfile.ts` does not ask for them. `docs/RELEASE-1.md`
   says that the invoice has no UPI QR code because "ERPNext has no field for a
   UPI id". That is correct for a UPI id as text. An image of the code is there.
   This is a fact for the release 2 list, not a fault of release 1.
2. **Two errors are in the error log of the old site, from this reading.** A
   query for the DocType `DocType` gave HTTP 500, two times. Nothing was written.

### A.8 What this appendix changes in the decisions

- **For D-A.** Option A1 is a known and small piece of work: 12 fields, on 3
  DocTypes, with the types and options of table A.1. Without `custom_ad_agency`,
  which no project uses, it is 11.
- **For D-C.** The data that is at risk is mostly one figure: the sanctioned
  amount of 30 projects. If the production site has the projects and not this
  field, the budgets are not there.
- **For the code, option A2.** Each of the 12 fields can be absent on each new
  site, because only a person adds them. So StudioOS must operate without each
  one, and must say "not available" and not show 0.
