# erpnext/ — what StudioOS needs from an ERPNext site

This folder is the list of everything that StudioOS adds to a studio's ERPNext
site. If it is not in this folder, StudioOS must not depend on it.

`docs/adr/0005-custom-fields-and-the-erpnext-schema.md` gives the rule and the
reasons. Written in ASD-STE100 Simplified Technical English.

## The two folders

| Folder | Holds | Example |
|---|---|---|
| `schema/` | The shape: one custom field in each file | `0001_project_sanction_amount.json` |
| `reference/` | A record that the code names, and that a person or StudioOS creates | `0001_supplier_group_equipment_rental.json` |

Master data and transactions are not here. A customer, a project and an invoice
belong to the studio. They are in ERPNext only.

## The rules

1. **Each file has a number, and the numbers go up.** `0001_`, `0002_`.
2. **A file only adds.** It does not remove a field and it does not rename one.
   This is the same rule as a D1 migration, for the same reason: after a
   rollback, the previous code must still operate.
3. **A file does not change after it is applied to a site.** To change a field,
   add a new file.
4. **A new file needs the five conditions of ADR-0005.** Write the reason in the
   commit.
5. **A new file is part of a release.** Apply it to the test site first, test,
   then apply it to production.

## Apply one file

A System Manager of the site does this, with `frappe-ctl`.

```bash
# 1. Is the field there?  0 = no, 1 = yes.
frappe-ctl --site <profile> frappe count "Custom Field" \
  --filter "dt=Project" --filter "fieldname=custom_sanction_amount"

# 2. Is the file correct for this site?  It must print "valid": true.
#    Give it the file without its "doctype" key: validate reports that key as
#    unknown and prints "valid": false for a correct file. `apply` needs the key.
frappe-ctl --site <profile> frappe validate "Custom Field" --output json \
  --data "$(bun -e "const d=require('./erpnext/schema/0001_project_sanction_amount.json'); delete d.doctype; console.log(JSON.stringify(d))")"

# 3. Apply it. Only when step 1 printed 0.
frappe-ctl --site <profile> frappe apply --file erpnext/schema/0001_project_sanction_amount.json
```

Steps 1 and 2 only read. Step 3 is the one write.

`0001_project_sanction_amount.json` was applied to the production site,
`csds-prod`, on 2026-10-14: step 1 printed `0`, step 2 printed
`"valid": true`, step 3 made `Project-custom_sanction_amount`, and step 1
printed `1` after it. Step 2 with the `doctype` key left in the data printed
`"valid": false` with `"unknown": [{"field": "doctype"}]` and nothing missing.
That was a fault in this file, corrected above.

`frappe-ctl describe` lists a DocType's own fields only, never its Custom
Fields (on 2026-10-14 the test site had 8 on Project and describe showed none).
To check a field, use step 1, or a list query that names the
field: a site that does not have it answers 417.

## Apply one reference file

The same three steps, for the DocType and the name of the file. For
`reference/0001_supplier_group_equipment_rental.json`:

```bash
# 1. Is the record there?  0 = no, 1 = yes.
frappe-ctl --site <profile> next count "Supplier Group" --filter "name=Equipment Rental"

# 2. Is the file correct for this site?  Without the "doctype" key, as above.
frappe-ctl --site <profile> next validate "Supplier Group" --output json \
  --data "$(bun -e "const d=require('./erpnext/reference/0001_supplier_group_equipment_rental.json'); delete d.doctype; console.log(JSON.stringify(d))")"

# 3. Apply it. Only when step 1 printed 0.
frappe-ctl --site <profile> next apply --file erpnext/reference/0001_supplier_group_equipment_rental.json
```

Applied to the test site, `csds`, on 2026-10-14. The production site had it
already.

On the test site, the group `Rental House` was also moved below
`Equipment Rental` on 2026-10-14, so that its three suppliers are vendors in the
demo test. That changed test data only; it is not a file in this folder.

`Equipment Rental` is the top vendor group. StudioOS reads the groups below it
from the site (`worker/src/lib/vendorGroups.ts`), so a group that the studio
adds below it is a vendor group with no change to this folder. A supplier in a
group outside that tree is crew.

## Expected on the site

These records come with ERPNext or with an app that the studio installs.
StudioOS names them and does not create them, so they have no file here.
Malhar checked on 2026-10-14 that each one is on the new site.

| Record | Kind | It comes from | StudioOS uses it to |
|---|---|---|---|
| `Services` | Item Group | ERPNext setup | make the Item for a crew role |
| `Nos` | UOM | ERPNext setup | write an invoice line |
| `Standard Selling` | Price List | ERPNext setup | write an invoice |
| `998431` | GST HSN Code | the India Compliance app | make the Item for a crew role |

Configuration, not records: `COMPANY` and `OWNER_SUPPLIER` in
`worker/wrangler.jsonc`, for each environment. If no Supplier has the name in
`OWNER_SUPPLIER`, Payables shows no "owed to owner" part, and nothing fails.

Not expected, and not required: the Item Groups `In-House Equipment` and
`Rental House Catalogue`, and the Department `Theatre Education - CSDS`. The
code operates when they are absent. The equipment groups return with the rental
feature in release 2.

## Check a site

Before a deploy, run step 1 for each file in `schema/`. Each one must print `1`.
A site that prints `0` does not have what the release needs. Do not deploy to
it. A script for this check is release 2 work.
