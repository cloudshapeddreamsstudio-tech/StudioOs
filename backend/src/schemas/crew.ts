import { z } from 'zod';

/**
 * Request shapes for /api/project-crew.
 *
 * Same contract the D1-backed version had -- the frontend's request bodies
 * don't change even though the storage underneath now is a Purchase Order,
 * not a row in a table we owned. See routes/projectCrew.ts.
 */

export const createCrewSchema = z.object({
  project: z.string().min(1, 'project is required'),
  name: z.string().min(1, 'name is required'),
  role: z.enum(['Crew', 'Vendor']).default('Crew'),
  designation: z.string().optional(),
  rate: z.coerce.number().optional(),
  days: z.coerce.number().optional(),
  total: z.union([z.coerce.number(), z.literal('')]).optional(),
  contact: z.string().optional(),
  notes: z.string().optional(),
});

export const updateCrewSchema = z
  .object({
    role: z.enum(['Crew', 'Vendor']),
    name: z.string(),
    designation: z.string(),
    rate: z.coerce.number(),
    days: z.coerce.number(),
    total: z.union([z.coerce.number(), z.literal('')]),
    contact: z.string(),
    notes: z.string(),
  })
  .partial();

export type CreateCrewInput = z.infer<typeof createCrewSchema>;
export type UpdateCrewInput = z.infer<typeof updateCrewSchema>;
