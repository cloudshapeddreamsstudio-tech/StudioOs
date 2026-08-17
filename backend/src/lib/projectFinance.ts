/**
 * The project-detail money model and completion rules.
 *
 * Extracted from the body of `server/routes/projectDetail.js` so the
 * arithmetic can be tested without a network or an ERPNext round-trip. These
 * are the numbers on the owner's most-used screen and the rules that decide
 * whether a project is "done" — none of it had a single test in the old app.
 *
 * Nothing here writes. The route does the ERPNext side-effects; this module
 * only decides what *should* be true.
 */

export interface TaskRow {
  name: string;
  subject?: string;
  status?: string;
  is_group?: number;
  description?: string;
}

export interface SalesRow {
  name: string;
  status?: string;
  outstanding_amount?: number | null;
  grand_total?: number | null;
}

export interface PurchaseRow {
  name: string;
  status?: string;
  supplier_group?: string | null;
  outstanding_amount?: number | null;
  grand_total?: number | null;
}

export interface CrewRow {
  role: string;
  total?: number | null;
}

export interface ExpenseRow {
  category?: string | null;
  amount?: number | null;
  estimatedAmount?: number | null;
}

/**
 * The best available crew/vendor split. There is no direct roster↔invoice link
 * yet, so the Rental House supplier group is the signal for "this was a vendor
 * rental rather than a person we booked".
 */
export const VENDOR_SUPPLIER_GROUP = 'Rental House';

/** A submitted-but-unpaid invoice is real money owed. A Draft is not. */
function isOwed(inv: { status?: string; outstanding_amount?: number | null }): boolean {
  return inv.status !== 'Draft' && Number(inv.outstanding_amount || 0) > 0;
}

function sumOutstanding(rows: { outstanding_amount?: number | null }[]): number {
  return rows.reduce((s, i) => s + Number(i.outstanding_amount || 0), 0);
}

export interface CompletionInput {
  tasks: TaskRow[];
  liveSales: SalesRow[];
  livePurchases: PurchaseRow[];
  crewRoster: CrewRow[];
  /** Counts of the raw, pre-filter invoice lists — a cancelled invoice still
   *  proves something happened on this project. */
  totalSalesCount: number;
  totalPurchaseCount: number;
}

/**
 * Whether a project is genuinely finished.
 *
 * "Complete" isn't something anyone should have to remember to click. A project
 * is done when (a) every actionable task is checked off, (b) every crew/vendor
 * bill is fully paid, and (c) the client's own invoices are fully paid. Status
 * is therefore derived, with one manual escape hatch: Cancelled.
 */
export function computeCompletion(input: CompletionInput) {
  const { tasks, liveSales, livePurchases, crewRoster } = input;

  const actionableTasks = tasks.filter((t) => !t.is_group);
  const openTasks = actionableTasks.filter(
    (t) => t.status !== 'Completed' && t.status !== 'Cancelled',
  );
  const hasTasks = actionableTasks.length > 0;

  /**
   * A project with no checklist at all (older ones, or created before templates
   * existed) shouldn't be permanently stuck as incomplete just for lacking a
   * checklist — that's a different problem from "crew unpaid". So zero tasks is
   * vacuously complete, and `hasTasks` is surfaced separately for a "no
   * checklist" note.
   */
  const tasksComplete = openTasks.length === 0;

  const unpaidPurchases = livePurchases.filter(isOwed);
  const crewFullyPaid = unpaidPurchases.length === 0;

  const unpaidSales = liveSales.filter(isOwed);
  const clientFullyPaid = unpaidSales.length === 0;

  const crewEntries = crewRoster.filter((e) => e.role === 'Crew');
  const vendorEntries = crewRoster.filter((e) => e.role === 'Vendor');

  /**
   * `crewFullyPaid` is vacuously true when there are no unpaid purchase
   * invoices — which includes "no crew at all". That is the exact bug this
   * flag guards: a project with NO crew assigned must not have "Crew Payment
   * Made" silently auto-complete.
   */
  const noCrewAssigned = crewEntries.length === 0;

  const vendorPurchases = livePurchases.filter(
    (i) => i.supplier_group === VENDOR_SUPPLIER_GROUP,
  );
  const hasVendorInvolvement = vendorEntries.length > 0 || vendorPurchases.length > 0;
  const unpaidVendorPurchases = vendorPurchases.filter(isOwed);
  const vendorFullyPaid = unpaidVendorPurchases.length === 0;

  /**
   * Don't call an untouched project complete just because there is nothing to
   * be incomplete about. An ongoing engagement tracked outside ERPNext can have
   * zero tasks AND zero invoices while very much still active, so require some
   * sign of real activity first — a checklist, or any invoice at all (even an
   * unsent draft counts as "something happened here").
   */
  const hasActivity =
    hasTasks || input.totalSalesCount > 0 || input.totalPurchaseCount > 0;

  const ready = hasActivity && tasksComplete && crewFullyPaid && clientFullyPaid;

  return {
    ready,
    hasTasks,
    tasksComplete,
    tasksRemaining: openTasks.length,
    crewFullyPaid,
    crewOutstandingCount: unpaidPurchases.length,
    crewOutstandingAmount: sumOutstanding(unpaidPurchases),
    clientFullyPaid,
    clientOutstandingCount: unpaidSales.length,
    clientOutstandingAmount: sumOutstanding(unpaidSales),
    noCrewAssigned,
    hasVendorInvolvement,
    vendorFullyPaid,
    // Not part of the old response shape, but the route needs these and
    // recomputing them there would duplicate the rules.
    _internal: { actionableTasks, openTasks, vendorPurchases, crewEntries, vendorEntries },
  };
}

