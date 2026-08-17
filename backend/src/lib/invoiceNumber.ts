import type { FrappeClient } from './frappe';

/**
 * Computes the studio's own invoice number: `CSDS_SINV_{NN}_{YYMM}{NN}`
 *
 *   - first NN  = running count of studio-numbered invoices so far THIS YEAR
 *   - YYMM      = 2-digit year + 2-digit month of the invoice's posting date
 *   - second NN = running count of studio-numbered invoices so far THIS MONTH
 *
 * e.g. `CSDS_SINV_01_260101` (1st of the year, Jan 2026) or
 *      `CSDS_SINV_45_260703` (45th of the year, 3rd of July 2026).
 *
 * This is separate from ERPNext's internal Sales Invoice `name`, which its
 * controller always generates itself and cannot be overridden over REST -- so
 * the studio's format lives in the custom field `custom_invoice_number`
 * instead of fighting that.
 *
 * The counters are derived by COUNTING existing invoices that already carry a
 * `custom_invoice_number` in the target year/month (by posting_date), not by
 * parsing the last-used number. That makes it self-healing when invoices are
 * cancelled or deleted out of order, and older pre-feature invoices (which have
 * no custom_invoice_number) don't skew the count.
 *
 * Ported from `server/lib/invoiceNumber.js`. Two deliberate changes:
 *
 *  1. The Frappe client is a parameter, not a module import -- Workers have no
 *     ambient env, and it makes the date logic testable without a network.
 *  2. Dates are read in UTC rather than the host's local timezone. The original
 *     did `new Date('2026-01-01').getFullYear()`, which parses as UTC midnight
 *     but reads back in local time -- on a host behind UTC that returns the
 *     *previous* year, silently filing a January invoice under the wrong one.
 *     The studio runs in IST (ahead of UTC) so it never saw this, and Workers
 *     run UTC, so pinning to UTC preserves observed behaviour and removes the
 *     trap.
 */

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Year/month of a posting date, read in UTC. Accepts 'YYYY-MM-DD' or a Date. */
export function resolveYearMonth(postingDate?: string | Date | null): {
  year: number;
  month: number;
} {
  if (!postingDate) {
    const now = new Date();
    return { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 };
  }

  if (typeof postingDate === 'string') {
    // Fast path for the format ERPNext actually sends, avoiding Date entirely.
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(postingDate);
    if (match?.[1] && match[2]) {
      return { year: Number(match[1]), month: Number(match[2]) };
    }
  }

  const d = new Date(postingDate);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

/** Last calendar day of a month, 1-indexed month. Handles leap years. */
export function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Assemble the number from its parts. Split out so it can be tested directly. */
export function formatInvoiceNumber(
  year: number,
  month: number,
  yearCount: number,
  monthCount: number,
): string {
  const yy = pad2(year % 100);
  const mm = pad2(month);
  const yearSeq = pad2(yearCount + 1);
  const monthSeq = pad2(monthCount + 1);
  return `CSDS_SINV_${yearSeq}_${yy}${mm}${monthSeq}`;
}

export async function computeInvoiceNumber(
  frappe: FrappeClient,
  postingDate?: string | Date | null,
): Promise<string> {
  const { year, month } = resolveYearMonth(postingDate);
  const mm = pad2(month);

  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  const monthStart = `${year}-${mm}-01`;
  const monthEnd = `${year}-${mm}-${pad2(lastDayOfMonth(year, month))}`;

  const [yearCount, monthCount] = await Promise.all([
    frappe
      .getList('Sales Invoice', {
        fields: ['name'],
        filters: [
          ['custom_invoice_number', '!=', ''],
          ['posting_date', '>=', yearStart],
          ['posting_date', '<=', yearEnd],
        ],
        limit: 1000,
      })
      .then((r) => r.length)
      .catch(() => 0),
    frappe
      .getList('Sales Invoice', {
        fields: ['name'],
        filters: [
          ['custom_invoice_number', '!=', ''],
          ['posting_date', '>=', monthStart],
          ['posting_date', '<=', monthEnd],
        ],
        limit: 1000,
      })
      .then((r) => r.length)
      .catch(() => 0),
  ]);

  return formatInvoiceNumber(year, month, yearCount, monthCount);
}
