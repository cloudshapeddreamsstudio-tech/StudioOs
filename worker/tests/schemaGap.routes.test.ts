import { describe, it, expect } from 'bun:test';
import { Hono } from 'hono';
import projects from '../src/routes/projects';
import payables from '../src/routes/payables';
import projectDetail from '../src/routes/projectDetail';
import { errorHandler } from '../src/middleware/errorHandler';
import { FrappeError } from '../src/lib/errors';
import type { FrappeClient, ListOptions } from '../src/lib/frappe';
import type { AppEnv } from '../src/types';

/**
 * The incident of 2026-10-04 (docs/INCIDENT-2026-10-04-schema-skew.md), as a
 * test: a route, on a site that does not have the custom fields.
 *
 * Demo cannot show this fault. It signs in on the old site, which has each
 * field. So the site here is a fake that refuses an absent field the way
 * ERPNext does: the whole query, HTTP 417, `Field not permitted in query`.
 *
 * ADR-0005 condition 5: StudioOS operates when a field is absent. It shows "not
 * available". It never shows 0, and it never fails.
 */

const PROJECT_CUSTOM = [
  'custom_sales_person',
  'custom_commission_percent',
  'custom_sanction_amount',
  'custom_shoot_date',
  'custom_brand',
  'custom_ad_agency',
  'custom_production_house',
  'custom_poc',
];

type Rows = Record<string, Record<string, unknown>[]>;

/** A site. `absent` lists the fields it does not have, as `DocType.field`. */
function fakeSite(absent: string[], rows: Rows) {
  const lacks = (doctype: string, field: unknown) => absent.includes(`${doctype}.${String(field)}`);
  const strip = (doctype: string, row: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(row).filter(([k]) => !lacks(doctype, k)));

  const client: Partial<FrappeClient> = {
    getList: async <T>(doctype: string, opts: ListOptions = {}) => {
      const asked = [...(opts.fields ?? []), ...(opts.filters ?? []).map((f) => f[0])];
      const offender = asked.find((f) => lacks(doctype, f));
      if (offender) {
        throw new FrappeError(417, {
          exception: `frappe.exceptions.DataError: Field not permitted in query: ${String(offender)}`,
          exc_type: 'DataError',
        });
      }
      return (rows[doctype] ?? []).map((r) => strip(doctype, r)) as T[];
    },
    getDoc: async <T>(doctype: string, name: string) => {
      const row = (rows[doctype] ?? []).find((r) => r.name === name);
      if (!row) throw new FrappeError(404, { exception: 'DoesNotExistError' });
      return strip(doctype, row) as T;
    },
  };
  return client as FrappeClient;
}

function mount(route: Hono<AppEnv>, site: FrappeClient) {
  const app = new Hono<AppEnv>();
  app.use('*', async (c, next) => {
    c.set('frappe', site);
    await next();
  });
  app.onError(errorHandler);
  app.route('/', route);
  return app;
}

const PROJECT = {
  name: 'PROJ-0001',
  project_name: 'Ad film',
  customer: 'Acme',
  status: 'Open',
  custom_sales_person: 'Prem',
  custom_commission_percent: 10,
  custom_sanction_amount: 100000,
  custom_shoot_date: '2026-10-20',
  total_billed_amount: 50000,
  total_purchase_cost: 20000,
  gross_margin: 30000,
  per_gross_margin: 60,
};

const BILL = {
  name: 'PINV-1',
  supplier: 'Asha',
  supplier_name: 'Asha',
  grand_total: 8000,
  outstanding_amount: 8000,
  status: 'Unpaid',
  supplier_group: 'Freelance Crew',
  project: 'PROJ-0001',
};

const INVOICE = {
  name: 'SINV-1',
  custom_invoice_number: 'CSDS_SINV_01',
  posting_date: '2026-10-01',
  grand_total: 50000,
  outstanding_amount: 50000,
  status: 'Unpaid',
  project: 'PROJ-0001',
};

const ALL = { Project: [PROJECT], 'Purchase Invoice': [BILL], 'Sales Invoice': [INVOICE] };
const noProjectCustom = PROJECT_CUSTOM.map((f) => `Project.${f}`);

describe('GET /api/projects', () => {
  it('loads on a site that has none of the custom fields', async () => {
    const res = await mount(projects, fakeSite(noProjectCustom, ALL)).request('/');
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>[];
    expect(body).toHaveLength(1);
    expect(body[0]?.name).toBe('PROJ-0001');
    expect(body[0]?.project_name).toBe('Ad film');
    // Absent, not zero and not empty text: the key is not there.
    expect('custom_sanction_amount' in (body[0] ?? {})).toBe(false);
  });

  it('still returns the fields on a site that has them', async () => {
    const res = await mount(projects, fakeSite([], ALL)).request('/');
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>[];
    expect(body[0]?.custom_sanction_amount).toBe(100000);
    expect(body[0]?.custom_shoot_date).toBe('2026-10-20');
  });
});

describe('GET /api/payables', () => {
  it('loads on a site that has none of the custom fields, and does not invent a commission', async () => {
    const res = await mount(payables, fakeSite(noProjectCustom, ALL)).request('/');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      supplierGroups: { supplier: string; totalOutstanding: number }[];
      commission: unknown;
      totals: { owedToOthers: number; commissionOwed: number | null; grandTotal: number | null };
    };
    // What the studio owes its suppliers is read from stock fields. It is whole.
    expect(body.supplierGroups).toHaveLength(1);
    expect(body.totals.owedToOthers).toBe(8000);
    // The commission cannot be known here. Not available -- never 0.
    expect(body.commission).toBeNull();
    expect(body.totals.commissionOwed).toBeNull();
    // A total with an unknown part is not a total.
    expect(body.totals.grandTotal).toBeNull();
  });

  it('calculates the commission on a site that has the fields', async () => {
    const res = await mount(payables, fakeSite([], ALL)).request('/');
    const body = (await res.json()) as {
      commission: { party: string; totalOwed: number }[];
      totals: { commissionOwed: number; grandTotal: number };
    };
    expect(body.commission).toHaveLength(1);
    expect(body.commission[0]?.totalOwed).toBe(5000);
    expect(body.totals.commissionOwed).toBe(5000);
    expect(body.totals.grandTotal).toBe(13000);
  });
});

describe('GET /api/project/:name', () => {
  it('keeps the sales invoices on a site with no custom_invoice_number', async () => {
    const site = fakeSite(['Sales Invoice.custom_invoice_number'], ALL);
    const res = await mount(projectDetail, site).request('/PROJ-0001');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { salesInvoices: { name: string }[] };
    // Before this correction the query failed, a catch hid the failure, and
    // the project showed no invoice at all.
    expect(body.salesInvoices).toHaveLength(1);
    expect(body.salesInvoices[0]?.name).toBe('SINV-1');
  });
});
