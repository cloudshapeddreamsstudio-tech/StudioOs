# Release 1

**The target:** Shubham uses StudioOS each day for real project work, on the
production ERPNext site. `docs/PLAN-v2.md` D7.

**The rule:** a feature is in release 1 only when it operates correctly today.
Nothing is added to release 1. A new request goes to release 2.

Written in ASD-STE100 Simplified Technical English. See `docs/adr/README.md`.

---

## The environments

| | StudioOS web app (Cloudflare) | ERPNext site (Frappe Cloud) |
|---|---|---|
| **Staging** | `https://demoos.cloudshapeddreamsstudio.com` | `cloudshapeddreamsstudio.m.erpnext.com` |
| **Production** | `https://studioos.cloudshapeddreamsstudio.com` | `csdstudio.frappe.cloud` |

Each environment is a separate Cloudflare Worker with its own D1, its own KV and
its own secrets. Staging never connects to the production ERPNext site.
Production never connects to the staging ERPNext site.

---

## What is in release 1

This list is what a person can do **on the screen**. Sandesh tested each item in
a browser on staging, on 2026-10-02. The first version of this list was written
from the Worker code, and it named actions that the app has no control for. That
was a fault in this document. It is corrected here.

Each item reads and writes the studio's own ERPNext, with the token of the
person who signed in. ERPNext decides what each person sees.

| Area | What a person can do |
|---|---|
| **Sign in** | Sign in with the ERPNext account of the studio. Sign out. |
| **Dashboard** | See the Overview, Analytics and Fintech tabs. |
| **Projects** | See the list. Create a project. Edit a project. Open a project and use its six tabs: Checklist, Money, Expenses (read only), Crew (add, edit, remove), Docs (see and download files), Activity (see notes, add a note). |
| **Invoices** | See the list. Print the branded invoice. |
| **Tasks** | See the Kanban board. Move a task to a different column. |
| **Payables** | See what the studio owes its suppliers. |
| **Clients** | See the list. Open a client. Edit a client. |
| **Vendors** | See the list. |
| **Inventory** | See the list. |

For each other action, a person uses ERPNext directly. That includes: to create
or submit an invoice, to record a payment, and to create a task.

---

## What is not in release 1

`docs/RELEASE-2.md` holds the list, in order. In short:

- Controls that the Worker has and the app does not: invoices (create, edit,
  submit, payment, amend), tasks (create, edit, delete), documents (upload,
  remove), notes (edit), and sign out on all devices.
- Features that are built and not shown: studio rental, transactions,
  subscriptions, the entry of project expenses, the invoice designer, the UPI
  QR code.
- The design system of `docs/FRONTEND.md`.

Nothing from that list is added to release 1.

---

## Known limits of release 1

These are correct behaviour for release 1. Do not report them as faults.

- **No UPI QR code on an invoice.** ERPNext has no field for a UPI id. The
  printed invoice has no QR code.
- **"Budget remaining" shows a dash.** It needs project expenses, which are in
  release 2. A dash is correct. A zero would be wrong.
- **A button that a person may not use is still shown.** ERPNext refuses the
  action and the app shows the error. StudioOS has no role model (D9).
- **A person is removed by disabling them in ERPNext.** Their StudioOS session
  stops at the next token refresh, in one hour or less.

---

## The gates

Release 1 is done when all three gates are passed, in this sequence.

1. **Staging is deployed.** `docs/tasks/r1-staging.md`, part A. **Passed 2026-10-02.**
2. **Sandesh tests staging himself and signs off.** `docs/tasks/r1-staging.md`,
   parts B and C. An agent cannot pass this gate. A person clicks each item.
   **Passed 2026-10-03.** 21 items pass. The 8 other items tested actions that
   are not in release 1: see Malhar's decision in that card.
3. **Production is deployed and Shubham signs in.**
   `docs/tasks/r1-production.md`. Malhar approves before it starts.
