# Audit 2026-10-09 — the old ERPNext site, before the move

**For:** Malhar, Shubham
**State:** a reading. Nothing was changed on either site.

The studio moves from the old site (`cloudshapeddreamsstudio.m.erpnext.com`) to
the new site (`csdstudio.frappe.cloud`). This document says what is on each
site, what is clean, what is not, and what a person must decide.

Each site was read with `frappe-ctl` 0.3.0 in read-only mode, on 2026-10-09.
Only the verbs `get`, `count`, `describe` and `validate` were used.

Written in ASD-STE100 Simplified Technical English.

---

## 1. The two sites

| | Old site | New site |
|---|---|---|
| Customers | 20 | 14 |
| Suppliers | 16 | 14 |
| Items | 270 | 54 |
| Projects | 34 | 0 |
| Sales invoices | 47 | 2 |
| Purchase invoices | 45 | 0 |
| Payments | 17 | 0 |
| Purchase orders | 8 | 0 |
| Sales orders | 4 | 1 |
| Custom fields that a person added | 13 | 0 |
| India Compliance app | installed | installed (2026-10-08) |

The new site was prepared on 2026-07-17 with customers, suppliers and service
items. No project was moved. The studio still works on the old site: the last
project there is from 2026-10-02.

---

## 2. Master data — mostly clean

### Customers

- Each of the 14 customers on the new site is also on the old site.
- 6 are only on the old site. 3 are test records: `Malhar`, `Sandesh`,
  `sample`. 3 are real and have projects.
- No duplicate names.
- No customer has a GSTIN. 14 of 20 have no mobile number. 15 have no email.
- 9 of 20 have no customer group.

### Suppliers

- Each of the 14 suppliers on the new site is also on the old site.
- 2 are only on the old site. 1 is a test record, from the staging test.
- No duplicate names.
- No supplier has a GSTIN or a PAN. 7 of 16 have no mobile number.
- 2 have no supplier group.
- 4 companies are a customer and also a supplier. That is correct in ERPNext.

### Items

- Each of the 54 items on the new site is also on the old site. They are the
  service items.
- 216 items are only on the old site. 193 are the rental house catalogue and 16
  are in-house equipment. They belong to the rental feature, which is release 2.
- 3 item names appear two times. Example: `Canon RF 85mm F1.4 L VCM` and
  `Canon RF 85mm f/1.4L VCM`.
- Each item has an HSN code. 67 of 270 have no rate.

---

## 3. Reference lists — the two sites do not agree

This is the part that needs a decision. The new site has a different list, not
an older copy of the same list.

| List | Only on the old site | Only on the new site |
|---|---|---|
| Project Type | 12, such as `Promotional`, `TV/DV Commercial`, `Event` | 10, such as `Promotional Shoot`, `Ad Film`, `Event Coverage` |
| Supplier Group | 5, such as `Rental House`, `Vendor Companies` | 6, such as `Equipment Rental`, `Camera & Lighting` |
| Item Group | 4: the rental and equipment groups | none |
| Department | `Theatre Education - CSDS`. The others have no `- CSDS` suffix | the same names, with the `- CSDS` suffix |
| Sales Person | 2 people | none |
| Mode of Payment | `UPI \\| Kotak 811` | none |

31 of 34 projects have a project type from the old list. So each project needs
a type from the new list before it moves.

The code names two of these records. `Rental House` is a Supplier Group that
`routes/projectCrew.ts` uses to separate crew from vendors. It is not on the new
site. `Theatre Education - CSDS` is a Department. It is not on the new site.

---

## 4. Projects — 34, and 31 are real

- 29 open, 4 completed, 1 cancelled.
- Each project has a customer, and each customer exists.
- 3 are test or personal records: `PROJ-0007`, `PROJ-0035`, `PROJ-0036`.
- 3 have no project type. 5 have no start date.
- 28 of 34 were created in July 2026.
- 30 have a sanction amount. The total is ₹3,66,334.

---

## 5. Invoices and payments — Malhar says most are test data

| | Count | Submitted | Cancelled | Total, submitted | Not paid |
|---|---|---|---|---|---|
| Sales invoices | 47 | 40 | 7 | ₹7,32,724 | ₹5,62,450 |
| Purchase invoices | 45 | 34 | 11 | ₹1,54,529 | ₹1,49,529 |
| Payments | 17 | 13 | 3 | ₹1,84,274 | — |

What the reading shows:

- 42 of 47 sales invoices and 37 of 45 purchase invoices were entered in July
  2026, with earlier dates.
- 30 sales invoices and 33 purchase invoices are overdue.
- 13 sales invoices were made by Sandesh, during tests.
- The studio invoice number is set on 3 of 47 sales invoices.

The plan: **do not move invoices or payments.** The new site starts with no
transactions. If one invoice is real and not paid, a person enters it again on
the new site.

---

## 6. What a person must decide

| # | Decision | Who |
|---|---|---|
| 1 | Which project types stay: the old list, the new list, or one merged list. Then the type of each of the 31 projects | Shubham |
| 2 | The same for supplier groups | Shubham |
| 3 | Do the 3 real customers and the 31 real projects move as they are | Shubham |
| 4 | Is any invoice real and not paid. If yes, which ones | Shubham |
| 5 | Do the 2 sales persons move | Shubham |
| 6 | Do the 216 rental and equipment items move now, or with release 2 | Malhar |

---

## 7. The move, in sequence

1. Apply `erpnext/schema/0001_project_sanction_amount.json` to the new site.
2. Add the reference records that the decisions give.
3. Add the 3 customers and the 1 supplier that are real and absent.
4. Move the 31 projects, with the sanction amount and the new project type.
5. Move the tasks of those projects.
6. Count again on each site. The projects and the sanction total must agree.
7. Shubham stops work on the old site. The old site becomes the test site.

No step is done until decisions 1 to 5 are made.

---

## 8. What this audit did not read

- The tasks, one by one. There are 270 on the old site and 45 on the new site.
- The addresses and the contacts of each customer and supplier.
- The print formats, the letter head and the naming series.
- The chart of accounts and the tax templates.
