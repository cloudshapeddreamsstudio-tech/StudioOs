import { describe, it, expect } from 'bun:test';
import {
  computeCompletion,
  computeFinance,
  buildExpenseOverview,
  desiredPercentComplete,
  type TaskRow,
  type SalesRow,
  type PurchaseRow,
  type CrewRow,
} from '../src/lib/projectFinance';

/**
 * The project-detail money model. This decides whether a project is "done" —
 * which the app then WRITES back to ERPNext as the project's status — and it
 * produces the profit figures the owner quotes from. None of it had tests.
 *
 * The rules most worth pinning are the ones that are vacuously true in an edge
 * case, because those fail silently and in the wrong direction.
 */

const task = (over: Partial<TaskRow> = {}): TaskRow => ({
  name: 'T1',
  status: 'Open',
  is_group: 0,
  ...over,
});

const sale = (over: Partial<SalesRow> = {}): SalesRow => ({
  name: 'S1',
  status: 'Overdue',
  outstanding_amount: 0,
  grand_total: 0,
  ...over,
});

const purchase = (over: Partial<PurchaseRow> = {}): PurchaseRow => ({
  name: 'P1',
  status: 'Overdue',
  supplier_group: 'Direction & Production',
  outstanding_amount: 0,
  grand_total: 0,
  ...over,
});

function completion(over: Partial<Parameters<typeof computeCompletion>[0]> = {}) {
  return computeCompletion({
    tasks: [],
    liveSales: [],
    livePurchases: [],
    crewRoster: [],
    totalSalesCount: 0,
    totalPurchaseCount: 0,
    ...over,
  });
}

describe('computeCompletion — the "is it done?" rules', () => {
  it('an untouched project with nothing on it is NOT complete', () => {
    // Vacuously "nothing incomplete", but an ongoing engagement tracked
    // outside ERPNext looks exactly like this and is very much still active.
    expect(completion().ready).toBe(false);
  });

  it('is complete when tasks are done, crew paid and client paid', () => {
    const c = completion({
      tasks: [task({ status: 'Completed' })],
      liveSales: [sale({ outstanding_amount: 0 })],
      livePurchases: [purchase({ outstanding_amount: 0 })],
      totalSalesCount: 1,
      totalPurchaseCount: 1,
    });
    expect(c.ready).toBe(true);
  });

  it('is NOT complete while the client still owes money', () => {
    const c = completion({
      tasks: [task({ status: 'Completed' })],
      liveSales: [sale({ outstanding_amount: 55000 })],
      totalSalesCount: 1,
    });
    expect(c.ready).toBe(false);
    expect(c.clientFullyPaid).toBe(false);
    expect(c.clientOutstandingAmount).toBe(55000);
  });

  it('is NOT complete while a crew bill is unpaid', () => {
    const c = completion({
      tasks: [task({ status: 'Completed' })],
      livePurchases: [purchase({ outstanding_amount: 3000 })],
      totalPurchaseCount: 1,
    });
    expect(c.ready).toBe(false);
    expect(c.crewOutstandingAmount).toBe(3000);
  });

  it('ignores DRAFT invoices when deciding what is owed', () => {
    // A draft has not been sent, so its outstanding is not real money owed.
    const c = completion({
      tasks: [task({ status: 'Completed' })],
      liveSales: [sale({ status: 'Draft', outstanding_amount: 99999 })],
      totalSalesCount: 1,
    });
    expect(c.clientFullyPaid).toBe(true);
    expect(c.ready).toBe(true);
  });

  it('treats phase headers as non-actionable', () => {
    const c = completion({
      tasks: [task({ is_group: 1, status: 'Open' }), task({ name: 'T2', status: 'Completed' })],
      totalSalesCount: 1,
    });
    expect(c.tasksComplete).toBe(true);
    expect(c.tasksRemaining).toBe(0);
  });

  it('a project with no checklist is vacuously task-complete but flagged', () => {
    const c = completion({ totalSalesCount: 1 });
    expect(c.hasTasks).toBe(false);
    expect(c.tasksComplete).toBe(true);
  });

  it('flags noCrewAssigned so "Crew Payment Made" cannot silently auto-tick', () => {
    // This is the bug the flag exists for: with no crew there are no unpaid
    // purchase invoices, so crewFullyPaid is TRUE for the wrong reason.
    const c = completion({ tasks: [task({ status: 'Completed' })], totalSalesCount: 1 });
    expect(c.crewFullyPaid).toBe(true);
    expect(c.noCrewAssigned).toBe(true);
  });

  it('does not flag noCrewAssigned once real crew is on the roster', () => {
    const roster: CrewRow[] = [{ role: 'Crew', total: 5000 }];
    expect(completion({ crewRoster: roster }).noCrewAssigned).toBe(false);
  });

  it('detects vendor involvement from the roster or from Rental House invoices', () => {
    expect(completion({ crewRoster: [{ role: 'Vendor', total: 1000 }] }).hasVendorInvolvement).toBe(true);
    expect(
      completion({ livePurchases: [purchase({ supplier_group: 'Rental House' })] })
        .hasVendorInvolvement,
    ).toBe(true);
    expect(completion({ livePurchases: [purchase()] }).hasVendorInvolvement).toBe(false);
  });

  it('a cancelled invoice still counts as activity having happened', () => {
    // liveSales excludes it, but totalSalesCount does not — so the project is
    // not treated as untouched.
    const c = completion({ tasks: [task({ status: 'Completed' })], totalSalesCount: 1 });
    expect(c.ready).toBe(true);
  });
});

