import type { Context } from 'hono';
import {
  sealSession,
  openSession,
  sessionCookie,
  clearSessionCookie,
  SESSION_COOKIE,
  type Session,
} from '../../lib/session';
import type { AppEnv } from '../../types';

/**
 * The one place that reads and writes a signed-in session.
 *
 * No route touches the session cookie or a session table directly. A route
 * asks this module who the person is, and gets the studio, the ERPNext user and
 * the ERPNext tokens back. See docs/adr/0003-how-sessions-are-stored.md.
 *
 * That is what makes the storage swappable: today the session is sealed into
 * the cookie, next it is a row in D1, and nothing outside this folder changes.
 */

type Ctx = Context<AppEnv>;

/** Start a session for a person who has just signed in. */
export async function createSession(c: Ctx, session: Session): Promise<void> {
  c.header('Set-Cookie', sessionCookie(await sealSession(session, c.env.SESSION_KEY), secure(c)), {
    append: true,
  });
}

/** The current session, or null when there is none or it cannot be trusted. */
export async function readSession(c: Ctx): Promise<Session | null> {
  try {
    return await openSession(readCookie(c.req.header('cookie'), SESSION_COOKIE), c.env.SESSION_KEY);
  } catch {
    return null;
  }
}

/** Store renewed ERPNext tokens for the current session. */
export async function updateTokens(c: Ctx, session: Session): Promise<void> {
  await createSession(c, session);
}

/**
 * End the current session. Returns it, so the caller can revoke its token at
 * the studio's ERPNext, or null when there was none.
 */
export async function endSession(c: Ctx): Promise<Session | null> {
  const session = await readSession(c);
  c.header('Set-Cookie', clearSessionCookie(secure(c)), { append: true });
  return session;
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
