import { Hono } from 'hono';
import type { FrappeClient } from '../lib/frappe';
import { resolveCompany } from '../lib/companyProfile';
import { createCrewSchema, updateCrewSchema } from '../schemas/crew';
import { ValidationError, NotFoundError } from '../lib/errors';
import type { AppEnv } from '../types';

/**
 * A lightweight crew/vendor "roster" per project -- who's booked, at what
 * rate, for how many days, and the resulting total.
 *
 * Deliberately NOT tied to Purchase Invoices for money purposes: this is a
 * planning layer (who do we need, what will it cost) that exists before, or
 * without, any formal bill being raised. Real invoiced spend is shown
 * separately on the Money tab. Plan and actual are independently sourced and
 * never back-filled from one another, per the studio's "never guess money"
 * rule -- see projectFinance.ts.
 *
 * Was `projectCrew.json`, then a D1 table (`crewEntries`), removed when
 * ERPNext became the only store (Phase 7b). Phase 10f's decision, taken
 * 2026-08-18 (docs/PLAN-v2.md): one `Purchase Order` per crew/vendor member,
 * kept as a Draft (docstatus 0) so it stays freely editable while a booking
 * is still being planned -- nothing here ever submits one. Suppliers already
 * model "the studio's crew, freelancers, and rental houses" (see
 * routes/vendors.ts), so a roster entry is a Supplier plus a draft PO, not a
 * new kind of record.
 *
 * The Crew/Vendor split reuses the exact signal `projectFinance.ts` already
 * uses for real purchase invoices -- `VENDOR_SUPPLIER_GROUP` -- rather than
 * inventing a second one. A Supplier in that group is a Vendor entry;
 * everyone else is Crew.
 *
 * Every field name and requirement below was proven live against
 * cloudshapeddreamsstudio.m.erpnext.com (create, inspect, delete -- same
 * proof pattern as Timesheet/Journal Entry in docs/PLAN-v2.md), not assumed:
 *
 *  - `Purchase Order` has no `remarks` field (that's Sales Invoice only).
 *    Its free-text home is `terms` (Text Editor, always writable).
 *  - `Purchase Order Item.item_code` is a required Link to a real `Item` --
 *    unlike Sales Invoice Item on this site, a free-text line does not work
 *    here. A "designation" is therefore a real Item (this studio already has
 *    "Cinematographer", "Director" etc. in the Services group -- a roster
 *    entry's designation reuses or creates one, the same on-the-fly pattern
 *    as everything else in this file).
 *  - `Item` creation needs a `gst_hsn_code` (an India Compliance validation,
 *    not visible in the DocType schema's `reqd` flags). `998431` matches
 *    this studio's own existing service Items (motion picture / video
 *    production services).
 *  - `Purchase Order` itself needs `naming_series`, `company`, `currency`,
 *    `conversion_rate` explicitly -- they have schema defaults, but this
 *    studio's site did not apply them without an explicit value.
 *  - `Purchase Order Item`'s `uom`, `stock_uom`, `conversion_factor`,
 *    `base_rate`, `base_amount` are all `reqd: 1` in the schema but are
 *    populated automatically server-side from the Item master and
 *    `qty` * `rate` -- supplying `item_code`, `qty`, `rate`, `schedule_date`
 *    is sufficient and was proven sufficient live.
 *  - `supplier_group` is fetched directly onto `Purchase Order` itself (not
 *    just onto `Purchase Invoice`), so the Crew/Vendor split needs no
 *    separate Supplier lookup.
 */

const CREW_SUPPLIER_GROUP = 'Freelance Crew';
const VENDOR_SUPPLIER_GROUP = 'Rental House';
/** This studio's own convention for service-designation Items -- see file header. */
const DESIGNATION_ITEM_GROUP = 'Services';
const DESIGNATION_ITEM_HSN_CODE = '998431';
const FALLBACK_DESIGNATION = 'Crew Service';

interface SupplierRow {
  name: string;
  supplier_name: string;
  supplier_group: string;
}

/**
 * Resolve a name typed into the roster form to an existing Supplier's
 * docname, or create one on the fly -- same on-the-fly-create pattern as
 * `resolveCustomer` / `resolveSalesPerson` in routes/projects.ts. A new
 * crew/vendor member shouldn't be blocked on a separate "add supplier"
 * step.
 */
async function resolveCrewSupplier(
  frappe: FrappeClient,
  name: string,
  role: 'Crew' | 'Vendor',
): Promise<SupplierRow> {
  const existing = await frappe.getList<SupplierRow>('Supplier', {
    fields: ['name', 'supplier_name', 'supplier_group'],
    filters: [['supplier_name', '=', name]],
    limit: 1,
  });
  if (existing.length && existing[0]) return existing[0];

  const supplierGroup = role === 'Vendor' ? VENDOR_SUPPLIER_GROUP : CREW_SUPPLIER_GROUP;
  const created = await frappe.createDoc<SupplierRow>('Supplier', {
    supplier_name: name,
    supplier_group: supplierGroup,
    supplier_type: 'Individual',
  });
  return { ...created, supplier_group: supplierGroup };
}

