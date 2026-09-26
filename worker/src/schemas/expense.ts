import { z } from 'zod';

/**
 * Request shapes for /api/project-expenses.
 *
 * These schemas are the API contract. The frontend imports the inferred types
 * so a field rename can't silently drift between the two halves -- which is
 * exactly what could happen in the old app, where the browser built request
 * bodies by hand and the server read them by hand.
 */

export const createExpenseSchema = z.object({
  project: z.string().min(1, 'project is required'),
  category: z.string().min(1, 'category is required'),
  amount: z.coerce.number().finite(),
  date: z.string().optional(),
  description: z.string().optional(),
  estimatedAmount: z.coerce.number().finite().optional(),
  paidBy: z.string().optional(),
  mode: z.string().optional(),
});

export const updateExpenseSchema = z
  .object({
    category: z.string().min(1),
    description: z.string(),
    amount: z.coerce.number().finite(),
    date: z.string(),
    paidBy: z.string(),
    mode: z.string(),
    estimatedAmount: z.coerce.number().finite(),
  })
  .partial();

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;
