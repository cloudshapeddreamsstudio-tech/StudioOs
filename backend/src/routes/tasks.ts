import { Hono } from 'hono';
import { z } from 'zod';
import { createFrappeClient } from '../lib/frappe';
import { cleanFrappeError } from '../lib/frappeError';
import { AppError, ValidationError } from '../lib/errors';
import type { AppEnv } from '../types';

/**
 * Tasks — the project checklist and the Kanban board.
 * Ported from `server/routes/tasks.js`.
 */

const app = new Hono<AppEnv>();

const createTaskSchema = z.object({
  project: z.string().min(1, 'project is required'),
  subject: z.string().trim().min(1, 'subject is required'),
  exp_end_date: z.string().nullable().optional(),
  is_milestone: z.boolean().optional(),
  parent_task: z.string().optional(),
});

const updateTaskSchema = z
  .object({
    status: z.string(),
    subject: z.string(),
    exp_end_date: z.string().nullable(),
    is_milestone: z.boolean(),
  })
  .partial();

/** Re-throws an ERPNext failure with its real message dug out of the HTML. */
function rethrowClean(err: unknown): never {
  const status = (err as { status?: number }).status ?? 500;
  throw new AppError(cleanFrappeError(err), status, (err as { data?: unknown }).data);
}

/**
 * GET /api/tasks — real (non-template) actionable tasks for the Kanban board.
 *
 * Excludes `is_group=1` phase headers (e.g. "AF - Pre-Production"): those are
 * organisational, not something to drag across board columns.
 */
app.get('/', async (c) => {
  const frappe = createFrappeClient(c.env);
  const data = await frappe.getList<{ is_group: number }>('Task', {
    fields: [
      'name',
      'subject',
      'project',
      'status',
      'priority',
      'exp_start_date',
      'exp_end_date',
      'is_milestone',
      'is_group',
    ],
    filters: [['is_template', '=', 0]],
    limit: 500,
    orderBy: 'exp_end_date asc',
  });
  return c.json(data.filter((t) => !t.is_group));
});

/**
 * POST /api/tasks — add a task to a project's checklist directly (not from a
 * template). Optionally nested under a phase group via `parent_task` so it
 * shows up grouped correctly on the Checklist tab.
 */
app.post('/', async (c) => {
  const frappe = createFrappeClient(c.env);
  const body = createTaskSchema.parse(await c.req.json());

  try {
    const data = await frappe.createDoc('Task', {
      project: body.project,
      subject: body.subject.trim(),
      status: 'Open',
      exp_end_date: body.exp_end_date || null,
      is_milestone: body.is_milestone ? 1 : 0,
      parent_task: body.parent_task || undefined,
    });
    return c.json(data);
  } catch (err) {
    rethrowClean(err);
  }
});

/**
 * PUT /api/tasks/:name — quick status change (Kanban card menu, Checklist
 * checkbox) or a full edit of subject/date/milestone.
 */
app.put('/:name', async (c) => {
  const frappe = createFrappeClient(c.env);
  const name = c.req.param('name');
  const body = updateTaskSchema.parse(await c.req.json());

  const patch: Record<string, unknown> = {};
  if (body.status !== undefined) patch.status = body.status;
  if (body.subject !== undefined) patch.subject = body.subject;
  if (body.exp_end_date !== undefined) patch.exp_end_date = body.exp_end_date || null;
  if (body.is_milestone !== undefined) patch.is_milestone = body.is_milestone ? 1 : 0;

  if (!Object.keys(patch).length) throw new ValidationError('nothing to update');

  // Fetch the pre-update task when a status change is happening, so the
  // Timeline note can name the task and its project even when the caller only
  // sends { status }.
  let priorTask: { status?: string; subject?: string; project?: string } | null = null;
  if (body.status !== undefined) {
    priorTask = await frappe
      .getDoc<{ status: string; subject: string; project: string }>('Task', name)
      .catch(() => null);
  }

  let data: unknown;
  try {
    data = await frappe.updateDoc('Task', name, patch);
  } catch (err) {
    rethrowClean(err);
  }

  /**
   * Log a Timeline (Comment) entry whenever status actually changes.
   *
   * Critical ordering rule, preserved exactly: this Comment is created with NO
   * explicit timestamp, so ERPNext stamps its own `creation` from the server's
   * real clock at the moment the request executes — never the task's due date,
   * never anything client-supplied. Even when the owner is retroactively
   * catching up on a task actually finished days ago, the Timeline entry
   * reflects the real moment it was recorded, and the project Activity feed
   * sorts by that. So the feed is always in true forward chronological order.
   */
  if (priorTask && body.status !== undefined && priorTask.status !== body.status && priorTask.project) {
    const subjectForNote = body.subject !== undefined ? body.subject : priorTask.subject;
    await frappe
      .createDoc('Comment', {
        comment_type: 'Comment',
        reference_doctype: 'Project',
        reference_name: priorTask.project,
        content: `Task '${subjectForNote}' marked ${body.status}`,
      })
      .catch((err: Error) =>
        console.error(`task status Timeline log failed for ${name}:`, err.message),
      );
  }

  return c.json(data);
});

/** DELETE /api/tasks/:name — remove a task from the checklist. */
app.delete('/:name', async (c) => {
  const frappe = createFrappeClient(c.env);
  await frappe.deleteDoc('Task', c.req.param('name'));
  return c.json({ deleted: true });
});

export default app;
