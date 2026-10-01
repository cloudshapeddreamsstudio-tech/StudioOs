/**
 * End-to-end check for H2b: sign out everywhere.
 *
 * A test with one cookie cannot prove this. Sign in from TWO browsers (for
 * example Chrome and Edge), so the same person has two sessions. Then:
 *
 *   1. Copy `studioos_session` from browser one into worker/.test-cookie
 *   2. Copy `studioos_session` from browser two into worker/.test-cookie-2
 *   3. bun run worker/scripts/check-sign-out-everywhere.ts [origin]
 *
 * It calls POST /auth/logout-all with the FIRST cookie only, then proves the
 * SECOND browser is signed out too. Both browsers must sign in again after.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const origin = (process.argv[2] ?? 'http://localhost:8787').replace(/\/$/, '');
const read = (name: string) => readFileSync(join(import.meta.dir, '..', name), 'utf8').trim();
const one = `studioos_session=${read('.test-cookie')}`;
const two = `studioos_session=${read('.test-cookie-2')}`;

const me = (cookie: string) => fetch(`${origin}/auth/me`, { headers: { cookie } });

for (const [name, cookie] of [['browser one', one], ['browser two', two]] as const) {
  const r = await me(cookie);
  if (r.status !== 200) {
    console.log(`SETUP  ${name}: /auth/me answered ${r.status}. Sign in there and copy a fresh cookie.`);
    process.exit(2);
  }
  console.log(`ok    before: ${name} is signed in as ${((await r.json()) as { user: string }).user}`);
}
if (one === two) {
  console.log('SETUP  both files hold the same cookie. Use two different browsers.');
  process.exit(2);
}

const res = await fetch(`${origin}/auth/logout-all`, { method: 'POST', headers: { cookie: one } });
const body = (await res.json().catch(() => ({}))) as { sessionsEnded?: number };
console.log(`info  POST /auth/logout-all with browser one: ${res.status}, sessionsEnded=${body.sessionsEnded}`);

let failed = 0;
for (const [name, cookie] of [['browser one', one], ['browser two', two]] as const) {
  for (const path of ['/auth/me', '/api/projects']) {
    const r = await fetch(`${origin}${path}`, { headers: { cookie } });
    const ok = r.status === 401;
    if (!ok) failed++;
    console.log(`${ok ? 'ok  ' : 'FAIL'}  after: ${name} on ${path} is ${r.status}, expected 401`);
  }
}
process.exit(failed ? 1 : 0);
