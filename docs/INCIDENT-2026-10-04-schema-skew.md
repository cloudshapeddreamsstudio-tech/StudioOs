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
- **Not verified** — a conclusion that has no direct evidence yet. Section 6
  says how to get the evidence.

---

## 1. Summary

1. `v1.0.0` is in production. Sign-in operates. Seven pages load.
2. **Projects and Payables do not load.** Each shows `ERPNext API error 417`.
3. The cause is schema skew between the two ERPNext sites. StudioOS asks ERPNext
   for custom fields that a person added by hand to the old site
   (`cloudshapeddreamsstudio.m.erpnext.com`). The production site
   (`csdstudio.frappe.cloud`) does not have all of them. **Not verified** by the
   text of the ERPNext error. Section 3 gives the evidence that is available.
4. Staging signs in on the old site, which has each field. So the test of 29
   items on staging could not find this fault.
5. This is not a new problem. `docs/PLAN-v2.md` recorded it in August and
   deferred it to Phase 8. Projects and Payables were never protected.
6. No data is changed or lost. StudioOS failed to read. It wrote nothing.
7. Three decisions are necessary. Section 7.

---

## 2. What was observed

The deployment itself is correct.

| Fact | Value | Mark |
|---|---|---|
| Tag | `v1.0.0` = commit `79e74f6`, on `main` | Observed |
| Worker | `studioos-production`, version `9e713de3-b151-42c1-838f-d3067f7b1c67` | Observed |
| Address | `studioos.cloudshapeddreamsstudio.com` only. No `workers.dev` address | Observed |
| `/api/health` | `{"ok":true,"registryBound":true,"appOrigin":"https://studioos.cloudshapeddreamsstudio.com"}` | Observed |
| `check-one-origin.ts` | 5 of 5 pass | Observed |
| Sign-in with `csdstudio.frappe.cloud` | arrives on the dashboard (P1 passes) | Observed |
| The staging ERPNext site, on production | refused: "is not connected to StudioOS yet" | Observed |

The live log of the production Worker, while Sandesh opened each page:

| Endpoint | Status | Page |
|---|---|---|
| `/api/projects` | **417**, 6 times | Projects |
| `/api/payables` | **417**, 4 times | Payables |
| `/api/invoices` | 200 | Invoices |
| `/api/tasks` | 200 | Tasks |
| `/api/clients` | 200 | Clients |
| `/api/vendors` | 200 | Vendors |
| `/api/inventory` | 200 | Inventory |
| `/api/customers`, `/api/sales-persons`, `/api/project-types`, `/api/project-templates` | 200 | the project form pickers |

The Inventory page loaded and showed this message. It is the proof that the
production site lacks custom fields that the old site has:

> Some columns are blank because your ERPNext does not have them. There is no
> equipment_status field on Item ... There is no rental_source field ...

`/api/gql` and `/api/graphql` answered 401, two times each. Those are scanners
on the internet. The Worker refused them correctly.

---

## 3. The cause

### 3.1 What Frappe does

When a list query names a field that the site does not have, Frappe does not
return an empty value. It refuses the whole query with
`DataError: Field not permitted in query: <field>`, as HTTP 417. One absent
column stops one whole page. **Recorded** in `docs/PLAN-v2.md`, lines 692 to
702.

### 3.2 The two queries that fail

Both are plain `getList` calls on `Project`. Neither uses
`lib/optionalFields.ts`. **Observed** in the code at `v1.0.0`.

| File and line | Custom fields in the query |
|---|---|
| `worker/src/routes/projects.ts:111`, with `PROJECT_LIST_FIELDS` from `worker/src/schemas/project.ts:8` | all 8 fields of section 4.1 |
| `worker/src/routes/payables.ts:42` | `custom_sales_person`, `custom_commission_percent`, `custom_sanction_amount` |

### 3.3 Why this was known

**Recorded** in `docs/PLAN-v2.md`, lines 312 to 319, from August 2026:

> The very first cross-site request failed with `Field not permitted in query:
> custom_sales_person`. Eight custom fields on `Project` exist on the CSDS site
> and on no other. They had to be created on `studio.os` by hand to get past
> it — which is precisely the normalisation job Phase 8 defers.

So the fields were added by hand to the local bench, and the code was not
changed. `lib/optionalFields.ts` was written later, for Inventory, Insights,
Invoices and Clients. Projects and Payables did not get it.