describe('desiredPercentComplete', () => {
  it('is 100 when completing', () => {
    expect(desiredPercentComplete('Completed', 4, 2)).toBe(100);
  });

  it('is the real checklist ratio when still open', () => {
    expect(desiredPercentComplete('Open', 4, 1)).toBe(75);
  });

  it('is 0 with no checklist, and does not divide by zero', () => {
    expect(desiredPercentComplete('Open', 0, 0)).toBe(0);
  });
});

describe('computeFinance', () => {
  const base = {
    sanctioned: 100000,
    billed: 0,
    purchaseCost: 0,
    commissionPercent: 5,
    liveSales: [] as SalesRow[],
    livePurchases: [] as PurchaseRow[],
    expenseTotal: 0,
    grossMargin: 0,
    marginPercent: 0,
  };

  it('charges commission on billed once anything is invoiced', () => {
    const f = computeFinance({ ...base, billed: 80000 });
    expect(f.commissionBase).toBe(80000);
    expect(f.commissionOwed).toBe(4000);
  });

  it('falls back to sanctioned before anything is billed', () => {
    const f = computeFinance(base);
    expect(f.commissionBase).toBe(100000);
    expect(f.commissionOwed).toBe(5000);
  });

  it('computes budget remaining after spend and expenses', () => {
    const f = computeFinance({ ...base, purchaseCost: 30000, expenseTotal: 5000 });
    expect(f.remaining).toBe(65000);
  });

  it('excludes drafts from outstanding on both sides', () => {
    const f = computeFinance({
      ...base,
      liveSales: [sale({ status: 'Draft', outstanding_amount: 50000 }), sale({ name: 'S2', outstanding_amount: 10000 })],
      livePurchases: [purchase({ status: 'Draft', outstanding_amount: 7000 })],
    });
    expect(f.salesOutstanding).toBe(10000);
    expect(f.purchaseOutstanding).toBe(0);
  });
});

