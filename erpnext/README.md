# erpnext/ — what StudioOS needs from an ERPNext site

This folder is the list of everything that StudioOS adds to a studio's ERPNext
site. If it is not in this folder, StudioOS must not depend on it.

`docs/adr/0005-custom-fields-and-the-erpnext-schema.md` gives the rule and the
reasons. Written in ASD-STE100 Simplified Technical English.

## The two folders

| Folder | Holds | Example |
|---|---|---|
| `schema/` | The shape: one custom field in each file | `0001_project_sanction_amount.json` |
| `reference/` | The fixed lists that the code names | a Supplier Group, an Item Group. Empty today |

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
frappe-ctl --site <profile> frappe validate "Custom Field" \
  --data "$(cat erpnext/schema/0001_project_sanction_amount.json)" --output json

# 3. Apply it. Only when step 1 printed 0.
frappe-ctl --site <profile> frappe apply --file erpnext/schema/0001_project_sanction_amount.json
```

Steps 1 and 2 only read. They were run against the production site on
2026-10-09: step 1 printed `0`, and step 2 printed `"valid": true`. Step 3 was
not run. The first person who runs step 3 corrects this file if it is wrong.

## Check a site

Before a deploy, run step 1 for each file in `schema/`. Each one must print `1`.
A site that prints `0` does not have what the release needs. Do not deploy to
it. A script for this check is release 2 work.
