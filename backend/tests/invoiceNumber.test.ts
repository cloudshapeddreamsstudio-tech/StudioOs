import { describe, it, expect } from 'bun:test';
import {
  computeInvoiceNumber,
  formatInvoiceNumber,
  lastDayOfMonth,
  resolveYearMonth,
} from '../src/lib/invoiceNumber';
import { FrappeError } from '../src/lib/errors';
import type { FrappeClient } from '../src/lib/frappe';

/**
 * This is the invoice number the studio's clients see on paper. A duplicate or
 * a skipped sequence is a real accounting problem, so the logic is pinned here
 * rather than trusted.
 *
 * The Frappe client is faked: these tests are about the date arithmetic and
 * sequence composition, not about ERPNext.
 */

/** A client whose getList returns N rows, and records the filters it was given. */
function fakeClient(counts: { year: number; month: number }) {
  const calls: unknown[][][] = [];
  let call = 0;
  const client = {
    async getList(_doctype: string, opts: { filters?: unknown[][] } = {}) {
      calls.push(opts.filters ?? []);
      // Order matches the Promise.all in computeInvoiceNumber: year, then month.
      const n = call++ === 0 ? counts.year : counts.month;
      return Array.from({ length: n }, (_, i) => ({ name: `SINV-${i}` }));
    },
  } as unknown as FrappeClient;
  return { client, calls };
}

describe('resolveYearMonth', () => {
  it('reads a YYYY-MM-DD string without timezone drift', () => {
    // The original did `new Date('2026-01-01').getFullYear()`, which on a host
    // behind UTC returns 2025 and files the invoice under the wrong year.
    expect(resolveYearMonth('2026-01-01')).toEqual({ year: 2026, month: 1 });
    expect(resolveYearMonth('2026-12-31')).toEqual({ year: 2026, month: 12 });
  });

  it('handles a Date object', () => {
    expect(resolveYearMonth(new Date(Date.UTC(2026, 6, 3)))).toEqual({ year: 2026, month: 7 });
  });
});

describe('lastDayOfMonth', () => {
  it('knows month lengths', () => {
    expect(lastDayOfMonth(2026, 1)).toBe(31);
    expect(lastDayOfMonth(2026, 4)).toBe(30);
  });

  it('handles February in common and leap years', () => {
    expect(lastDayOfMonth(2026, 2)).toBe(28);
    expect(lastDayOfMonth(2028, 2)).toBe(29);
    // 2100 is divisible by 4 but not a leap year.
    expect(lastDayOfMonth(2100, 2)).toBe(28);
  });
});

describe('formatInvoiceNumber', () => {
  it('builds the documented shape', () => {
    // 1st invoice of the year, Jan 2026, 1st of the month.
    expect(formatInvoiceNumber('CSDS', 2026, 1, 0, 0)).toBe('CSDS_SINV_01_260101');
    // 45th of the year, July 2026, 3rd of that month.
    expect(formatInvoiceNumber('CSDS', 2026, 7, 44, 2)).toBe('CSDS_SINV_45_260703');
  });

  it('zero-pads every segment', () => {
    expect(formatInvoiceNumber('CSDS', 2026, 9, 8, 4)).toBe('CSDS_SINV_09_260905');
  });

  it('counts are running totals, so the next number is count + 1', () => {
    expect(formatInvoiceNumber('CSDS', 2026, 3, 11, 3)).toBe('CSDS_SINV_12_260304');
  });

  it('takes the last two digits of the year', () => {
    expect(formatInvoiceNumber('CSDS', 2030, 11, 0, 0)).toBe('CSDS_SINV_01_301101');
  });
});

describe('computeInvoiceNumber', () => {
  it('combines year and month counts from ERPNext', async () => {
    const { client } = fakeClient({ year: 44, month: 2 });
    expect(await computeInvoiceNumber(client, 'CSDS', '2026-07-03')).toBe('CSDS_SINV_45_260703');
  });

  it('filters by the target year and the correct month end', async () => {
    const { client, calls } = fakeClient({ year: 0, month: 0 });
    await computeInvoiceNumber(client, 'CSDS', '2028-02-10');

    const yearFilters = calls[0] as unknown[][];
    const monthFilters = calls[1] as unknown[][];

    expect(yearFilters).toContainEqual(['posting_date', '>=', '2028-01-01']);
    expect(yearFilters).toContainEqual(['posting_date', '<=', '2028-12-31']);
    expect(monthFilters).toContainEqual(['posting_date', '>=', '2028-02-01']);
    // 2028 is a leap year -- the month window must include the 29th.
    expect(monthFilters).toContainEqual(['posting_date', '<=', '2028-02-29']);
  });

  it('only counts invoices that already carry a studio number', async () => {
    const { client, calls } = fakeClient({ year: 0, month: 0 });
    await computeInvoiceNumber(client, 'CSDS', '2026-05-05');
    // Older pre-feature invoices have no custom_invoice_number and must not
    // skew the sequence.
    expect(calls[0]).toContainEqual(['custom_invoice_number', '!=', '']);
  });

  it('uses the company abbreviation, not the letters CSDS', async () => {
    const { client } = fakeClient({ year: 0, month: 0 });
    expect(await computeInvoiceNumber(client, 'MOON', '2026-07-03')).toBe('MOON_SINV_01_260701');
  });

  /**
   * This replaces a test that pinned the opposite, and the old behaviour was a
   * duplicate-number generator.
   *
   * It read: "treats an ERPNext failure as a zero count rather than throwing",
   * degrading to `_01_`. On a studio with 44 invoices already issued, a single
   * unreachable moment therefore mints invoice number 01 a second time — the
   * same number, on paper, in a client's hands. Failing to count is not
   * evidence that the count is zero.
   */
  it('throws rather than inventing number 01 when the count cannot be read', async () => {
    const failing = {
      async getList() {
        throw new Error('ERPNext unreachable');
      },
    } as unknown as FrappeClient;

    await expect(computeInvoiceNumber(failing, 'CSDS', '2026-06-01')).rejects.toThrow(
      'ERPNext unreachable',
    );
  });

  /**
   * Absence of the field is a different thing from failure to read it. A site
   * that never adopted the studio numbering convention should simply not get a
   * number -- ERPNext's own invoice name is still there and still identifies it.
   */
  it('returns null when this site has no custom_invoice_number field', async () => {
    const stockSite = {
      async getList() {
        throw new FrappeError(417, {
          exception:
            'frappe.exceptions.DataError: Field not permitted in query: custom_invoice_number',
        });
      },
    } as unknown as FrappeClient;

    expect(await computeInvoiceNumber(stockSite, 'ACME', '2026-06-01')).toBeNull();
  });
});
