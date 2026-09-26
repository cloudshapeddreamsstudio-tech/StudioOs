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
  /**
   * `null` means the roster is not available in this release, which is NOT the
   * same as an empty roster. "No crew is assigned" is a claim about data; with
   * no data we must not make it. See docs/PLAN-v2.md 7b.
   */
  crewRoster: CrewRow[] | null;
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

  const crewRosterUnavailable = crewRoster === null;
  const crewEntries = (crewRoster ?? []).filter((e) => e.role === 'Crew');
  const vendorEntries = (crewRoster ?? []).filter((e) => e.role === 'Vendor');

  /**
   * `crewFullyPaid` is vacuously true when there are no unpaid purchase
   * invoices — which includes "no crew at all". That is the exact bug this
   * flag guards: a project with NO crew assigned must not have "Crew Payment
   * Made" silently auto-complete.
   *
   * When the roster is unavailable this must be **false**, not true. An empty
   * array and a missing source both produce zero entries, but they mean
   * opposite things: one says "nobody is on this crew", the other says "we
   * cannot see the crew". Telling an owner "no crew is assigned" about a
   * project that has a full roster would be worse than saying nothing.
   */
  const noCrewAssigned = !crewRosterUnavailable && crewEntries.length === 0;

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
    crewRosterUnavailable,
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
  /** `null` when project expenses are unavailable — see CompletionInput.crewRoster. */
  expenseTotal: number | null;
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
    /**
     * Budget left = sanctioned, minus crew/rental spend, minus misc expenses.
     *
     * With expenses unavailable this is **null**, not `sanctioned - purchaseCost`.
     * Treating a missing figure as zero does not produce a slightly wrong
     * number, it produces a confidently wrong one — always in the flattering
     * direction, since every unseen expense makes the owner look richer than
     * they are. A dash is honest; an overstated budget invites overspending.
     */
    remaining:
      input.expenseTotal === null ? null : sanctioned - purchaseCost - input.expenseTotal,
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
  /** `null` when the roster is unavailable — see CompletionInput.crewRoster. */
  crewEntries: CrewRow[] | null;
  vendorEntries: CrewRow[] | null;
  /** `null` when project expenses are unavailable. */
  expenses: ExpenseRow[] | null;
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
  /**
   * Planned figures come from the roster. When it is unavailable they are null,
   * never zero: a row reading "Crew — planned ₹0, actual ₹40,000" tells the
   * owner they overspent by the whole amount, when in truth the plan was simply
   * not visible.
   */
  const rosterUnavailable = input.crewEntries === null || input.vendorEntries === null;
  const crewPlanned = rosterUnavailable
    ? null
    : input.crewEntries!.reduce((s, e) => s + Number(e.total || 0), 0);
  const vendorPlanned = rosterUnavailable
    ? null
    : input.vendorEntries!.reduce((s, e) => s + Number(e.total || 0), 0);

  const expensesUnavailable = input.expenses === null;
  const actualByCategory: Record<string, number> = {};
  const plannedByCategory: Record<string, number> = {};
  for (const e of input.expenses ?? []) {
    const c = e.category || 'Other';
    actualByCategory[c] = (actualByCategory[c] ?? 0) + Number(e.amount || 0);
    plannedByCategory[c] = (plannedByCategory[c] ?? 0) + Number(e.estimatedAmount || 0);
  }

  // Only emit a row if it has a nonzero planned OR actual — no empty rows.
  const rows: { category: string; planned: number | null; actual: number }[] = [];
  if ((crewPlanned ?? 0) > 0 || crewActual > 0 || rosterUnavailable) {
    rows.push({ category: 'Crew', planned: crewPlanned, actual: crewActual });
  }
  if ((vendorPlanned ?? 0) > 0 || vendorActual > 0 || rosterUnavailable) {
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

  /**
   * A total across rows where some are unknown is itself unknown. Summing the
   * knowable ones and presenting it as "planned" would understate the plan by
   * exactly the hidden part.
   */
  const plannedTotal =
    rosterUnavailable || expensesUnavailable
      ? null
      : rows.reduce((s, r) => s + (r.planned ?? 0), 0);

  /**
   * The *actual* total is unknown too when expenses are unavailable.
   *
   * Crew and vendor actuals come from purchase invoices and are fully known,
   * but logged expenses contribute to actual spend as well. Summing only the
   * visible part and labelling it "production actual" understates spend, which
   * then overstates profit — the page would confidently report a 95% margin on
   * a project whose out-of-pocket costs simply cannot be seen.
   */
  const actualTotal = expensesUnavailable ? null : rows.reduce((s, r) => s + r.actual, 0);

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
  const profitActual =
    actualTotal === null ? null : sanctioned - commissionActual - actualTotal;
  // Planned profit is derived from planned production, so it inherits its
  // unknown-ness rather than quietly assuming the plan was zero.
  const profitPlanned =
    plannedTotal === null ? null : sanctioned - commissionPlanned - plannedTotal;
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
      profitPlannedPercent:
        sanctioned > 0 && profitPlanned !== null ? (profitPlanned / sanctioned) * 100 : null,
      profitActualPercent:
        sanctioned > 0 && profitActual !== null ? (profitActual / sanctioned) * 100 : null,
      meetsTargetPlanned:
        sanctioned > 0 && profitPlanned !== null ? profitPlanned >= targetProfit : null,
      meetsTargetActual:
        sanctioned > 0 && profitActual !== null ? profitActual >= targetProfit : null,
    },
  };
}
