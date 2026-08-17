import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { expenses } from '../db/schema';
import { createExpenseSchema, updateExpenseSchema } from '../schemas/expense';
import { NotFoundError } from '../lib/errors';
import type { AppEnv, Env } from '../types';

/**
 * Granular per-project out-of-pocket expenses that don't warrant a formal
 * ERPNext Purchase Invoice: transport, food, props, location fees. Shown on
 * the project's Expenses tab, and they reduce its "budget remaining".
 *
 * Ported from `server/routes/projectExpenses.js`, which kept these in
 * `data/projectExpenses.json`. The API shape is unchanged; the storage is not.
 *
 * The old version did read-file -> mutate-array -> write-whole-file on every
 * mutation. Two things were wrong with that, and both are gone here:
 *
 *   1. `fs.writeFileSync` truncates before it writes, so a crash mid-write
 *      left a corrupt or empty ledger -- losing every expense, not just the
 *      one being saved.
 *   2. The read-modify-write was only safe because the sync fs calls happened
 *      to block Node's single thread. Anyone "modernising" it to
 *      `fs.promises` would have silently introduced lost updates.
 *
 * D1 gives us a real single-row write for a single-row change.
 */

/** Shared with the project-detail aggregate so that page needs only one fetch. */
export async function readExpensesForProject(env: Env, project: string) {
  return db(env).select().from(expenses).where(eq(expenses.project, project));
}

const app = new Hono<AppEnv>();

/** GET /api/project-expenses?project=PROJ-XXXX
 *  Lists expenses, with per-category totals and a grand total. */
app.get('/', async (c) => {
  const project = c.req.query('project');
  const conn = db(c.env);

  const list = project
    ? await conn.select().from(expenses).where(eq(expenses.project, project))
    : await conn.select().from(expenses);

  const byCategory: Record<string, number> = {};
  let total = 0;
  for (const e of list) {
    const cat = e.category || 'Other';
    byCategory[cat] = (byCategory[cat] || 0) + Number(e.amount || 0);
    total += Number(e.amount || 0);
  }

  return c.json({ expenses: list, byCategory, total });
});

/** POST /api/project-expenses -- add an expense. */
app.post('/', async (c) => {
  const body = createExpenseSchema.parse(await c.req.json());
  const today = new Date().toISOString().slice(0, 10);

  const expense = {
    id: `exp-${Date.now()}`,
    project: body.project,
    date: body.date || today,
    category: body.category,
    description: body.description ?? '',
    amount: Number(body.amount) || 0,
    /**
     * Planned/estimated amount for this entry, driving the Expense Overview
     * table's Planned column. Never back-filled from `amount` -- plan and
     * actual are independently sourced, per the "never guess money" rule.
     */
    estimatedAmount: Number(body.estimatedAmount) || 0,
    paidBy: body.paidBy ?? '',
    mode: body.mode || 'Cash',
    createdAt: today,
  };

  await db(c.env).insert(expenses).values(expense);
  return c.json(expense);
});

/** PUT /api/project-expenses/:id -- edit an expense. */
app.put('/:id', async (c) => {
  const id = c.req.param('id');
  const body = updateExpenseSchema.parse(await c.req.json());
  const conn = db(c.env);

  const patch: Record<string, unknown> = {};
  if (body.category !== undefined) patch.category = body.category;
  if (body.description !== undefined) patch.description = body.description;
  if (body.date !== undefined) patch.date = body.date;
  if (body.paidBy !== undefined) patch.paidBy = body.paidBy;
  if (body.mode !== undefined) patch.mode = body.mode;
  if (body.amount !== undefined) patch.amount = Number(body.amount) || 0;
  if (body.estimatedAmount !== undefined) {
    patch.estimatedAmount = Number(body.estimatedAmount) || 0;
  }

  const updated = await conn
    .update(expenses)
    .set(patch)
    .where(eq(expenses.id, id))
    .returning();

  if (!updated.length) throw new NotFoundError('Expense');
  return c.json(updated[0]);
});

/** DELETE /api/project-expenses/:id */
app.delete('/:id', async (c) => {
  const deleted = await db(c.env)
    .delete(expenses)
    .where(eq(expenses.id, c.req.param('id')))
    .returning({ id: expenses.id });

  if (!deleted.length) throw new NotFoundError('Expense');
  return c.json({ deleted: true });
});

export default app;
