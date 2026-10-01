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

Each item reads and writes the studio's own ERPNext, with the token of the
person who signed in. ERPNext decides what each person sees.

| Area | What a person can do |
|---|---|
| **Sign in** | Sign in with the ERPNext account of the studio. Sign out. Sign out on all devices. |
| **Dashboard** | See the Overview, Analytics and Fintech tabs. |
| **Projects** | See the list. Create a project. Edit a project. Open a project and use its six tabs: Checklist, Money, Expenses (planned against actual, read only), Crew (add, edit, remove), Docs (upload and remove files), Activity (add and edit notes). |
| **Invoices** | See the list. Create a draft. Edit a draft. Submit it. Amend it. Record a payment. Print the branded invoice. |
| **Tasks** | Use the Kanban board: create, move, edit and delete a task. |
| **Payables** | See what the studio owes its suppliers. |
| **Clients** | See the list. Open a client. Edit a client. |
| **Vendors** | See the list. |
| **Inventory** | See the list. |

---

## What is not in release 1

These are built and are not shown in the app. They go to release 2, after
Shubham uses release 1 each day.

- Studio rental: bookings, hourly sessions, and invoices from them.
- Transactions, and the theatre ledger.
- Subscriptions for overheads. Decided: a native ERPNext `Subscription` (D8).
- The entry of new project expenses. The Expenses tab shows them and does not
  add them.
- The invoice designer and the brand settings.
- The UPI scan-to-pay QR code on an invoice.

When Shubham uses release 1, ask him which of these he needs first.

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

1. **Staging is deployed.** `docs/tasks/r1-staging.md`, part A.
2. **Sandesh tests staging himself and signs off.** `docs/tasks/r1-staging.md`,
   parts B and C. An agent cannot pass this gate. A person clicks each item.
3. **Production is deployed and Shubham signs in.**
   `docs/tasks/r1-production.md`. Malhar approves before it starts.
