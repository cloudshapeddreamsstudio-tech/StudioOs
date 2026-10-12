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

/** What the routes asked the site for, and what they wrote to it. */
interface Seen {
  /** The fields of each list query, by DocType. */
  asked: Record<string, string[][]>;
  /** Each document that was created or updated. */
  written: { doctype: string; fields: Record<string, unknown> }[];
}

/**
 * A site. `absent` lists the fields it does not have, as `DocType.field`.
 *
 * A list query gets back only the fields it named, as ERPNext answers. So a
 * test cannot pass on a field that the route did not ask for.
 */
function fakeSite(absent: string[], rows: Rows): FrappeClient & { seen: Seen } {
  const lacks = (doctype: string, field: unknown) => absent.includes(`${doctype}.${String(field)}`);
  const strip = (doctype: string, row: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(row).filter(([k]) => !lacks(doctype, k)));
  const seen: Seen = { asked: {}, written: [] };

  const client: Partial<FrappeClient> & { seen: Seen } = {
    seen,
    getList: async <T>(doctype: string, opts: ListOptions = {}) => {
      const fields = opts.fields ?? ['name'];
      (seen.asked[doctype] ??= []).push([...fields]);
      const named = [...fields, ...(opts.filters ?? []).map((f) => f[0])];
      const offender = named.find((f) => lacks(doctype, f));
      if (offender) {
        throw new FrappeError(417, {
          exception: `frappe.exceptions.DataError: Field not permitted in query: ${String(offender)}`,
          exc_type: 'DataError',
        });
      }
      return (rows[doctype] ?? []).map((r) =>
        Object.fromEntries(Object.entries(r).filter(([k]) => fields.includes(k))),
      ) as T[];
    },
    getDoc: async <T>(doctype: string, name: string) => {
      const row = (rows[doctype] ?? []).find((r) => r.name === name);
      if (!row) throw new FrappeError(404, { exception: 'DoesNotExistError' });
      return strip(doctype, row) as T;
    },
    createDoc: async <T>(doctype: string, fields: Record<string, unknown>) => {
      seen.written.push({ doctype, fields });
      return { name: `${doctype}-NEW`, ...fields } as T;
    },
    updateDoc: async <T>(doctype: string, name: string, fields: Record<string, unknown>) => {
      seen.written.push({ doctype, fields });
      return { name, ...fields } as T;
    },
  };
  return client as FrappeClient & { seen: Seen };
}

/** The custom fields that ADR-0005 does not permit in release 1. */
const NOT_PERMITTED = [
  'custom_sales_person',
  'custom_commission_percent',
  'custom_shoot_date',
  'custom_brand',
  'custom_ad_agency',
  'custom_production_house',
  'custom_poc',
];

function mountWithCompany(route: Hono<AppEnv>, site: FrappeClient) {
  const app = mount(route, site);
  return (path: string, init?: RequestInit) =>
    app.request(path, init, { COMPANY: 'Cloud Shaped Dreams Studio' } as AppEnv['Bindings']);
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

  it('returns the sanctioned amount on a site that has the field', async () => {
    const res = await mount(projects, fakeSite([], ALL)).request('/');
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>[];
    expect(body[0]?.custom_sanction_amount).toBe(100000);
  });

  it('asks for one custom field only: the one that ADR-0005 permits', async () => {
    const site = fakeSite([], ALL);
    await mount(projects, site).request('/');
    const custom = (site.seen.asked.Project ?? []).flat().filter((f) => f.startsWith('custom_'));
    expect(custom).toEqual(['custom_sanction_amount']);
  });

  it('does not return a field that is not permitted, on a site that has it', async () => {
    // The old site has each of these. StudioOS does not read them.
    const res = await mount(projects, fakeSite([], ALL)).request('/');
    const body = (await res.json()) as Record<string, unknown>[];
    for (const field of NOT_PERMITTED) expect(field in (body[0] ?? {})).toBe(false);
  });
});

describe('POST and PUT /api/projects', () => {
  const sent = {
    project_name: 'R1 check',
    customer: 'Acme',
    sanctioned_amount: 80000,
    // What an old copy of the form still sends. Each must be ignored.
    sales_person: 'Prem',
    commission_percent: 10,
    brand: 'Acme',
    ad_agency: 'X',
    production_house: 'Y',
    poc: 'Z',
    shoot_date: '2026-10-20',
  };
  const json = (method: string) => ({
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(sent),
  });
  const customWritten = (site: { seen: Seen }, doctype: string) =>
    site.seen.written
      .filter((w) => w.doctype === doctype)
      .flatMap((w) => Object.keys(w.fields))
      .filter((k) => k.startsWith('custom_'));

  it('create writes the sanctioned amount and no other custom field', async () => {
    const site = fakeSite([], { ...ALL, Customer: [{ name: 'Acme', customer_name: 'Acme' }] });
    const res = await mountWithCompany(projects, site)('/', json('POST'));
    expect(res.status).toBeLessThan(300);
    expect(customWritten(site, 'Project')).toEqual(['custom_sanction_amount']);
    const project = site.seen.written.find((w) => w.doctype === 'Project');
    expect(project?.fields.custom_sanction_amount).toBe(80000);
    // No Sales Person is looked up or created for a project any more.
    expect(site.seen.asked['Sales Person']).toBeUndefined();
    expect(site.seen.written.some((w) => w.doctype === 'Sales Person')).toBe(false);
  });

  it('edit writes the sanctioned amount and no other custom field', async () => {
    const site = fakeSite([], { ...ALL, Customer: [{ name: 'Acme', customer_name: 'Acme' }] });
    const res = await mountWithCompany(projects, site)('/PROJ-0001', json('PUT'));
    expect(res.status).toBeLessThan(300);
    expect(customWritten(site, 'Project')).toEqual(['custom_sanction_amount']);
  });
});

describe('GET /api/payables', () => {
  it('loads on a site that has none of the custom fields', async () => {
    const res = await mount(payables, fakeSite(noProjectCustom, ALL)).request('/');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      supplierGroups: { supplier: string; totalOutstanding: number }[];
      totals: { owedToOthers: number; grandTotal: number };
    };
    expect(body.supplierGroups).toHaveLength(1);
    expect(body.totals.owedToOthers).toBe(8000);
    expect(body.totals.grandTotal).toBe(8000);
  });

  it('does not read Project at all, so no field of Project can stop it', async () => {
    // A site that refuses every query on Project.
    const site = fakeSite([], ALL);
    const plain = site.getList.bind(site);
    site.getList = (async (doctype: string, opts?: ListOptions) => {
      if (doctype === 'Project') throw new FrappeError(417, { exception: 'DataError: refused' });
      return plain(doctype, opts);
    }) as FrappeClient['getList'];

    const res = await mount(payables, site).request('/');
    expect(res.status).toBe(200);
  });

  it('reports no commission, on a site with the fields or without them', async () => {
    for (const absent of [[], noProjectCustom]) {
      const res = await mount(payables, fakeSite(absent, ALL)).request('/');
      const body = (await res.json()) as { totals: Record<string, unknown> } & Record<string, unknown>;
      expect('commission' in body).toBe(false);
      expect('commissionOwed' in body.totals).toBe(false);
    }
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
