import { Hono } from 'hono';
import { z } from 'zod';
import { createFrappeClient, type FrappeClient } from '../lib/frappe';
import { readExpensesForProject } from './projectExpenses';
import { readCrewForProject } from './projectCrew';
import {
  computeCompletion,
  computeFinance,
  buildExpenseOverview,
  desiredPercentComplete,
  type TaskRow,
  type SalesRow,
  type PurchaseRow,
} from '../lib/projectFinance';
import { NotFoundError } from '../lib/errors';
import type { AppEnv } from '../types';

/**
 * Everything a single project needs, in one call.
 *
 * The project detail page is meant to be a "you never have to leave" view, so
 * rather than make the browser fan out to a dozen endpoints, the whole picture
 * is assembled here: the project, its checklist, money in (Sales Invoices +
 * Payment Entries), money out (Purchase Invoices), attached documents, and an
 * activity timeline. Anything with no data comes back empty and the page shows
 * a friendly empty state.
 *
 * Ported from `server/routes/projectDetail.js`, the largest file in the old
 * app. The arithmetic now lives in lib/projectFinance.ts; what remains here is
 * fetching and the ERPNext side-effects.
 *
 * **This GET writes.** It auto-ticks milestone tasks, renames legacy task
 * subjects, creates the Vendor Payment task when vendor involvement first
 * appears, and syncs the derived project status. That was true of the original
 * and is preserved deliberately — the sync is what keeps status honest without
 * anyone remembering to click anything. Every write is best-effort: a failure
 * is logged and the page still renders.
 */

const app = new Hono<AppEnv>();

/**
 * GET /api/project/files/:file_id/download — proxy a (possibly private) file
 * so the browser can view it without ERPNext credentials.
 * Registered before /:name so "files" isn't read as a project name.
 */
app.get('/files/:file_id/download', async (c) => {
  const frappe = createFrappeClient(c.env);
  const fileDoc = await frappe.getDoc<{ file_url: string; file_name: string }>(
    'File',
    c.req.param('file_id'),
  );
  const { buffer, contentType } = await frappe.downloadFile(fileDoc.file_url);
  return c.body(buffer, 200, {
    'Content-Type': contentType || 'application/octet-stream',
    'Content-Disposition': `inline; filename="${fileDoc.file_name}"`,
  });
});

/** DELETE /api/project/files/:file_id — remove an attached document. */
app.delete('/files/:file_id', async (c) => {
  const frappe = createFrappeClient(c.env);
  await frappe.deleteDoc('File', c.req.param('file_id'));
  return c.json({ deleted: true });
});

/**
 * POST /api/project/:name/files — attach a document. The browser sends base64
 * (simplest path without a multipart dependency); this decodes and forwards to
 * ERPNext's own upload_file endpoint.
 */
