import { describe, it, expect } from 'bun:test';
import { Hono } from 'hono';
import payables from '../src/routes/payables';
import inventory from '../src/routes/inventory';
import projectDetail from '../src/routes/projectDetail';
import { errorHandler } from '../src/middleware/errorHandler';
import { FrappeError } from '../src/lib/errors';
import { vendorGroupsFrom, VENDOR_ROOT_GROUP } from '../src/lib/vendorGroups';
import type { FrappeClient, ListOptions } from '../src/lib/frappe';
import type { AppEnv } from '../src/types';

/**
 * v1.0.1 card, item B5: the master records that the code names, against the
 * two sites as they are. Malhar's answers of 2026-10-14.
 *
 *  1. Vendors are `Equipment Rental` and each group below it. The top name is
 *     in erpnext/reference/0001, not in the code.
 *  2. No special case for the Department `Theatre Education - CSDS`.
 *  3. The equipment Item Groups can be absent. Nothing fails.
 *  4. The owner's supplier name is configuration, beside COMPANY.
 */

/** The Supplier Group tree of the new site, as read on 2026-10-14. */
const NEW_SITE_GROUPS = [
  { name: 'All Supplier Groups', parent_supplier_group: null },
  { name: 'Equipment Rental', parent_supplier_group: 'All Supplier Groups' },
  { name: 'Camera & Lighting', parent_supplier_group: 'Equipment Rental' },
  { name: 'Sound & AV', parent_supplier_group: 'Equipment Rental' },
  { name: 'Freelance Crew', parent_supplier_group: 'All Supplier Groups' },
  { name: 'Direction & Production', parent_supplier_group: 'Freelance Crew' },
  { name: 'Studios & Agencies', parent_supplier_group: 'All Supplier Groups' },
];

describe('vendorGroupsFrom', () => {
  it('reads the top group from the reference file', () => {
    expect(VENDOR_ROOT_GROUP).toBe('Equipment Rental');
  });

  it('is the top group and each group below it', () => {
    const v = vendorGroupsFrom(NEW_SITE_GROUPS);
    expect([...v].sort()).toEqual(['Camera & Lighting', 'Equipment Rental', 'Sound & AV']);
  });

  it('finds a group at any depth, and a group added later', () => {
    const v = vendorGroupsFrom([
      ...NEW_SITE_GROUPS,
      { name: 'Grip', parent_supplier_group: 'Camera & Lighting' },
    ]);
    expect(v.has('Grip')).toBe(true);
  });

  it('is the top group alone on a site that does not have it', () => {
    const v = vendorGroupsFrom([{ name: 'Rental House', parent_supplier_group: 'Vendor Companies' }]);
    expect([...v]).toEqual(['Equipment Rental']);
  });

  it('stops on a tree with a cycle', () => {
    const v = vendorGroupsFrom([
      { name: 'A', parent_supplier_group: 'Equipment Rental' },
      { name: 'B', parent_supplier_group: 'A' },
      { name: 'Equipment Rental', parent_supplier_group: 'B' },
    ]);
    expect([...v].sort()).toEqual(['A', 'B', 'Equipment Rental']);
  });
});

/* -------------------------------------------------------------- the routes */

type Rows = Record<string, Record<string, unknown>[]>;

/** A site that answers with the fields that were asked for, as ERPNext does. */
function site(rows: Rows): FrappeClient {
  const pick = (r: Record<string, unknown>, fields: string[]) =>
    Object.fromEntries(Object.entries(r).filter(([k]) => fields.includes(k)));
  const client: Partial<FrappeClient> = {
    getList: async <T>(doctype: string, opts: ListOptions = {}) => {
      const fields = opts.fields ?? ['name'];
      let list = rows[doctype] ?? [];
      for (const [field, op, value] of (opts.filters ?? []) as [string, string, unknown][]) {
        if (op === '=') list = list.filter((r) => r[field] === value);
        if (op === 'in') list = list.filter((r) => (value as unknown[]).includes(r[field]));
      }
      return list.map((r) => pick(r, fields)) as T[];
    },
    getDoc: async <T>(doctype: string, name: string) => {
      const row = (rows[doctype] ?? []).find((r) => r.name === name);
      if (!row) throw new FrappeError(404, { exception: 'DoesNotExistError' });
      return row as T;
    },
    updateDoc: async <T>(_d: string, name: string, fields: Record<string, unknown>) =>
      ({ name, ...fields }) as T,
    createDoc: async <T>(doctype: string, fields: Record<string, unknown>) =>
      ({ name: `${doctype}-NEW`, ...fields }) as T,
  };
  return client as FrappeClient;
}