/**
 * Resolve a designation ("Cinematographer", "Boom Operator", ...) to a real
 * Item, or create one on the fly. `item_code` is a mandatory Link on
 * Purchase Order Item -- there is no free-text line here, so the
 * designation itself has to be a document, not a string.
 */
async function resolveDesignationItem(
  frappe: FrappeClient,
  designation: string,
): Promise<{ item_code: string; item_name: string }> {
  const itemCode = designation.trim() || FALLBACK_DESIGNATION;

  const existing = await frappe
    .getDoc<{ item_code: string; item_name: string }>('Item', itemCode)
    .catch(() => null);
  if (existing) return existing;

  const created = await frappe.createDoc<{ item_code: string; item_name: string }>('Item', {
    item_code: itemCode,
    item_name: itemCode,
    item_group: DESIGNATION_ITEM_GROUP,
    stock_uom: 'Day',
    is_stock_item: 0,
    is_purchase_item: 1,
    gst_hsn_code: DESIGNATION_ITEM_HSN_CODE,
  });
  return created;
}

interface PurchaseOrderRow {
  name: string;
  supplier: string;
  supplier_name?: string;
  supplier_group?: string;
  docstatus: number;
  schedule_date?: string;
  grand_total?: number;
  items?: { item_code?: string; item_name?: string; qty?: number; rate?: number }[];
  terms?: string;
}

/**
 * ERPNext's Purchase Order has nowhere native for "contact number for this
 * crew member on this booking" -- that isn't a property of the Supplier (the
 * same person can be booked on many projects with different numbers on
 * file, or none). `terms` (Text Editor) is a plain, always-writable field on
 * Purchase Order, so the two planning-layer fields with no home live there,
 * one per labelled line -- readable by a human looking at the PO directly in
 * ERPNext, not just by this app.
 */
function encodeTerms(contact: string, notes: string): string | undefined {
  const lines: string[] = [];
  if (contact) lines.push(`Contact: ${contact}`);
  if (notes) lines.push(`Notes: ${notes}`);
  return lines.length ? lines.join('\n') : undefined;
}

function decodeTerms(terms: string | undefined): { contact: string; notes: string } {
  const text = terms || '';
  const match = (label: string) =>
    new RegExp(`^${label}: (.*)$`, 'm').exec(text)?.[1]?.trim() ?? '';
  return { contact: match('Contact'), notes: match('Notes') };
}

/** One roster row's shape, as the frontend already expects it. */
interface CrewRosterRow {
  id: string;
  project: string;
  role: 'Crew' | 'Vendor';
  name: string;
  designation: string;
  rate: number;
  days: number;
  total: number;
  contact: string;
  notes: string;
  docstatus: number;
}

function rateAndDaysFrom(po: PurchaseOrderRow): { rate: number; days: number } {
  const item = po.items?.[0];
  const days = Number(item?.qty) || 1;
  const rate = Number(item?.rate) || 0;
  return { rate, days };
}

function toRosterRow(po: PurchaseOrderRow): CrewRosterRow {
  const { rate, days } = rateAndDaysFrom(po);
  const { contact, notes } = decodeTerms(po.terms);
  const item = po.items?.[0];
  const designation = item?.item_code === FALLBACK_DESIGNATION ? '' : item?.item_name || '';
  return {
    id: po.name,
    project: '', // filled by the caller, which already knows it
    role: po.supplier_group === VENDOR_SUPPLIER_GROUP ? 'Vendor' : 'Crew',
    name: po.supplier_name || po.supplier,
    designation,
    rate,
    days,
    total: Number(po.grand_total) || rate * days,
    contact,
    notes,
    docstatus: po.docstatus,
  };
}

/**
 * Shared with the project-detail aggregate so that page needs only one
 * fetch. Named the same as the D1-era helper it replaces.
 */
export async function readCrewForProject(
  frappe: FrappeClient,
  project: string,
): Promise<CrewRosterRow[]> {
  const orders = await frappe.getList<PurchaseOrderRow>('Purchase Order', {
    fields: [
      'name', 'supplier', 'supplier_name', 'supplier_group', 'docstatus',
      'schedule_date', 'grand_total', 'terms',
    ],
    filters: [['project', '=', project], ['docstatus', '!=', 2]],
    limit: 200,
  });
  if (!orders.length) return [];

  // items[] isn't in the list query above (ERPNext list views don't return
  // child tables); fetch each order's rate/days/designation from its own doc.
  const withItems = await Promise.all(
    orders.map((o) => frappe.getDoc<PurchaseOrderRow>('Purchase Order', o.name)),
  );

  return withItems.map((po) => ({ ...toRosterRow(po), project }));
}

const app = new Hono<AppEnv>();

