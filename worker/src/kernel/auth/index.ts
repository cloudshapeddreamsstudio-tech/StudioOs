import type { Context } from 'hono';
import { encryptString, decryptString } from '../../lib/crypto';
import {
  sessionCookie,
  clearSessionCookie,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  type Session,
} from '../../lib/session';
import { getTenant, normaliseHost } from '../../lib/tenants';
import {
  newSessionId,
  isWellFormedSessionId,
  hashSessionId,
  sessionExpired,
} from './sessionId';
import type { AppEnv, Env } from '../../types';

/**
 * The one place that reads and writes a signed-in session.
 *
 * No route touches the session cookie or a session table directly. A route
 * asks this module who the person is, and gets the studio, the ERPNext user and
 * the ERPNext tokens back. See docs/adr/0003-how-sessions-are-stored.md.
 *
 * A session is a row in D1. The cookie holds a random identifier and nothing
 * else; D1 holds its SHA-256, and the ERPNext tokens encrypted with
 * SESSION_KEY. To delete the row cancels the session on the next request --
 * which a sealed cookie could never do.
 *
 * This module says who the person is. It never says what they may see. That is
 * ERPNext's decision, made on the token, on every request.
 *
 * Two layers. The functions that take `env` do the storage work and are tested
 * against a real local D1 (tests/sessionStore.d1.test.ts). The functions that
 * take a Hono context add the cookie and nothing else.
 */

type Ctx = Context<AppEnv>;

/** What the session store needs from the Worker's bindings. */
export type StoreEnv = Pick<Env, 'DB' | 'SESSION_KEY' | 'TENANTS' | 'REGISTRY_KEY'>;

/**
 * How long a revocation at ERPNext may take before StudioOS stops waiting.
 * Revocation is best effort; a site that hangs must not hang the sign-out.
 */
export const REVOKE_TIMEOUT_MS = 5_000;

/* ------------------------------------------------------- with the cookie */

/** Start a session for a person who has just signed in. */
export async function createSession(c: Ctx, session: Session): Promise<void> {
  const id = await insertSession(c.env, session);
  c.header('Set-Cookie', sessionCookie(id, secure(c)), { append: true });
}

/**
 * The current session, or null when there is none, it expired, or it was
 * cancelled. Never throws for a bad cookie: an unreadable session is the same
 * as no session.
 */
export async function readSession(c: Ctx): Promise<Session | null> {
  const id = currentId(c);
  return id ? readSessionById(c.env, id) : null;
}

/** Store renewed ERPNext tokens for the current session. */
export async function updateTokens(c: Ctx, session: Session): Promise<void> {
  const id = currentId(c);
  if (!id) return;
  const key = c.env.SESSION_KEY;
  await c.env.DB.prepare(
    `UPDATE erp_token
        SET access_token_enc = ?2, refresh_token_enc = ?3, access_expires_at = ?4
      WHERE session_id_hash = ?1`,
  )
    .bind(
      await hashSessionId(id),
      await encryptString(session.accessToken, key),
      session.refreshToken ? await encryptString(session.refreshToken, key) : null,
      session.accessExpiresAt,
    )
    .run();
}

/**
 * Sign this browser out: delete its session, revoke its token at the studio's
 * ERPNext, clear the cookie. A failed revocation does not stop the sign-out.
 */
export async function endSession(c: Ctx): Promise<void> {
  const id = currentId(c);
  const session = id ? await readSessionById(c.env, id) : null;
  if (id) await deleteSession(c.env, await hashSessionId(id));
  c.header('Set-Cookie', clearSessionCookie(secure(c)), { append: true });
  if (session) await revokeAtErpnext(c.env, session.host, [session.accessToken]);
}

/**
 * Sign the person out everywhere: every session of theirs on this studio, in
 * each browser, and each of their ERPNext tokens. Clears this browser's cookie.
 * Returns how many sessions ended.
 *
 * A person may always end their own sessions. Ending a different person's is
 * `endAllSessionsOf`, which has no route on purpose.
 */
