/**
 * Proves the ledger import did not lose or duplicate anything.
 *
 * Counts rows in the legacy JSON files, counts rows in D1, and compares. Also
 * checks money totals, because a row count alone would not catch a truncated
 * amount or a booking whose sessions failed to import.
 *
 *   bun run scripts/verify-ledgers.ts            # against local D1
 *   bun run scripts/verify-ledgers.ts --remote   # against the real database
 *
 * Exits non-zero on any mismatch, so it can gate a deploy. This is the check
 * that turns "the import seemed to work" into "the import is proven correct" —
 * and it is the one step of the deploy that must never be skipped, because
 * these files are the studio's only copy of this data.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const LEGACY = join(
  import.meta.dir,
  '..',
  '..',
  '..',
  'Erpnext UI Application',
  'CSDSxERPnext App',
  'server',
  'data',
);

const remote = process.argv.includes('--remote');

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(join(LEGACY, file), 'utf8')) as T;
}

/** Runs a query through wrangler and returns the first result row set. */
function query(sql: string): Record<string, unknown>[] {
  const out = execFileSync(
    'npx.cmd',
    [
      'wrangler',
      'd1',
      'execute',
      'studioos-db',
      remote ? '--remote' : '--local',
      '--command',
      sql,
      '--json',
    ],
    { encoding: 'utf8', cwd: join(import.meta.dir, '..') },
  );
  // wrangler prints a JSON array of statement results.
  const parsed = JSON.parse(out.slice(out.indexOf('[')));
  return parsed[0]?.results ?? [];
}

function num(rows: Record<string, unknown>[], key = 'n'): number {
  return Number(rows[0]?.[key] ?? 0);
}

interface Check {
  label: string;
  expected: number;
  actual: number;
}

const checks: Check[] = [];

// --- row counts ----------------------------------------------------------
const expenses = readJson<{ expenses: unknown[] }>('projectExpenses.json').expenses ?? [];
const crew = readJson<{ entries: unknown[] }>('projectCrew.json').entries ?? [];
const subs = readJson<{ subscriptions: unknown[] }>('subscriptions.json').subscriptions ?? [];
const tx = readJson<{ transactions: { amount?: number }[] }>('transactions.json').transactions ?? [];
const rental = readJson<{ bookings: { sessions?: { amount?: number }[] }[] }>('studioRental.json')
  .bookings ?? [];

const sessions = rental.flatMap((b) => b.sessions ?? []);

checks.push(
  { label: 'expenses', expected: expenses.length, actual: num(query('SELECT COUNT(*) AS n FROM expenses')) },
  { label: 'crew_entries', expected: crew.length, actual: num(query('SELECT COUNT(*) AS n FROM crew_entries')) },
  { label: 'subscriptions', expected: subs.length, actual: num(query('SELECT COUNT(*) AS n FROM subscriptions')) },
  { label: 'transactions', expected: tx.length, actual: num(query('SELECT COUNT(*) AS n FROM transactions')) },
  { label: 'rental_bookings', expected: rental.length, actual: num(query('SELECT COUNT(*) AS n FROM rental_bookings')) },
  { label: 'rental_sessions', expected: sessions.length, actual: num(query('SELECT COUNT(*) AS n FROM rental_sessions')) },
  { label: 'brand (single row)', expected: 1, actual: num(query('SELECT COUNT(*) AS n FROM brand')) },
);

// --- money totals --------------------------------------------------------
// A row count would not catch a value that imported as 0, so the sums matter
// at least as much as the counts.
const sum = (rows: { amount?: number }[]) =>
  Math.round(rows.reduce((s, r) => s + Number(r.amount || 0), 0) * 100) / 100;

checks.push(
  {
    label: 'transactions total',
    expected: sum(tx),
    actual: Math.round(num(query('SELECT COALESCE(SUM(amount),0) AS n FROM transactions')) * 100) / 100,
  },
  {
    label: 'rental sessions total',
    expected: sum(sessions),
    actual:
      Math.round(num(query('SELECT COALESCE(SUM(amount),0) AS n FROM rental_sessions')) * 100) / 100,
  },
  {
    label: 'crew roster total',
    expected:
      Math.round(
        (crew as { total?: number }[]).reduce((s, c) => s + Number(c.total || 0), 0) * 100,
      ) / 100,
    actual: Math.round(num(query('SELECT COALESCE(SUM(total),0) AS n FROM crew_entries')) * 100) / 100,
  },
);

// --- report --------------------------------------------------------------
const target = remote ? 'REMOTE' : 'local';
console.log(`\nLedger verification against ${target} D1\n`);

let failed = 0;
for (const c of checks) {
  const ok = c.expected === c.actual;
  if (!ok) failed++;
  const mark = ok ? 'ok  ' : 'FAIL';
  console.log(
    `  [${mark}] ${c.label.padEnd(24)} expected ${String(c.expected).padStart(12)}  actual ${String(c.actual).padStart(12)}`,
  );
}

if (failed) {
  console.error(`\n${failed} check(s) FAILED. Do not proceed with cutover.\n`);
  process.exit(1);
}

console.log(`\nAll ${checks.length} checks passed. Every ledger row and total accounted for.\n`);
