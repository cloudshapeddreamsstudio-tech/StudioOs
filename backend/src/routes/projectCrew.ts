import { Hono } from 'hono';
import type { FrappeClient } from '../lib/frappe';
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
 */

const CREW_SUPPLIER_GROUP = 'Crew & Freelancers';
const VENDOR_SUPPLIER_GROUP = 'Rental House';

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

interface PurchaseOrderRow {
  name: string;
  supplier: string;
  supplier_name?: string;
  docstatus: number;
  schedule_date?: string;
  grand_total?: number;
  items?: { qty?: number; rate?: number; description?: string }[];
  remarks?: string;
}

/**
 * ERPNext's Purchase Order has nowhere native for "designation on this
 * booking" or "contact number for this crew member" -- those aren't
 * properties of the Supplier (a Supplier can be crew on one project and a
 * billed vendor on another, with a different designation each time) and
 * inventing a custom field would need bench access this route doesn't
 * assume. `remarks` is a plain, always-writable text field on every ERPNext
 * transaction, so the three planning-layer fields that have no home live
 * there, one per labelled line -- readable by a human looking at the PO
 * directly in ERPNext, not just by this app.
 */
function encodeRemarks(designation: string, contact: string, notes: string): string | undefined {
  const lines: string[] = [];
  if (designation) lines.push(`Designation: ${designation}`);
  if (contact) lines.push(`Contact: ${contact}`);
  if (notes) lines.push(`Notes: ${notes}`);
  return lines.length ? lines.join('\n') : undefined;
}

function decodeRemarks(remarks: string | undefined): {
  designation: string;
  contact: string;
  notes: string;
} {
  const text = remarks || '';
  const match = (label: string) =>
    new RegExp(`^${label}: (.*)$`, 'm').exec(text)?.[1]?.trim() ?? '';
  return {
    designation: match('Designation'),
    contact: match('Contact'),
    notes: match('Notes'),
  };
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

function toRosterRow(po: PurchaseOrderRow, supplierGroup: string | undefined): CrewRosterRow {
  const { rate, days } = rateAndDaysFrom(po);
  const { designation, contact, notes } = decodeRemarks(po.remarks);
  return {
    id: po.name,
    project: '', // filled by the caller, which already knows it
    role: supplierGroup === VENDOR_SUPPLIER_GROUP ? 'Vendor' : 'Crew',
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
    fields: ['name', 'supplier', 'supplier_name', 'docstatus', 'schedule_date', 'grand_total', 'remarks'],
    filters: [['project', '=', project], ['docstatus', '!=', 2]],
    limit: 200,
  });
  if (!orders.length) return [];

  // Batch-resolve supplier groups rather than one lookup per order.
  const supplierNames = [...new Set(orders.map((o) => o.supplier))];
  const suppliers = await frappe.getList<SupplierRow>('Supplier', {
    fields: ['name', 'supplier_name', 'supplier_group'],
    filters: [['name', 'in', supplierNames]],
    limit: supplierNames.length,
  });
  const groupBySupplier = new Map(suppliers.map((s) => [s.name, s.supplier_group]));

  // items[] isn't in the list query above (ERPNext list views don't return
  // child tables); fetch each order's rate/days from its own doc.
  const withItems = await Promise.all(
    orders.map((o) => frappe.getDoc<PurchaseOrderRow>('Purchase Order', o.name)),
  );

  return withItems.map((po) => ({
    ...toRosterRow(po, groupBySupplier.get(po.supplier)),
    project,
  }));
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

  const supplier = await resolveCrewSupplier(frappe, body.name, body.role);

  const rate = Number(body.rate) || 0;
  const days = Number(body.days) || 1;
  const total = body.total !== undefined && body.total !== '' ? Number(body.total) : rate * days;

  const project = await frappe.getDoc<{ expected_start_date?: string; custom_shoot_date?: string }>(
    'Project',
    body.project,
  );
  const scheduleDate =
    project.custom_shoot_date || project.expected_start_date || new Date().toISOString().slice(0, 10);

  const created = await frappe.createDoc<PurchaseOrderRow>('Purchase Order', {
    docstatus: 0,
    supplier: supplier.name,
    project: body.project,
    transaction_date: new Date().toISOString().slice(0, 10),
    schedule_date: scheduleDate,
    remarks: encodeRemarks(body.designation || '', body.contact || '', body.notes || ''),
    items: [
      {
        item_name: body.designation ? `${body.designation} — ${body.name}` : body.name,
        description: body.designation || body.name,
        qty: days,
        rate: total / days || rate,
        uom: 'Day',
        conversion_factor: 1,
        schedule_date: scheduleDate,
      },
    ],
  });

  return c.json({
    ...toRosterRow(created, supplier.supplier_group),
    project: body.project,
  });
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
  let supplierName = existing.supplier_name || existing.supplier;

  if (body.name !== undefined || body.role !== undefined) {
    const name = body.name ?? supplierName;
    const role = body.role ?? 'Crew';
    const supplier = await resolveCrewSupplier(frappe, name, role);
    patch.supplier = supplier.name;
    supplierName = name;
  }

  const existingFields = decodeRemarks(existing.remarks);
  if (body.designation !== undefined || body.contact !== undefined || body.notes !== undefined) {
    patch.remarks = encodeRemarks(
      body.designation ?? existingFields.designation,
      body.contact ?? existingFields.contact,
      body.notes ?? existingFields.notes,
    );
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

  if (total !== undefined) {
    const designation = body.designation ?? existingFields.designation;
    patch.items = [
      {
        item_name: designation ? `${designation} — ${supplierName}` : supplierName,
        description: designation || supplierName,
        qty: days,
        rate: total / days || rate,
        uom: 'Day',
        conversion_factor: 1,
        schedule_date: existing.schedule_date,
      },
    ];
  }

  const updated = await frappe.updateDoc<PurchaseOrderRow>('Purchase Order', id, patch);
  const supplierGroup = (
    await frappe.getList<SupplierRow>('Supplier', {
      fields: ['name', 'supplier_group'],
      filters: [['name', '=', updated.supplier]],
      limit: 1,
    })
  )[0]?.supplier_group;

  return c.json({ ...toRosterRow(updated, supplierGroup), project: '' });
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
