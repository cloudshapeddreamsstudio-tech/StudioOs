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

import { decryptString, encryptString } from './crypto';

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

/**
 * Whether this host may be talked to over plain HTTP.
 *
 * OAuth libraries refuse insecure transport by default, and rightly so -- an
 * authorization code exchange in clear text hands the session to anyone on the
 * path. The local dev bench genuinely is plain HTTP, so the exception exists,
 * but it is granted per host from a fixed list and never inferred.
 */
export function allowsInsecureTransport(host: string): boolean {
  const bare = host.split(':')[0] ?? host;
  return PLAINTEXT_HOSTS.has(bare);
}

/** The origin every request to that site is built from. */
export function originForHost(host: string): string {
  const scheme = allowsInsecureTransport(host) ? 'http' : 'https';
  return `${scheme}://${host}`;
}

/* ---------------------------------------------------------------- crypto */

/**
 * Thin aliases over lib/crypto.ts. The registry and the session cookie protect
 * different things but need the same primitive, so it lives in one place.
 */
export const encryptSecret = encryptString;
export const decryptSecret = decryptString;

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