/** GET /api/project-crew?project=PROJ-XXXX */
app.get('/', async (c) => {
  const frappe = c.get('frappe');
  const project = c.req.query('project');
  if (!project) throw new ValidationError('project is required');
  return c.json(await readCrewForProject(frappe, project));
});

/**
 * POST /api/project-crew -- add a crew or vendor entry.
 *
 * Creates a Draft Purchase Order (docstatus 0). Nothing here submits one --
 * a draft is fully reversible, matching how invoices are created as drafts
 * first (see routes/invoices.ts).
 */
app.post('/', async (c) => {
  const frappe = c.get('frappe');
  const body = createCrewSchema.parse(await c.req.json());

  const [supplier, item, profile, project] = await Promise.all([
    resolveCrewSupplier(frappe, body.name, body.role),
    resolveDesignationItem(frappe, body.designation || ''),
    resolveCompany(frappe),
    frappe.getDoc<{ expected_start_date?: string; custom_shoot_date?: string }>(
      'Project',
      body.project,
    ),
  ]);

  const rate = Number(body.rate) || 0;
  const days = Number(body.days) || 1;
  const total = body.total !== undefined && body.total !== '' ? Number(body.total) : rate * days;
  const scheduleDate =
    project.custom_shoot_date || project.expected_start_date || new Date().toISOString().slice(0, 10);

  const created = await frappe.createDoc<PurchaseOrderRow>('Purchase Order', {
    docstatus: 0,
    naming_series: 'PUR-ORD-.YYYY.-',
    supplier: supplier.name,
    project: body.project,
    company: profile.name,
    currency: profile.currency,
    conversion_rate: 1,
    transaction_date: new Date().toISOString().slice(0, 10),
    schedule_date: scheduleDate,
    terms: encodeTerms(body.contact || '', body.notes || ''),
    items: [
      {
        item_code: item.item_code,
        item_name: item.item_name,
        schedule_date: scheduleDate,
        qty: days,
        rate: total / days || rate,
      },
    ],
  });

  return c.json({ ...toRosterRow(created), project: body.project });
});

/**
 * PUT /api/project-crew/:id -- edit an entry.
 *
 * Only a Draft can be edited in place, same guard as `invoices.ts PUT
 * /:name`. A submitted PO would need a proper amend flow, which is out of
 * scope here since nothing in this route ever submits one.
 */
app.put('/:id', async (c) => {
  const frappe = c.get('frappe');
  const id = c.req.param('id');
  const body = updateCrewSchema.parse(await c.req.json());

  const existing = await frappe.getDoc<PurchaseOrderRow>('Purchase Order', id);
  if (existing.docstatus !== 0) {
    throw new ValidationError('Only a draft roster entry can be edited directly.');
  }

  const patch: Record<string, unknown> = {};

  if (body.name !== undefined || body.role !== undefined) {
    const name = body.name ?? existing.supplier_name ?? existing.supplier;
    const role = body.role ?? (existing.supplier_group === VENDOR_SUPPLIER_GROUP ? 'Vendor' : 'Crew');
    const supplier = await resolveCrewSupplier(frappe, name, role);
    patch.supplier = supplier.name;
  }

  const existingFields = decodeTerms(existing.terms);
  if (body.contact !== undefined || body.notes !== undefined) {
    patch.terms = encodeTerms(body.contact ?? existingFields.contact, body.notes ?? existingFields.notes);
  }

  const { rate: existingRate, days: existingDays } = rateAndDaysFrom(existing);
  const rate = body.rate !== undefined ? Number(body.rate) || 0 : existingRate;
  const days = body.days !== undefined ? Number(body.days) || 1 : existingDays;
  const total =
    body.total !== undefined && body.total !== ''
      ? Number(body.total)
      : body.rate !== undefined || body.days !== undefined
        ? rate * days
        : undefined;

  if (total !== undefined || body.designation !== undefined) {
    const item =
      body.designation !== undefined
        ? await resolveDesignationItem(frappe, body.designation)
        : existing.items?.[0];
    if (item?.item_code) {
      patch.items = [
        {
          item_code: item.item_code,
          item_name: item.item_name,
          schedule_date: existing.schedule_date,
          qty: days,
          rate: (total ?? existingRate * existingDays) / days || rate,
        },
      ];
    }
  }

  const updated = await frappe.updateDoc<PurchaseOrderRow>('Purchase Order', id, patch);
  return c.json({ ...toRosterRow(updated), project: '' });
});

/** DELETE /api/project-crew/:id -- only drafts; nothing here submits one. */
app.delete('/:id', async (c) => {
  const frappe = c.get('frappe');
  const id = c.req.param('id');

  const existing = await frappe
    .getDoc<PurchaseOrderRow>('Purchase Order', id)
    .catch(() => null);
  if (!existing) throw new NotFoundError('Crew entry');
  if (existing.docstatus !== 0) {
    throw new ValidationError('Only a draft roster entry can be deleted directly.');
  }

  await frappe.deleteDoc('Purchase Order', id);
  return c.json({ deleted: true });
});

export default app;
