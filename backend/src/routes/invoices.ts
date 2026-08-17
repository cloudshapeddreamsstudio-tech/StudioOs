import { Hono } from 'hono';
import { renderInvoiceHtml, type InvoiceDoc } from '../lib/invoiceHtml';
import { computeInvoiceNumber } from '../lib/invoiceNumber';
import { buildPayQr } from '../lib/payQr';
import { readBrand, BRAND_DEFAULTS, type BrandConfig } from './brand';
import {
  createInvoiceSchema,
  updateInvoiceSchema,
  amendInvoiceSchema,
  type InvoiceItemInput,
} from '../schemas/invoice';
import { ValidationError } from '../lib/errors';
import { createDraftPayment } from './payments';
import type { AppEnv } from '../types';

/**
 * Sales Invoices. Ported from `server/routes/invoices.js`.
 *
 * The money rules are preserved exactly:
 *  - invoices are always created as DRAFTS; submitting is a separate call
 *  - a submitted invoice is never edited, only cancelled and re-issued
 *  - an amendment requires a written reason, logged on both documents
 *  - `project` is stamped on the parent AND every line item, or ERPNext's
 *    project rollup fields silently stay wrong
 */

const app = new Hono<AppEnv>();

/**
 * Accounting coordinates for this company, taken from the studio's existing
 * submitted invoices (see SINV-26-00002) so new invoices post to exactly the
 * same ledgers as the ones made by hand in ERPNext.
 */
const INCOME_ACCOUNT = 'Sales - CSDS';
const DEBIT_TO = 'Debtors - CSDS';
const COST_CENTER = 'Main - CSDS';

/**
 * Normalises the UI's line items into valid Sales Invoice Item rows. `project`
 * is stamped on every line (studio rollup rule). Shared by create / edit-draft
 * / amend so all three build identical rows.
 */
function buildInvoiceItems(items: InvoiceItemInput[], project?: string) {
  return (Array.isArray(items) ? items : [])
    .filter((it) => it && (it.item_name || it.item_code) && Number(it.qty) > 0)
    .map((it) => {
      const line: Record<string, unknown> = {
        item_name: it.item_name || it.item_code,
        description: it.description || it.item_name || it.item_code,
        qty: Number(it.qty),
        rate: Number(it.rate) || 0,
        uom: it.uom || 'Nos',
        conversion_factor: 1,
        income_account: INCOME_ACCOUNT,
        cost_center: COST_CENTER,
        project: project || undefined,
      };
      if (it.item_code) line.item_code = it.item_code;
      return line;
    });
}

/** The same "did anything survive normalisation?" guard all three writes share. */
function requireItems(items: ReturnType<typeof buildInvoiceItems>) {
  if (!items.length) {
    throw new ValidationError('line items need a name and a quantity greater than zero');
  }
  return items;
}

/** GET /api/invoices -- list Sales Invoices with the fields the dashboard needs. */
app.get('/', async (c) => {
  const frappe = c.get('frappe');
  const data = await frappe.getList('Sales Invoice', {
    fields: [
      'name',
      'custom_invoice_number',
      'customer',
      'project',
      'posting_date',
      'due_date',
      'grand_total',
      'outstanding_amount',
      'status',
    ],
    limit: 200,
    orderBy: 'posting_date desc',
  });
  return c.json(data);
});

/**
 * GET /api/invoices/service-items -- the sales/service catalogue used to build
 * invoice lines. Free-text line names are allowed too (item_code isn't required
 * on Sales Invoice Item), but offering the catalogue keeps naming and default
 * rates consistent with how the studio already invoices.
 *
 * Declared before /:name so it isn't swallowed by the parameter route.
 */
app.get('/service-items', async (c) => {
  const frappe = c.get('frappe');
  const data = await frappe.getList('Item', {
    fields: ['item_code', 'item_name', 'standard_rate', 'stock_uom'],
    filters: [
      ['disabled', '=', 0],
      ['is_sales_item', '=', 1],
    ],
    limit: 300,
    orderBy: 'item_name asc',
  });
  return c.json(data);
});

/**
 * POST /api/invoices/brand-preview -- renders the branded template with SAMPLE
 * data and a caller-supplied brand config. Powers the live preview in the
 * invoice designer without touching any real invoice.
 */
