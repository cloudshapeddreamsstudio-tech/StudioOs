import { describe, it, expect } from 'bun:test';
import {
  buildPayables,
  OWNER_SUPPLIER_NAME,
  CONFLICT_RE,
  type PayablePurchaseRow,
  type PayableProjectRow,
} from '../src/lib/payablesAggregate';
import { computeCommission } from '../src/lib/projectFinance';

/**
 * "Who do I still owe" — the page the owner opens before paying anyone.
 *
 * The two rules worth pinning hardest: money owed to the owner himself must
 * never be folded into what he owes other people, and a purchase invoice with a
 * conflicting payment note must stay flagged for a human rather than being
 * quietly netted out.
 */

const po = (over: Partial<PayablePurchaseRow> = {}): PayablePurchaseRow => ({
  name: 'PINV-1',
  supplier: 'Chaitanya Dahake',
  supplier_name: 'Chaitanya Dahake',
  outstanding_amount: 3000,
  grand_total: 3000,
  due_date: '2026-06-01',
  status: 'Overdue',
  supplier_group: 'Direction & Production',
  remarks: '',
  ...over,
});

describe('buildPayables — the owner/others split', () => {
  it('reports money owed to the owner separately from everyone else', () => {
    const r = buildPayables(
      [
        po({ name: 'PINV-1', supplier: 'Chaitanya Dahake', outstanding_amount: 3000 }),
        po({ name: 'PINV-2', supplier: OWNER_SUPPLIER_NAME, outstanding_amount: 22000 }),
      ],
      [],
    );
    expect(r.totals.owedToOthers).toBe(3000);
    expect(r.totals.owedToOwner).toBe(22000);
    // The grand total still includes both — it just isn't presented as one lump.
    expect(r.totals.grandTotal).toBe(25000);
  });

  it('marks the owner group with isOwner', () => {
    const r = buildPayables([po({ supplier: OWNER_SUPPLIER_NAME })], []);
    expect(r.supplierGroups[0]?.isOwner).toBe(true);
  });
});

describe('buildPayables — grouping', () => {
  it('sums a supplier across their invoices and keeps the oldest due date', () => {
    const r = buildPayables(
      [
        po({ name: 'PINV-1', outstanding_amount: 3000, due_date: '2026-06-01' }),
        po({ name: 'PINV-2', outstanding_amount: 5000, due_date: '2026-03-15' }),
      ],
      [],
    );
    expect(r.supplierGroups).toHaveLength(1);
    expect(r.supplierGroups[0]?.totalOutstanding).toBe(8000);
    expect(r.supplierGroups[0]?.oldestDueDate).toBe('2026-03-15');
  });

  it('ranks suppliers by how much is owed', () => {
    const r = buildPayables(
      [
        po({ supplier: 'Small', outstanding_amount: 1000 }),
        po({ name: 'PINV-2', supplier: 'Big', outstanding_amount: 9000 }),
      ],
      [],
    );
    expect(r.supplierGroups.map((g) => g.supplier)).toEqual(['Big', 'Small']);
  });

  it('classifies Rental House as Vendor and everything else as Crew', () => {
    const r = buildPayables(
      [
        po({ name: 'PINV-1', supplier_group: 'Rental House' }),
        po({ name: 'PINV-2', supplier: 'Someone', supplier_group: null }),
      ],
      [],
    );
    const parties = r.supplierGroups.flatMap((g) =>
      (g.invoices as { partyType: string }[]).map((i) => i.partyType),
    );
    expect(parties).toContain('Vendor');
    expect(parties).toContain('Crew');
  });
});

describe('buildPayables — the conflict flag', () => {
  it('flags remarks that claim the bill was already paid', () => {
    const r = buildPayables(
      [po({ remarks: 'sheet timeline shows ₹22,000 cash paid 23 Jan (conflict)' })],
      [],
    );
    const inv = (r.supplierGroups[0]?.invoices as { conflict: boolean }[])[0];
    expect(inv?.conflict).toBe(true);
  });

  it('matches each conflict phrase, case-insensitively', () => {
    for (const s of ['CONFLICT', 'Already Paid', 'cash paid']) {
      expect(CONFLICT_RE.test(s)).toBe(true);
    }
  });

  it('leaves a flagged invoice in the totals rather than netting it out', () => {
    // Money is never guessed: the conflict is surfaced for a human, but the
    // amount still counts as owed until someone resolves it.
    const r = buildPayables([po({ outstanding_amount: 22000, remarks: 'already paid' })], []);
    expect(r.totals.owedToOthers).toBe(22000);
  });

  it('does not flag ordinary remarks', () => {
    const r = buildPayables([po({ remarks: 'Camera assistant, 1 day' })], []);
    const inv = (r.supplierGroups[0]?.invoices as { conflict: boolean }[])[0];
    expect(inv?.conflict).toBe(false);
  });
});

describe('buildPayables — commission', () => {
  const project = (over: Partial<PayableProjectRow> = {}): PayableProjectRow => ({
    name: 'PROJ-1',
    project_name: 'Ad Film',
    custom_sales_person: 'Referrer A',
    custom_commission_percent: 5,
    total_billed_amount: 100000,
    custom_sanction_amount: 0,
    ...over,
  });

  it('uses the shared commission formula', () => {
    const r = buildPayables([], [project()]);
    expect(r.commission[0]?.totalOwed).toBe(computeCommission(100000, 0, 5).commissionOwed);
    expect(r.commission[0]?.totalOwed).toBe(5000);
  });

  it('falls back to sanctioned before anything is billed', () => {
    const r = buildPayables(
      [],
      [project({ total_billed_amount: 0, custom_sanction_amount: 60000 })],
    );
    expect(r.commission[0]?.totalOwed).toBe(3000);
  });

  it('accumulates across projects per referrer', () => {
    const r = buildPayables(
      [],
      [project(), project({ name: 'PROJ-2', total_billed_amount: 40000 })],
    );
    expect(r.commission).toHaveLength(1);
    expect(r.commission[0]?.totalOwed).toBe(7000);
    expect(r.commission[0]?.projects).toHaveLength(2);
  });

  it('skips projects with no referrer or no commission rate', () => {
    const r = buildPayables(
      [],
      [
        project({ custom_sales_person: null }),
        project({ name: 'PROJ-2', custom_commission_percent: 0 }),
      ],
    );
    expect(r.commission).toEqual([]);
  });

  it('folds commission into the grand total', () => {
    const r = buildPayables([po({ outstanding_amount: 1000 })], [project()]);
    expect(r.totals.grandTotal).toBe(1000 + 5000);
  });
});
