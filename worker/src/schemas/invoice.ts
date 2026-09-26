import { z } from 'zod';

/**
 * Request shapes for /api/invoices.
 *
 * The old app validated by hand inside each handler (`if (!customer) return
 * res.status(400)...`), which meant the rules were scattered and the error
 * shapes inconsistent. These schemas keep the exact same rules, in one place,
 * and produce field-level errors.
 */

export const invoiceItemSchema = z.object({
  item_code: z.string().optional(),
  item_name: z.string().optional(),
  description: z.string().optional(),
  qty: z.coerce.number(),
  rate: z.coerce.number().optional(),
  uom: z.string().optional(),
});

const invoiceBodyShape = {
  customer: z.string().min(1, 'customer is required'),
  /**
   * Which company's books this belongs in.
   *
   * Optional, and only *needed* when the site has more than one company — with
   * one, there is nothing to disambiguate. When there are several, StudioOS
   * refuses rather than guessing; see lib/companyProfile.ts for why.
   */
  company: z.string().optional(),
  project: z.string().optional(),
  posting_date: z.string().optional(),
  due_date: z.string().optional(),
  subject: z.string().optional(),
  discount_amount: z.coerce.number().optional(),
  items: z.array(invoiceItemSchema).min(1, 'at least one line item is required'),
};

export const createInvoiceSchema = z.object(invoiceBodyShape);

/** Editing a draft. `customer` may be omitted to leave it as-is. */
export const updateInvoiceSchema = z.object({
  ...invoiceBodyShape,
  customer: z.string().optional(),
});

/**
 * Amending a submitted invoice. `reason` is mandatory -- a sent invoice that
 * changes must always carry a record of why.
 */
export const amendInvoiceSchema = z.object({
  ...invoiceBodyShape,
  customer: z.string().optional(),
  reason: z
    .string()
    .trim()
    .min(
      1,
      'A reason is required to edit a sent invoice, so there is always a record of why it changed.',
    ),
});

export type InvoiceItemInput = z.infer<typeof invoiceItemSchema>;
export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
export type AmendInvoiceInput = z.infer<typeof amendInvoiceSchema>;
