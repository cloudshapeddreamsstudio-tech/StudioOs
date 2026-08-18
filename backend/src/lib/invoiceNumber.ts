import { SchemaGapError, missingFieldFrom } from './optionalFields';
import type { FrappeClient } from './frappe';

/**
 * Computes the studio's own invoice number: `{ABBR}_SINV_{NN}_{YYMM}{NN}`
 *
 *   - first NN  = running count of studio-numbered invoices so far THIS YEAR
 *   - YYMM      = 2-digit year + 2-digit month of the invoice's posting date
 *   - second NN = running count of studio-numbered invoices so far THIS MONTH
 *
 * e.g. `CSDS_SINV_01_260101` (1st of the year, Jan 2026) or
 *      `CSDS_SINV_45_260703` (45th of the year, 3rd of July 2026).
 *
 * The prefix is the **company's own abbreviation** from ERPNext, not the
 * letters CSDS. It was hardcoded, which would have stamped one studio's initials
 * onto every other studio's invoices.
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
  prefix: string,
  year: number,
  month: number,
  yearCount: number,
  monthCount: number,
): string {
  const yy = pad2(year % 100);
  const mm = pad2(month);
  const yearSeq = pad2(yearCount + 1);
  const monthSeq = pad2(monthCount + 1);
  return `${prefix}_SINV_${yearSeq}_${yy}${mm}${monthSeq}`;
}

/**
 * Counts invoices already numbered in a date window.
 *
 * `custom_invoice_number` is in the **filter**, so on a site without that field
 * there is no degraded answer — see lib/optionalFields.ts. The original caught
 * every failure and counted 0, which on such a site is not a missing feature
 * but a **duplicate-number generator**: every invoice ever created would come
 * out as `_01_`, because the count is always zero. Throwing is the only correct
 * response, and the caller turns it into "this site does not do studio
 * numbering" rather than into a collision.
 */
async function countNumbered(
  frappe: FrappeClient,
  from: string,
  to: string,
): Promise<number> {
  try {
    const rows = await frappe.getList('Sales Invoice', {
      fields: ['name'],
      filters: [
        ['custom_invoice_number', '!=', ''],
        ['posting_date', '>=', from],
        ['posting_date', '<=', to],
      ],
      limit: 1000,
    });
    return rows.length;
  } catch (err) {
    if (missingFieldFrom(err)) throw new SchemaGapError('Sales Invoice', 'custom_invoice_number');
    throw err;
  }
}

/**
 * The next studio invoice number, or **null** if this site does not carry the
 * `custom_invoice_number` field at all.
 *
 * Null means "leave it off this invoice". ERPNext's own `name` is still there
 * and is still the invoice's identity, so nothing is lost except a convention
 * this studio never adopted.
 */
export async function computeInvoiceNumber(
  frappe: FrappeClient,
  prefix: string,
  postingDate?: string | Date | null,
): Promise<string | null> {
  const { year, month } = resolveYearMonth(postingDate);
  const mm = pad2(month);

  const monthEndDay = pad2(lastDayOfMonth(year, month));

  try {
    const [yearCount, monthCount] = await Promise.all([
      countNumbered(frappe, `${year}-01-01`, `${year}-12-31`),
      countNumbered(frappe, `${year}-${mm}-01`, `${year}-${mm}-${monthEndDay}`),
    ]);
    return formatInvoiceNumber(prefix, year, month, yearCount, monthCount);
  } catch (err) {
    if (err instanceof SchemaGapError) return null;
    throw err;
  }
}