describe('buildExpenseOverview', () => {
  const base = {
    sanctioned: 100000,
    commissionPercent: 5,
    commissionOwed: 5000,
    livePurchases: [] as PurchaseRow[],
    vendorPurchases: [] as PurchaseRow[],
    crewEntries: [] as CrewRow[],
    vendorEntries: [] as CrewRow[],
    expenses: [] as { category?: string; amount?: number; estimatedAmount?: number }[],
  };

  it('emits no rows when there is nothing planned or spent', () => {
    expect(buildExpenseOverview(base).rows).toEqual([]);
  });

  it('splits crew from vendor using the Rental House group', () => {
    const vendorInv = purchase({ supplier_group: 'Rental House', grand_total: 8000 });
    const crewInv = purchase({ name: 'P2', grand_total: 3000 });
    const o = buildExpenseOverview({
      ...base,
      livePurchases: [vendorInv, crewInv],
      vendorPurchases: [vendorInv],
      crewEntries: [{ role: 'Crew', total: 5000 }],
      vendorEntries: [{ role: 'Vendor', total: 9000 }],
    });
    expect(o.rows).toContainEqual({ category: 'Crew', planned: 5000, actual: 3000 });
    expect(o.rows).toContainEqual({ category: 'Vendor', planned: 9000, actual: 8000 });
  });

  it('counts spend regardless of whether it is paid yet', () => {
    // "Actual" is grand_total, not outstanding — this is spend, not debt.
    const inv = purchase({ grand_total: 3000, outstanding_amount: 3000 });
    const o = buildExpenseOverview({ ...base, livePurchases: [inv] });
    expect(o.actualTotal).toBe(3000);
  });

  it('never back-fills planned from actual', () => {
    // An expense logged with no estimate must show planned 0, not its amount.
    const o = buildExpenseOverview({
      ...base,
      expenses: [{ category: 'Transport', amount: 1250 }],
    });
    expect(o.rows).toContainEqual({ category: 'Transport', planned: 0, actual: 1250 });
  });

  it('computes profit as sanctioned minus commission minus production', () => {
    const o = buildExpenseOverview({
      ...base,
      expenses: [{ category: 'Props', amount: 20000, estimatedAmount: 25000 }],
    });
    expect(o.margin.profitActual).toBe(100000 - 5000 - 20000);
    expect(o.margin.profitPlanned).toBe(100000 - 5000 - 25000);
  });

  it('flags whether the 20% profit target is met', () => {
    const meets = buildExpenseOverview({
      ...base,
      expenses: [{ category: 'Props', amount: 10000 }],
    });
    expect(meets.margin.meetsTargetActual).toBe(true); // 85k profit vs 20k target

    const misses = buildExpenseOverview({
      ...base,
      expenses: [{ category: 'Props', amount: 90000 }],
    });
    expect(misses.margin.meetsTargetActual).toBe(false); // 5k profit vs 20k target
  });

  it('returns null percentages rather than dividing by zero on an unsanctioned project', () => {
    const o = buildExpenseOverview({ ...base, sanctioned: 0, commissionOwed: 0 });
    expect(o.margin.profitActualPercent).toBeNull();
    expect(o.margin.meetsTargetActual).toBeNull();
  });
});

/**
 * Phase 7b: the crew roster and project expenses are not in this release.
 *
 * The danger is not that figures are missing — it is that a missing figure
 * silently becomes zero, which produces a confidently wrong number rather than
 * an obviously absent one. Every wrong answer here flatters the owner: unseen
 * spend makes the budget look healthier and the profit look larger, which is
 * exactly the direction that causes overspending.
 *
 * So `null` must survive all the way out. These tests exist to stop a future
 * `?? 0` from looking harmless.
 */
