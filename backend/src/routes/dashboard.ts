import { Hono } from 'hono';
import { createFrappeClient } from '../lib/frappe';
import {
  buildDashboard,
  type ProjectRow,
  type InvoiceRow,
  type VendorRow,
} from '../lib/dashboardAggregate';
import type { AppEnv } from '../types';

/**
 * GET /api/dashboard — every KPI and series the home page needs, in one call.
 *
 * Ported from `server/routes/dashboard.js`. The three source queries run in
 * parallel; all the arithmetic lives in lib/dashboardAggregate.ts so it can be
 * tested without a network.
 */

const app = new Hono<AppEnv>();

app.get('/', async (c) => {
  const frappe = createFrappeClient(c.env);

  const [projects, invoices, vendors] = await Promise.all([
    frappe.getList<ProjectRow>('Project', {
      fields: [
        'name',
        'project_name',
        'customer',
        'status',
        'expected_start_date',
        'expected_end_date',
        'total_billed_amount',
        'total_purchase_cost',
        'gross_margin',
        'per_gross_margin',
      ],
      limit: 500,
      orderBy: 'creation desc',
    }),
    frappe.getList<InvoiceRow>('Sales Invoice', {
      fields: [
        'name',
        'customer',
        'project',
        'posting_date',
        'due_date',
        'grand_total',
        'outstanding_amount',
        'status',
      ],
      limit: 500,
      orderBy: 'posting_date desc',
    }),
    frappe.getList<VendorRow>('Supplier', {
      fields: ['name', 'supplier_name', 'supplier_group', 'disabled'],
      limit: 500,
    }),
  ]);

  return c.json(buildDashboard(projects, invoices, vendors));
});

export default app;
