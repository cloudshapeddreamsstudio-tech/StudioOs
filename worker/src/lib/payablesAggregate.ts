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

/**
 * What the studio owes its suppliers. Each figure is read from stock fields of
 * `Purchase Invoice`, so it is the same on each ERPNext site.
 *
 * This had a second part: a commission owed to each sales person, calculated
 * from two custom fields of `Project`. ADR-0005 does not permit those fields in
 * release 1, so that part is not here. It returns with the fields.
 */
export function buildPayables(purchaseInvoices: PayablePurchaseRow[]) {
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

  const owedToOthers = supplierGroups
    .filter((g) => !g.isOwner)
    .reduce((s, g) => s + g.totalOutstanding, 0);
  const owedToOwner = supplierGroups
    .filter((g) => g.isOwner)
    .reduce((s, g) => s + g.totalOutstanding, 0);

  return {
    supplierGroups,
    totals: {
      owedToOthers,
      owedToOwner,
      grandTotal: owedToOthers + owedToOwner,
    },
    poCount: purchaseInvoices.length,
  };
}
