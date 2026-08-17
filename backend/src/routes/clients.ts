import { Hono } from 'hono';
import { z } from 'zod';
import { createFrappeClient } from '../lib/frappe';
import type { AppEnv } from '../types';

/**
 * Clients directory, backed by the real ERPNext Customer doctype rather than a
 * new local store. Ported from `server/routes/clients.js`.
 *
 * Deliberately separate from `customers.ts`, which stays as the lightweight
 * picker source for the project form. This one is the full directory page.
 *
 * Mounted twice, mirroring the old app: `/api/clients` lists, `/api/client/:name`
 * gets one aggregate.
 */

const app = new Hono<AppEnv>();

interface InvoiceRow {
  name: string;
  customer?: string;
  status?: string;
  outstanding_amount?: number | null;
}

/**
 * "To collect" reflects only invoices actually sent — a Draft has not been
 * submitted, so its outstanding isn't real money owed. Same rule as everywhere
 * else in the app.
 */
function outstandingOf(invoices: InvoiceRow[]): number {
  return invoices
    .filter((i) => i.status !== 'Cancelled' && i.status !== 'Draft')
    .reduce((s, i) => s + Number(i.outstanding_amount || 0), 0);
}

/**
 * GET /api/clients — all Customers with an outstanding-receivables total each.
 *
 * Fetches every Sales Invoice once and groups in memory rather than making an
 * N+1 call per customer.
 */
app.get('/', async (c) => {
  const frappe = createFrappeClient(c.env);

  const [customers, projects, invoices] = await Promise.all([
    frappe.getList<{ name: string }>('Customer', {
      fields: ['name', 'customer_name', 'customer_type', 'email_id', 'mobile_no', 'disabled'],
      limit: 500,
      orderBy: 'customer_name asc',
    }),
    frappe.getList<{ customer?: string }>('Project', {
      fields: ['name', 'customer'],
      limit: 1000,
    }),
    frappe.getList<InvoiceRow>('Sales Invoice', {
      fields: ['name', 'customer', 'status', 'outstanding_amount'],
      limit: 1000,
    }),
  ]);

  const invoicesByCustomer: Record<string, InvoiceRow[]> = {};
  for (const i of invoices) {
    if (i.customer) (invoicesByCustomer[i.customer] ||= []).push(i);
  }

  const projectCountByCustomer: Record<string, number> = {};
  for (const p of projects) {
    if (p.customer) projectCountByCustomer[p.customer] = (projectCountByCustomer[p.customer] ?? 0) + 1;
  }

  return c.json(
    customers.map((cust) => ({
      ...cust,
      outstandingReceivables: outstandingOf(invoicesByCustomer[cust.name] ?? []),
      projectCount: projectCountByCustomer[cust.name] ?? 0,
    })),
  );
});

/**
 * GET /api/client/:name — one client's whole page in a single call: the
 * Customer doc, their invoices, their projects, their address, and the
 * computed outstanding total.
 */
app.get('/:name', async (c) => {
  const frappe = createFrappeClient(c.env);
  const clientName = c.req.param('name');

  const customer = await frappe.getDoc<{
    customer_primary_address?: string;
    customer_primary_contact?: string;
    customer_name?: string;
    customer_type?: string;
  }>('Customer', clientName);

  const [salesInvoices, projects, address] = await Promise.all([
    frappe
      .getList<InvoiceRow>('Sales Invoice', {
        fields: ['name', 'custom_invoice_number', 'posting_date', 'due_date', 'grand_total', 'outstanding_amount', 'status', 'creation'],
        filters: [['customer', '=', clientName]],
        limit: 500,
        orderBy: 'posting_date desc',
      })
      .catch(() => [] as InvoiceRow[]),
    frappe
      .getList('Project', {
        fields: ['name', 'project_name', 'status', 'custom_shoot_date', 'custom_brand', 'creation'],
        filters: [['customer', '=', clientName]],
        limit: 500,
        orderBy: 'creation desc',
      })
      .catch(() => []),
    customer.customer_primary_address
      ? frappe.getDoc('Address', customer.customer_primary_address).catch(() => null)
      : Promise.resolve(null),
  ]);

  const liveSales = salesInvoices.filter((i) => i.status !== 'Cancelled');

  return c.json({
    customer,
    address,
    salesInvoices: liveSales,
    projects,
    outstandingReceivables: outstandingOf(liveSales),
  });
});