### 3.4 What is not verified

- The exact field that the production ERPNext names in its error. The app shows
  only `ERPNext API error 417`.
- Which of the 12 fields in section 4 exist on the production site.
- The list of custom fields on the old site. The saved login of `frappe-ctl`
  for that site is from August and is expired. The site refused to renew it
  (HTTP 403), and the `frappe-ctl` program is not on this machine now. So this
  document has the list that **the code asks for**, not the list that **the
  site has**. Section 6 closes this gap.

---

## 4. Everything that StudioOS expects from an ERPNext site

This is the full list, read from the code at `v1.0.0`. It is the list to compare
both sites against.

"Protected" means the query uses `getListTolerant`: if the field is absent, the
page loads and says that the column is not available. "Not protected" means a
plain `getList`: if the field is absent, the page fails with 417.

### 4.1 Custom fields on `Project` — 8

`custom_sales_person`, `custom_commission_percent`, `custom_sanction_amount`,
`custom_shoot_date`, `custom_brand`, `custom_ad_agency`,
`custom_production_house`, `custom_poc`.

| Where | Call | Protected | If a field is absent |
|---|---|---|---|
| `routes/projects.ts:111` | list | **No** | **Projects fails, 417. Observed** |
| `routes/payables.ts:42` | list, 3 of the fields | **No** | **Payables fails, 417. Observed** |
| `routes/clients.ts:136` | list, `custom_brand`, `custom_shoot_date` | Yes | the column is blank |
| `routes/projectDetail.ts:406` and `409` | reads the whole document | — | **no error. See 5.2** |
| `routes/projects.ts:229` to `236` | create a project | — | **no error. See 5.3** |
| `routes/projects.ts:325` to `341` | edit a project | — | **no error. See 5.3** |
| `routes/projectCrew.ts:261` to `271` | reads the whole document, for `custom_shoot_date` | — | no error. It uses `expected_start_date`, then today. That fallback is correct |

### 4.2 Custom field on `Sales Invoice` — 1

`custom_invoice_number`. It holds the studio's own invoice number, such as
`CSDS_SINV_02_260630`.

| Where | Call | Protected | If the field is absent |
|---|---|---|---|
| `routes/invoices.ts:94` | list | Yes | Invoices loads. **Observed**: 200 |
| `routes/clients.ts:118` | list | Yes | the column is blank |
| `routes/projectDetail.ts:159` | list | **No** | **the project page fails, 417. Not verified** |
| `lib/invoiceNumber.ts:105` | list, to find the next number | **No** | to create an invoice fails. Release 2 |

### 4.3 Custom fields on `Item` — 2

`equipment_status`, `rental_source`. Both are protected, in
`routes/inventory.ts:55` and `routes/insights.ts:73`. **Observed**: the
production site does not have them, and Inventory loads with the message.

### 4.4 Field on `Project Template` — 1

`disabled`. Protected in `routes/lookups.ts`. **Observed**: 200.

### 4.5 Master records that the code names

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

### 4.6 Summary of the code

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
site does not have. Sections 4.1 and 4.2 give the ones that do.

---

## 5. The problems, in order of importance

### 5.1 Two pages do not load — the reason production is stopped

Projects and Payables fail with 417. **Observed.** Projects is the first page
that Shubham must see. `docs/tasks/r1-production.md` says release 1 is done
"when Shubham sees his own projects".

### 5.2 A project page can show a wrong money figure, with no error

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
data that is absent. **Observed** in the code.
**Not verified** on the production screen, because the Projects list does not
load and so no project was opened.

This is more serious than 5.1. A page that fails is reported. A wrong number is
believed.

### 5.3 To create or edit a project can lose what the person typed, with no error

`routes/projects.ts:229` to `236` writes the 8 custom fields. The Frappe REST
API is expected to ignore a field that the DocType does not have. If it does,
then on a site without the fields the person types a sales person, a commission
and a budget, the save succeeds, and the values are not kept. **Not verified**,
for the behaviour of Frappe and for the production site. Do not test it on
production, which holds real data. Test it on a site without the fields.

### 5.4 The project page can fail a second time

`routes/projectDetail.ts:159` asks for `custom_invoice_number` on
`Sales Invoice`, not protected. If the production site lacks it, each project
page fails with 417, after 5.1 is corrected. **Not verified.**

### 5.5 The master records of section 4.5 are not checked

