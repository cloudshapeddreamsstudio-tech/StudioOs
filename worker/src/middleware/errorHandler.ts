import type { Context } from 'hono';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors';
import type { AppEnv } from '../types';

/**
 * One place that turns a thrown error into an HTTP response.
 *
 * The old Express version repeated a try/catch with the same
 * `res.status(err.status || 500).json({ error, details })` shape in every
 * single route handler. Hono's onError does it once.
 */
export function errorHandler(err: Error, c: Context<AppEnv>) {
  if (err instanceof ZodError) {
    return c.json(
      { error: 'Invalid request', details: err.flatten() },
      400,
    );
  }

  if (err instanceof AppError) {
    // Upstream ERPNext statuses pass straight through, as they did before.
    const status = err.status >= 400 && err.status <= 599 ? err.status : 500;
    return c.json({ error: err.message, details: err.details }, status as 400);
  }

  // Anything else is a real bug. Log it, but don't leak internals.
  console.error('Unhandled error:', err);
  return c.json({ error: 'Internal server error' }, 500);
}
