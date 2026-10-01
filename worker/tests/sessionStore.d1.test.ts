import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getPlatformProxy } from 'wrangler';
import {
  insertSession,
  readSessionById,
  endEverySessionOfOwner,
  endAllSessionsOf,
  REVOKE_TIMEOUT_MS,
  type StoreEnv,
} from '../src/kernel/auth';
import { putTenant } from '../src/lib/tenants';
import type { Session } from '../src/lib/session';

/**
 * kernel/auth against a real D1: the local workerd SQLite that `bun run dev`
 * uses, in memory, gone when the test ends. No network beyond 127.0.0.1, where
 * the fake ERPNext sites below listen.
 *
 * H2b: one request ends every session of a person, in each browser. Each
 * session holds its own ERPNext token (ADR-0003 condition 8), so each one is
 * revoked. A revocation that fails or hangs never stops the sign-out.
 */

const KEY = btoa(String.fromCharCode(...new Uint8Array(32).fill(5)));

let proxy: Awaited<ReturnType<typeof getPlatformProxy<{ DB: D1Database; TENANTS: KVNamespace }>>>;
let env: StoreEnv;

/** A fake ERPNext that records the token of each revoke_token call. */
const revoked: string[] = [];
let erp: ReturnType<typeof Bun.serve>;
/** A fake ERPNext that accepts the connection and never answers. */
let hang: ReturnType<typeof Bun.serve>;

beforeAll(async () => {
  proxy = await getPlatformProxy<{ DB: D1Database; TENANTS: KVNamespace }>({
    configPath: join(import.meta.dir, '..', 'wrangler.jsonc'),
    persist: false,
  });
  env = { DB: proxy.env.DB, TENANTS: proxy.env.TENANTS, SESSION_KEY: KEY, REGISTRY_KEY: KEY };

  erp = Bun.serve({
    port: 0,
    async fetch(req) {
      revoked.push(new URLSearchParams(await req.text()).get('token') ?? '');
      return Response.json({ message: 'ok' });
    },
  });
  hang = Bun.serve({ port: 0, fetch: () => new Promise<Response>(() => {}) });
}, 60_000);

afterAll(async () => {
  erp?.stop(true);
  hang?.stop(true);
  await proxy?.dispose();
});

beforeEach(async () => {
  // A fresh schema each test, from the migration that production applies.
  for (const t of ['erp_token', 'session', 'user', 'studio']) {
    await env.DB.prepare(`DROP TABLE IF EXISTS ${t}`).run();
  }
  const sql = readFileSync(join(import.meta.dir, '..', 'migrations', '0000_sessions.sql'), 'utf8');
  const statements = sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
  for (const s of statements) await env.DB.prepare(s).run();
  revoked.length = 0;
});

function session(host: string, user: string, token: string): Session {
  return {
    host,
    user,
    accessToken: token,
    refreshToken: `refresh-${token}`,
    accessExpiresAt: Math.floor(Date.now() / 1000) + 3600,
  };
}

const live = async (id: string) => (await readSessionById(env, id)) !== null;

describe('endEverySessionOfOwner (POST /auth/logout-all)', () => {
  it('ends every session of the same person on the same studio, and no other', async () => {
    const laptop = await insertSession(env, session('a.example', 'alice', 'tok-laptop'));
    const phone = await insertSession(env, session('a.example', 'alice', 'tok-phone'));
    const bob = await insertSession(env, session('a.example', 'bob', 'tok-bob'));
    // The same ERPNext user id on a different studio is a different person
    // (ADR-0003 condition 7).
    const aliceElsewhere = await insertSession(env, session('b.example', 'alice', 'tok-b'));

    expect(await endEverySessionOfOwner(env, laptop)).toBe(2);

    expect(await live(laptop)).toBe(false);
    expect(await live(phone)).toBe(false);
    expect(await live(bob)).toBe(true);
    expect(await live(aliceElsewhere)).toBe(true);
  });

  it('deletes the ERPNext tokens with the sessions', async () => {
    const id = await insertSession(env, session('a.example', 'alice', 'tok-1'));
    await insertSession(env, session('a.example', 'alice', 'tok-2'));
    await endEverySessionOfOwner(env, id);

    const left = await env.DB.prepare('SELECT COUNT(*) AS n FROM erp_token').first<{ n: number }>();
    expect(left?.n).toBe(0);
  });

  it('ends nothing for an identifier that is not a session', async () => {
    const id = await insertSession(env, session('a.example', 'alice', 'tok-1'));
    expect(await endEverySessionOfOwner(env, 'A'.repeat(43))).toBe(0);
    expect(await live(id)).toBe(true);
  });

  it('revokes each session\'s own token at ERPNext', async () => {
    const host = `127.0.0.1:${erp.port}`;
    await putTenant(env, { host, clientId: 'c', clientSecret: 's' });
    const one = await insertSession(env, session(host, 'alice', 'tok-one'));
    await insertSession(env, session(host, 'alice', 'tok-two'));

    await endEverySessionOfOwner(env, one);

    expect(revoked.sort()).toEqual(['tok-one', 'tok-two']);
  });
});

describe('endAllSessionsOf (the operator function, no route)', () => {
  it('ends every session of one person on one studio', async () => {
    const a = await insertSession(env, session('a.example', 'alice', 't1'));
    const b = await insertSession(env, session('a.example', 'alice', 't2'));
    const bob = await insertSession(env, session('a.example', 'bob', 't3'));
    const elsewhere = await insertSession(env, session('b.example', 'alice', 't4'));

    expect(await endAllSessionsOf(env, 'a.example', 'alice')).toBe(2);

    expect(await live(a)).toBe(false);
    expect(await live(b)).toBe(false);
    expect(await live(bob)).toBe(true);
    expect(await live(elsewhere)).toBe(true);
  });

  it('finds the studio however the host was typed', async () => {
    const a = await insertSession(env, session('a.example', 'alice', 't1'));
    expect(await endAllSessionsOf(env, 'https://A.example/', 'alice')).toBe(1);
    expect(await live(a)).toBe(false);
  });

  it('ends nothing for a person or studio that has no sessions', async () => {
    const a = await insertSession(env, session('a.example', 'alice', 't1'));
    expect(await endAllSessionsOf(env, 'a.example', 'nobody')).toBe(0);
    expect(await endAllSessionsOf(env, 'z.example', 'alice')).toBe(0);
    expect(await live(a)).toBe(true);
  });
});

describe('a revocation that fails never stops the sign-out', () => {
  it('when ERPNext refuses the connection', async () => {
    // Port 9 on 127.0.0.1: nothing listens, the connection is refused.
    await putTenant(env, { host: '127.0.0.1:9', clientId: 'c', clientSecret: 's' });
    const id = await insertSession(env, session('127.0.0.1:9', 'alice', 't'));

    expect(await endAllSessionsOf(env, '127.0.0.1:9', 'alice')).toBe(1);
    expect(await live(id)).toBe(false);
  });

  it('when ERPNext never answers, it gives up after the time limit', async () => {
    const host = `127.0.0.1:${hang.port}`;
    await putTenant(env, { host, clientId: 'c', clientSecret: 's' });
    const id = await insertSession(env, session(host, 'alice', 't'));

    const started = Date.now();
    expect(await endEverySessionOfOwner(env, id)).toBe(1);
    const took = Date.now() - started;

    expect(await live(id)).toBe(false);
    expect(took).toBeLessThan(REVOKE_TIMEOUT_MS + 2_000);
  }, 15_000);
});
