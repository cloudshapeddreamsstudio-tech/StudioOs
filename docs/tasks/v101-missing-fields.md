# v1.0.1 — StudioOS operates on a site that does not have a field

**State:** Open
**Owner:** Sandesh
**Release:** `v1.0.1`. A PATCH release: it corrects a fault and adds no feature.
**Start from:** `main`, after the branch `docs/erpnext-schema-policy` is merged.

---

## What happened after your incident report

Your report was correct. Malhar read it, and these decisions followed. Read them
first, because they change what you build.

| Decision | Where it is written |
|---|---|
| The studio moves to the new site, `csdstudio.frappe.cloud`. The old site becomes the test site | `docs/AUDIT-2026-10-09-old-site.md` |
| A custom field is permitted only under five conditions, and only from a file | `docs/adr/0005-custom-fields-and-the-erpnext-schema.md` |
| One field is permitted now: `Project.custom_sanction_amount` | `erpnext/schema/0001_project_sanction_amount.json` |
| The 7 other `Project` fields, and the invoice number, are not permitted now | ADR-0005, the table "The fields today" |
| Invoices and payments do not move. Most are test data | The audit, section 5 |
| The India Compliance app is installed on the new site | The audit, section 1 |

Two things in your report became rules:

- "A wrong number is believed" is now condition 5 of ADR-0005.
- Your three options A1, A2, A3 became: A2 for the code, and A1 only for the
  one field that is permitted, from a file and not by hand.

---

## To the agent that reads this card

1. Part A is done by Sandesh, not by you. It needs a secret. Never ask him to
   paste a secret into the chat.
2. Part C writes to the production ERPNext site. Malhar's approval is in this
   file, dated 2026-10-09. Sandesh runs the write himself, in his own terminal.
   You do not run it.
3. Do not move data between the two sites. That is a different card, and it
   waits for answers from Shubham.
4. Do not change the scope. A new idea goes to `docs/RELEASE-2.md`.

---

## Read these first

1. `AGENTS.md`
2. `docs/adr/0005-custom-fields-and-the-erpnext-schema.md`
3. `erpnext/README.md`
4. `docs/WORKFLOW.md` — the branches for a release
5. Your own report, `docs/INCIDENT-2026-10-04-schema-skew.md`, sections 5, 6
   and 7

---

## Part A — connect `frappe-ctl` to the two sites

You read the old site with `frappe-ctl` on 2026-10-04. Now connect the new site
too, so that you can compare the two sites when you need to.

1. Sign in on `https://csdstudio.frappe.cloud`.
2. Open your avatar, then **My Settings**, then **API Access**. Select
   **Generate Keys**. Copy the API Key and the API Secret. The secret shows one
   time.
3. In your own terminal, not in the agent chat:

   ```bash
   frappe-ctl profile add csds-prod --url https://csdstudio.frappe.cloud --key <API_KEY> --secret <API_SECRET>
   ```

4. Check the two profiles. Each command must print a number:

   ```bash
   FRAPPE_CTL_READONLY=1 frappe-ctl --site csds      next count Project
   FRAPPE_CTL_READONLY=1 frappe-ctl --site csds-prod next count Project
   ```

Use the profile names `csds` (the old site) and `csds-prod` (the new site), so
that each document and each person uses the same two names.

**Set `FRAPPE_CTL_READONLY=1` for each command that only reads.** It stops each
write. Remove it only for a write that a card tells you to do.

---

## Part B — the code

Open `release/v1.0.1` from `main`. Do each item on its own `fix/` branch.

### B1. Each list call operates when a field is absent

Your section 5.6 has the count of list calls that are not protected. Use
`getListTolerant` from `lib/optionalFields.ts`. Start with the two that failed:
`routes/projects.ts` and `routes/payables.ts`. Then `routes/projectDetail.ts`.

### B2. An absent money field is "not available", not 0

`routes/projectDetail.ts`, where it reads `custom_sanction_amount` and
`custom_commission_percent`. When the site does not have the field, the page
says "not available". It does not calculate a commission or a remaining budget
from 0. This is your section 7.2.

### B3. Stop the use of the fields that are not permitted

ADR-0005 permits one field. For the 7 other `Project` fields and for
`Sales Invoice.custom_invoice_number`:

- the Worker does not read them and does not write them;
- the project form does not show an input for them.

The two `Item` fields stay as they are. They are protected, and they wait for
the rental feature.

**Stop and ask before B3** if a screen in `docs/RELEASE-1.md` cannot operate
without one of those fields.

### B4. The three small corrections of your section 6

- 6.1: log the status, the path and the `exception` text of ERPNext for a
  `FrappeError` of 4xx that is not 401, 403 or 404.
- 6.2: show the development hint only when `import.meta.env.DEV` is true.
- 6.3: do not retry a request that got a 4xx.

### B5. The master records that the code names

Two are not on the new site: Supplier Group `Rental House` and Department
`Theatre Education - CSDS`. Your section 5.5 has the full list.

For each name in the code, do one of these and say which one in the commit:

- remove the name from the code, or
- add a file in `erpnext/reference/` for it.

**Stop and ask** if neither is possible.

### B6. The test

Demo signs in on the old site, which has each field. So demo cannot show this
fault. Your section 9, D-B, says so.

- Unit tests: give `getListTolerant` a fake site that refuses a field. The
  pattern is in `worker/tests/optionalFields.test.ts`.
- One test for B2: a project with no sanction amount gives "not available".

### B7. Bring your report into the release

Merge `fix/production-schema-skew` into `release/v1.0.1`. The report is the
record of this fault.

---

## Part C — the one field on the new site

**Needs Malhar's approval. Malhar approved it on 2026-10-09. Start it after Part
B is done.**

Approved by Malhar: **approved**
Date: 2026-10-09

1. Do steps 1 and 2 of `erpnext/README.md` on `csds-prod`. They only read.
   Step 1 must print `0`. Step 2 must print `"valid": true`.
2. Do step 3. This is the only write in this card.
3. Do step 1 again. It must print `1`.
4. If a step does not operate as `erpnext/README.md` says, correct that file in
   the same change.

---

## Part D — release

`docs/WORKFLOW.md`, steps 4 and 5.

1. Deploy `release/v1.0.1` to demo. Test Projects, Payables and one project
   page by hand.
2. Tell Malhar. He approves.
3. Merge into `main`, tag `v1.0.1`, deploy production.
4. On production, open Projects and Payables. Each must load. The Projects list
   is empty, and that is correct: no project is moved yet.

---

## Not in this card

- **The move of the data.** 31 projects and their budgets move after Shubham
  answers a sheet of questions. That is the next card.
- **The rental and equipment items.** Release 2.
- **A script that checks a site against `erpnext/schema/`.** Release 2.

---

## Done when

- Projects and Payables load on production, on a site with one custom field.
- A project with no sanction amount shows "not available".
- The Worker log shows the reason that ERPNext gives for a 4xx.
- You can read the two sites with `frappe-ctl`.
- `erpnext/README.md` is correct for the step that you ran.