app.post('/brand-preview', async (c) => {
  const incoming = ((await c.req.json().catch(() => ({}))) ?? {}) as Partial<BrandConfig>;
  const stored = await readBrand(c.env).catch(() => ({ ...BRAND_DEFAULTS }));

  const brand: BrandConfig = {
    ...stored,
    ...incoming,
    address: { ...stored.address, ...(incoming.address ?? {}) },
    bank: { ...stored.bank, ...(incoming.bank ?? {}) },
  };

  const sample: InvoiceDoc = {
    name: 'SINV-26-00002',
    custom_invoice_number: 'CSDS_SINV_02_260630',
    customer_name: 'Mr. Raj Hande',
    posting_date: '2026-06-30',
    due_date: '2026-07-15',
    payment_terms_template: 'Net 15',
    remarks: 'Real Estate | Shivajinagar | 30 June 26',
    docstatus: 1,
    total: 7500,
    discount_amount: 500,
    grand_total: 7000,
    outstanding_amount: 7000,
    in_words: 'Indian Rupee Seven Thousand Only',
    items: [
      { item_name: 'Cinematography', qty: 1, rate: 6000, amount: 6000 },
      { item_name: 'Gimbal', qty: 1, rate: 1500, amount: 1500 },
    ],
  };

  const qr = await buildPayQr(brand, sample);
  return c.html(renderInvoiceHtml(sample, brand, qr));
});

/**
 * GET /api/invoices/:name/print -- the branded, print-ready page for a real
 * Sales Invoice (draft or submitted).
 */
app.get('/:name/print', async (c) => {
  const frappe = c.get('frappe');
  const invoice = await frappe.getDoc<InvoiceDoc>('Sales Invoice', c.req.param('name'));
  const brand = await readBrand(c.env);

  // Resolve a readable project name for the QR note (invoice.project is the
  // PROJ id). Non-fatal if it can't be fetched.
  let projectName = '';
  if (invoice.project) {
    try {
      const proj = await frappe.getDoc<{ project_name?: string }>('Project', invoice.project);
      projectName = proj.project_name || '';
    } catch {
      /* ignore -- the QR just falls back to the invoice subject */
    }
  }

  const qr = await buildPayQr(brand, invoice, projectName);
  return c.html(renderInvoiceHtml(invoice, brand, qr));
});

/** GET /api/invoices/:name -- single invoice detail. */
app.get('/:name', async (c) => {
  const frappe = c.get('frappe');
  return c.json(await frappe.getDoc('Sales Invoice', c.req.param('name')));
});

/**
 * POST /api/invoices -- create a Sales Invoice as a DRAFT (docstatus 0).
 *
 * Deliberately draft-only: this never posts to the ledger by itself. A draft is
 * fully reversible (it can be deleted), so the studio can build an invoice in
 * the app, eyeball it, and only then explicitly submit it.
 */
app.post('/', async (c) => {
  const frappe = c.get('frappe');
  const body = createInvoiceSchema.parse(await c.req.json());

  const cleanItems = requireItems(buildInvoiceItems(body.items, body.project));
  const invoiceNumber = await computeInvoiceNumber(frappe, body.posting_date);

  const created = await frappe.createDoc('Sales Invoice', {
    docstatus: 0,
    naming_series: 'SINV-.YY.-',
    company: c.env.COMPANY,
    customer: body.customer,
    project: body.project || undefined,
    posting_date: body.posting_date || undefined,
    set_posting_time: body.posting_date ? 1 : 0,
    due_date: body.due_date || undefined,
    currency: 'INR',
    selling_price_list: 'Standard Selling',
    debit_to: DEBIT_TO,
    cost_center: COST_CENTER,
    apply_discount_on: 'Grand Total',
    discount_amount: Number(body.discount_amount) || 0,
    remarks: body.subject || undefined,
    custom_invoice_number: invoiceNumber,
    items: cleanItems,
  });

  return c.json(created);
});

/**
 * POST /api/invoices/:name/submit -- explicitly submit a draft to the ledger
 * (docstatus 0 -> 1). The deliberate, separate "post it for real" step; the UI
 * puts it behind a confirmation so nobody books money by accident.
 */
app.post('/:name/submit', async (c) => {
  const frappe = c.get('frappe');
  const name = c.req.param('name');

  const current = await frappe.getDoc<{ docstatus: number }>('Sales Invoice', name);
  if (current.docstatus === 1) throw new ValidationError('invoice is already submitted');
  if (current.docstatus === 2) {
    throw new ValidationError('invoice is cancelled and cannot be submitted');
  }

  return c.json(await frappe.updateDoc('Sales Invoice', name, { docstatus: 1 }));
});

/**
 * PUT /api/invoices/:name -- edit a DRAFT invoice in place (docstatus 0 only).
 * A draft hasn't hit the ledger, so it's a plain update. Submitted invoices are
 * rejected here and must go through /amend instead.
 */
