import { describe, it, expect } from 'bun:test';
import {
  buildPayables as build,
  CONFLICT_RE,
  type PayablePurchaseRow,
} from '../src/lib/payablesAggregate';
import { vendorGroupsFrom } from '../src/lib/vendorGroups';

/** The owner's supplier name is configuration now (OWNER_SUPPLIER). */
const OWNER_SUPPLIER_NAME = 'Shubham Chauhan';

/** The vendor groups of a site laid out like the new one. */
const VENDOR_GROUPS = vendorGroupsFrom([
  { name: 'Equipment Rental', parent_supplier_group: 'All Supplier Groups' },
  { name: 'Camera & Lighting', parent_supplier_group: 'Equipment Rental' },
]);

const buildPayables = (rows: PayablePurchaseRow[]) =>
  build(rows, { ownerSupplier: OWNER_SUPPLIER_NAME, vendorGroups: VENDOR_GROUPS });

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
      ]);
    expect(r.totals.owedToOthers).toBe(3000);
    expect(r.totals.owedToOwner).toBe(22000);
    // The grand total still includes both — it just isn't presented as one lump.
    expect(r.totals.grandTotal).toBe(25000);
  });

  it('marks the owner group with isOwner', () => {
    const r = buildPayables([po({ supplier: OWNER_SUPPLIER_NAME })]);
    expect(r.supplierGroups[0]?.isOwner).toBe(true);
  });
});

describe('buildPayables — grouping', () => {
  it('sums a supplier across their invoices and keeps the oldest due date', () => {
    const r = buildPayables(
      [
        po({ name: 'PINV-1', outstanding_amount: 3000, due_date: '2026-06-01' }),
        po({ name: 'PINV-2', outstanding_amount: 5000, due_date: '2026-03-15' }),
      ]);
    expect(r.supplierGroups).toHaveLength(1);
    expect(r.supplierGroups[0]?.totalOutstanding).toBe(8000);
    expect(r.supplierGroups[0]?.oldestDueDate).toBe('2026-03-15');
  });

  it('ranks suppliers by how much is owed', () => {
    const r = buildPayables(
      [
        po({ supplier: 'Small', outstanding_amount: 1000 }),
        po({ name: 'PINV-2', supplier: 'Big', outstanding_amount: 9000 }),
      ]);
    expect(r.supplierGroups.map((g) => g.supplier)).toEqual(['Big', 'Small']);
  });

  it('classifies a group below Equipment Rental as Vendor and everything else as Crew', () => {
    const r = buildPayables(
      [
        po({ name: 'PINV-1', supplier_group: 'Camera & Lighting' }),
        po({ name: 'PINV-2', supplier: 'Someone', supplier_group: null }),
      ]);
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
      [po({ remarks: 'sheet timeline shows ₹22,000 cash paid 23 Jan (conflict)' })]);
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
    const r = buildPayables([po({ outstanding_amount: 22000, remarks: 'already paid' })]);
    expect(r.totals.owedToOthers).toBe(22000);
  });

  it('does not flag ordinary remarks', () => {
    const r = buildPayables([po({ remarks: 'Camera assistant, 1 day' })]);
    const inv = (r.supplierGroups[0]?.invoices as { conflict: boolean }[])[0];
    expect(inv?.conflict).toBe(false);
  });
});

describe('buildPayables — the totals', () => {
  it('the grand total is what is owed to others and to the owner, and no more', () => {
    // It had a third part, a commission from custom fields of Project. ADR-0005
    // does not permit those fields in release 1, so no commission is reported.
    const r = buildPayables([
      po({ outstanding_amount: 1000 }),
      po({ name: 'PINV-2', supplier: OWNER_SUPPLIER_NAME, outstanding_amount: 400 }),
    ]);
    expect(r.totals.owedToOthers).toBe(1000);
    expect(r.totals.owedToOwner).toBe(400);
    expect(r.totals.grandTotal).toBe(1400);
    expect('commission' in r).toBe(false);
    expect('commissionOwed' in r.totals).toBe(false);
  });
});
