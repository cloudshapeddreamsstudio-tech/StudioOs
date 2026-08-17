import { Hono } from 'hono';
import type { Context } from 'hono';
import type { FrappeClient } from '../lib/frappe';
import { validatePayment, type PaymentInvoice } from '../lib/paymentRules';
import { AppError, ValidationError } from '../lib/errors';
import type { AppEnv } from '../types';

/**
 * Recording a client's payment against a Sales Invoice.
 *
 * Ported from `server/routes/payments.js` (T-021), the first feature in this
 * app that posts to the general ledger. **Draft-first, always**: the create
 * route never submits a Payment Entry itself. Only the explicit, confirm-gated
 * `/submit` route does that.
 */

/** Same receivable account the invoices route posts to. */
const DEBIT_TO = 'Debtors - CSDS';

/**
 * The only valid "Deposit To" targets: non-group Bank/Cash accounts on this
 * company. (A prerequisite of T-021 set `account_type: 'Bank'` on
 * Kotak Bank - CSDS so it qualifies alongside Cash.)
 */
async function getDepositAccounts(frappe: FrappeClient, company: string) {
  return frappe.getList<{ name: string; account_name: string; account_type: string }>('Account', {
    fields: ['name', 'account_name', 'account_type'],
    filters: [
      ['company', '=', company],
      ['account_type', 'in', ['Bank', 'Cash']],
      ['is_group', '=', 0],
    ],
    limit: 20,
  });
}

/**
 * Finds an existing DRAFT Payment Entry already allocated to this invoice, so
 * the caller can be warned instead of silently creating a second one.
 *
 * Payment Entry's `references` child table isn't independently queryable over
 * REST, so this fetches candidate drafts by party and inspects each one in
 * full. Cheap at this app's real volume — but it is N+1, and on Workers each
 * `getDoc` is a subrequest against a per-invocation cap. The `limit: 50` keeps
 * it bounded; if the studio ever accumulates many open drafts for one customer
 * this is the first thing that will bite.
 */
async function findExistingDraftFor(frappe: FrappeClient, invoice: PaymentInvoice) {
  const candidates = await frappe.getList<{ name: string }>('Payment Entry', {
    fields: ['name'],
    filters: [
      ['docstatus', '=', 0],
      ['party', '=', invoice.customer],
      ['payment_type', '=', 'Receive'],
    ],
    limit: 50,
  });

  for (const c of candidates) {
    const full = await frappe.getDoc<{
      name: string;
      references?: { reference_doctype: string; reference_name: string }[];
    }>('Payment Entry', c.name);

    const hit = (full.references ?? []).some(
      (r) => r.reference_doctype === 'Sales Invoice' && r.reference_name === invoice.name,
    );
    if (hit) return full;
  }
  return null;
}

/**
 * POST /api/invoices/:name/payment — create a DRAFT Payment Entry (Receive)
 * allocated to one Sales Invoice.
 *
 * Exported as a handler rather than a route because it is mounted from the
 * invoices router, so the URL stays invoice-scoped exactly as the spec calls
 * for. The submit route below lives under /api/payments since it isn't.
 */
