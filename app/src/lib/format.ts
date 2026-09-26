import { format, parseISO, isValid } from 'date-fns';

/**
 * Indian-format currency, matching the old app's output (₹4,94,824 -- lakh
 * grouping, not thousands). Getting this wrong is immediately visible to the
 * owner, so it goes through Intl rather than hand-rolled string work.
 */
const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

export function formatCurrency(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  return inr.format(Number.isFinite(n) ? n : 0);
}

/**
 * For figures that can be genuinely unknown, as opposed to zero.
 *
 * `formatCurrency` coerces null to ₹0, which is right for "nothing has been
 * spent" and badly wrong for "we cannot see what was spent". The backend is
 * careful to return null rather than 0 for those (see projectFinance.ts); this
 * is what stops that care being undone in the last inch before the screen.
 */
export function formatCurrencyOrDash(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : formatCurrency(value);
}

/** Plain number with lakh grouping, no currency symbol. */
export function formatNumber(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  return new Intl.NumberFormat('en-IN').format(Number.isFinite(n) ? n : 0);
}

/** ERPNext hands back 'YYYY-MM-DD' or null. Renders as '9 Aug 2026'. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const parsed = parseISO(value);
  return isValid(parsed) ? format(parsed, 'd MMM yyyy') : '—';
}

export function formatPercent(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  return `${Number.isFinite(n) ? Math.round(n) : 0}%`;
}