export async function endAllMySessions(c: Ctx): Promise<number> {
  const id = currentId(c);
  const ended = id ? await endEverySessionOfOwner(c.env, id) : 0;
  c.header('Set-Cookie', clearSessionCookie(secure(c)), { append: true });
  return ended;
}

/* ------------------------------------------------------- the store itself */

/** Write a new session and its tokens. Returns the identifier for the cookie. */
export async function insertSession(env: StoreEnv, session: Session): Promise<string> {
  const db = env.DB;
  const key = env.SESSION_KEY;
  const now = nowSeconds();

  // Upsert, then RETURNING gives the id of the new row or of the existing one.
  const studio = await db
    .prepare(
      `INSERT INTO studio (id, host, created_at) VALUES (?1, ?2, ?3)
       ON CONFLICT (host) DO UPDATE SET host = excluded.host
       RETURNING id`,
    )
    .bind(crypto.randomUUID(), session.host, now)
    .first<{ id: string }>();
  if (!studio) throw new Error('Could not record the studio.');

  const user = await db
    .prepare(
      `INSERT INTO user (id, studio_id, erp_user, created_at) VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT (studio_id, erp_user) DO UPDATE SET erp_user = excluded.erp_user
       RETURNING id`,
    )
    .bind(crypto.randomUUID(), studio.id, session.user, now)
    .first<{ id: string }>();
  if (!user) throw new Error('Could not record the user.');

  const id = newSessionId();
  const idHash = await hashSessionId(id);

  // One batch is one D1 transaction: a session never exists without its tokens.
  await db.batch([
    db
      .prepare('INSERT INTO session (id_hash, user_id, created_at, expires_at) VALUES (?1, ?2, ?3, ?4)')
      .bind(idHash, user.id, now, now + SESSION_TTL_SECONDS),
    db
      .prepare(
        `INSERT INTO erp_token (session_id_hash, access_token_enc, refresh_token_enc, access_expires_at)
         VALUES (?1, ?2, ?3, ?4)`,
      )
      .bind(
        idHash,
        await encryptString(session.accessToken, key),
        session.refreshToken ? await encryptString(session.refreshToken, key) : null,
        session.accessExpiresAt,
      ),
  ]);

  return id;
}

/** The session for an identifier, or null. Deletes it if expired or unreadable. */
export async function readSessionById(env: StoreEnv, id: string): Promise<Session | null> {
  if (!isWellFormedSessionId(id)) return null;
  const idHash = await hashSessionId(id);

  const row = await env.DB.prepare(
    `SELECT s.expires_at, u.erp_user, st.host,
            t.access_token_enc, t.refresh_token_enc, t.access_expires_at
       FROM session s
       JOIN user u       ON u.id = s.user_id
       JOIN studio st    ON st.id = u.studio_id
       JOIN erp_token t  ON t.session_id_hash = s.id_hash
      WHERE s.id_hash = ?1`,
  )
    .bind(idHash)
    .first<{
      expires_at: number;
      erp_user: string;
      host: string;
      access_token_enc: string;
      refresh_token_enc: string | null;
      access_expires_at: number;
    }>();
  if (!row) return null;

  if (sessionExpired(row.expires_at)) {
    await deleteSession(env, idHash);
    return null;
  }

  try {
    const key = env.SESSION_KEY;
    return {
      host: row.host,
      user: row.erp_user,
      accessToken: await decryptString(row.access_token_enc, key),
      refreshToken: row.refresh_token_enc ? await decryptString(row.refresh_token_enc, key) : undefined,
      accessExpiresAt: row.access_expires_at,
    };
  } catch {
    // SESSION_KEY was rotated, or the row was edited. Either way it is dead.
    await deleteSession(env, idHash);
    return null;
  }
}

/**
 * End every session of the person who owns this session identifier, on that
 * person's studio. Returns how many ended; 0 when the identifier is not a
 * session.
 */
