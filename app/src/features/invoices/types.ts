/**
 * The shape /api/invoices returns — the list projection, not the full
 * ERPNext Sales Invoice doc.
 *
 * `name` is the number of the invoice. ERPNext makes it from the naming
 * series, for example `SINV-26-00002`.
 */
export interface InvoiceListRow {
  name: string;
  customer: string | null;
  project: string | null;
  posting_date: string | null;
  due_date: string | null;
  grand_total: number | null;
  outstanding_amount: number | null;
  status: string | null;
}
