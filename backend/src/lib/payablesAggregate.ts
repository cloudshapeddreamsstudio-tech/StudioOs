import { computeCommission } from './projectFinance';

/**
 * Payables aggregation — everything the studio still owes, in one shape.
 *
 * Extracted from `server/routes/payables.js` (T-014) so the grouping and the
 * owner/others split can be tested. Read-only by design: no write route lives
 * on this endpoint, and it is sourced entirely from ERPNext, never from the
 * local ledgers.
 */

/**
 * The studio's own name as a Supplier. Money "owed" to this party is really the
 * owner paying himself for his own crew work, not an external liability — so it
 * is reported separately rather than folded into "who I still owe" at face
 * value.
 */
export const OWNER_SUPPLIER_NAME = 'Shubham Chauhan';

/**
 * A purchase invoice whose remarks mention a conflicting or already-paid note
 * must be flagged for a human, never auto-resolved or netted out. Money is
 * never guessed.
 *
 * (The originating case: PINV-26-00017, "sheet timeline shows ₹22,000 cash paid
 * 23 Jan (conflict)".)
 */
export const CONFLICT_RE = /conflict|already paid|cash paid/i;

/** Rental House is the established Vendor signal; anything else is Crew. */
const VENDOR_SUPPLIER_GROUP = 'Rental House';

export interface PayablePurchaseRow {
  name: string;
  supplier: string;
  supplier_name?: string | null;
  posting_date?: string | null;
  due_date?: string | null;
  grand_total?: number | null;
  outstanding_amount?: number | null;
  status?: string;
  supplier_group?: string | null;
  remarks?: string | null;
  project?: string | null;
}

export interface PayableProjectRow {
  name: string;
  project_name?: string;
  custom_sales_person?: string | null;
  custom_commission_percent?: number | null;
  custom_sanction_amount?: number | null;
  total_billed_amount?: number | null;
  department?: string | null;
}

export function buildPayables(
  purchaseInvoices: PayablePurchaseRow[],
  projects: PayableProjectRow[],
) {
  // --- Group unpaid purchase invoices by supplier ---
  const bySupplier: Record<
    string,
    {
      supplier: string;
      supplierName: string;
      isOwner: boolean;
      totalOutstanding: number;
      oldestDueDate: string | null;
      invoices: unknown[];
    }
  > = {};

  for (const inv of purchaseInvoices) {
    const key = inv.supplier;
    const group = (bySupplier[key] ??= {
      supplier: inv.supplier,
      supplierName: inv.supplier_name || inv.supplier,
      isOwner: inv.supplier === OWNER_SUPPLIER_NAME,
      totalOutstanding: 0,
      oldestDueDate: null,
      invoices: [],
    });

    const outstanding = Number(inv.outstanding_amount || 0);
    group.totalOutstanding += outstanding;
    if (!group.oldestDueDate || (inv.due_date && inv.due_date < group.oldestDueDate)) {
      group.oldestDueDate = inv.due_date || null;
    }

    group.invoices.push({
      name: inv.name,
      project: inv.project || null,
      amount: outstanding,
      grandTotal: Number(inv.grand_total || 0),
      dueDate: inv.due_date || null,
      postingDate: inv.posting_date || null,
      status: inv.status,
      partyType: inv.supplier_group === VENDOR_SUPPLIER_GROUP ? 'Vendor' : 'Crew',
      conflict: CONFLICT_RE.test(inv.remarks || ''),
      remarks: inv.remarks || '',
    });
  }

  const supplierGroups = Object.values(bySupplier).sort(
    (a, b) => b.totalOutstanding - a.totalOutstanding,
  );

  /**
   * Commission owed, per person. This route has no way to know which
   * commission has already been paid out — no Payment Entry links to commission
   * specifically — so it reports what is OWED by the formula, the same
   * read-only scope as the rest of this endpoint.
   */
  const commissionByPerson: Record<
    string,
    { party: string; totalOwed: number; projects: unknown[] }
  > = {};

  for (const p of projects) {
    const percent = Number(p.custom_commission_percent || 0);
    const salesPerson = p.custom_sales_person;
    if (!salesPerson || percent <= 0) continue;

    const { commissionBase, commissionOwed } = computeCommission(
      Number(p.total_billed_amount || 0),
      Number(p.custom_sanction_amount || 0),
      percent,
    );
    if (commissionOwed <= 0) continue;

    const entry = (commissionByPerson[salesPerson] ??= {
      party: salesPerson,
      totalOwed: 0,
      projects: [],
    });
    entry.totalOwed += commissionOwed;
    entry.projects.push({
      project: p.name,
      projectName: p.project_name,
      commissionOwed,
      commissionPercent: percent,
      commissionBase,
    });
  }

  const commission = Object.values(commissionByPerson).sort((a, b) => b.totalOwed - a.totalOwed);

  const owedToOthers = supplierGroups
    .filter((g) => !g.isOwner)
    .reduce((s, g) => s + g.totalOutstanding, 0);
  const owedToOwner = supplierGroups
    .filter((g) => g.isOwner)
    .reduce((s, g) => s + g.totalOutstanding, 0);
  const commissionOwed = commission.reduce((s, c) => s + c.totalOwed, 0);

  return {
    supplierGroups,
    commission,
    totals: {
      owedToOthers,
      owedToOwner,
      commissionOwed,
      grandTotal: owedToOthers + owedToOwner + commissionOwed,
    },
    poCount: purchaseInvoices.length,
  };
}
