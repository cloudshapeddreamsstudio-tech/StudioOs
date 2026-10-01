import { bytesToBase64Url } from '../../lib/crypto';

/**
 * The session identifier: the one value in the cookie. ADR-0003 conditions 2
 * and 3.
 *
 * 32 bytes from `crypto.getRandomValues`, base64url without padding, so always
 * 43 characters. D1 stores only its SHA-256, so a copy of the database holds no
 * identifier that a browser could present.
 */

export const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function newSessionId(): string {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

/**
 * Rejects anything that `newSessionId` could not have made -- an old sealed
 * cookie, an empty value, a guess -- before it costs a hash and a query.
 */
export function isWellFormedSessionId(value: string | undefined): value is string {
  return value !== undefined && SESSION_ID_PATTERN.test(value);
}

/** Lowercase hex SHA-256. This, never the identifier, is the D1 key. */
export async function hashSessionId(id: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(id));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** True at and after the expiry second. A session does not live on a boundary. */
export function sessionExpired(expiresAt: number, nowSeconds = Math.floor(Date.now() / 1000)): boolean {
  return expiresAt <= nowSeconds;
}
