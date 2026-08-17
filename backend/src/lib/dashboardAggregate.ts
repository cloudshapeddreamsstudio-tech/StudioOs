/**
 * Dashboard aggregation. Pure functions over already-fetched rows.
 *
 * Ported from the body of `server/routes/dashboard.js`, but split out from the
 * route so the arithmetic can be tested without a network. This is the code
 * that produces the numbers the owner looks at first every morning; it had no
 * tests at all in the old app.
 *
 * One deliberate change: month keys are computed in UTC. The original used
 * local-time `new Date(y, m, 1)`, which on a host behind UTC shifts the whole
 * 6-month window by one month. Workers run UTC and the studio is in IST (ahead
 * of UTC), so this preserves observed behaviour and removes the trap.
 */

export interface ProjectRow {
  name?: string;
  project_name?: string;
  customer?: string | null;
  status?: string;
  expected_start_date?: string | null;
  expected_end_date?: string | null;
  total_billed_amount?: number | null;
  total_purchase_cost?: number | null;
  gross_margin?: number | null;
  per_gross_margin?: number | null;
}

export interface InvoiceRow {
  name?: string;
  customer?: string | null;
  project?: string | null;
  posting_date?: string | null;
  due_date?: string | null;
  grand_total?: number | null;
  outstanding_amount?: number | null;
  status?: string;
}

export interface VendorRow {
  name?: string;
  supplier_name?: string;
  supplier_group?: string | null;
  disabled?: number | boolean;
}

/** 'YYYY-MM-DD' → 'YYYY-MM'. Null-safe. */
export function monthKey(dateStr?: string | null): string | null {
  return dateStr ? dateStr.slice(0, 7) : null;
}

