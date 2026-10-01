# 0001. StudioOS provisions its own DocTypes

- **Status:** Accepted
- **Date:** 2026-09-26
- **Owner:** Malhar
- **Changes:** `docs/SEAM.md` section 3 and Amendment 2. Unblocks project
  expenses, overheads, and Phase 10g.

## The question

Project expenses and studio overheads have no light home in stock ERPNext. May
StudioOS create its own DocTypes on a studio's ERPNext site to hold them, or
must that data go to D1?

`docs/SEAM.md` section 3 says "ERPNext must not know about StudioOS". A reader
applies that sentence to two different acts and stops both. This document
separates the two acts and decides the second one.

## Why the question is open

Phase 10f examined the six data sets that the old application kept outside
ERPNext. Four of them have a native home. Two do not.

- **Project expenses.** `Expense Claim` is not part of stock ERPNext. It is
  part of HRMS, which is a different application. Only `Purchase Invoice`,
  which needs a Supplier, and `Journal Entry`, which is submittable and posts
  to the general ledger, are available.
- **Overheads.** An ERPNext `Subscription` needs a Subscription Plan. A plan
  needs an Item and a Supplier. To record one electricity bill, the studio
  owner creates four records. The old ledger also holds a ₹0 placeholder, which
  is a useful note and an impossible invoice.

Phase 10f also proved a fact that changes the options. A studio's own System
Manager creates a custom DocType through the API, writes rows to it, and reads
them back. This needs no developer mode, no bench access, and no application
install. A user without System Manager gets a `PermissionError`. This was
proved on a stock ERPNext v15 site and then removed.

Frappe's own guidance agrees with this division. Frappe tells you to make a new
DocType for a new feature. Frappe tells you to use `Custom Field` and
`Customize Form` to change a DocType that a different party owns.

## The options

**A. StudioOS creates its own DocTypes on the studio's site.**
Gives: the data stays in the studio's own database, under the studio's own
permissions, in the studio's own backup. ERPNext applies the permissions.
Costs: a DocType that is made at run time has `custom: 1`. Frappe stores it
only in the database. It is difficult to move it into a Frappe application
later. Frappe has open issues for this problem. A DocType with `custom: 1` also
cannot hold server-side controller code.

**B. The data goes to D1.**
Gives: full control of the schema, and no change to any customer's site.
Costs: each read needs `withDocAccess`, and that control fails silently if a
contributor forgets it. The studio owner cannot see the data. The data is not
in the studio's backup. The data is lost when StudioOS stops.

**C. StudioOS ships a Frappe application that each customer installs.**
Gives: real application DocTypes, version control, and portability.
Costs: Frappe Cloud does not permit a custom application on its low-cost shared
plans. Each customer needs a private bench or a higher plan. Each install and
each upgrade becomes work for each customer.

**D. Force the data into a stock DocType.**
Gives: nothing new to learn, and full portability.
Costs: Phase 10f measured this cost. It is four setup records for each overhead
and it cannot hold a ₹0 placeholder. `Journal Entry` makes each small expense
an accounting event that you correct by cancel and re-post.

## The decision

**StudioOS may create its own DocTypes on a studio's ERPNext site.** Six
conditions apply, and all six are necessary.

1. Only for data that stays if you delete StudioOS. Presentation data never
   gets a DocType. It goes to D1.
2. StudioOS creates the DocType at connect time, on the session of the owner
   who signs in. StudioOS never uses a stored credential to create one. A
   stored credential is question 3 of the checklist, and question 3 says stop.
3. The operation is idempotent. StudioOS connects a site many times and creates
   the DocType one time.
4. The name starts with `StudioOS`. A studio owner sees `StudioOS Project
   Expense` in the DocType list and knows which application made it.
5. StudioOS sets the permissions when it creates the DocType. The permissions
   match the stock DocType that the data sits beside. StudioOS never leaves the
   permissions open.
6. An export procedure exists, and it is written down, before StudioOS writes
   the first row.

One more rule controls the speed. Prove this with project expenses. Ship it.
Then stop. Do not create three DocTypes on the first day.

## Why

**The first reason is the security property, and it decides the question.**
Section 0 of SEAM says that an error in "who may read this" is a data leak.
Section 5 says that this error gives no error message.

Each table in D1 is a place where a contributor forgets `withDocAccess` and
nothing reports the mistake. Each row in a DocType on the studio's own site is
checked by ERPNext, against the token of the person who signed in, with no code
from StudioOS. Option A makes the surface for that silent failure smaller.
Option B makes it larger.

**The second reason is that the seam rule already answered this.** A studio
wants its record of project expenses if StudioOS stops. It is money against a
project, and the accountant needs it. Question 1 therefore says ERPNext. The
only reason to send it to D1 is that no stock DocType fits, and that is a
difficulty in the implementation. A difficulty in the implementation must not
move the boundary. That movement is the failure that the seam prevents.

**The third reason is that portability points to option A, not away from it.**
Phase 10f argued that native DocTypes are portable and custom DocTypes are not.
Compare the two honestly. A custom DocType is in the owner's own ERPNext. The
owner lists it, reports on it, and exports it to CSV. It is in the owner's site
backup. A D1 table is not visible to the owner, is not in the backup, and stops
when StudioOS stops. The true concern in that argument is that a custom DocType
is unfamiliar. That is a different problem, and a clear name solves it.

## What this costs

**The cost is the move to an application, and it is deferred, not removed.** A
DocType with `custom: 1` does not become an application DocType without work.
Frappe has open issues that request this feature. Fixtures are the method that
is available now, and the Frappe community reports that fixtures are easy to
get wrong. If StudioOS later ships `studioos_core` as a real application, this
work happens then.

**The second cost is that a custom DocType holds no server-side code.** For
this architecture that is acceptable. All validation is in the Worker, which is
where this design wants it.

**The third cost is that StudioOS now writes to the structure of a customer's
site, and not only to its rows.** Condition 4 and condition 6 exist to control
this cost. Read them as the price of the decision.

## What does not change

- **A custom field on a stock DocType stays forbidden in version 1.** Adding
  `custom_studioos_id` to `Project` puts a StudioOS concern into the shape of a
  DocType that ERPNext owns. You then maintain a Frappe application, its
  migrations, and an install step for each customer.
- **The reference still goes one way.** A StudioOS DocType refers to `Project`.
  `Project` refers to nothing in StudioOS. Section 3 of SEAM demands this, and
  this decision obeys it. The correct statement of that rule is: **ERPNext must
  not depend on StudioOS.**
- **Brand data stays in D1.** The accent colour, the tagline, the notes wording
  and the margin split are presentation. They do not stay if you delete
  StudioOS. The UPI id is a studio setting and it goes to D1 with them.
- **Overheads: decided 2026-10-02, native `Subscription`, not a provisioned
  DocType.** See `docs/PLAN-v2.md` D8. The original text was: This ADR makes the option available. It does not
  choose it. The studio owner decides whether an overhead is a note or is
  bookkeeping, because that choice changes what the data means.

## How we know if this was wrong

Write a new ADR if one of these happens.

- A studio administrator asks StudioOS to remove its DocTypes, and the removal
  loses data that the studio needs.
- The export procedure in condition 6 is written but nobody can complete it.
- Frappe changes the API so that a custom DocType needs developer mode.
- StudioOS needs a third DocType before the first one has run for one month.
  That is a signal that the seam is moving, not that the decision was wrong.