export async function createDraftPayment(c: Context<AppEnv>) {
  const frappe = c.get('frappe');

  /**
   * This handler is mounted from the invoices router rather than declared on
   * one, so Hono can't prove `:name` is in the path. Checked rather than cast:
   * a missing invoice name here would otherwise fetch `Sales Invoice/undefined`.
   */
  const invoiceName = c.req.param('name');
  if (!invoiceName) throw new ValidationError('invoice name is required');

  const invoice = await frappe.getDoc<PaymentInvoice>('Sales Invoice', invoiceName);
  const body = (await c.req.json().catch(() => ({}))) as {
    amount?: unknown;
    paymentDate?: string;
    modeOfPayment?: string;
    depositTo?: string;
    referenceNo?: string;
    notes?: string;
  };

  const accounts = await getDepositAccounts(frappe, c.env.COMPANY);
  const verdict = validatePayment(
    invoice,
    body,
    accounts.map((a) => a.name),
  );
  if (!verdict.ok) throw new AppError(verdict.error, verdict.status);

  const { paidAmount, outstanding } = verdict;

  // Duplicate guard: warn rather than silently creating a second draft.
  const existingDraft = await findExistingDraftFor(frappe, invoice);
  if (existingDraft) {
    return c.json(
      {
        error: `A draft payment (${existingDraft.name}) already exists against this invoice. Submit or delete it before creating another.`,
        existing: existingDraft.name,
      },
      409,
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const postingDate = body.paymentDate || today;

  const created = await frappe.createDoc<{ name: string }>('Payment Entry', {
    docstatus: 0,
    naming_series: 'ACC-PAY-.YYYY.-',
    payment_type: 'Receive',
    posting_date: postingDate,
    company: c.env.COMPANY,
    party_type: 'Customer',
    party: invoice.customer,
    paid_from: DEBIT_TO,
    paid_from_account_currency: 'INR',
    paid_to: body.depositTo,
    paid_to_account_currency: 'INR',
    paid_amount: paidAmount,
    received_amount: paidAmount,
    source_exchange_rate: 1,
    target_exchange_rate: 1,
    base_paid_amount: paidAmount,
    base_received_amount: paidAmount,
    mode_of_payment: body.modeOfPayment,
    reference_no: body.referenceNo || undefined,
    reference_date: body.referenceNo ? postingDate : undefined,
    remarks:
      body.notes ||
      `Amount INR ${paidAmount} received from ${invoice.customer} against ${invoice.name}`,
    project: (invoice as { project?: string }).project || undefined,
    references: [
      {
        reference_doctype: 'Sales Invoice',
        reference_name: invoice.name,
        total_amount: invoice.grand_total,
        outstanding_amount: outstanding,
        allocated_amount: paidAmount,
      },
    ],
  });

  // Timeline entry on the server clock — same never-backdated pattern used
  // elsewhere. Best-effort: a failed comment must not undo a created draft.
  await frappe
    .createDoc('Comment', {
      comment_type: 'Comment',
      reference_doctype: 'Sales Invoice',
      reference_name: invoice.name,
      content: `Draft payment ${created.name} recorded: ₹${paidAmount} via ${body.modeOfPayment}. Not yet posted to books.`,
    })
    .catch(() => {});

  return c.json(created);
}

const app = new Hono<AppEnv>();

/** GET /api/payments/deposit-accounts — Bank/Cash accounts for the dropdown. */
app.get('/deposit-accounts', async (c) => {
  const frappe = c.get('frappe');
  return c.json(await getDepositAccounts(frappe, c.env.COMPANY));
});

/** GET /api/payments/modes-of-payment — Mode of Payment dropdown options. */
app.get('/modes-of-payment', async (c) => {
  const frappe = c.get('frappe');
  const modes = await frappe.getList('Mode of Payment', {
    fields: ['name', 'type'],
    filters: [['enabled', '=', 1]],
    limit: 20,
  });
  return c.json(modes);
});

/**
 * POST /api/payments/:name/submit — the explicit, confirm-gated "post it for
 * real" step (docstatus 0 → 1). Nothing before this call has touched the
 * ledger; this is the only thing that does.
 */
app.post('/:name/submit', async (c) => {
  const frappe = c.get('frappe');
  const name = c.req.param('name');

  const current = await frappe.getDoc<{
    docstatus: number;
    paid_amount: number;
    references?: { reference_name: string }[];
  }>('Payment Entry', name);

  if (current.docstatus === 1) throw new ValidationError('Payment is already submitted.');
  if (current.docstatus === 2) {
    throw new ValidationError('Payment is cancelled and cannot be submitted.');
  }

  const updated = await frappe.updateDoc<{ name: string }>('Payment Entry', name, {
    docstatus: 1,
  });

  const invoiceRef = (current.references ?? [])[0];
  if (invoiceRef) {
    await frappe
      .createDoc('Comment', {
        comment_type: 'Comment',
        reference_doctype: 'Sales Invoice',
        reference_name: invoiceRef.reference_name,
        content: `Payment ${updated.name} posted to books: ₹${current.paid_amount}.`,
      })
      .catch(() => {});
  }

  return c.json(updated);
});

export default app;
