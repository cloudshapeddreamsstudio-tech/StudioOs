import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client';
import { crewEntries } from '../db/schema';
import { NotFoundError } from '../lib/errors';
import type { AppEnv, Env } from '../types';

/**
 * A lightweight crew/vendor "roster" per project — who's booked, at what rate,
 * for how many days, and the resulting total.
 *
 * Deliberately NOT tied to ERPNext Purchase Invoices. It is an optional
 * planning layer (who do we need, what will it cost) that exists before, or
 * without, any formal bill being raised. Real invoiced spend is shown
 * separately on the Money tab. Plan and actual are independently sourced and
 * never back-filled from one another, per the studio's "never guess money"
 * rule.
 *
 * Ported from `server/routes/projectCrew.js` (projectCrew.json) to D1.
 */

const createCrewSchema = z.object({
  project: z.string().min(1, 'project is required'),
  name: z.string().min(1, 'name is required'),
  role: z.string().min(1, 'role is required'),
  designation: z.string().optional(),
  rate: z.coerce.number().optional(),
  days: z.coerce.number().optional(),
  total: z.union([z.coerce.number(), z.literal('')]).optional(),
  contact: z.string().optional(),
  notes: z.string().optional(),
});

const updateCrewSchema = z
  .object({
    role: z.string(),
    name: z.string(),
    designation: z.string(),
    rate: z.coerce.number(),
    days: z.coerce.number(),
    total: z.union([z.coerce.number(), z.literal('')]),
    contact: z.string(),
    notes: z.string(),
  })
  .partial();

/** Shared with the project-detail aggregate so that page needs only one fetch. */
export async function readCrewForProject(env: Env, project: string) {
  return db(env).select().from(crewEntries).where(eq(crewEntries.project, project));
}

const app = new Hono<AppEnv>();

/** GET /api/project-crew?project=PROJ-XXXX */
app.get('/', async (c) => {
  const project = c.req.query('project');
  const conn = db(c.env);
  const list = project
    ? await conn.select().from(crewEntries).where(eq(crewEntries.project, project))
    : await conn.select().from(crewEntries);
  return c.json(list);
});

/** POST /api/project-crew — add a crew or vendor entry. */
app.post('/', async (c) => {
  const b = createCrewSchema.parse(await c.req.json());
  const rate = Number(b.rate) || 0;
  const days = Number(b.days) || 0;

  const entry = {
    id: `crew-${Date.now()}`,
    project: b.project,
    // Anything that isn't explicitly "Vendor" is Crew — the roster only has
    // these two roles and the milestone sync depends on that being exact.
    role: b.role === 'Vendor' ? 'Vendor' : 'Crew',
    name: b.name,
    designation: b.designation ?? '',
    rate,
    days,
    /**
     * Total defaults to rate × days but can be overridden (flat-fee work,
     * negotiated discounts). Whatever is explicitly given wins.
     */
    total: b.total !== undefined && b.total !== '' ? Number(b.total) : rate * days,
    contact: b.contact ?? '',
    notes: b.notes ?? '',
    createdAt: new Date().toISOString().slice(0, 10),
  };

  await db(c.env).insert(crewEntries).values(entry);
  return c.json(entry);
});

/** PUT /api/project-crew/:id — edit an entry. */
app.put('/:id', async (c) => {
  const id = c.req.param('id');
  const b = updateCrewSchema.parse(await c.req.json());
  const conn = db(c.env);

  const existing = (await conn.select().from(crewEntries).where(eq(crewEntries.id, id)))[0];
  if (!existing) throw new NotFoundError('Crew entry');

  const patch: Record<string, unknown> = {};
  if (b.role !== undefined) patch.role = b.role === 'Vendor' ? 'Vendor' : 'Crew';
  if (b.name !== undefined) patch.name = b.name;
  if (b.designation !== undefined) patch.designation = b.designation;
  if (b.contact !== undefined) patch.contact = b.contact;
  if (b.notes !== undefined) patch.notes = b.notes;
  if (b.rate !== undefined) patch.rate = Number(b.rate) || 0;
  if (b.days !== undefined) patch.days = Number(b.days) || 0;

  /**
   * Same precedence as the original: an explicit total wins; otherwise a
   * changed rate or days recomputes it from the *new* values.
   */
  if (b.total !== undefined && b.total !== '') {
    patch.total = Number(b.total) || 0;
  } else if (b.rate !== undefined || b.days !== undefined) {
    const rate = (patch.rate as number) ?? existing.rate;
    const days = (patch.days as number) ?? existing.days;
    patch.total = rate * days;
  }

  const updated = await conn
    .update(crewEntries)
    .set(patch)
    .where(eq(crewEntries.id, id))
    .returning();

  return c.json(updated[0]);
});

/** DELETE /api/project-crew/:id */
app.delete('/:id', async (c) => {
  const deleted = await db(c.env)
    .delete(crewEntries)
    .where(eq(crewEntries.id, c.req.param('id')))
    .returning({ id: crewEntries.id });

  if (!deleted.length) throw new NotFoundError('Crew entry');
  return c.json({ deleted: true });
});

export default app;
