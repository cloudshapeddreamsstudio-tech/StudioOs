# 0005. Custom fields, and the ERPNext schema that StudioOS needs

- **Status:** Accepted
- **Date:** 2026-10-09
- **Owner:** Malhar
- **Changes:** `docs/SEAM.md` section 3, tier 2. `docs/WORKFLOW.md`. Adds the
  folder `erpnext/`.

## The question

StudioOS reads custom fields on DocTypes that ERPNext ships. Is that permitted?
If it is, which fields, and how does a site get them?

## Why the question is open

On 2026-10-04, release `v1.0.0` went to production. The Projects page and the
Payables page failed with HTTP 417. `docs/INCIDENT-2026-10-04-schema-skew.md`
has the full record.

The cause: three people added 13 custom fields to the old ERPNext site by hand,
from February to July 2026. The code asks for 12 of them. Nothing recorded
them. The production site had none of them.

`docs/SEAM.md` section 3 said that a custom field on a stock DocType is
forbidden in version 1. The code did not obey that rule on the day the rule was
written. So the rule was not true, and nobody checked.

An audit of the old site on 2026-10-09 measured the use of each field
(`docs/AUDIT-2026-10-09-old-site.md`). Most are almost empty:

| Field | Has a value |
|---|---|
| `Project.custom_sanction_amount` | 30 of 34 projects |
| `Project.custom_sales_person` | 4 of 34 |
| `Project.custom_commission_percent`, `custom_shoot_date`, `custom_poc` | 3 of 34 each |
| `Project.custom_brand`, `custom_production_house` | 1 of 34 each |
| `Project.custom_ad_agency` | 0 of 34 |
| `Sales Invoice.custom_invoice_number` | 3 of 47 |
| `Item.equipment_status`, `Item.rental_source` | for the rental feature, which is release 2 |

## The options

**A. Forbid each custom field.** The rule of SEAM, as written. It makes the
budget of a project impossible to keep, because ERPNext has no field with that
meaning.

**B. Permit a custom field when a person adds it by hand.** This is what
happened. It caused the incident.

**C. Permit a custom field under conditions, from a list in the repository.**

## The decision

Option C. **A custom field on a stock DocType is permitted only when all five
conditions are true.**

1. **It is a record of the studio.** It stays if you delete StudioOS.
2. **ERPNext has no field and no document with that meaning.**
3. **A screen that is in a release uses it.**
4. **It is a file in `erpnext/schema/`, with the reason in the commit.**
5. **StudioOS operates when the field is absent.** It shows "not available". It
   never shows 0, and it never fails.

The fields today:

| Field | Decision |
|---|---|
| `Project.custom_sanction_amount` | **Permitted.** `erpnext/schema/0001_project_sanction_amount.json` |
| `Sales Invoice.custom_invoice_number` | **Not permitted.** Use the naming series of ERPNext, which condition 2 names |
| The 7 other `Project` fields | **Not in release 1.** Each one returns as a new file when Shubham asks for it and a screen uses it |
| `Item.equipment_status`, `Item.rental_source` | **Release 2**, with the rental feature |
| `Project.custom_ad_agency` | **Dropped.** No project uses it |

A person does not add a field in Customize Form. A field comes from a file in
`erpnext/schema/`, applied with `frappe-ctl`. `erpnext/README.md` has the
procedure.

## Why

**The data is in the correct place.** A budget is a record of the studio, so
question 1 of SEAM sends it to ERPNext. The fault was not where the data is. The
fault was that nothing said the field must exist.

**A list in the repository makes a site repeatable.** A new site gets its fields
from files, in minutes. The old site got them from three people in five months.

**Condition 5 is the one that protects money.** `routes/projectDetail.ts` reads
an absent sanction amount as 0, and then calculates a commission and a remaining
budget from 0. A page that fails is reported. A wrong number is believed.

**Condition 3 keeps the list short.** A field with a value on 1 of 34 projects
is not a need. It waits until the product manager asks.

## What this costs

**The code must change before the rule is true.** Today the code asks for 12
fields and protects 3. Release `v1.0.1` must make each read tolerant
(`getListTolerant`, which exists and is tested) and must stop the read of the
fields that are not permitted. Until then, this ADR is a target.

**Seven fields with a few values are not carried to the new site.** Nine values
in total. A person can copy them into the project notes by hand.

**A person applies a file. No machine does it yet.** The check that a site has
each file is a command today and a script later.

## What does not change

- A DocType that StudioOS owns still follows ADR-0001.
- ERPNext must not depend on StudioOS. A custom field does not change that: if
  you delete StudioOS, the field is one more column and ERPNext operates.
- StudioOS has no permission code and holds no credential for a studio.

## How we know if this was wrong

- A release fails on a site because a field is absent. Then condition 5 was not
  obeyed, or the check before the deploy was not run.
- `erpnext/schema/` has more than approximately 10 files in one year. Then
  StudioOS is building its own data model inside ERPNext, and ADR-0001 is the
  better tool.
- A person adds a field by hand again. Then the procedure is too slow.
