import { describe, it, expect } from 'bun:test';
import {
  newSessionId,
  isWellFormedSessionId,
  hashSessionId,
  sessionExpired,
} from '../src/kernel/auth/sessionId';
import { sessionCookie, clearSessionCookie, SESSION_TTL_SECONDS } from '../src/lib/session';

/**
 * ADR-0003 says we own every line of the session store, so these prove the
 * four things the ADR lists: the random source, the cookie flags, the expiry,
 * and (end to end, in scripts/check-session-cancel.ts) deletion that takes
 * effect on the next request.
 */

describe('session identifier', () => {
  it('is 43 base64url characters, which is 32 bytes', () => {
    const id = newSessionId();
    expect(id).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('does not repeat', () => {
    const ids = new Set(Array.from({ length: 1000 }, newSessionId));
    expect(ids.size).toBe(1000);
  });

  it('accepts only what newSessionId makes', () => {
    expect(isWellFormedSessionId(newSessionId())).toBe(true);
    expect(isWellFormedSessionId(undefined)).toBe(false);
    expect(isWellFormedSessionId('')).toBe(false);
    expect(isWellFormedSessionId('a'.repeat(42))).toBe(false);
    expect(isWellFormedSessionId('a'.repeat(44))).toBe(false);
    // An old sealed cookie: the same alphabet, but ~294 characters.
    expect(isWellFormedSessionId('a'.repeat(294))).toBe(false);
    expect(isWellFormedSessionId(`${'a'.repeat(42)}=`)).toBe(false);
  });
});

describe('session identifier hash', () => {
  it('is a stable 64-character hex SHA-256', async () => {
    const id = newSessionId();
    const h = await hashSessionId(id);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(await hashSessionId(id)).toBe(h);
  });

  it('is never the identifier, and differs per identifier', async () => {
    const a = newSessionId();
    const b = newSessionId();
    expect(await hashSessionId(a)).not.toContain(a);
    expect(await hashSessionId(a)).not.toBe(await hashSessionId(b));
  });

  it('matches a known SHA-256 vector', async () => {
    expect(await hashSessionId('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});

describe('session expiry', () => {
  it('is live before the expiry second and dead at and after it', () => {
    expect(sessionExpired(1000, 999)).toBe(false);
    expect(sessionExpired(1000, 1000)).toBe(true);
    expect(sessionExpired(1000, 1001)).toBe(true);
  });
});

describe('session cookie', () => {
  const id = newSessionId();

  it('carries only the identifier, HttpOnly, SameSite=Lax, for 14 days', () => {
    const c = sessionCookie(id, false);
    expect(c.startsWith(`studioos_session=${id};`)).toBe(true);
    expect(c).toContain('HttpOnly');
    expect(c).toContain('SameSite=Lax');
    expect(c).toContain('Path=/');
    expect(c).toContain(`Max-Age=${SESSION_TTL_SECONDS}`);
    expect(SESSION_TTL_SECONDS).toBe(60 * 60 * 24 * 14);
  });

  it('is Secure on an https origin only', () => {
    expect(sessionCookie(id, true)).toContain('Secure');
    expect(sessionCookie(id, false)).not.toContain('Secure');
  });

  it('is cleared with Max-Age=0 and the same flags', () => {
    const c = clearSessionCookie(true);
    expect(c).toContain('Max-Age=0');
    expect(c).toContain('HttpOnly');
    expect(c).toContain('Secure');
  });
});
