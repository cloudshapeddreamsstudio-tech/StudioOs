/**
 * Worker bindings. `vars` come from wrangler.toml, secrets from
 * `wrangler secret put` (or .dev.vars locally).
 *
 * There is deliberately no database binding. ERPNext is the only store —
 * see docs/PLAN-v2.md, decision 2. The D1 and R2 bindings were removed in
 * Phase 6a along with the routes that used them.
 *
 * There is also deliberately no ERPNext credential. Phase 6c removed the admin
 * key: every request runs on the signed-in user's own token, so StudioOS holds
 * nothing that can read a studio's books on its own authority.
 */
export interface Env {
  /**
   * Kept only for the company name and as a default for tooling. It is NOT how
   * requests reach ERPNext any more -- since Phase 6c each request goes to the
   * signed-in user's own studio, whose origin comes from the tenant registry.
   */
  FRAPPE_URL: string;
  COMPANY: string;

  /** Tenant registry — see lib/tenants.ts. Added in Phase 6b. */
  TENANTS: KVNamespace;
  /** 32 bytes, base64. Encrypts tenant client secrets before they reach KV. */
  REGISTRY_KEY: string;
  /** 32 bytes, base64. Signs and encrypts the session cookie. */
  SESSION_KEY: string;
  /**
   * Where StudioOS itself is reachable. The OAuth redirect URI is built from
   * this, and it is registered on every customer's site — so it has to be a
   * permanent, exact match, not something derived from a request header.
   */
  APP_ORIGIN: string;
  /** Gates POST /auth/register so only the connector app can add a tenant. */
  CONNECTOR_SHARED_SECRET: string;
}

/**
 * Hono generic: `new Hono<AppEnv>()` gives typed `c.env` and `c.get`.
 *
 * `frappe` and `session` are set by the requireSession middleware, so any route
 * mounted behind it can assume both. A route that reaches for `c.get('frappe')`
 * without that middleware gets undefined at runtime -- which is the correct
 * failure, because it means the route is unauthenticated.
 */
export type AppEnv = {
  Bindings: Env;
  Variables: {
    frappe: import('./lib/frappe').FrappeClient;
    session: import('./lib/session').Session;
  };
};