export async function endEverySessionOfOwner(env: StoreEnv, id: string): Promise<number> {
  if (!isWellFormedSessionId(id)) return 0;
  const owner = await env.DB.prepare('SELECT user_id FROM session WHERE id_hash = ?1')
    .bind(await hashSessionId(id))
    .first<{ user_id: string }>();
  return owner ? endUserSessions(env, owner.user_id) : 0;
}

/**
 * End every session of one ERPNext user on one studio. Returns how many ended.
 *
 * **This function has no route, on purpose.** Who may end the sessions of a
 * different person is a permission question, and StudioOS has no permission
 * code (docs/SEAM.md section 0). Phase 6d decides who may call it. Do not add a
 * route with an "is admin" check in front of it. Ask first.
 */
export async function endAllSessionsOf(env: StoreEnv, host: string, erpUser: string): Promise<number> {
  const user = await env.DB.prepare(
    `SELECT u.id FROM user u JOIN studio st ON st.id = u.studio_id
      WHERE st.host = ?1 AND u.erp_user = ?2`,
  )
    .bind(normaliseHost(host), erpUser)
    .first<{ id: string }>();
  return user ? endUserSessions(env, user.id) : 0;
}

/**
 * Delete each session of one user row and its tokens in one batch, then revoke
 * each token at the studio's ERPNext. One user row is one person on one studio
 * (ADR-0003 condition 7), and each session has its own token (condition 8).
 */
async function endUserSessions(env: StoreEnv, userId: string): Promise<number> {
  const studio = await env.DB.prepare(
    'SELECT st.host FROM user u JOIN studio st ON st.id = u.studio_id WHERE u.id = ?1',
  )
    .bind(userId)
    .first<{ host: string }>();

  // One transaction: the tokens are read as they are deleted, so no token is
  // revoked for a session that survives, and none is missed.
  const [tokens, sessions] = await env.DB.batch<{ access_token_enc: string }>([
    env.DB.prepare(
      `DELETE FROM erp_token
        WHERE session_id_hash IN (SELECT id_hash FROM session WHERE user_id = ?1)
        RETURNING access_token_enc`,
    ).bind(userId),
    env.DB.prepare('DELETE FROM session WHERE user_id = ?1').bind(userId),
  ]);

  const accessTokens: string[] = [];
  for (const row of tokens?.results ?? []) {
    try {
      accessTokens.push(await decryptString(row.access_token_enc, env.SESSION_KEY));
    } catch {
      // Unreadable under this SESSION_KEY: deleted above, nothing to revoke.
    }
  }
  if (studio) await revokeAtErpnext(env, studio.host, accessTokens);

  return sessions?.meta.changes ?? 0;
}

/**
 * Revoke tokens at the studio's ERPNext. Best effort: a refused connection, an
 * error, or a site that does not answer within REVOKE_TIMEOUT_MS is ignored. A
 * person must always be able to sign out of StudioOS.
 */
async function revokeAtErpnext(env: StoreEnv, host: string, accessTokens: string[]): Promise<void> {
  if (accessTokens.length === 0) return;
  const tenant = await getTenant(env, host).catch(() => null);
  if (!tenant) return;
  await Promise.allSettled(
    accessTokens.map((token) =>
      fetch(`${tenant.origin}/api/method/frappe.integrations.oauth2.revoke_token`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token }),
        signal: AbortSignal.timeout(REVOKE_TIMEOUT_MS),
      }),
    ),
  );
}

/** erp_token goes with it: ON DELETE CASCADE. */
async function deleteSession(env: StoreEnv, idHash: string): Promise<void> {
  await env.DB.prepare('DELETE FROM session WHERE id_hash = ?1').bind(idHash).run();
}

function currentId(c: Ctx): string | undefined {
  const id = readCookie(c.req.header('cookie'), SESSION_COOKIE);
  return isWellFormedSessionId(id) ? id : undefined;
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function secure(c: Ctx): boolean {
  return c.env.APP_ORIGIN.startsWith('https://');
}

export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return rest.join('=') || undefined;
  }
  return undefined;
}
