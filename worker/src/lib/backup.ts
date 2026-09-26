import type { Env } from '../types';

/**
 * Off-box backup of the D1 ledgers.
 *
 * This exists because of a specific failure the old app was one bad day away
 * from: its ledgers lived only in flat JSON inside a git repo with no remote,
 * on one laptop. Those tables hold studio rental sessions, transactions, crew
 * rosters and expenses — none of which exist anywhere in ERPNext. Losing them
 * loses them permanently.
 *
 * The dump is plain JSON, not a SQL dump, deliberately: it must be readable and
 * re-importable by hand at 2am without any tooling being available.
 */

/** Every table that holds data the studio cannot recover from ERPNext. */
const TABLES = [
  'expenses',
  'crew_entries',
  'subscriptions',
  'transactions',
  'rental_bookings',
  'rental_sessions',
  'brand',
] as const;

export interface BackupResult {
  key: string;
  bytes: number;
  rowCounts: Record<string, number>;
  skipped?: string;
}

export async function backupLedgers(env: Env, now = new Date()): Promise<BackupResult> {
  const dump: Record<string, unknown[]> = {};
  const rowCounts: Record<string, number> = {};

  for (const table of TABLES) {
    // Table names are from the constant above, never from input.
    const { results } = await env.DB.prepare(`SELECT * FROM ${table}`).all();
    dump[table] = results ?? [];
    rowCounts[table] = results?.length ?? 0;
  }

  const body = JSON.stringify(
    { takenAt: now.toISOString(), rowCounts, tables: dump },
    null,
    2,
  );

  const key = `d1/studioos-${now.toISOString().slice(0, 10)}.json`;

  /**
   * If the bucket isn't bound yet the dump still gets built and counted, so the
   * log line proves the job ran and what it would have written. A backup that
   * silently does nothing is worse than no backup at all, because it is
   * believed.
   */
  if (!env.BACKUPS) {
    return {
      key,
      bytes: body.length,
      rowCounts,
      skipped: 'R2 bucket BACKUPS is not bound — nothing was written',
    };
  }

  await env.BACKUPS.put(key, body, {
    httpMetadata: { contentType: 'application/json' },
  });

  return { key, bytes: body.length, rowCounts };
}
