# R1 — deploy production

**State:** Blocked. Starts only when both are true:

1. `docs/tasks/r1-staging.md` part C is complete, with each item Pass.
2. Malhar writes "approved" and the date below.

**Owner:** Sandesh
**Branch:** `release-1`

Approved by Malhar:
Date:

---

## To the agent that reads this card

- If the approval above is empty, stop. Tell Sandesh that this card is blocked.
- **Production holds Shubham's real data.** Do not create, edit, submit or
  delete a record in production to test it. Part B below only looks.

---

## Part A — deploy

Do `docs/DEPLOY.md` with `ENV` = `production`. Steps 1 to 9.

| | Value |
|---|---|
| StudioOS address | `https://studioos.cloudshapeddreamsstudio.com` |
| ERPNext site | `csdstudio.frappe.cloud` |

Step 3: confirm the exact Company name on `csdstudio.frappe.cloud` before you
set `COMPANY`. Step 6: make three new secrets. Do not copy the staging ones.

---

## Part B — look, do not change

Sandesh does each of these himself, in a browser.

| # | Do this | You must see |
|---|---|---|
| P1 | Sign in with `csdstudio.frappe.cloud`. | The dashboard. |
| P2 | Open each page in the menu. | Each page loads, with production data. |
| P3 | Open one project and each of its tabs. Change nothing. | Each tab loads. |
| P4 | Sign out. | The sign-in page. |

---

## Part C — hand over

1. Shubham signs in on `https://studioos.cloudshapeddreamsstudio.com` with his
   own ERPNext account, with Sandesh beside him or on a call.
2. Shubham opens his projects and one invoice.

Release 1 is done when Shubham sees his own projects.

| | |
|---|---|
| Production deployed by | |
| Date | |
| Shubham signed in on | |
