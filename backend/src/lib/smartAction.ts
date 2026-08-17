/**
 * Deterministic "what's the next step for this project?" logic.
 *
 * Direct port of the old `server/lib/smartAction.js`. No AI, no model -- just
 * rules over the project's real state (money + checklist phase + status). The
 * studio's project life cycle is:
 *
 *   Pre-production -> Production (shoot) -> Post-production -> Delivery ->
 *   Invoice -> Payment -> Wrap/Portfolio
 *
 * so the button points at the next thing that actually moves the project
 * toward "done". Money state is the strongest signal and is checked first; the
 * task checklist's current phase refines the pre-invoice stages.
 *
 * Behaviour is intentionally identical to the original -- this is the code most
 * worth pinning with tests before anything else changes, since it drives the
 * primary call-to-action on every project row.
 */

export type Stage = 'pre' | 'production' | 'post' | null;

export type SmartActionKind =
  | 'reopen'
  | 'invoice'
  | 'payment'
  | 'portfolio'
  | 'update'
  | 'equipment';

export interface SmartAction {
  label: string;
  kind: SmartActionKind;
  tab: string;
}

export interface SmartActionMeta {
  progress?: number;
  phase?: string | null;
  actionableCount?: number;
  salesOutstanding?: number;
  hasDraft?: boolean;
}

export interface SmartActionProject {
  status?: string;
  total_billed_amount?: number | string | null;
}

/**
 * Map a phase/group name (e.g. "AF - Pre-Production") to a coarse stage.
 * Order matters: "pre-production" contains "production", so test 'pre' first.
 */
export function stageFromPhase(phase: string | null | undefined): Stage {
  if (!phase) return null;
  const p = phase.toLowerCase();
  if (/\b(pre|plan|prep|recce|scout)/.test(p)) return 'pre';
  if (/(post|edit|colou?r|grade|deliver|wrap|output|render|export)/.test(p)) return 'post';
  if (/(production|shoot|film|record|capture)/.test(p)) return 'production';
  if (/(invoice|bill|payment|account)/.test(p)) return 'post';
  return null;
}

export function computeSmartAction(
  project: SmartActionProject,
  meta: SmartActionMeta,
): SmartAction {
  const status = project.status;
  const billed = Number(project.total_billed_amount || 0);
  const outstanding = Number(meta.salesOutstanding || 0);
  const progress = Number(meta.progress || 0);
  const hasTasks = Number(meta.actionableCount || 0) > 0;
  const stage = stageFromPhase(meta.phase);

  // 1. Cancelled projects: the only sensible next step is to reopen.
  if (status === 'Cancelled') return { label: 'Reopen', kind: 'reopen', tab: '' };

  // 2. A draft invoice is sitting there waiting to be sent to the books.
  if (meta.hasDraft) return { label: 'Submit Invoice', kind: 'invoice', tab: 'money' };

  // 3. Invoiced, money still outstanding -> chase / record the payment.
  if (billed > 0 && outstanding > 0) return { label: 'Payment Pending', kind: 'payment', tab: 'money' };

  // 4. Invoiced and fully collected -> the job is money-done; wrap it up
  //    (put it on the website / portfolio, per the studio's end-of-project step).
  if (billed > 0 && outstanding <= 0) return { label: 'Add to Portfolio', kind: 'portfolio', tab: 'docs' };

  // 5. Nothing invoiced yet -> use the checklist phase to point at the work.
  if (stage === 'post' || progress >= 66 || status === 'Completed') {
    return { label: 'Create Invoice', kind: 'invoice', tab: 'money' };
  }
  if (stage === 'production' || (progress >= 33 && progress < 66)) {
    return { label: 'Add Update', kind: 'update', tab: 'activity' };
  }
  if (stage === 'pre' || (hasTasks && progress < 33)) {
    return { label: 'Plan Equipment', kind: 'equipment', tab: 'docs' };
  }

  // 6. No checklist to go on and not yet invoiced -> the useful next money
  //    step for this studio's historical projects is to raise the invoice.
  return { label: 'Create Invoice', kind: 'invoice', tab: 'money' };
}
