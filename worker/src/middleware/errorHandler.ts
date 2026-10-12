import type { Context } from 'hono';
import { ZodError } from 'zod';
import { AppError, FrappeError } from '../lib/errors';
import type { AppEnv } from '../types';

/**
 * One place that turns a thrown error into an HTTP response.
 *
 * The old Express version repeated a try/catch with the same
 * `res.status(err.status || 500).json({ error, details })` shape in every
 * single route handler. Hono's onError does it once.
 */
/**
 * ERPNext answers that are normal and are not logged: nobody is signed in, the
 * studio's own roles said no, the document is not there.
 */
const QUIET_STATUSES = new Set([401, 403, 404]);

/** The longest reason that goes in one log line. */
const REASON_LIMIT = 400;

/**
 * The reason that ERPNext gave, for the log.
 *
 * On 2026-10-04 production answered 417 on two pages and the log held the
 * status and nothing more. The reason -- `Field not permitted in query:
 * custom_sales_person` -- was in the body of the response, and the only place
 * to read it was the developer tools of the browser of the person who saw the
 * fault, at the moment they saw it. docs/INCIDENT-2026-10-04-schema-skew.md,
 * section 6.1.
 *
 * It is the `exception` text of ERPNext, cut short. It names a field, a
 * DocType or a rule. It is not the request, and it holds no token.
 */
function erpnextReason(details: unknown): string {
  const d = details as { exception?: unknown; message?: unknown } | string | null | undefined;
  const raw =
    typeof d === 'string'
      ? d
      : typeof d?.exception === 'string'
        ? d.exception
        : typeof d?.message === 'string'
          ? d.message
          : '(no reason in the answer)';
  const oneLine = raw.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  return oneLine.length > REASON_LIMIT ? `${oneLine.slice(0, REASON_LIMIT)}…` : oneLine;
}

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
    if (err instanceof FrappeError && !QUIET_STATUSES.has(status)) {
      console.error(
        `ERPNext refused: ${status} ${c.req.method} ${c.req.path} -- ${erpnextReason(err.details)}`,
      );
    }
    return c.json({ error: err.message, details: err.details }, status as 400);
  }

  // Anything else is a real bug. Log it, but don't leak internals.
  console.error('Unhandled error:', err);
  return c.json({ error: 'Internal server error' }, 500);
}
