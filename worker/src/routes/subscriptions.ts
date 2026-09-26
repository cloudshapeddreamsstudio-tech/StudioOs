import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client';
import { subscriptions } from '../db/schema';
import { monthlyAmount } from '../lib/rentalBilling';
import { NotFoundError } from '../lib/errors';
import type { AppEnv } from '../types';

/**
 * Recurring studio overheads that aren't per-project crew costs — AI and
 * software subscriptions, wifi, the electricity bill on the property the studio
 * is built on. Visibility only: what recurs, how much, and when it is next due.
 *
 * Ported from `server/routes/subscriptions.js`.
 */

const app = new Hono<AppEnv>();

const createSchema = z.object({
  name: z.string().min(1, 'name is required'),
  amount: z.coerce.number(),
  category: z.string().optional(),
  vendor: z.string().optional(),
  currency: z.string().optional(),
  cycle: z.string().optional(),
  nextDue: z.string().optional(),
  paymentMode: z.string().optional(),
  billedTo: z.string().optional(),
  active: z.boolean().optional(),
  notes: z.string().optional(),
});

const updateSchema = createSchema.partial();

/**
 * GET /api/subscriptions — all of them, plus monthly/yearly totals for the
 * active ones.
 *
 * Totals stay **grouped by currency**. The studio pays for some things in USD
 * and some in INR, and this app has no FX rate — inventing one to produce a
 * single headline number would be guessing at money.
 */
app.get('/', async (c) => {
  const subs = await db(c.env).select().from(subscriptions);

  const totals: Record<string, { monthly: number; yearly: number }> = {};
  for (const s of subs.filter((x) => x.active)) {
    const cur = s.currency || 'INR';
    const bucket = (totals[cur] ??= { monthly: 0, yearly: 0 });
    const m = monthlyAmount(s);
    bucket.monthly += m;
    bucket.yearly += m * 12;
  }

  return c.json({
    subscriptions: subs,
    totals,
    activeCount: subs.filter((s) => s.active).length,
  });
});

/** POST /api/subscriptions */
app.post('/', async (c) => {
  const b = createSchema.parse(await c.req.json());

  const sub = {
    id: `sub-${Date.now()}`,
    name: b.name,
    category: b.category || 'Other',
    vendor: b.vendor ?? '',
    amount: Number(b.amount) || 0,
    currency: b.currency || 'INR',
    cycle: b.cycle || 'Monthly',
    nextDue: b.nextDue ?? '',
    paymentMode: b.paymentMode || 'Card',
    billedTo: b.billedTo ?? '',
    // Defaults to active unless explicitly set false, matching the original.
    active: b.active !== false,
    notes: b.notes ?? '',
    createdAt: new Date().toISOString().slice(0, 10),
  };

  await db(c.env).insert(subscriptions).values(sub);
  return c.json(sub);
});

/** PUT /api/subscriptions/:id — also how a subscription is paused or resumed. */
app.put('/:id', async (c) => {
  const id = c.req.param('id');
  const b = updateSchema.parse(await c.req.json());

  const patch: Record<string, unknown> = {};
  if (b.name !== undefined) patch.name = b.name;
  if (b.category !== undefined) patch.category = b.category;
  if (b.vendor !== undefined) patch.vendor = b.vendor;
  if (b.amount !== undefined) patch.amount = Number(b.amount) || 0;
  if (b.currency !== undefined) patch.currency = b.currency;
  if (b.cycle !== undefined) patch.cycle = b.cycle;
  if (b.nextDue !== undefined) patch.nextDue = b.nextDue;
  if (b.paymentMode !== undefined) patch.paymentMode = b.paymentMode;
  if (b.billedTo !== undefined) patch.billedTo = b.billedTo;
  if (b.active !== undefined) patch.active = b.active;
  if (b.notes !== undefined) patch.notes = b.notes;

  const updated = await db(c.env)
    .update(subscriptions)
    .set(patch)
    .where(eq(subscriptions.id, id))
    .returning();

  if (!updated.length) throw new NotFoundError('Subscription');
  return c.json(updated[0]);
});

/** DELETE /api/subscriptions/:id */
app.delete('/:id', async (c) => {
  const deleted = await db(c.env)
    .delete(subscriptions)
    .where(eq(subscriptions.id, c.req.param('id')))
    .returning({ id: subscriptions.id });

  if (!deleted.length) throw new NotFoundError('Subscription');
  return c.json({ deleted: true });
});

export default app;