const ENV = { COMPANY: 'Cloud Shaped Dreams Studio', OWNER_SUPPLIER: 'Asha Owner' } as AppEnv['Bindings'];

function request(route: Hono<AppEnv>, s: FrappeClient, path: string) {
  const app = new Hono<AppEnv>();
  app.use('*', async (c, next) => {
    c.set('frappe', s);
    await next();
  });
  app.onError(errorHandler);
  app.route('/', route);
  return app.request(path, {}, ENV);
}

const bill = (over: Record<string, unknown>) => ({
  name: 'PINV-1',
  supplier: 'Crew Person',
  supplier_name: 'Crew Person',
  grand_total: 1000,
  outstanding_amount: 1000,
  status: 'Unpaid',
  docstatus: 1,
  supplier_group: 'Direction & Production',
  project: 'PROJ-1',
  ...over,
});

describe('GET /api/payables on a site laid out like the new one', () => {
  const rows = {
    'Supplier Group': NEW_SITE_GROUPS,
    'Purchase Invoice': [
      bill({ name: 'PINV-1' }),
      bill({ name: 'PINV-2', supplier: 'Lens House', supplier_name: 'Lens House', supplier_group: 'Camera & Lighting' }),
      bill({ name: 'PINV-3', supplier: 'Asha Owner', supplier_name: 'Asha Owner' }),
    ],
  };

  it('labels a supplier in a group below Equipment Rental as Vendor', async () => {
    const res = await request(payables, site(rows), '/');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      supplierGroups: { supplier: string; invoices: { partyType: string }[] }[];
    };
    const party = (s: string) => body.supplierGroups.find((g) => g.supplier === s)?.invoices[0]?.partyType;
    expect(party('Lens House')).toBe('Vendor');
    expect(party('Crew Person')).toBe('Crew');
  });

  it('reads the owner from OWNER_SUPPLIER, not from the code', async () => {
    const res = await request(payables, site(rows), '/');
    const body = (await res.json()) as {
      supplierGroups: { supplier: string; isOwner: boolean }[];
      totals: { owedToOthers: number; owedToOwner: number };
    };
    expect(body.supplierGroups.find((g) => g.supplier === 'Asha Owner')?.isOwner).toBe(true);
    expect(body.totals.owedToOwner).toBe(1000);
    expect(body.totals.owedToOthers).toBe(2000);
  });
});

describe('GET /api/inventory without the equipment Item Groups', () => {
  it('loads, on a site that has neither group (release 2)', async () => {
    const res = await request(inventory, site({ Item: [{ name: 'Cinematographer', item_group: 'Services' }] }), '/');
    expect(res.status).toBe(200);
  });
});

describe('GET /api/project/:name and the master records', () => {
  const project = (over: Record<string, unknown>) => ({
    name: 'PROJ-1',
    status: 'Open',
    custom_sanction_amount: 100000,
    ...over,
  });

  it('a bill in a group below Equipment Rental is vendor spend', async () => {
    const res = await request(
      projectDetail,
      site({
        Project: [project({})],
        'Supplier Group': NEW_SITE_GROUPS,
        'Purchase Invoice': [
          bill({ name: 'PINV-1', grand_total: 3000 }),
          bill({ name: 'PINV-2', supplier_group: 'Sound & AV', grand_total: 8000 }),
        ],
      }),
      '/PROJ-1',
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      expenseOverview: { rows: { category: string; actual: number }[] };
    };
    const actual = (c: string) => body.expenseOverview.rows.find((r) => r.category === c)?.actual;
    expect(actual('Vendor')).toBe(8000);
    expect(actual('Crew')).toBe(3000);
  });

  it('has no special case for a department, and does not fail on one that is absent', async () => {
    const res = await request(
      projectDetail,
      site({ Project: [project({ department: 'Theatre Education - CSDS' })] }),
      '/PROJ-1',
    );
    expect(res.status).toBe(200);
  });
});
