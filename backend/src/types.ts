/**
 * Worker bindings. `vars` come from wrangler.toml, secrets from
 * `wrangler secret put` (or .dev.vars locally).
 *
 * There is deliberately no database binding. ERPNext is the only store —
 * see docs/PLAN-v2.md, decision 2. The D1 and R2 bindings were removed in
 * Phase 6a along with the routes that used them.
 *
 * `FRAPPE_API_KEY` / `FRAPPE_API_SECRET` are a single admin key for the one
 * studio, and are on their way out: Phase 6c replaces them with the signed-in
 * user's own token, so ERPNext enforces that user's permissions rather than
 * granting everyone full access.
 */
export interface Env {
  FRAPPE_URL: string;
  FRAPPE_API_KEY: string;
  FRAPPE_API_SECRET: string;
  COMPANY: string;

  /** Tenant registry — see lib/tenants.ts. Added in Phase 6b. */
  TENANTS: KVNamespace;
  /** 32 bytes, base64. Encrypts tenant client secrets before they reach KV. */
  REGISTRY_KEY: string;
  /** 32 bytes, base64. Signs and encrypts the session cookie. */
  SESSION_KEY: string;
}

/** Hono generic: `new Hono<AppEnv>()` gives typed `c.env`. */
export type AppEnv = { Bindings: Env };
