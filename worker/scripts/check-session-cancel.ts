/**
 * End-to-end check for H2: a session can be cancelled.
 *
 * A sealed cookie cannot be cancelled. After sign-out, a copy of the cookie
 * still says who you are, because the Worker trusts the cookie itself. With
 * sessions in D1, sign-out deletes the row and the copy is worthless.
 *
 * Needs a real signed-in cookie, so it cannot run in `bun test`:
 *
 *   1. Sign in at http://localhost:8787 in a browser.
 *   2. DevTools > Application > Cookies > http://localhost:8787. Copy the value
 *      of `studioos_session` into worker/.test-cookie (git ignores it).
 *   3. bun run worker/scripts/check-session-cancel.ts [origin]
 *
 * It signs that session out, so sign in again afterwards.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const origin = (process.argv[2] ?? 'http://localhost:8787').replace(/\/$/, '');
const value = readFileSync(join(import.meta.dir, '..', '.test-cookie'), 'utf8').trim();
const cookie = `studioos_session=${value}`;

const me = () => fetch(`${origin}/auth/me`, { headers: { cookie } });
const api = () => fetch(`${origin}/api/projects`, { headers: { cookie } });

const before = await me();
if (before.status !== 200) {
  console.log(`SETUP  /auth/me answered ${before.status} before sign-out. Copy a fresh cookie.`);
  process.exit(2);
}
console.log(`ok    before sign-out, /auth/me knows ${((await before.json()) as { user: string }).user}`);

await fetch(`${origin}/auth/logout`, { method: 'POST', headers: { cookie } });

let failed = 0;
for (const [name, res] of [
  ['/auth/me', await me()],
  ['/api/projects', await api()],
] as const) {
  const ok = res.status === 401;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  after sign-out, a copy of the cookie on ${name} is ${res.status}, expected 401`);
}
process.exit(failed ? 1 : 0);
