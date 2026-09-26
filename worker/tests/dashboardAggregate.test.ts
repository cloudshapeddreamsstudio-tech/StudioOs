import { describe, it, expect } from 'bun:test';
import {
  buildDashboard,
  lastNMonthKeys,
  monthKey,
  type ProjectRow,
  type InvoiceRow,
  type VendorRow,
} from '../src/lib/dashboardAggregate';
import { cleanFrappeError } from '../src/lib/frappeError';

/**
 * These are the numbers on the studio owner's home page. The old app computed
 * them inline in a route handler with no tests, so a wrong sign or a
 * mis-bucketed month would have shipped silently.
 *
 * The cancelled-invoice rule is the one most worth pinning: cancelled invoices
 * are reversed in the ledger, so counting them overstates revenue and
 * outstanding alike.
 */

const NOW = new Date(Date.UTC(2026, 7, 9)); // 2026-08-09

const projects: ProjectRow[] = [
  {
    name: 'PROJ-1',
    customer: 'Oblik Media',
    status: 'Open',
    expected_start_date: '2026-08-01',
    total_billed_amount: 10000,
    total_purchase_cost: 4000,
    gross_margin: 6000,
  },
  {
    name: 'PROJ-2',
    customer: 'Oblik Media',
    status: 'Completed',
    expected_start_date: '2026-07-15',
    total_billed_amount: 20000,
    total_purchase_cost: 5000,
    gross_margin: 15000,
  },
  {
    name: 'PROJ-3',
    customer: 'Nari Studios',
    status: 'Open',
    expected_start_date: '2025-01-01', // outside the 6-month window
    total_billed_amount: 5000,
    total_purchase_cost: 1000,
    gross_margin: 4000,
  },
];

const invoices: InvoiceRow[] = [
  { name: 'S1', posting_date: '2026-08-02', grand_total: 10000, outstanding_amount: 10000, status: 'Overdue' },
  { name: 'S2', posting_date: '2026-07-10', grand_total: 20000, outstanding_amount: 0, status: 'Paid' },
  { name: 'S3', posting_date: '2026-08-05', grand_total: 99999, outstanding_amount: 99999, status: 'Cancelled' },
];

const vendors: VendorRow[] = [
  { name: 'V1', supplier_group: 'Direction & Production', disabled: 0 },
  { name: 'V2', supplier_group: 'Direction & Production', disabled: 1 },
  { name: 'V3', supplier_group: null, disabled: 0 },
];

describe('monthKey / lastNMonthKeys', () => {
  it('slices a date to its month', () => {
    expect(monthKey('2026-08-09')).toBe('2026-08');
    expect(monthKey(null)).toBeNull();
  });

  it('returns n months oldest-first, ending at the given month', () => {
    expect(lastNMonthKeys(6, NOW)).toEqual([
      '2026-03',
      '2026-04',
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
    ]);
  });

  it('crosses a year boundary correctly', () => {
    expect(lastNMonthKeys(3, new Date(Date.UTC(2026, 1, 15)))).toEqual([
      '2025-12',
      '2026-01',
      '2026-02',
    ]);
  });
});

describe('buildDashboard — money rules', () => {
  const d = buildDashboard(projects, invoices, vendors, NOW);

  it('excludes cancelled invoices from outstanding', () => {
    // S3 is ₹99,999 and cancelled. Only S1's ₹10,000 is really owed.
    expect(d.kpis.totalOutstanding).toBe(10000);
  });

  it('excludes cancelled invoices from the billed trend', () => {
    const aug = d.monthlyBilled.find((m) => m.month === '2026-08');
    expect(aug?.total).toBe(10000); // not 109,999
  });

  it('still shows cancelled in the status breakdown', () => {
    // That breakdown is about document state, not money owed.
    const cancelled = d.invoicesByStatus.find((s) => s.status === 'Cancelled');
    expect(cancelled?.count).toBe(1);
  });

  it('sums billed, cost and margin across all projects', () => {
    expect(d.kpis.totalBilled).toBe(35000);
    expect(d.kpis.totalPurchaseCost).toBe(10000);
    expect(d.kpis.totalGrossMargin).toBe(25000);
  });

  it('computes average margin as a percentage of billed', () => {
    expect(d.kpis.avgMarginPct).toBeCloseTo((25000 / 35000) * 100, 6);
  });

  it('does not divide by zero when nothing is billed', () => {
    const empty = buildDashboard([], [], [], NOW);
    expect(empty.kpis.avgMarginPct).toBe(0);
  });

  it('counts overdue invoices and their amount', () => {
    expect(d.kpis.overdueCount).toBe(1);
    expect(d.kpis.overdueAmount).toBe(10000);
  });
});

describe('buildDashboard — grouping', () => {
  const d = buildDashboard(projects, invoices, vendors, NOW);

  it('counts only enabled vendors as active', () => {
    expect(d.kpis.activeVendors).toBe(2);
    expect(d.kpis.totalVendors).toBe(3);
  });

  it('labels vendors with no group as Unspecified', () => {
    expect(d.vendorsByGroup).toContainEqual({ group: 'Unspecified', count: 1 });
  });

  it('ranks customers by billed amount', () => {
    expect(d.topCustomers[0]?.customer).toBe('Oblik Media');
    expect(d.topCustomers[0]?.totalBilled).toBe(30000);
    expect(d.topCustomers[0]?.projects).toBe(2);
  });

  it('ignores project rows dated outside the 6-month window', () => {
    // PROJ-3 starts in Jan 2025 and must not land in any bucket.
    const total = d.monthlyMargin.reduce((s, m) => s + m.total, 0);
    expect(total).toBe(21000); // 6000 + 15000, not 25000
  });

  it('counts open projects as active', () => {
    expect(d.kpis.activeProjects).toBe(2);
    expect(d.kpis.totalProjects).toBe(3);
  });
});

describe('cleanFrappeError', () => {
  it('strips the exception class prefix and HTML tags', () => {
    const err = {
      data: {
        exception:
          "frappe.exceptions.ValidationError: Task due date can't be after the project's <b>end date</b>",
      },
    };
    expect(cleanFrappeError(err)).toBe(
      "Task due date can't be after the project's end date",
    );
  });

  it('falls back to the plain message when there is no exception body', () => {
    expect(cleanFrappeError({ message: 'ERPNext API error 417' })).toBe('ERPNext API error 417');
  });

  it('never returns an empty string', () => {
    expect(cleanFrappeError({ data: { exception: '<p></p>' }, message: 'fallback' })).toBe(
      'fallback',
    );
  });
});
