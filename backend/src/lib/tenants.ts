/**
 * The tenant registry.
 *
 * Every studio runs its own ERPNext, so there is no shared identity provider
 * to send an anonymous visitor to. Before StudioOS can start a sign-in it has
 * to know *which* site, and what credentials it was registered with there.
 * That mapping cannot live in the studio's own ERPNext, because we need it
 * before we are able to talk to that site at all.
 *
 * It lives in Cloudflare KV, keyed by host. It is the one piece of state
 * StudioOS keeps outside ERPNext -- see docs/PLAN-v2.md, decision D1.
 *
 * The client secret is encrypted by us before it is written. Cloudflare
 * encrypts KV at rest, but anyone holding an API token for the namespace can
 * read the values back, and a client secret is not something that should be
 * readable that way.
 */

export interface Tenant {
  /** Normalised host, with port if there is one. Also the KV key. */
  host: string;
  /** Scheme + host. What OIDC discovery and every API call are built on. */
  origin: string;
  clientId: string;
  clientSecret: string;
  createdAt: string;
}

/** Stored shape. `clientSecret` is ciphertext, never plaintext. */
interface StoredTenant {
  host: string;
  origin: string;
  clientId: string;
  encryptedSecret: string;
  createdAt: string;
}

export class InvalidDomainError extends Error {}

/**
 * Hosts that get `http`. Everything else gets `https`.
 *
 * This exists for the WSL dev bench, which serves over plain HTTP on a port.
 * It is deliberately a fixed list rather than "http if a port is present" --
 * a real site on a non-standard HTTPS port must not be downgraded to http
 * just because the owner typed a port number.
 */
const PLAINTEXT_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * Turn whatever the user typed into a canonical host.
 *
 * Accepts `moonlightfilms.erpnext.com`, `https://moonlightfilms.erpnext.com/`,
 * `HTTPS://Moonlightfilms.ERPNext.com/app/project` and so on. Ports are kept:
 * `localhost:8000` is a real site during development.
 *
 * Throws rather than guessing. A registry keyed by a subtly wrong host is
 * worse than a rejection, because the failure surfaces much later as "this
 * studio is not registered" for a studio that plainly is.
 */
export function normaliseHost(input: string): string {
  const trimmed = (input ?? '').trim();
  if (!trimmed) throw new InvalidDomainError('Enter your ERPNext site address.');

  // Give the URL parser a scheme to work with, whatever the user typed.
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new InvalidDomainError(`"${trimmed}" is not a valid site address.`);
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new InvalidDomainError('Site address must be http or https.');
  }
  if (!url.hostname) throw new InvalidDomainError(`"${trimmed}" is not a valid site address.`);

  // `URL` already lowercases the hostname and drops a default port.
  return url.port ? `${url.hostname}:${url.port}` : url.hostname;
}

/** The origin every request to that site is built from. */
export function originForHost(host: string): string {
  const bare = host.split(':')[0] ?? host;
  const scheme = PLAINTEXT_HOSTS.has(bare) ? 'http' : 'https';
  return `${scheme}://${host}`;
}

/* ---------------------------------------------------------------- crypto */

const IV_BYTES = 12; // AES-GCM standard nonce length.

async function importKey(rawBase64: string): Promise<CryptoKey> {
  const raw = base64ToBytes(rawBase64);
  if (raw.byteLength !== 32) {
    throw new Error('REGISTRY_KEY must be 32 bytes, base64-encoded.');
  }
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

/**
 * Encrypt with a fresh random IV each time, and store the IV alongside the
 * ciphertext. Reusing an IV with AES-GCM is a well-known way to lose the
 * secrecy the encryption was there to provide.
 */
export async function encryptSecret(plaintext: string, keyBase64: string): Promise<string> {
  const key = await importKey(keyBase64);
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext),
  );

  const joined = new Uint8Array(iv.byteLength + ciphertext.byteLength);
  joined.set(iv, 0);
  joined.set(new Uint8Array(ciphertext), iv.byteLength);
  return bytesToBase64(joined);
}

export async function decryptSecret(payload: string, keyBase64: string): Promise<string> {
  const key = await importKey(keyBase64);
  const joined = base64ToBytes(payload);
  if (joined.byteLength <= IV_BYTES) throw new Error('Encrypted value is truncated.');

  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: joined.subarray(0, IV_BYTES) },
    key,
    joined.subarray(IV_BYTES),
  );
  return new TextDecoder().decode(plaintext);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

/* ------------------------------------------------------------- registry */

export interface RegistryEnv {
  TENANTS: KVNamespace;
  REGISTRY_KEY: string;
}

export async function getTenant(env: RegistryEnv, hostOrDomain: string): Promise<Tenant | null> {
  const host = normaliseHost(hostOrDomain);
  const stored = await env.TENANTS.get<StoredTenant>(host, 'json');
  if (!stored) return null;

  return {
    host: stored.host,
    origin: stored.origin,
    clientId: stored.clientId,
    clientSecret: await decryptSecret(stored.encryptedSecret, env.REGISTRY_KEY),
    createdAt: stored.createdAt,
  };
}

export async function putTenant(
  env: RegistryEnv,
  input: { host: string; clientId: string; clientSecret: string },
): Promise<Tenant> {
  const host = normaliseHost(input.host);
  const origin = originForHost(host);

  // Keep the original registration date if this is a re-register, so a
  // reinstall does not look like a brand new customer.
  const existing = await env.TENANTS.get<StoredTenant>(host, 'json');
  const createdAt = existing?.createdAt ?? new Date().toISOString();

  const stored: StoredTenant = {
    host,
    origin,
    clientId: input.clientId,
    encryptedSecret: await encryptSecret(input.clientSecret, env.REGISTRY_KEY),
    createdAt,
  };
  await env.TENANTS.put(host, JSON.stringify(stored));

  return { ...stored, clientSecret: input.clientSecret } as Tenant;
}
