import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema';
import type { Env } from '../types';

/**
 * A Drizzle handle over the request's D1 binding.
 *
 * Workers have no long-lived connection pool -- the binding is handed to us
 * per request, so this is called per request. It is cheap; there is no socket
 * to open.
 */
export function db(env: Env) {
  return drizzle(env.DB, { schema });
}

export type Db = ReturnType<typeof db>;
