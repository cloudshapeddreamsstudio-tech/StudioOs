import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client';
import { transactions } from '../db/schema';
import { NotFoundError } from '../lib/errors';
import type { AppEnv } from '../types';

/**
 * A lightweight, non-ERPNext transaction ledger for business lines the studio
 * tracks without putting them through formal accounting — Theatre Education
 * (JSPM Theatre Club, Ghar Founders Day) being the main one.
 *
 * Ported from `server/routes/transactions.js`. One change: the JSON store kept
 * its own `nextId` counter because a flat file has no sequence. SQLite has one,
 * so the counter is gone and the primary key autoincrements — existing integer
 * ids were preserved on import, so nothing renumbered.
 */

const app = new Hono<AppEnv>();

const createSchema = z.object({
  project: z.string().min(1, 'project is required'),
  date: z.string().min(1, 'date is required'),
  amount: z.coerce.number(),
  direction: z.enum(['income', 'expense'], {
    errorMap: () => ({ message: "direction must be 'income' or 'expense'" }),
  }),
  type: z.string().optional(),
  description: z.string().optional(),
  mode: z.string().optional(),
  source: z.string().optional(),
});

const updateSchema = createSchema.partial();

/** GET /api/transactions?project=PROJ-0029 */
app.get('/', async (c) => {
  const project = c.req.query('project');
  const conn = db(c.env);

  const rows = project
    ? await conn.select().from(transactions).where(eq(transactions.project, project))
    : await conn.select().from(transactions);

  /**
   * Totals are computed here rather than in the browser so every caller gets
   * the same arithmetic. Direction decides the sign — an "expense" row stores a
   * positive amount, exactly as the old ledger did.
   */
  const income = rows
    .filter((t) => t.direction === 'income')
    .reduce((s, t) => s + Number(t.amount || 0), 0);
  const expense = rows
    .filter((t) => t.direction === 'expense')
    .reduce((s, t) => s + Number(t.amount || 0), 0);

  return c.json({
    transactions: rows,
    totals: { income, expense, net: income - expense, count: rows.length },
  });
});

/** POST /api/transactions */
app.post('/', async (c) => {
  const b = createSchema.parse(await c.req.json());

  const entry = {
    project: b.project,
    date: b.date,
    amount: Number(b.amount) || 0,
    direction: b.direction,
    type: b.type || 'other',
    description: b.description ?? '',
    mode: b.mode || 'Banking',
    source: b.source || 'manual',
  };

  const created = await db(c.env).insert(transactions).values(entry).returning();
  return c.json(created[0]);
});

/** PUT /api/transactions/:id */
app.put('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isFinite(id)) throw new NotFoundError('Transaction');

  const b = updateSchema.parse(await c.req.json());
  const patch: Record<string, unknown> = {};

  if (b.project !== undefined) patch.project = b.project;
  if (b.date !== undefined) patch.date = b.date;
  if (b.amount !== undefined) patch.amount = Number(b.amount) || 0;
  if (b.direction !== undefined) patch.direction = b.direction;
  if (b.type !== undefined) patch.type = b.type;
  if (b.description !== undefined) patch.description = b.description;
  if (b.mode !== undefined) patch.mode = b.mode;
  if (b.source !== undefined) patch.source = b.source;

  const updated = await db(c.env)
    .update(transactions)
    .set(patch)
    .where(eq(transactions.id, id))
    .returning();

  if (!updated.length) throw new NotFoundError('Transaction');
  return c.json(updated[0]);
});

/** DELETE /api/transactions/:id */
app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isFinite(id)) throw new NotFoundError('Transaction');

  const deleted = await db(c.env)
    .delete(transactions)
    .where(eq(transactions.id, id))
    .returning({ id: transactions.id });

  if (!deleted.length) throw new NotFoundError('Transaction');
  return c.json({ ok: true });
});

export default app;
