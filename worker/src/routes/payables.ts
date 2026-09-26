import { Hono } from 'hono';
import {
  buildPayables,
  type PayablePurchaseRow,
  type PayableProjectRow,
} from '../lib/payablesAggregate';
import type { AppEnv } from '../types';

/**
 * GET /api/payables — every submitted purchase invoice still owed, grouped by
 * supplier, plus commission owed to referrers. The whole page in one call.
 *
 * Ported from `server/routes/payables.js` (T-014). Read-only: no write route
 * lives here, and it reads ERPNext only — never the local D1 ledgers, per the
 * studio's "the ERP is the only truth" principle for money owed.
 */

const app = new Hono<AppEnv>();

app.get('/', async (c) => {
  const frappe = c.get('frappe');

  const [purchaseInvoices, projects] = await Promise.all([
    /**
     * Submitted only, outstanding > 0 — the same rule used for "to pay"
     * everywhere else: a draft purchase invoice isn't real money owed yet.
     */
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
    // Needed for the commission leg.
    frappe.getList<PayableProjectRow>('Project', {
      fields: [
        'name', 'project_name', 'custom_sales_person', 'custom_commission_percent',
        'custom_sanction_amount', 'total_billed_amount', 'department',
      ],
      limit: 1000,
    }),
  ]);

  return c.json(buildPayables(purchaseInvoices, projects));
});

export default app;
