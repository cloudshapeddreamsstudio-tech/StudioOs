/**
 * The shape /api/invoices returns — the list projection, not the full
 * ERPNext Sales Invoice doc.
 *
 * `custom_invoice_number` is the studio's own number (CSDS_SINV_NN_YYMMNN).
 * It is empty on invoices raised before that feature existed, which is why the
 * table falls back to ERPNext's internal `name`.
 */
export interface InvoiceListRow {
  name: string;
  custom_invoice_number: string | null;
  customer: string | null;
  project: string | null;
  posting_date: string | null;
  due_date: string | null;
  grand_total: number | null;
  outstanding_amount: number | null;
  status: string | null;
}
