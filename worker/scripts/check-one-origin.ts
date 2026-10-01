/**
 * End-to-end check for H1: one Worker, one origin.
 *
 *   bun run start            # terminal one: builds the SPA, starts the Worker
 *   bun run worker/scripts/check-one-origin.ts [origin]
 *
 * Runs in Bun, against a running Worker. It is not part of `bun test`, because
 * it needs the network and a server.
 *
 * Checks 2 and 3 guard `run_worker_first` in wrangler.jsonc from both sides.
 * Check 3 is the failure SEAM.md section 8 warns about: the OAuth callback is a
 * browser navigation, and if index.html answers it, sign-in fails with no log
 * line. Under wrangler 4.144 locally, removing the line made check 2 fail
 * instead (a deep link got the Worker's 404).
 */
const origin = (process.argv[2] ?? 'http://localhost:8787').replace(/\/$/, '');

type Check = { name: string; run: () => Promise<string | null> };

const nav = { 'Sec-Fetch-Mode': 'navigate', Accept: 'text/html' };
const isSpa = (body: string) => /<div id="root"/.test(body);

const checks: Check[] = [
  {
    name: 'GET /api/health is JSON from the Worker',
    run: async () => {
      const r = await fetch(`${origin}/api/health`);
      const j = (await r.json().catch(() => null)) as { ok?: boolean } | null;
      return j?.ok === true ? null : `status ${r.status}, body was not {ok:true}`;
    },
  },
  {
    name: 'GET /projects (SPA deep link) is index.html',
    run: async () => {
      const r = await fetch(`${origin}/projects`, { headers: nav });
      return isSpa(await r.text()) ? null : `status ${r.status}, no SPA root in the body`;
    },
  },
  {
    name: 'GET /auth/callback as a navigation reaches the Worker, not index.html',
    run: async () => {
      const r = await fetch(`${origin}/auth/callback?code=x&state=y`, {
        headers: nav,
        redirect: 'manual',
      });
      const body = await r.text();
      return isSpa(body) ? 'got index.html: run_worker_first is missing' : null;
    },
  },
  {
    name: 'GET /api/projects with no cookie is 401, not HTML',
    run: async () => {
      const r = await fetch(`${origin}/api/projects`, { headers: nav });
      return r.status === 401 ? null : `status ${r.status}`;
    },
  },
  {
    name: 'GET /auth/start with no site redirects to a relative /sign-in on this origin',
    run: async () => {
      const r = await fetch(`${origin}/auth/start`, { headers: nav, redirect: 'manual' });
      const to = r.headers.get('location') ?? '';
      return r.status === 302 && to.startsWith('/sign-in?') ? null : `status ${r.status}, location "${to}"`;
    },
  },
];

let failed = 0;
for (const c of checks) {
  const problem = await c.run().catch((e) => `threw: ${e.message}`);
  console.log(`${problem ? 'FAIL' : 'ok  '}  ${c.name}${problem ? `\n      ${problem}` : ''}`);
  if (problem) failed++;
}
process.exit(failed ? 1 : 0);
