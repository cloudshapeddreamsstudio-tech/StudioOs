import { describe, it, expect } from 'bun:test';
import { validatePayment, type PaymentInvoice } from '../src/lib/paymentRules';

/**
 * The only path in the app that leads to a general-ledger posting.
 *
 * Every one of these rules exists because getting it wrong writes wrong money
 * into the studio's books. They are enforced server-side regardless of what the
 * browser checked — a client-side check is a convenience, not a control.
 */

const ACCOUNTS = ['Kotak Bank - CSDS', 'Cash - CSDS'];

const invoice = (over: Partial<PaymentInvoice> = {}): PaymentInvoice => ({
  name: 'SINV-26-00002',
  docstatus: 1,
  outstanding_amount: 55000,
  grand_total: 110000,
  customer: 'Magic Peacock Studio',
  ...over,
});

const good = { amount: 25000, modeOfPayment: 'Cash', depositTo: 'Cash - CSDS' };

describe('validatePayment', () => {
  it('accepts a valid partial payment', () => {
    const v = validatePayment(invoice(), good, ACCOUNTS);
    expect(v).toEqual({ ok: true, paidAmount: 25000, outstanding: 55000 });
  });

  it('accepts payment of the exact outstanding balance', () => {
    const v = validatePayment(invoice(), { ...good, amount: 55000 }, ACCOUNTS);
    expect(v.ok).toBe(true);
  });

  it('refuses to over-allocate by even one rupee', () => {
    const v = validatePayment(invoice(), { ...good, amount: 55001 }, ACCOUNTS);
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.status).toBe(400);
      expect(v.error).toContain('cannot exceed');
    }
  });

  it('refuses a draft invoice', () => {
    // Nothing is owed on a document that was never sent.
    const v = validatePayment(invoice({ docstatus: 0 }), good, ACCOUNTS);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.error).toContain('Only a submitted invoice');
  });

  it('refuses a cancelled invoice', () => {
    const v = validatePayment(invoice({ docstatus: 2 }), good, ACCOUNTS);
    expect(v.ok).toBe(false);
  });

  it('refuses an invoice with nothing outstanding', () => {
    const v = validatePayment(invoice({ outstanding_amount: 0 }), good, ACCOUNTS);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.error).toContain('no outstanding balance');
  });

  it('refuses zero, negative and non-numeric amounts', () => {
    for (const amount of [0, -100, 'abc', null, undefined, '']) {
      const v = validatePayment(invoice(), { ...good, amount }, ACCOUNTS);
      expect(v.ok).toBe(false);
    }
  });

  it('refuses an unknown Deposit To account', () => {
    // Guards against a tampered or stale dropdown posting into an arbitrary
    // ledger account.
    const v = validatePayment(invoice(), { ...good, depositTo: 'Suspense - CSDS' }, ACCOUNTS);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.error).toContain('known Bank/Cash accounts');
  });

  it('requires a payment mode and a deposit account', () => {
    expect(validatePayment(invoice(), { ...good, modeOfPayment: '' }, ACCOUNTS).ok).toBe(false);
    expect(validatePayment(invoice(), { ...good, depositTo: '' }, ACCOUNTS).ok).toBe(false);
  });

  it('checks the invoice state before the amount', () => {
    // A draft invoice with a nonsense amount should complain about the invoice,
    // which is the more useful message.
    const v = validatePayment(invoice({ docstatus: 0 }), { ...good, amount: -5 }, ACCOUNTS);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.error).toContain('Only a submitted invoice');
  });
});