/**
 * `percent_complete` to write alongside a derived status.
 *
 * ERPNext's Project controller derives `status` from `percent_complete` on
 * every save (100% forces Completed regardless of what was passed), so status
 * alone gets silently overridden unless percent is patched to match AND the
 * method is switched to Manual. Uses the real checklist ratio so the native
 * field stays meaningful rather than being a throwaway number.
 */
export function desiredPercentComplete(
  desiredStatus: string,
  actionableCount: number,
  openCount: number,
): number {
  if (desiredStatus === 'Completed') return 100;
  if (actionableCount === 0) return 0;
  return Math.round(((actionableCount - openCount) / actionableCount) * 100);
}

/**
 * Commission owed on a project.
 *
 * Charged on what is actually invoiced to the client, per studio policy,
 * falling back to the sanctioned amount when nothing is billed yet — so the
 * figure is meaningful the moment a project is created.
 *
 * The old app had this formula written out twice, in `projectDetail.js` and
 * again in `payables.js`, with a comment in the latter saying it was "copied
 * here rather than reinvented". Two copies is one copy too many for a money
 * rule; both callers now share this.
 */
export function computeCommission(
  billed: number,
  sanctioned: number,
  commissionPercent: number,
): { commissionBase: number; commissionOwed: number } {
  const commissionBase = billed > 0 ? billed : sanctioned;
  return {
    commissionBase,
    commissionOwed: Math.round((commissionBase * commissionPercent) / 100),
  };
}

export interface FinanceInput {
  sanctioned: number;
  billed: number;
  purchaseCost: number;
  commissionPercent: number;
  liveSales: SalesRow[];
  livePurchases: PurchaseRow[];
  expenseTotal: number;
  grossMargin: number;
  marginPercent: number;
}

export function computeFinance(input: FinanceInput) {
  const { sanctioned, billed, purchaseCost, commissionPercent } = input;

  const { commissionBase, commissionOwed } = computeCommission(
    billed,
    sanctioned,
    commissionPercent,
  );

  // Only submitted invoices count as money owed — a Draft hasn't been sent.
  const salesOutstanding = sumOutstanding(input.liveSales.filter((i) => i.status !== 'Draft'));
  const purchaseOutstanding = sumOutstanding(
    input.livePurchases.filter((i) => i.status !== 'Draft'),
  );

  return {
    sanctioned,
    billed,
    purchaseCost,
    expenseTotal: input.expenseTotal,
    // Budget left = sanctioned, minus crew/rental spend, minus misc expenses.
    remaining: sanctioned - purchaseCost - input.expenseTotal,
    grossMargin: input.grossMargin,
    marginPercent: input.marginPercent,
    commissionPercent,
    commissionBase,
    commissionOwed,
    salesOutstanding,
    purchaseOutstanding,
  };
}

