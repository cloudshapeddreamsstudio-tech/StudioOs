import { describe, it, expect } from 'bun:test';
import {
  normaliseHost,
  originForHost,
  encryptSecret,
  decryptSecret,
  allowsInsecureTransport,
  InvalidDomainError,
} from '../src/lib/tenants';

/**
 * The registry is the one piece of state StudioOS keeps outside ERPNext, and
 * the host is its primary key. Two failure modes are worth pinning hard:
 *
 *  - A host that normalises inconsistently means a studio that plainly IS
 *    registered gets told it is not, at sign-in, in production.
 *  - A scheme guessed from the presence of a port would silently downgrade a
 *    real site to plain HTTP and send an OAuth exchange over the wire in
 *    clear text.
 */

const KEY = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));

describe('normaliseHost', () => {
  it('accepts a bare domain', () => {
    expect(normaliseHost('moonlightfilms.erpnext.com')).toBe('moonlightfilms.erpnext.com');
  });

  it('strips scheme, path and trailing slash', () => {
    expect(normaliseHost('https://moonlightfilms.erpnext.com/')).toBe(
      'moonlightfilms.erpnext.com',
    );
    expect(normaliseHost('https://moonlightfilms.erpnext.com/app/project')).toBe(
      'moonlightfilms.erpnext.com',
    );
  });

  it('lowercases and trims, so the same site is never two registry entries', () => {
    expect(normaliseHost('  HTTPS://Moonlightfilms.ERPNext.COM/  ')).toBe(
      'moonlightfilms.erpnext.com',
    );
  });

  it('keeps a port, because the dev bench is a real site on one', () => {
    expect(normaliseHost('localhost:8000')).toBe('localhost:8000');
    expect(normaliseHost('http://localhost:8000/app')).toBe('localhost:8000');
  });

  it('drops a default port, so :443 and bare are one entry not two', () => {
    expect(normaliseHost('https://moonlightfilms.erpnext.com:443')).toBe(
      'moonlightfilms.erpnext.com',
    );
  });

  it('rejects rather than guessing', () => {
    expect(() => normaliseHost('')).toThrow(InvalidDomainError);
    expect(() => normaliseHost('   ')).toThrow(InvalidDomainError);
    expect(() => normaliseHost('ftp://example.com')).toThrow(InvalidDomainError);
  });
});

describe('originForHost', () => {
  it('uses https for a real site', () => {
    expect(originForHost('moonlightfilms.erpnext.com')).toBe('https://moonlightfilms.erpnext.com');
  });

  it('uses http only for the known local hosts', () => {
    expect(originForHost('localhost:8000')).toBe('http://localhost:8000');
    expect(originForHost('127.0.0.1:8000')).toBe('http://127.0.0.1:8000');
  });

  /**
   * The rule is a fixed host list, NOT "has a port". A studio self-hosting on
   * https://erp.example.com:8443 must not be downgraded to http because it
   * happens to use a non-standard port -- that would put the authorization
   * code exchange, and the client secret, on the wire in clear text.
   */
  it('does not downgrade a real site that uses a non-standard port', () => {
    expect(originForHost('erp.example.com:8443')).toBe('https://erp.example.com:8443');
  });
});

describe('allowsInsecureTransport', () => {
  /**
   * This predicate decides whether the OAuth library's refusal to speak plain
   * HTTP is waived. Getting it wrong on a customer host would put the
   * authorization code exchange in clear text, so the negative cases matter
   * far more than the positive one.
   */
  it('waives HTTPS only for the local dev bench', () => {
    expect(allowsInsecureTransport('localhost:8000')).toBe(true);
    expect(allowsInsecureTransport('127.0.0.1:8000')).toBe(true);
  });

  it('never waives it for a real site, however it is spelled', () => {
    expect(allowsInsecureTransport('moonlightfilms.erpnext.com')).toBe(false);
    expect(allowsInsecureTransport('erp.example.com:8443')).toBe(false);
    // A host that merely *contains* "localhost" is not localhost.
    expect(allowsInsecureTransport('localhost.evil.com')).toBe(false);
    expect(allowsInsecureTransport('notlocalhost')).toBe(false);
  });
});

describe('client secret encryption', () => {
  it('round-trips', async () => {
    const secret = 'a57c7667a9';
    const sealed = await encryptSecret(secret, KEY);
    expect(await decryptSecret(sealed, KEY)).toBe(secret);
  });

  it('never stores the plaintext', async () => {
    const sealed = await encryptSecret('a57c7667a9', KEY);
    expect(sealed).not.toContain('a57c7667a9');
  });

  /**
   * A fixed IV would make identical secrets encrypt identically, which leaks
   * that two studios share a secret, and it breaks AES-GCM outright if the
   * same key is reused across messages.
   */
  it('produces different ciphertext each time for the same input', async () => {
    const a = await encryptSecret('same-secret', KEY);
    const b = await encryptSecret('same-secret', KEY);
    expect(a).not.toBe(b);
    expect(await decryptSecret(a, KEY)).toBe(await decryptSecret(b, KEY));
  });

  it('refuses a key that is not 32 bytes', async () => {
    await expect(encryptSecret('x', btoa('too short'))).rejects.toThrow(/32 bytes/);
  });

  it('fails closed on a truncated payload rather than returning junk', async () => {
    await expect(decryptSecret(btoa('short'), KEY)).rejects.toThrow();
  });
});
