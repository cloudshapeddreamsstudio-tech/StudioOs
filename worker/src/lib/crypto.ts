/**
 * AES-GCM helpers, shared by the tenant registry and the session cookie.
 *
 * Both need to put something on a wire or in a store that must not be readable
 * by whoever can reach that store: a tenant's client secret in KV, and the
 * signed-in user's refresh token in a cookie. Same primitive, one
 * implementation, so a mistake cannot be fixed in one place and missed in the
 * other.
 */

const IV_BYTES = 12; // AES-GCM standard nonce length.

export async function importAesKey(rawBase64: string): Promise<CryptoKey> {
  const raw = base64ToBytes(rawBase64);
  if (raw.byteLength !== 32) {
    throw new Error('Key must be 32 bytes, base64-encoded.');
  }
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

/**
 * Encrypt with a fresh random IV each time, stored alongside the ciphertext.
 * Reusing an IV with AES-GCM under the same key destroys the confidentiality
 * the encryption exists to provide, so this is never a caller's choice.
 */
export async function encryptString(plaintext: string, keyBase64: string): Promise<string> {
  const key = await importAesKey(keyBase64);
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext),
  );

  const joined = new Uint8Array(iv.byteLength + ciphertext.byteLength);
  joined.set(iv, 0);
  joined.set(new Uint8Array(ciphertext), iv.byteLength);
  return bytesToBase64Url(joined);
}

/**
 * Throws on a tampered, truncated or wrong-key payload. AES-GCM authenticates,
 * so a modified ciphertext fails rather than decrypting to something else --
 * which is what makes this safe to use for a cookie the user can edit.
 */
export async function decryptString(payload: string, keyBase64: string): Promise<string> {
  const key = await importAesKey(keyBase64);
  const joined = base64UrlToBytes(payload);
  if (joined.byteLength <= IV_BYTES) throw new Error('Encrypted value is truncated.');

  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: joined.subarray(0, IV_BYTES) },
    key,
    joined.subarray(IV_BYTES),
  );
  return new TextDecoder().decode(plaintext);
}

/**
 * base64url, not base64. These values go into cookies and query strings, where
 * `+` and `/` are hostile and `=` padding is inconsistently handled.
 */
export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

export function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/');
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

function base64ToBytes(value: string): Uint8Array {
  return base64UrlToBytes(value);
}