export interface ExpenseOverviewInput {
  sanctioned: number;
  commissionPercent: number;
  commissionOwed: number;
  livePurchases: PurchaseRow[];
  vendorPurchases: PurchaseRow[];
  crewEntries: CrewRow[];
  vendorEntries: CrewRow[];
  expenses: ExpenseRow[];
}

/** The owner's "where did the money go" table: planned versus actual. */
export function buildExpenseOverview(input: ExpenseOverviewInput) {
  const { sanctioned, commissionPercent, commissionOwed } = input;

  /**
   * "Actual" is grand_total of every live purchase invoice regardless of paid
   * status — this is spend, not outstanding-owed. "Planned" comes from the
   * roster, which is deliberately not tied to real invoices.
   */
  const crewPurchases = input.livePurchases.filter(
    (i) => i.supplier_group !== VENDOR_SUPPLIER_GROUP,
  );
  const crewActual = crewPurchases.reduce((s, i) => s + Number(i.grand_total || 0), 0);
  const vendorActual = input.vendorPurchases.reduce((s, i) => s + Number(i.grand_total || 0), 0);
  const crewPlanned = input.crewEntries.reduce((s, e) => s + Number(e.total || 0), 0);
  const vendorPlanned = input.vendorEntries.reduce((s, e) => s + Number(e.total || 0), 0);

  const actualByCategory: Record<string, number> = {};
  const plannedByCategory: Record<string, number> = {};
  for (const e of input.expenses) {
    const c = e.category || 'Other';
    actualByCategory[c] = (actualByCategory[c] ?? 0) + Number(e.amount || 0);
    plannedByCategory[c] = (plannedByCategory[c] ?? 0) + Number(e.estimatedAmount || 0);
  }

  // Only emit a row if it has a nonzero planned OR actual — no empty rows.
  const rows: { category: string; planned: number; actual: number }[] = [];
  if (crewPlanned > 0 || crewActual > 0) {
    rows.push({ category: 'Crew', planned: crewPlanned, actual: crewActual });
  }
  if (vendorPlanned > 0 || vendorActual > 0) {
    rows.push({ category: 'Vendor', planned: vendorPlanned, actual: vendorActual });
  }
  const categories = new Set([
    ...Object.keys(actualByCategory),
    ...Object.keys(plannedByCategory),
  ]);
  for (const cat of [...categories].sort()) {
    const planned = plannedByCategory[cat] ?? 0;
    const actual = actualByCategory[cat] ?? 0;
    if (planned > 0 || actual > 0) rows.push({ category: cat, planned, actual });
  }

  const plannedTotal = rows.reduce((s, r) => s + r.planned, 0);
  const actualTotal = rows.reduce((s, r) => s + r.actual, 0);

  /**
   * Margin model, per the owner's explicit split on SANCTIONED:
   * commission% → sales person, 20% → profit (the minimum he wants to clear),
   * the rest → all production (crew + vendor + expenses).
   *
   * Commission is its own cost line feeding profit and is never folded into the
   * expense rows above.
   */
  const commissionPlanned = Math.round((sanctioned * commissionPercent) / 100);
  const commissionActual = commissionOwed; // reuse, don't re-derive
  const profitActual = sanctioned - commissionActual - actualTotal;
  const profitPlanned = sanctioned - commissionPlanned - plannedTotal;
  const targetProfit = 0.2 * sanctioned;

  return {
    rows,
    plannedTotal,
    actualTotal,
    margin: {
      commissionPlanned,
      commissionActual,
      productionPlanned: plannedTotal,
      productionActual: actualTotal,
      // The ceiling the owner wants visible so he can see headroom before quoting.
      productionCeilingPlanned: sanctioned - commissionPlanned - targetProfit,
      productionCeilingActual: sanctioned - commissionActual - targetProfit,
      profitPlanned,
      profitActual,
      profitPlannedPercent: sanctioned > 0 ? (profitPlanned / sanctioned) * 100 : null,
      profitActualPercent: sanctioned > 0 ? (profitActual / sanctioned) * 100 : null,
      meetsTargetPlanned: sanctioned > 0 ? profitPlanned >= targetProfit : null,
      meetsTargetActual: sanctioned > 0 ? profitActual >= targetProfit : null,
    },
  };
}