app.post('/:name/files', async (c) => {
  const frappe = createFrappeClient(c.env);
  const body = z
    .object({
      file_name: z.string().min(1, 'file_name is required'),
      content_base64: z.string().min(1, 'content_base64 is required'),
    })
    .parse(await c.req.json());

  // Workers have no Buffer; atob + Uint8Array is the equivalent.
  const binary = atob(body.content_base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  const uploaded = await frappe.uploadFile(bytes.buffer, body.file_name, {
    doctype: 'Project',
    docname: c.req.param('name'),
    isPrivate: true,
  });
  return c.json(uploaded);
});

/**
 * Finds a default milestone task by its invisible marker rather than its
 * subject text.
 *
 * Milestone tasks carry an HTML-comment marker in their description, set at
 * creation. Matching on the marker means the primary milestone's subject stays
 * user-renameable (pencil-edit on the Checklist tab) without breaking the sync —
 * matching on the literal "Shoot Date" would break the moment someone renamed
 * it to "Edit Days". Tasks created before markers existed fall back to matching
 * the literal subject.
 */
function findByMarker(
  tasks: TaskRow[],
  marker: string | null,
  fallbackSubject?: string,
): TaskRow | undefined {
  return tasks.find((t) => {
    if (marker && String(t.description || '').includes(`<!--${marker}-->`)) return true;
    if (fallbackSubject && !t.description) {
      return String(t.subject || '').trim().toLowerCase() === fallbackSubject;
    }
    return false;
  });
}

/** Best-effort task status change that also updates the in-memory copy. */
async function setTaskStatus(
  frappe: FrappeClient,
  task: TaskRow,
  status: string,
  context: string,
): Promise<void> {
  await frappe
    .updateDoc('Task', task.name, { status })
    .then(() => {
      task.status = status;
    })
    .catch((err: Error) => console.error(`${context} failed:`, err.message));
}

/** GET /api/project/:name — the full aggregated view for one project. */
app.get('/:name', async (c) => {
  const frappe = createFrappeClient(c.env);
  const projectName = c.req.param('name');

  const project = await frappe.getDoc<Record<string, unknown> & { status?: string }>(
    'Project',
    projectName,
  );

  // Fire the rest in parallel — none depend on each other. Each is wrapped so
  // one empty or failed section doesn't sink the whole page.
  const [tasks, salesInvoices, purchaseInvoices, payments, files, comments, communications] =
    await Promise.all([
      frappe
        .getList<TaskRow>('Task', {
          fields: [
            'name', 'subject', 'status', 'priority', 'is_group', 'is_milestone',
            'exp_start_date', 'exp_end_date', 'progress', 'description', 'lft', 'parent_task',
          ],
          filters: [['project', '=', projectName], ['is_template', '=', 0]],
          limit: 500,
          orderBy: 'lft asc',
        })
        .catch(() => [] as TaskRow[]),
      frappe
        .getList<SalesRow>('Sales Invoice', {
          fields: ['name', 'custom_invoice_number', 'posting_date', 'due_date', 'grand_total', 'outstanding_amount', 'status'],
          filters: [['project', '=', projectName]],
          limit: 100,
          orderBy: 'posting_date desc',
        })
        .catch(() => [] as SalesRow[]),
      frappe
        .getList<PurchaseRow>('Purchase Invoice', {
          fields: ['name', 'supplier', 'supplier_name', 'posting_date', 'due_date', 'grand_total', 'outstanding_amount', 'status', 'supplier_group'],
          filters: [['project', '=', projectName]],
          limit: 100,
          orderBy: 'posting_date desc',
        })
        .catch(() => [] as PurchaseRow[]),
      frappe
        .getList('Payment Entry', {
          fields: ['name', 'payment_type', 'party', 'party_name', 'posting_date', 'paid_amount', 'mode_of_payment', 'docstatus'],
          filters: [['project', '=', projectName]],
          limit: 100,
          orderBy: 'posting_date desc',
        })
        .catch(() => []),
      frappe
        .getList('File', {
          fields: ['name', 'file_name', 'is_private', 'creation'],
          filters: [['attached_to_doctype', '=', 'Project'], ['attached_to_name', '=', projectName]],
          limit: 100,
          orderBy: 'creation desc',
        })
        .catch(() => []),
      frappe
        .getList<{ name: string; content: string; owner: string; creation: string }>('Comment', {
          fields: ['name', 'comment_type', 'content', 'owner', 'creation'],
          filters: [
            ['reference_doctype', '=', 'Project'],
            ['reference_name', '=', projectName],
            ['comment_type', '=', 'Comment'],
          ],
          limit: 100,
          orderBy: 'creation desc',
        })
        .catch(() => []),
      frappe
        .getList<{
          name: string; subject: string; content: string; sender: string; recipients: string;
          communication_date: string; communication_medium: string; sent_or_received: string;
        }>('Communication', {
          fields: ['name', 'subject', 'content', 'sender', 'recipients', 'communication_date', 'communication_medium', 'sent_or_received'],
          filters: [['reference_doctype', '=', 'Project'], ['reference_name', '=', projectName]],
          limit: 100,
          orderBy: 'communication_date desc',
        })
        .catch(() => []),
    ]);

  // --- Milestone task matching -------------------------------------------
  const primaryMilestoneTask = findByMarker(tasks, 'milestone-primary', 'shoot date');
  const invoiceMailedTask =
    findByMarker(tasks, 'milestone-invoice-mailed', 'invoice mailed') ??
    findByMarker(tasks, null, 'send invoice'); // pre-rename subject
  const invoiceClearedTask = findByMarker(tasks, 'milestone-invoice-cleared', 'invoice cleared');
  const crewPaymentTask =
    findByMarker(tasks, 'milestone-crew-paid', 'crew payment made') ??
    findByMarker(tasks, null, 'pay crew'); // pre-rename subject
  let vendorPaymentTask = findByMarker(tasks, 'milestone-vendor-paid', 'vendor payment made');

  /**
   * Rename the old "Send Invoice" / "Pay Crew" subjects in place so existing
   * projects show the current labels, without losing task history or identity.
   */
  if (invoiceMailedTask && String(invoiceMailedTask.subject || '').trim().toLowerCase() === 'send invoice') {
    await frappe
      .updateDoc('Task', invoiceMailedTask.name, {
        subject: 'Invoice Mailed',
        description: '<!--milestone-invoice-mailed-->',
      })
      .then(() => { invoiceMailedTask.subject = 'Invoice Mailed'; })
      .catch((err: Error) => console.error(`rename Send Invoice failed for ${projectName}:`, err.message));
  }
  if (crewPaymentTask && String(crewPaymentTask.subject || '').trim().toLowerCase() === 'pay crew') {
    await frappe
      .updateDoc('Task', crewPaymentTask.name, {
        subject: 'Crew Payment Made',
        description: '<!--milestone-crew-paid-->',
      })
      .then(() => { crewPaymentTask.subject = 'Crew Payment Made'; })
      .catch((err: Error) => console.error(`rename Pay Crew failed for ${projectName}:`, err.message));
  }

  /**
   * Auto-tick the primary milestone once its date has passed. Compared in UTC
   * against the date-only string, avoiding the local-midnight drift the
   * original's `today.setHours(0,0,0,0)` had.
   */
  const shootDate = project.custom_shoot_date as string | undefined;
  if (primaryMilestoneTask && primaryMilestoneTask.status !== 'Completed' && shootDate) {
    const todayUtc = new Date().toISOString().slice(0, 10);
    if (String(shootDate).slice(0, 10) < todayUtc) {
      await setTaskStatus(frappe, primaryMilestoneTask, 'Completed', `primary milestone auto-complete for ${projectName}`);
    }
  }

  // Only real (non-cancelled) invoices count toward money.
  const liveSales = salesInvoices.filter((i) => i.status !== 'Cancelled');
  const livePurchases = purchaseInvoices.filter((i) => i.status !== 'Cancelled');

  const crewRoster = await readCrewForProject(c.env, projectName);
  const expenses = await readExpensesForProject(c.env, projectName);

  const completion = computeCompletion({
    tasks,
    liveSales,
    livePurchases,
    crewRoster,
    totalSalesCount: salesInvoices.length,
    totalPurchaseCount: purchaseInvoices.length,
  });
  const { actionableTasks, openTasks, vendorPurchases, crewEntries, vendorEntries } =
    completion._internal;

  /**
   * Idempotent: add "Vendor Payment Made" the moment vendor involvement first
   * appears on a project that didn't have it before.
   */
  if (completion.hasVendorInvolvement && !vendorPaymentTask) {
    const created = await frappe
      .createDoc<TaskRow>('Task', {
        project: projectName,
        subject: 'Vendor Payment Made',
        status: 'Open',
        description: '<!--milestone-vendor-paid-->',
      })
      .catch((err: Error) => {
        console.error(`Vendor Payment Made creation failed for ${projectName}:`, err.message);
        return null;
      });
    if (created) {
      vendorPaymentTask = created;
      tasks.push(created);
    }
  }

  /** Auto-tick "Invoice Cleared" — no invoice yet isn't "cleared", it's "not started". */
  if (
    invoiceClearedTask &&
    invoiceClearedTask.status !== 'Completed' &&
    liveSales.length > 0 &&
    completion.clientFullyPaid
  ) {
    await setTaskStatus(frappe, invoiceClearedTask, 'Completed', `Invoice Cleared auto-complete for ${projectName}`);
  }

  /**
   * Auto-tick "Crew Payment Made" — but only once real crew is assigned.
   * See the noCrewAssigned note in projectFinance.ts: without this guard a
   * project with no crew would silently claim its crew had been paid.
   */
  if (crewPaymentTask) {
    if (completion.noCrewAssigned) {
      if (crewPaymentTask.status === 'Completed') {
        // Crew removed after being paid — don't leave a stale claim standing.
        await setTaskStatus(frappe, crewPaymentTask, 'Open', `Crew Payment Made revert for ${projectName}`);
      }
    } else if (crewPaymentTask.status !== 'Completed' && completion.crewFullyPaid) {
      await setTaskStatus(frappe, crewPaymentTask, 'Completed', `Crew Payment Made auto-complete for ${projectName}`);
    }
  }

  if (
    vendorPaymentTask &&
    vendorPaymentTask.status !== 'Completed' &&
    completion.hasVendorInvolvement &&
    completion.vendorFullyPaid
  ) {
    await setTaskStatus(frappe, vendorPaymentTask, 'Completed', `Vendor Payment Made auto-complete for ${projectName}`);
  }

  /**
   * Theatre Education projects deliberately don't use ERPNext invoices at all
   * (they run on the lightweight transactions ledger), so this logic has no
   * visibility into their real money state. Leave their status alone rather
   * than guess.
   */
  const derivedStatusApplies =
    project.status !== 'Cancelled' && project.department !== 'Theatre Education - CSDS';

  let effectiveStatus = project.status;
  if (derivedStatusApplies) {
    const desiredStatus = completion.ready ? 'Completed' : 'Open';
    if (project.status !== desiredStatus) {
      const updated = await frappe
        .updateDoc<{ status: string }>('Project', projectName, {
          status: desiredStatus,
          percent_complete: desiredPercentComplete(
            desiredStatus,
            actionableTasks.length,
            openTasks.length,
          ),
          percent_complete_method: 'Manual',
        })
        .catch((err: Error) => {
          console.error(`status sync failed for ${projectName}:`, err.message);
          return null;
        });
      // Trust what ERPNext actually persisted, not what we asked for.
      effectiveStatus = updated ? updated.status : project.status;
    }
  }
  project.status = effectiveStatus;

  // Merge comments + communications into one activity stream, newest first.
  const activity = [
    ...comments.map((cm) => ({
      kind: 'comment' as const,
      id: cm.name,
      content: cm.content,
      who: cm.owner,
      when: cm.creation,
    })),
    ...communications.map((cm) => ({
      kind: 'communication' as const,
      id: cm.name,
      subject: cm.subject,
      content: cm.content,
      who: cm.sender || cm.recipients,
      direction: cm.sent_or_received,
      medium: cm.communication_medium,
      when: cm.communication_date,
    })),
  ].sort((a, b) => new Date(b.when).getTime() - new Date(a.when).getTime());

  const expenseTotal = expenses.reduce((s, e) => s + Number(e.amount || 0), 0);
  const expensesByCategory: Record<string, number> = {};
  for (const e of expenses) {
    const cat = e.category || 'Other';
    expensesByCategory[cat] = (expensesByCategory[cat] ?? 0) + Number(e.amount || 0);
  }

  const finance = computeFinance({
    sanctioned: Number(project.custom_sanction_amount || 0),
    billed: Number(project.total_billed_amount || 0),
    purchaseCost: Number(project.total_purchase_cost || 0),
    commissionPercent: Number(project.custom_commission_percent || 0),
    liveSales,
    livePurchases,
    expenseTotal,
    grossMargin: Number(project.gross_margin || 0),
    marginPercent: Number(project.per_gross_margin || 0),
  });

  const expenseOverview = buildExpenseOverview({
    sanctioned: finance.sanctioned,
    commissionPercent: finance.commissionPercent,
    commissionOwed: finance.commissionOwed,
    livePurchases,
    vendorPurchases,
    crewEntries,
    vendorEntries,
    expenses,
  });

  // `_internal` is a helper for this route, not part of the API contract.
  const { _internal, ...completionResponse } = completion;

  return c.json({
    project,
    tasks,
    salesInvoices: liveSales,
    purchaseInvoices: livePurchases,
    payments,
    files,
    activity,
    expenses,
    expensesByCategory,
    crewRoster,
    completion: completionResponse,
    expenseOverview,
    finance,
  });
});

/**
 * POST /api/project/:name/note — add a plain note to the activity timeline.
 * An internal annotation (an ERPNext Comment), not a financial or outward-facing
 * action, so it is a safe write.
 */
app.post('/:name/note', async (c) => {
  const frappe = createFrappeClient(c.env);
  const { content } = z
    .object({ content: z.string().trim().min(1, 'content is required') })
    .parse(await c.req.json());

  const created = await frappe.createDoc('Comment', {
    comment_type: 'Comment',
    reference_doctype: 'Project',
    reference_name: c.req.param('name'),
    // Escaped on write. Notes are rendered as HTML by the timeline (that is how
    // the struck-through edit history below displays), so raw user text would
    // be an injection vector. The old app escaped the *superseded* text but not
    // the new text — an inconsistency, fixed here rather than carried over.
    content: escapeHtml(content.trim()),
  });
  return c.json(created);
});

/**
 * Marks a prior version of a note's text, rendered struck-through with an
 * "(edited)" tag by the frontend.
 */
const EDIT_HISTORY_RE = /<div class="ch-hist"><del>([\s\S]*?)<\/del><\/div>/g;

function escapeHtml(str: unknown): string {
  const map: Record<string, string> = {
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  };
  return String(str ?? '').replace(/[&<>"']/g, (ch) => map[ch] ?? ch);
}

/**
 * PUT /api/project/:name/note/:commentId — edit a note.
 *
 * The replaced text is preserved as a struck-through history entry rather than
 * discarded, so there is always a record of what a note used to say.
 */
app.put('/:name/note/:commentId', async (c) => {
  const frappe = createFrappeClient(c.env);
  const { content } = z
    .object({ content: z.string().trim().min(1, 'content is required') })
    .parse(await c.req.json());

  const existing = await frappe.getDoc<{
    reference_doctype?: string;
    reference_name?: string;
    content?: string;
  }>('Comment', c.req.param('commentId'));

  if (
    existing.reference_doctype !== 'Project' ||
    existing.reference_name !== c.req.param('name')
  ) {
    throw new NotFoundError('Note on this project');
  }

  const priorHistory = (existing.content || '').match(EDIT_HISTORY_RE) ?? [];
  const oldCurrentText = (existing.content || '').replace(EDIT_HISTORY_RE, '').trim();
  // Both legs escaped: the superseded text (as the original did) and the
  // replacement (which the original left raw). Only the `ch-hist` wrapper we
  // generate ourselves is real markup.
  const newContent =
    priorHistory.join('') +
    `<div class="ch-hist"><del>${escapeHtml(oldCurrentText)}</del></div>` +
    escapeHtml(content.trim());

  const updated = await frappe.updateDoc('Comment', c.req.param('commentId'), {
    content: newContent,
  });
  return c.json(updated);
});

export default app;
