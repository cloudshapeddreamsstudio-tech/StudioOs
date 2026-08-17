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
