import type { Context } from 'hono';
import { encryptString, decryptString } from '../../lib/crypto';
import {
  sessionCookie,
  clearSessionCookie,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  type Session,
} from '../../lib/session';
import {
  newSessionId,
  isWellFormedSessionId,
  hashSessionId,
  sessionExpired,
} from './sessionId';
import type { AppEnv } from '../../types';

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
 */

type Ctx = Context<AppEnv>;

/** Start a session for a person who has just signed in. */
export async function createSession(c: Ctx, session: Session): Promise<void> {
  const db = c.env.DB;
  const key = c.env.SESSION_KEY;
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

  c.header('Set-Cookie', sessionCookie(id, secure(c)), { append: true });
}

/**
 * The current session, or null when there is none, it expired, or it was
 * cancelled. Never throws for a bad cookie: an unreadable session is the same
 * as no session.
 */
export async function readSession(c: Ctx): Promise<Session | null> {
  const idHash = await currentIdHash(c);
  if (!idHash) return null;

  const row = await c.env.DB.prepare(
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
    await deleteSession(c, idHash);
    return null;
  }

  try {
    const key = c.env.SESSION_KEY;
    return {
      host: row.host,
      user: row.erp_user,
      accessToken: await decryptString(row.access_token_enc, key),
      refreshToken: row.refresh_token_enc ? await decryptString(row.refresh_token_enc, key) : undefined,
      accessExpiresAt: row.access_expires_at,
    };
  } catch {
    // SESSION_KEY was rotated, or the row was edited. Either way it is dead.
    await deleteSession(c, idHash);
    return null;
  }
}

/** Store renewed ERPNext tokens for the current session. */
export async function updateTokens(c: Ctx, session: Session): Promise<void> {
  const idHash = await currentIdHash(c);
  if (!idHash) return;
  const key = c.env.SESSION_KEY;
  await c.env.DB.prepare(
    `UPDATE erp_token
        SET access_token_enc = ?2, refresh_token_enc = ?3, access_expires_at = ?4
      WHERE session_id_hash = ?1`,
  )
    .bind(
      idHash,
      await encryptString(session.accessToken, key),
      session.refreshToken ? await encryptString(session.refreshToken, key) : null,
      session.accessExpiresAt,
    )
    .run();
}

/**
 * End the current session: delete its row and clear the cookie. Returns the
 * session, so the caller can revoke its token at the studio's ERPNext, or null
 * when there was none.
 */
export async function endSession(c: Ctx): Promise<Session | null> {
  const session = await readSession(c);
  const idHash = await currentIdHash(c);
  if (idHash) await deleteSession(c, idHash);
  c.header('Set-Cookie', clearSessionCookie(secure(c)), { append: true });
  return session;
}

async function currentIdHash(c: Ctx): Promise<string | null> {
  const id = readCookie(c.req.header('cookie'), SESSION_COOKIE);
  return isWellFormedSessionId(id) ? hashSessionId(id) : null;
}

/** erp_token goes with it: ON DELETE CASCADE. */
async function deleteSession(c: Ctx, idHash: string): Promise<void> {
  await c.env.DB.prepare('DELETE FROM session WHERE id_hash = ?1').bind(idHash).run();
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
