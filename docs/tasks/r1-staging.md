# R1 — deploy staging, test it yourself, sign off

**State:** Open
**Owner:** Sandesh
**Branch:** `release-1`
**Gate:** this card is gate 1 and gate 2 of `docs/RELEASE-1.md`.

---

## To the agent that reads this card

Read this section before you do anything.

1. **You do part A with Sandesh.** You can run commands. Sandesh signs in to
   Cloudflare and to ERPNext, and pastes the secrets. Never ask him to paste a
   secret into the chat.
2. **You do not do part B. Sandesh does part B.** Part B is a person in a
   browser, clicking each item and looking at the result. You cannot see the
   browser. Do not say that an item passes. Do not mark an item as passed
   because the code looks correct, because a test passed, or because a `curl`
   answered.
3. **For each item in part B, ask Sandesh to do it, then ask him what he saw.**
   Write his answer in the sign-off table. If he says it failed, write what he
   saw, then help him find the cause. Fix it in a separate commit, deploy
   staging again, and ask him to test that item again.
4. **Do not change the scope.** If Sandesh finds something that is missing and
   is not in `docs/RELEASE-1.md`, write it in the "Release 2" list at the end of
   this card. Do not build it.
5. **Part C is his signature, not yours.** Do not fill in his name or the date.

---

## Read these first

1. `docs/RELEASE-1.md` — what is in the release, and what is not.
2. `docs/DEPLOY.md` — the procedure for part A.
3. `AGENTS.md` — the router.

---

## Part A — deploy staging

Do `docs/DEPLOY.md` with `ENV` = `staging`. Steps 1 to 9.

| | Value |
|---|---|
| StudioOS address | `https://demoos.cloudshapeddreamsstudio.com` |
| ERPNext site | `cloudshapeddreamsstudio.m.erpnext.com` |

Part A is done when `/api/health` answers `ok`, all five routing checks pass,
and you can sign in.

**If `docs/DEPLOY.md` is wrong, correct it in the same change.** It was written
before anyone ran it. You are the first person who runs it.

---

## Part B — test each item yourself

Use staging only. Never use the production site for a test.

Start each test record name with `R1-TEST` — a project, a task, an invoice. Then
you can find every test record and remove it later.

Use two browsers, or one normal window and one private window, for the
sign-out tests.

For each item: do the action, look at the result, and write **Pass** or
**Fail** in part C. For a fail, write what you saw.

### Sign in

| # | Do this | You must see |
|---|---|---|
| B1 | Open the StudioOS address while signed out. | The public home page. |
| B2 | Select sign in. Type `cloudshapeddreamsstudio.m.erpnext.com`. Sign in on ERPNext and approve. | The dashboard. Your name is shown. |
| B3 | Close the tab. Open the StudioOS address again. | You are still signed in. |
| B4 | Type a site that does not exist, such as `nosuchsite.erpnext.com`. | An error on the sign-in page. Not a blank page and not raw JSON. |

### Dashboard

| # | Do this | You must see |
|---|---|---|
| B5 | Open Dashboard. | The overview, with numbers from the staging site. |
| B6 | Open the Analytics tab, then the Fintech tab. | Both load. No error. |

### Projects

| # | Do this | You must see |
|---|---|---|
| B7 | Open Projects. | The project list of the staging site. |
| B8 | Create a project named `R1-TEST project`, with a customer. | It is saved and appears in the list. It also appears in ERPNext. |
| B9 | Edit that project. Change a field. Save. | The change is shown in StudioOS and in ERPNext. |
| B10 | Open the project. Open each tab: Checklist, Money, Expenses, Crew, Docs, Activity. | Each tab loads. "Budget remaining" can show a dash. That is correct. |
| B11 | In Crew, add a member. Edit the member. Remove the member. | Each change is saved. ERPNext has a draft Purchase Order for the member until you remove it. |
| B12 | In Docs, upload a small file. Then remove it. | The file appears, then goes. |
| B13 | In Activity, add a note. Edit the note. | The note is saved and the edit is shown. |

### Invoices

| # | Do this | You must see |
|---|---|---|
| B14 | Open Invoices. | The invoice list of the staging site. |
| B15 | Create a draft invoice for the `R1-TEST project`. | It is saved as a draft. |
| B16 | Edit the draft. Then submit it. | It is submitted. ERPNext shows it as submitted. |
| B17 | Record a payment against it. | A draft payment is created. |
| B18 | Print the invoice. | The branded invoice page. It has no UPI QR code. That is correct. |
| B19 | Amend the invoice. | A new amended draft is created. |

### Tasks, Payables, Clients, Vendors, Inventory

| # | Do this | You must see |
|---|---|---|
| B20 | Open Tasks. Create `R1-TEST task`. Move it to a different column. Edit it. Delete it. | Each change is saved. |
| B21 | Open Payables. | What the studio owes its suppliers. |
| B22 | Open Clients. Open one client. | The client list, then the client detail. |
| B23 | Edit a client. Change one field and then change it back. | Both changes are saved. |
| B24 | Open Vendors, then Inventory. | Both lists load. |

### Sign out

| # | Do this | You must see |
|---|---|---|
| B25 | Select sign out. Then use the browser back button. | The sign-in page. No studio data. |
| B26 | Sign in in browser 1 and in browser 2. In browser 1, select sign out on all devices. Then refresh browser 2. | Browser 2 is also signed out. |

### Things that must be correct, and are easy to miss

| # | Do this | You must see |
|---|---|---|
| B27 | Open `https://demoos.cloudshapeddreamsstudio.com/projects` directly, in a new tab. | The projects page. Not a 404. |
| B28 | Refresh the browser on a project detail page. | The same page loads again. |
| B29 | Open the app on a phone. | The menu opens and the pages can be read. |

---

## Part C — sign-off

Sandesh writes this table. The agent writes only the "What I saw" text that
Sandesh tells it.

| # | Pass / Fail | What I saw |
|---|---|---|
| B1 | | |
| B2 | | |
| B3 | | |
| B4 | | |
| B5 | | |
| B6 | | |
| B7 | | |
| B8 | | |
| B9 | | |
| B10 | | |
| B11 | | |
| B12 | | |
| B13 | | |
| B14 | | |
| B15 | | |
| B16 | | |
| B17 | | |
| B18 | | |
| B19 | | |
| B20 | | |
| B21 | | |
| B22 | | |
| B23 | | |
| B24 | | |
| B25 | | |
| B26 | | |
| B27 | | |
| B28 | | |
| B29 | | |

**I tested each item above myself, in a browser, on staging.**

- Name:
- Date:

When each item is Pass, commit this file on `release-1`, push, and message
Malhar. Malhar then approves `docs/tasks/r1-production.md`.

---

## Release 2

Write here anything that you found missing and that is not in
`docs/RELEASE-1.md`. Do not build it in this card.

-