describe('unavailable inputs are never treated as zero', () => {
  const completionBase = {
    tasks: [] as TaskRow[],
    liveSales: [] as SalesRow[],
    livePurchases: [] as PurchaseRow[],
    totalSalesCount: 0,
    totalPurchaseCount: 0,
  };

  const financeBase = {
    sanctioned: 100000,
    billed: 0,
    purchaseCost: 0,
    commissionPercent: 5,
    liveSales: [] as SalesRow[],
    livePurchases: [] as PurchaseRow[],
    grossMargin: 0,
    marginPercent: 0,
  };

  const overviewBase = {
    sanctioned: 100000,
    commissionPercent: 5,
    commissionOwed: 5000,
    livePurchases: [] as PurchaseRow[],
    vendorPurchases: [] as PurchaseRow[],
  };

  it('does not claim "no crew assigned" when the roster is simply unavailable', () => {
    const withRoster = computeCompletion({ ...completionBase, crewRoster: [] });
    const unavailable = computeCompletion({ ...completionBase, crewRoster: null });

    // An empty roster genuinely means nobody is on it.
    expect(withRoster.noCrewAssigned).toBe(true);
    expect(withRoster.crewRosterUnavailable).toBe(false);

    // A missing roster means we do not know, so we must not say.
    expect(unavailable.noCrewAssigned).toBe(false);
    expect(unavailable.crewRosterUnavailable).toBe(true);
  });

  it('leaves budget remaining unknown rather than overstating it', () => {
    const known = computeFinance({ ...financeBase, purchaseCost: 30000, expenseTotal: 5000 });
    expect(known.remaining).toBe(financeBase.sanctioned - 30000 - 5000);

    const unknown = computeFinance({ ...financeBase, purchaseCost: 30000, expenseTotal: null });
    expect(unknown.expenseTotal).toBeNull();
    // NOT sanctioned - purchaseCost, which would overstate the budget by every
    // expense nobody can see.
    expect(unknown.remaining).toBeNull();
  });

  it('leaves planned spend and planned profit unknown when the roster is missing', () => {
    const overview = buildExpenseOverview({
      ...overviewBase,
      crewEntries: null,
      vendorEntries: null,
      expenses: null,
    });

    expect(overview.plannedTotal).toBeNull();
    expect(overview.margin.profitPlanned).toBeNull();
    expect(overview.margin.profitPlannedPercent).toBeNull();
    // "Does this project meet the 20% target?" is unanswerable, not a No.
    expect(overview.margin.meetsTargetPlanned).toBeNull();
  });

  it('shows per-row actual spend, which comes from ERPNext and is known', () => {
    const overview = buildExpenseOverview({
      ...overviewBase,
      crewEntries: null,
      vendorEntries: null,
      expenses: null,
      livePurchases: [{ supplier_group: 'Crew', grand_total: 40000, outstanding_amount: 0 }],
    });

    const crewRow = overview.rows.find((r) => r.category === 'Crew');
    expect(crewRow?.actual).toBe(40000);
    // The row shows actual against an unknown plan, not against zero — which
    // would read as "overspent by the entire amount".
    expect(crewRow?.planned).toBeNull();
  });

  /**
   * The subtler half, and the one that actually shipped wrong before a browser
   * caught it: crew and vendor actuals come from purchase invoices and are
   * known, but logged expenses are actual spend too. Totalling only the visible
   * part understates spend and therefore overstates profit — the page reported
   * a 95% margin on a project whose out-of-pocket costs cannot be seen at all.
   */
  it('leaves ACTUAL spend and profit unknown too, not just planned', () => {
    const overview = buildExpenseOverview({
      ...overviewBase,
      crewEntries: null,
      vendorEntries: null,
      expenses: null,
      livePurchases: [{ supplier_group: 'Crew', grand_total: 40000, outstanding_amount: 0 }],
    });

    expect(overview.actualTotal).toBeNull();
    expect(overview.margin.profitActual).toBeNull();
    expect(overview.margin.profitActualPercent).toBeNull();
    expect(overview.margin.meetsTargetActual).toBeNull();
  });

  it('still totals actual spend normally when expenses ARE available', () => {
    const overview = buildExpenseOverview({
      ...overviewBase,
      crewEntries: [],
      vendorEntries: [],
      expenses: [{ category: 'Transport', amount: 1250 }],
      livePurchases: [{ supplier_group: 'Crew', grand_total: 40000, outstanding_amount: 0 }],
    });

    expect(overview.actualTotal).toBe(41250);
    expect(overview.margin.profitActual).toBe(100000 - 5000 - 41250);
  });
});
