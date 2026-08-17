import type { MiddlewareHandler } from 'hono';
import * as oauth from 'oauth4webapi';
import { frappeForToken } from '../lib/frappe';
import { getTenant, allowsInsecureTransport } from '../lib/tenants';
import {
  openSession,
  sealSession,
  sessionCookie,
  accessTokenExpired,
  SESSION_COOKIE,
  type Session,
} from '../lib/session';
import type { AppEnv } from '../types';

/**
 * Every `/api/*` request runs as the signed-in person.
 *
 * This is what replaced the single admin key in Phase 6c. The difference is not
 * cosmetic: with one shared key, StudioOS decided what each user could see, and
 * a bug or a missing check exposed a studio's payroll to its editors. Now the
 * request carries that person's own ERPNext token, so **ERPNext** decides, and
 * a page StudioOS forgot to guard simply returns less data.
 *
 * It also means a leaked StudioOS secret no longer grants access to any
 * studio's books, because StudioOS holds no credential that does.
 */
export const requireSession: MiddlewareHandler<AppEnv> = async (c, next) => {
  const sealed = readCookie(c.req.header('cookie'), SESSION_COOKIE);

  let session: Session;
  try {
    session = await openSession(sealed, c.env.SESSION_KEY);
  } catch {
    return c.json({ error: 'Not signed in.', signInRequired: true }, 401);
  }

  const tenant = await getTenant(c.env, session.host);
  if (!tenant) {
    return c.json(
      { error: `${session.host} is no longer connected to StudioOS.`, signInRequired: true },
      401,
    );
  }

  // Renew before the call rather than after a failure: a refresh triggered by a
  // 401 would have to replay the original request, and replaying a POST that
  // may already have been applied is how duplicate invoices get created.
  if (accessTokenExpired(session)) {
    const renewed = await refresh(c.env, session, tenant.origin, tenant.clientId, tenant.clientSecret);
    if (!renewed) {
      return c.json({ error: 'Your session expired. Sign in again.', signInRequired: true }, 401);
    }
    session = renewed;
    c.header('Set-Cookie', sessionCookie(await sealSession(session, c.env.SESSION_KEY), c.env.APP_ORIGIN.startsWith('https://')), {
      append: true,
    });
  }

  c.set('session', session);
  c.set('frappe', frappeForToken(tenant.origin, session.accessToken));

  await next();
};

async function refresh(
  env: AppEnv['Bindings'],
  session: Session,
  origin: string,
  clientId: string,
  clientSecret: string,
): Promise<Session | null> {
  if (!session.refreshToken) return null;

  const issuer = new URL(origin);
  const insecureOk = allowsInsecureTransport(session.host);

  try {
    const as = await oauth.processDiscoveryResponse(
      issuer,
      await oauth.discoveryRequest(issuer, {
        algorithm: 'oidc',
        [oauth.allowInsecureRequests]: insecureOk,
        [oauth.customFetch]: (input, init) => fetch(input, { ...init, redirect: 'follow' }),
      }),
    );

    const client: oauth.Client = { client_id: clientId };
    const response = await oauth.refreshTokenGrantRequest(
      as,
      client,
      oauth.ClientSecretPost(clientSecret),
      session.refreshToken,
      { [oauth.allowInsecureRequests]: insecureOk },
    );
    const tokens = await oauth.processRefreshTokenResponse(as, client, response);

    return {
      ...session,
      accessToken: tokens.access_token,
      // Frappe may or may not rotate the refresh token; keep the old one if not.
      refreshToken: tokens.refresh_token ?? session.refreshToken,
      accessExpiresAt: Math.floor(Date.now() / 1000) + (tokens.expires_in ?? 3600),
    };
  } catch {
    // A refresh that fails is not an error to surface -- the token was revoked,
    // or the studio disconnected us. Either way the answer is "sign in again".
    return null;
  }
}

function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return rest.join('=') || undefined;
  }
  return undefined;
}
