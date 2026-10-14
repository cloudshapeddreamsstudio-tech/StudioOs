import { Hono } from 'hono';
import { buildPayables, type PayablePurchaseRow } from '../lib/payablesAggregate';
import { readVendorGroups } from '../lib/vendorGroups';
import type { AppEnv } from '../types';

/**
 * GET /api/payables — every submitted purchase invoice still owed, grouped by
 * supplier. The whole page in one call.
 *
 * Ported from `server/routes/payables.js` (T-014). Read-only: no write route
 * lives here, and it reads ERPNext only — never the local D1 ledgers, per the
 * studio's "the ERP is the only truth" principle for money owed.
 */

const app = new Hono<AppEnv>();

app.get('/', async (c) => {
  const frappe = c.get('frappe');

  /**
   * Submitted only, outstanding > 0 — the same rule used for "to pay"
   * everywhere else: a draft purchase invoice isn't real money owed yet.
   *
   * This is the one query of the page, and it names stock fields only. The page
   * read `Project` too, for a commission, through three custom fields. A site
   * without them refused that query with 417 and took the page down in
   * production on 2026-10-04. ADR-0005 does not permit those fields in
   * release 1, so the query is gone.
   */
  const [purchaseInvoices, vendorGroups] = await Promise.all([
    frappe.getList<PayablePurchaseRow>('Purchase Invoice', {
    fields: [
      'name', 'supplier', 'supplier_name', 'posting_date', 'due_date',
      'grand_total', 'outstanding_amount', 'status', 'supplier_group',
      'remarks', 'project',
    ],
    filters: [
      ['docstatus', '=', 1],
      ['outstanding_amount', '>', 0],
    ],
    limit: 500,
    orderBy: 'due_date asc',
    }),
    readVendorGroups(frappe),
  ]);

  return c.json(
    buildPayables(purchaseInvoices, { ownerSupplier: c.env.OWNER_SUPPLIER, vendorGroups }),
  );
});

export default app;