const updateClientSchema = z.object({
  email: z.string().optional(),
  phone: z.string().optional(),
  customerType: z.string().optional(),
  address: z
    .object({
      address_line1: z.string().optional(),
      address_line2: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      pincode: z.string().optional(),
      country: z.string().optional(),
    })
    .optional(),
});

/**
 * PUT /api/client/:name — edit standard Customer fields.
 *
 * Only standard Customer fields are exposed. The ERPNext shapes that force this
 * three-way split, all confirmed against the live schema:
 *
 *  - `customer_type` is a direct Customer field.
 *  - `email_id` / `mobile_no` on Customer are Frappe **read-only** fields
 *    fetched from the primary Contact — they cannot be patched on Customer, so
 *    edits go to the linked Contact doc (created and linked if none exists).
 *  - address is a separate linked Address doc (also created if none exists).
 */
app.put('/:name', async (c) => {
  const frappe = createFrappeClient(c.env);
  const clientName = c.req.param('name');
  const body = updateClientSchema.parse(await c.req.json());

  const customer = await frappe.getDoc<{
    customer_type?: string;
    customer_name?: string;
    customer_primary_contact?: string;
    customer_primary_address?: string;
  }>('Customer', clientName);

  if (body.customerType !== undefined && body.customerType !== customer.customer_type) {
    await frappe.updateDoc('Customer', clientName, { customer_type: body.customerType });
  }

  if (body.email !== undefined || body.phone !== undefined) {
    const contactName = customer.customer_primary_contact;
    if (contactName) {
      const contact = await frappe.getDoc('Contact', contactName).catch(() => null);
      if (contact) {
        const patch: Record<string, unknown> = {};
        if (body.email !== undefined) {
          patch.email_ids = [{ email_id: body.email, is_primary: 1 }];
        }
        if (body.phone !== undefined) {
          patch.phone_nos = [{ phone: body.phone, is_primary_mobile_no: 1 }];
        }
        if (Object.keys(patch).length) await frappe.updateDoc('Contact', contactName, patch);
      }
    } else if (body.email || body.phone) {
      // No primary contact yet — create one and link it.
      const created = await frappe.createDoc<{ name: string }>('Contact', {
        first_name: customer.customer_name,
        email_ids: body.email ? [{ email_id: body.email, is_primary: 1 }] : [],
        phone_nos: body.phone ? [{ phone: body.phone, is_primary_mobile_no: 1 }] : [],
        links: [{ link_doctype: 'Customer', link_name: clientName }],
      });
      await frappe.updateDoc('Customer', clientName, { customer_primary_contact: created.name });
    }
  }

  if (body.address) {
    const a = body.address;
    const addressFields = {
      address_title: customer.customer_name,
      address_type: 'Billing',
      address_line1: a.address_line1 || '',
      address_line2: a.address_line2 || '',
      city: a.city || '',
      state: a.state || '',
      pincode: a.pincode || '',
      country: a.country || 'India',
      links: [{ link_doctype: 'Customer', link_name: clientName }],
    };

    if (customer.customer_primary_address) {
      await frappe.updateDoc('Address', customer.customer_primary_address, addressFields);
    } else if (a.address_line1) {
      // Only create an Address if there is actually a line 1 to put in it.
      const createdAddr = await frappe.createDoc<{ name: string }>('Address', addressFields);
      await frappe.updateDoc('Customer', clientName, {
        customer_primary_address: createdAddr.name,
      });
    }
  }

  return c.json({ customer: await frappe.getDoc('Customer', clientName) });
});

export default app;
