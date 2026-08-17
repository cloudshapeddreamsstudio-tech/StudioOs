import { decryptString, encryptString } from './crypto';

/**
 * The short-lived state carried across the sign-in round trip.
 *
 * When StudioOS sends someone to their own ERPNext to log in, three things
 * have to survive until they come back:
 *
 *  - `host`, so the callback knows which studio this was. It cannot be
 *    recovered from the request otherwise.
 *  - `state`, matched against what the site returns. This is what stops an
 *    attacker feeding a victim's browser an authorization code of their
 *    choosing (CSRF on the callback).
 *  - `verifier`, the PKCE secret. The code alone is useless without it, so a
 *    code intercepted in transit cannot be exchanged.
 *
 * It rides in an encrypted cookie rather than a store, because it is worthless
 * ten minutes later and a store would be one more thing to run. AES-GCM
 * authenticates, so a user editing their own cookie gets a decrypt failure
 * rather than a forged state.
 */
export interface AuthState {
  host: string;
  state: string;
  verifier: string;
  /** Unix seconds. Checked on the way out, not trusted from the cookie alone. */
  expiresAt: number;
}

export const AUTH_STATE_COOKIE = 'studioos_auth';

/** Ten minutes is generous for a login and short enough to limit replay. */
export const AUTH_STATE_TTL_SECONDS = 600;

export class AuthStateError extends Error {}

export async function sealAuthState(
  state: Omit<AuthState, 'expiresAt'>,
  keyBase64: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<string> {
  const payload: AuthState = { ...state, expiresAt: nowSeconds + AUTH_STATE_TTL_SECONDS };
  return encryptString(JSON.stringify(payload), keyBase64);
}

/**
 * Fails closed. A missing, tampered, malformed or expired cookie all raise --
 * none of them return a partly-trusted value, because every caller of this is
 * about to decide whether to complete a sign-in.
 */
export async function openAuthState(
  sealed: string | undefined,
  keyBase64: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<AuthState> {
  if (!sealed) throw new AuthStateError('Sign-in has no state. Start again.');

  let parsed: unknown;
  try {
    parsed = JSON.parse(await decryptString(sealed, keyBase64));
  } catch {
    throw new AuthStateError('Sign-in state could not be read. Start again.');
  }

  if (!isAuthState(parsed)) throw new AuthStateError('Sign-in state is malformed. Start again.');
  if (parsed.expiresAt <= nowSeconds) throw new AuthStateError('Sign-in took too long. Start again.');

  return parsed;
}

function isAuthState(value: unknown): value is AuthState {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.host === 'string' &&
    v.host.length > 0 &&
    typeof v.state === 'string' &&
    v.state.length > 0 &&
    typeof v.verifier === 'string' &&
    v.verifier.length > 0 &&
    typeof v.expiresAt === 'number' &&
    Number.isFinite(v.expiresAt)
  );
}

/**
 * `SameSite=Lax` is required, not a preference: the browser arrives back at
 * the callback via a top-level redirect from the studio's ERPNext, and `Strict`
 * would withhold the cookie on that navigation, breaking every sign-in.
 *
 * `Secure` is omitted on plain-HTTP origins only so the local dev bench works.
 * Anywhere else it is set, because this cookie carries the PKCE verifier.
 */
export function authStateCookie(sealed: string, secure: boolean): string {
  const parts = [
    `${AUTH_STATE_COOKIE}=${sealed}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${AUTH_STATE_TTL_SECONDS}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function clearAuthStateCookie(secure: boolean): string {
  const parts = [`${AUTH_STATE_COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}
