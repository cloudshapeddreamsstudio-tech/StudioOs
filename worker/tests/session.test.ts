import { describe, it, expect } from 'bun:test';
import {
  sealAuthState,
  openAuthState,
  authStateCookie,
  AuthStateError,
  AUTH_STATE_TTL_SECONDS,
} from '../src/lib/session';

/**
 * This cookie is the only thing standing between a sign-in and two attacks:
 * a forged `state` (someone else's authorization code planted in a victim's
 * browser) and a stolen code being redeemed without the PKCE verifier.
 *
 * So the tests care less about the happy path than about every way the value
 * can be wrong. Each of these must raise, never return a partly-trusted state.
 */

const KEY = btoa(String.fromCharCode(...new Uint8Array(32).fill(3)));
const OTHER_KEY = btoa(String.fromCharCode(...new Uint8Array(32).fill(9)));

const state = { host: 'localhost:8000', state: 'abc123', verifier: 'v-secret' };

describe('auth state cookie', () => {
  it('round-trips', async () => {
    const sealed = await sealAuthState(state, KEY);
    const opened = await openAuthState(sealed, KEY);
    expect(opened.host).toBe('localhost:8000');
    expect(opened.state).toBe('abc123');
    expect(opened.verifier).toBe('v-secret');
  });

  it('does not expose the verifier in the cookie value', async () => {
    const sealed = await sealAuthState(state, KEY);
    expect(sealed).not.toContain('v-secret');
    expect(sealed).not.toContain('localhost');
  });

  it('rejects a missing cookie', async () => {
    await expect(openAuthState(undefined, KEY)).rejects.toThrow(AuthStateError);
  });

  it('rejects a tampered cookie rather than trusting it', async () => {
    const sealed = await sealAuthState(state, KEY);
    const tampered = sealed.slice(0, -2) + (sealed.endsWith('A') ? 'BB' : 'AA');
    await expect(openAuthState(tampered, KEY)).rejects.toThrow(AuthStateError);
  });

  it('rejects a cookie sealed with a different key', async () => {
    const sealed = await sealAuthState(state, OTHER_KEY);
    await expect(openAuthState(sealed, KEY)).rejects.toThrow(AuthStateError);
  });

  it('rejects once expired', async () => {
    const now = 1_000_000;
    const sealed = await sealAuthState(state, KEY, now);
    // One second before the deadline it is still good.
    await expect(openAuthState(sealed, KEY, now + AUTH_STATE_TTL_SECONDS - 1)).resolves.toBeTruthy();
    await expect(openAuthState(sealed, KEY, now + AUTH_STATE_TTL_SECONDS)).rejects.toThrow(
      /took too long/,
    );
  });

  it('rejects a well-encrypted but malformed payload', async () => {
    const { encryptString } = await import('../src/lib/crypto');
    const sealed = await encryptString(JSON.stringify({ host: 'x' }), KEY);
    await expect(openAuthState(sealed, KEY)).rejects.toThrow(/malformed/);
  });

  /**
   * SameSite=Strict would withhold the cookie on the top-level redirect back
   * from the studio's ERPNext, so every sign-in would fail with "no state".
   * That failure looks like a bug in the OAuth flow, not a cookie attribute,
   * which is exactly why it is pinned here.
   */
  it('uses SameSite=Lax so it survives the redirect back', () => {
    expect(authStateCookie('sealed', true)).toContain('SameSite=Lax');
    expect(authStateCookie('sealed', true)).not.toContain('SameSite=Strict');
  });

  it('is HttpOnly, and Secure everywhere except plain-HTTP dev', () => {
    expect(authStateCookie('sealed', true)).toContain('HttpOnly');
    expect(authStateCookie('sealed', true)).toContain('Secure');
    expect(authStateCookie('sealed', false)).not.toContain('Secure');
  });
});
