# Release 2

**State:** a list, in order. Not started. Release 2 starts after release 1 is in
production and Shubham uses it.

**The rule:** release 2 adds what a person cannot do in release 1. The order
below is the plan today. It can change when Shubham uses release 1 and says what
he needs first.

Written in ASD-STE100 Simplified Technical English. See `docs/adr/README.md`.

---

## The order

### 1. The design system, steps 1 to 3

`docs/FRONTEND.md`, on the branch `docs/frontend-constitution`. Write the
tokens. Move the shared components onto them. Decided (D8, 2026-10-03): this
starts after release 1 is in production, and not before.

It comes first in release 2 for one reason. Items 2 to 6 below are new screens
and new buttons. Build them one time, on the tokens, and not two times.

### 2. Invoices: the controls

The Worker has each endpoint. The app has only the list and the print page.

- Create a draft invoice.
- Edit a draft.
- Submit it.
- Record a payment.
- Amend it.

This is the largest item, and it moves money. An invoice is created as a draft.
To submit is a separate, deliberate action. `AGENTS.md` has the rule.

### 3. Tasks: the controls

The app can move a task. Add: create, edit and delete.

### 4. Documents: the controls

The app can list and download. Add: upload and remove.

### 5. Notes: edit

The app can add a note. Add: edit a note.

### 6. Sign out on all devices

The Worker has `POST /auth/logout-all`. Add one button.

### 7. The rest of the design system

`docs/FRONTEND.md` steps 4 and 5: move each feature onto the tokens, one feature
for each commit, then switch the lint on.

---

## After those, in an order that Shubham gives

These are built in the Worker and are not shown in the app. Each one needs its
data home first, from `docs/SEAM.md` section 1.

| Feature | Its data home |
|---|---|
| Studio rental: bookings, hourly sessions, invoices from them | ERPNext `Timesheet`. The booking calendar in D1 |
| Transactions, and the theatre ledger | ERPNext `Journal Entry` |
| Subscriptions for overheads | ERPNext `Subscription`, with draft invoices (D8 of `docs/PLAN-v2.md`) |
| The entry of project expenses | A `StudioOS Project Expense` DocType (ADR-0001) |
| The invoice designer and the brand settings | D1 |
| The UPI QR code on an invoice | Needs a home for the UPI id. D1, with the brand |

---

## Found in the staging test

- **The contact number of a crew member is in the wrong place.** StudioOS writes
  it as text in the `terms` field of the draft Purchase Order. It must be a
  Contact of the Supplier. Today a person types it again for each project, and
  it is deleted when the booking is removed. Decide also what to do with the
  numbers that are in `terms` now. Full note: `docs/tasks/r1-staging.md`.

---

## Engineering work, not features

Do these when they stop a fault, not on a date.

- The Worker modules of ADR-0002. `docs/FRONTEND.md` D7 changes the module
  names, so ADR-0002 gets an amendment first.
- Continuous integration, with the three checks of ADR-0002.
- Sign-out that does not wait for ERPNext: revoke the token in the background.
- A check of `nodejs_compat`: the `qrcode` change can make the flag unnecessary.