Each name can be absent on the production site. The effect is small for a page
that only reads, and a failed action for a page that writes. Crew (add, edit,
remove) is in release 1 and depends on four of them.

### 5.6 The data itself can be incomplete on the production site

This is the question behind all the others. If `csdstudio.frappe.cloud` does
not have `custom_sanction_amount`, then the budget, the commission, the brand
and the shoot date of each project, which the studio typed on the old site,
are not on the new site. That is a question about the data of the studio, not
about StudioOS. Shubham must know the answer before he uses the new site as
the record.

### 5.7 The test could not find this

Staging and production sign in on two different ERPNext sites with two
different schemas. A test on staging proves the code against the old site only.
`docs/WORKFLOW.md` says "the code that a person tests is exactly the code that
ships". That is true for the code. It is not true for the site behind it.

---

## 6. The evidence that is missing, and how to get it

A System Manager opens each address below in a browser, signed in on that
site, and saves the page as a file. Do it for **both** sites. The answers are
schema and names. They hold no secret.

| # | Address, after the site name | Save as |
|---|---|---|
| 1 | `/api/resource/Custom Field?fields=["dt","fieldname","label","fieldtype","options","insert_after","reqd"]&limit_page_length=5000` | `custom-fields.json` |
| 2 | `/api/resource/DocType?filters=[["custom","=",1]]&fields=["name","module","istable"]&limit_page_length=1000` | `custom-doctypes.json` |
| 3 | `/api/resource/Property Setter?fields=["doc_type","field_name","property","value"]&limit_page_length=5000` | `property-setters.json` |
| 4 | `/api/resource/Supplier Group?limit_page_length=500` | `supplier-groups.json` |
| 5 | `/api/resource/Item Group?limit_page_length=500` | `item-groups.json` |
| 6 | `/api/resource/Department?limit_page_length=500` | `departments.json` |
| 7 | `/api/method/frappe.utils.change_log.get_versions` | `versions.json` |

Put the files in two folders, `skew/old-site/` and `skew/production/`, outside
the repository. Then the two lists are compared, and each "Not verified" in this
document becomes a fact.

The fastest single check, if only one is done: on the production site, open
Customize Form for `Project` and look for the 8 fields of section 4.1.

---

## 7. The decisions

### D-A. How production gets its Projects page — decide first

| Option | What | For | Against |
|---|---|---|---|
| **A1** | Add the missing custom fields to the production ERPNext, by hand | No code change. Minutes. Corrects 5.1 to 5.4 together | `docs/SEAM.md` section 3 forbids a dependency on a custom field of a stock DocType in version 1. The next studio has the same fault. A person must do it again on each site |
| **A2** | Make the code tolerant: `getListTolerant` in `projects.ts`, `payables.ts` and `projectDetail.ts`, and "not available" in place of 0 | Correct for each site. Uses code that exists and is tested | A `fix/` branch, `release/v1.0.1`, a demo test, a tag, a deploy. Hours, not minutes. It does not bring the data of 5.6 |
| **A3** | A1 now, then A2 as `v1.0.1` | Shubham starts today, and the code becomes correct | Two changes. The custom fields stay on the production site |

Recommendation: **A3, if the studio wants those fields on the new site**, which
5.6 decides. If the studio does not want them, A2 only.

### D-B. How `v1.0.1` is tested, if A2 or A3

Demo signs in on the old site, which has each field. So demo cannot show the
fault, and cannot show that it is corrected. The local bench `studio.os` got
the 8 fields by hand in August, so it cannot show it either. A test needs a
site **without** the fields. Options: a new empty site on the local bench, or
unit tests that give `getListTolerant` a fake site that refuses the field. The
second one exists as a pattern in `worker/tests/optionalFields.test.ts`.

### D-C. Is the data on the production site complete — 5.6

Shubham and Malhar. The answers of section 6 show the difference in schema. A
count of projects, invoices and customers on each site shows the difference in
data.

---

## 8. What was done and what was not

Done on 2026-10-04:

- Production deployed from `v1.0.0`, steps 1 to 8 of `docs/DEPLOY.md`.
- P1 passed. P2 failed on Projects and Payables.
- The live log was read. The code was read. This document was written.

Not done, on purpose:

- No change to the production ERPNext site.
- No change to the code, and no new deploy.
- No record created, edited or deleted in production.
- No rollback. There is no earlier version to roll back to, and the seven pages
  that operate are of use.
- Shubham has not signed in.
