/**
 * The guards around recording a client payment.
 *
 * Extracted from `server/routes/payments.js` so they can be tested directly.
 * This is the only path in the app that leads to a general-ledger posting, so
 * every rule is enforced here regardless of what the browser already checked —
 * a client-side check is a convenience, not a control.
 */

export interface PaymentInvoice {
  name: string;
  docstatus?: number;
  outstanding_amount?: number | null;
  grand_total?: number | null;
  customer?: string;
}

export interface PaymentRequest {
  amount?: unknown;
  modeOfPayment?: string;
  depositTo?: string;
}

export type PaymentRejection = { ok: false; status: number; error: string };
export type PaymentAcceptance = { ok: true; paidAmount: number; outstanding: number };

/**
 * Validates a payment against its invoice. Returns either the accepted amount
 * or the exact rejection the old app produced, status code included.
 *
 * `knownDepositAccounts` is passed in rather than fetched so this stays pure.
 */
export function validatePayment(
  invoice: PaymentInvoice,
  req: PaymentRequest,
  knownDepositAccounts: string[],
): PaymentAcceptance | PaymentRejection {
  if (invoice.docstatus !== 1) {
    return {
      ok: false,
      status: 400,
      error: 'Only a submitted invoice can have a payment recorded against it.',
    };
  }

  const outstanding = Number(invoice.outstanding_amount || 0);
  if (outstanding <= 0) {
    return { ok: false, status: 400, error: 'This invoice has no outstanding balance.' };
  }

  const paidAmount = Number(req.amount);

  // Never guess money, never over-allocate.
  if (!(paidAmount > 0)) {
    return { ok: false, status: 400, error: 'Amount received must be greater than 0.' };
  }
  if (paidAmount > outstanding) {
    return {
      ok: false,
      status: 400,
      error: `Amount received (₹${paidAmount}) cannot exceed the invoice's outstanding balance (₹${outstanding}).`,
    };
  }

  if (!req.modeOfPayment) {
    return { ok: false, status: 400, error: 'Payment mode is required.' };
  }
  if (!req.depositTo) {
    return { ok: false, status: 400, error: 'Deposit To account is required.' };
  }
  if (!knownDepositAccounts.includes(req.depositTo)) {
    return {
      ok: false,
      status: 400,
      error: "Deposit To must be one of the studio's known Bank/Cash accounts.",
    };
  }

  return { ok: true, paidAmount, outstanding };
}