app.put('/:name', async (c) => {
  const frappe = c.get('frappe');
  const name = c.req.param('name');

  const current = await frappe.getDoc<{ docstatus: number }>('Sales Invoice', name);
  if (current.docstatus !== 0) {
    throw new ValidationError(
      'Only draft invoices can be edited directly. A sent (submitted) invoice must be amended - cancelled and re-issued.',
    );
  }

  const body = updateInvoiceSchema.parse(await c.req.json());
  const cleanItems = requireItems(buildInvoiceItems(body.items, body.project));

  const updated = await frappe.updateDoc('Sales Invoice', name, {
    customer: body.customer,
    project: body.project || undefined,
    posting_date: body.posting_date || undefined,
    set_posting_time: body.posting_date ? 1 : 0,
    due_date: body.due_date || undefined,
    apply_discount_on: 'Grand Total',
    discount_amount: Number(body.discount_amount) || 0,
    remarks: body.subject || undefined,
    items: cleanItems,
  });

  return c.json(updated);
});

/**
 * POST /api/invoices/:name/amend -- the Zoho-style "edit a sent invoice".
 *
 * ERPNext locks a submitted invoice (it's posted to the ledger), so editing it
 * means: cancel the original (reversing its ledger entries) and re-issue a
 * corrected draft linked to it via `amended_from`. The reason is logged as a
 * comment on BOTH documents, so there is always a record of why a sent invoice
 * changed. The new draft is returned unsubmitted so it can be reviewed before
 * being posted again.
 */
app.post('/:name/amend', async (c) => {
  const frappe = c.get('frappe');
  const body = amendInvoiceSchema.parse(await c.req.json());

  const old = await frappe.getDoc<InvoiceDoc & { docstatus: number; name: string }>(
    'Sales Invoice',
    c.req.param('name'),
  );

  if (old.docstatus !== 1) {
    throw new ValidationError(
      'Only a submitted invoice can be amended. Drafts can be edited directly.',
    );
  }

  const cleanItems = requireItems(buildInvoiceItems(body.items, body.project || old.project));

  // 1. Cancel the original, reversing its GL entries. This fails if it has
  //    linked payments or returns -- ERPNext surfaces that and we pass its
  //    status straight back rather than swallowing it.
  await frappe.updateDoc('Sales Invoice', old.name, { docstatus: 2 });

  // 2. Re-issue as a corrected draft linked to the cancelled original. No
  //    naming_series when amended_from is set -- ERPNext names it <old>-N.
  const created = await frappe.createDoc<{ name: string }>('Sales Invoice', {
    docstatus: 0,
    amended_from: old.name,
    company: c.env.COMPANY,
    customer: body.customer || old.customer,
    project: body.project || old.project || undefined,
    posting_date: body.posting_date || undefined,
    set_posting_time: body.posting_date ? 1 : 0,
    due_date: body.due_date || undefined,
    currency: 'INR',
    selling_price_list: 'Standard Selling',
    debit_to: DEBIT_TO,
    cost_center: COST_CENTER,
    apply_discount_on: 'Grand Total',
    discount_amount: Number(body.discount_amount) || 0,
    remarks: body.subject || old.remarks || undefined,
    // Carry the same studio invoice number forward -- this is a correction of
    // the same invoice, not a new one, so it shouldn't consume a fresh slot.
    custom_invoice_number: old.custom_invoice_number || undefined,
    items: cleanItems,
  });

  // 3. Log the reason on both, for future reference. Best-effort: a failed
  //    comment must not undo a completed amendment.
  const stamp = body.reason.trim();
  await frappe
    .createDoc('Comment', {
      comment_type: 'Comment',
      reference_doctype: 'Sales Invoice',
      reference_name: old.name,
      content: `Cancelled & re-issued as ${created.name}. Reason: ${stamp}`,
    })
    .catch(() => {});
  await frappe
    .createDoc('Comment', {
      comment_type: 'Comment',
      reference_doctype: 'Sales Invoice',
      reference_name: created.name,
      content: `Amended from ${old.name}. Reason: ${stamp}`,
    })
    .catch(() => {});

  return c.json(created);
});

/**
 * POST /api/invoices/:name/payment -- create a DRAFT Payment Entry (Receive)
 * against this invoice.
 *
 * The implementation lives in routes/payments.ts but is mounted here so the URL
 * stays invoice-scoped, matching the old app. Submitting the draft is a
 * separate, confirm-gated call: POST /api/payments/:name/submit.
 */
app.post('/:name/payment', createDraftPayment);

export default app;