/** The last n month keys ending at `fromDate`'s month, oldest first. */
export function lastNMonthKeys(n: number, fromDate: Date = new Date()): string[] {
  const year = fromDate.getUTCFullYear();
  const month = fromDate.getUTCMonth();
  const keys: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const m = new Date(Date.UTC(year, month - i, 1));
    keys.push(`${m.getUTCFullYear()}-${String(m.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return keys;
}

/** Sums `field` across rows into a bucket per month, keyed by `dateField`. */
function bucketByMonth<T>(
  rows: T[],
  months: string[],
  dateOf: (row: T) => string | null | undefined,
  valueOf: (row: T) => number,
): Record<string, number> {
  const buckets: Record<string, number> = Object.fromEntries(months.map((m) => [m, 0]));
  for (const row of rows) {
    const m = monthKey(dateOf(row));
    if (m && m in buckets) buckets[m] = (buckets[m] ?? 0) + valueOf(row);
  }
  return buckets;
}

export function buildDashboard(
  projects: ProjectRow[],
  invoices: InvoiceRow[],
  vendors: VendorRow[],
  now: Date = new Date(),
) {
  /**
   * Cancelled invoices are reversed in the ledger. Including them would
   * overstate every money figure on the page, so all invoice arithmetic runs on
   * the live set. The one exception is the status breakdown, which deliberately
   * shows cancelled as its own bar.
   */
  const liveInvoices = invoices.filter((i) => i.status !== 'Cancelled');

  const totalBilled = projects.reduce((s, p) => s + (p.total_billed_amount || 0), 0);
  const totalPurchaseCost = projects.reduce((s, p) => s + (p.total_purchase_cost || 0), 0);
  const totalGrossMargin = projects.reduce((s, p) => s + (p.gross_margin || 0), 0);
  const avgMarginPct = totalBilled ? (totalGrossMargin / totalBilled) * 100 : 0;
  const totalOutstanding = liveInvoices.reduce((s, i) => s + (i.outstanding_amount || 0), 0);
  const overdueInvoices = liveInvoices.filter((i) => i.status === 'Overdue');
  const overdueAmount = overdueInvoices.reduce((s, i) => s + (i.outstanding_amount || 0), 0);
  const activeProjects = projects.filter((p) => p.status === 'Open').length;
  const activeVendors = vendors.filter((v) => !v.disabled).length;

  const months = lastNMonthKeys(6, now);

  const billedByMonth = bucketByMonth(liveInvoices, months, (i) => i.posting_date, (i) => i.grand_total || 0);
  const monthlyBilled = months.map((m) => ({ month: m, total: billedByMonth[m] ?? 0 }));

  const paidByMonth = bucketByMonth(
    liveInvoices.filter((i) => i.status === 'Paid'),
    months,
    (i) => i.posting_date,
    (i) => i.grand_total || 0,
  );
  const overdueByMonth = bucketByMonth(
    liveInvoices.filter((i) => i.status === 'Overdue'),
    months,
    (i) => i.posting_date,
    (i) => i.outstanding_amount || 0,
  );
  const monthlyPaidVsOverdue = months.map((m) => ({
    month: m,
    paid: paidByMonth[m] ?? 0,
    overdue: overdueByMonth[m] ?? 0,
  }));

  // Project-derived series key off expected_start_date, not posting date.
  const marginByMonth = bucketByMonth(projects, months, (p) => p.expected_start_date, (p) => p.gross_margin || 0);
  const monthlyMargin = months.map((m) => ({ month: m, total: marginByMonth[m] ?? 0 }));

  const purchaseByMonth = bucketByMonth(projects, months, (p) => p.expected_start_date, (p) => p.total_purchase_cost || 0);
  const monthlyPurchaseCost = months.map((m) => ({ month: m, total: purchaseByMonth[m] ?? 0 }));

  const startedByMonth = bucketByMonth(projects, months, (p) => p.expected_start_date, () => 1);
  const monthlyProjectsStarted = months.map((m) => ({ month: m, count: startedByMonth[m] ?? 0 }));

  const statusCounts: Record<string, number> = {};
  for (const p of projects) {
    const s = p.status ?? 'Unknown';
    statusCounts[s] = (statusCounts[s] ?? 0) + 1;
  }
  const projectsByStatus = Object.entries(statusCounts).map(([status, count]) => ({ status, count }));

  // All statuses INCLUDING cancelled — this breakdown is about document state,
  // not money owed.
  const invoiceStatus: Record<string, { status: string; count: number; amount: number }> = {};
  for (const i of invoices) {
    const key = i.status ?? 'Unknown';
    const s = invoiceStatus[key] ?? { status: key, count: 0, amount: 0 };
    s.count += 1;
    s.amount += i.grand_total || 0;
    invoiceStatus[key] = s;
  }
  const invoicesByStatus = Object.values(invoiceStatus);

  const groupCounts: Record<string, number> = {};
  for (const v of vendors) {
    const g = v.supplier_group || 'Unspecified';
    groupCounts[g] = (groupCounts[g] ?? 0) + 1;
  }
  const vendorsByGroup = Object.entries(groupCounts).map(([group, count]) => ({ group, count }));

  const byCustomer: Record<string, { customer: string; projects: number; totalBilled: number; grossMargin: number }> = {};
  for (const p of projects) {
    const key = p.customer ?? 'Unspecified';
    const c = byCustomer[key] ?? { customer: key, projects: 0, totalBilled: 0, grossMargin: 0 };
    c.projects += 1;
    c.totalBilled += p.total_billed_amount || 0;
    c.grossMargin += p.gross_margin || 0;
    byCustomer[key] = c;
  }
  const topCustomers = Object.values(byCustomer)
    .sort((a, b) => b.totalBilled - a.totalBilled)
    .slice(0, 6);

  return {
    kpis: {
      totalBilled,
      totalPurchaseCost,
      totalGrossMargin,
      avgMarginPct,
      totalOutstanding,
      overdueCount: overdueInvoices.length,
      overdueAmount,
      activeProjects,
      totalProjects: projects.length,
      activeVendors,
      totalVendors: vendors.length,
    },
    monthlyBilled,
    monthlyPaidVsOverdue,
    monthlyMargin,
    monthlyPurchaseCost,
    monthlyProjectsStarted,
    projectsByStatus,
    invoicesByStatus,
    vendorsByGroup,
    topCustomers,
    recentProjects: projects.slice(0, 6),
    recentInvoices: liveInvoices.slice(0, 6),
  };
}
