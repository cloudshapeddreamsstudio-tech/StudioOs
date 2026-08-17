import { Hono } from 'hono';
import * as oauth from 'oauth4webapi';
import {
  getTenant,
  putTenant,
  normaliseHost,
  allowsInsecureTransport,
  InvalidDomainError,
} from '../lib/tenants';
import {
  sealAuthState,
  openAuthState,
  authStateCookie,
  clearAuthStateCookie,
  AUTH_STATE_COOKIE,
  sealSession,
  openSession,
  sessionCookie,
  clearSessionCookie,
  SESSION_COOKIE,
  type AuthState,
  type Session,
} from '../lib/session';
import type { AppEnv } from '../types';

/**
 * Sign in with ERPNext.
 *
 * Every studio runs its own ERPNext, so there is no single place to send an
 * anonymous visitor. The flow therefore starts by being told which studio, and
 * StudioOS looks that site up in the registry before it can redirect anywhere.
 *
 * Nothing here ever sees a password. The person authenticates on their own
 * site and comes back with a one-time code; StudioOS exchanges that for a
 * token that carries *their* permissions, which is what lets ERPNext do the
 * authorising instead of us.
 */
const app = new Hono<AppEnv>();

/**
 * Scopes must be a subset of what the OAuth Client was registered with, which
 * is `all openid`.
 *
 * `openid` is deliberately NOT requested. Frappe signs ID tokens with HS256 --
 * a symmetric algorithm keyed on the client secret -- and oauth4webapi verifies
 * asymmetric signatures only, so an ID token in the response would fail
 * validation and break every sign-in. Nothing here needs one: identity comes
 * from an authenticated call to the site itself (see `whoami`), which is a
 * stronger claim anyway because it is the site answering about the token we
 * actually hold.
 */
const SCOPE = 'all';

function redirectUri(env: { APP_ORIGIN: string }): string {
  return `${env.APP_ORIGIN.replace(/\/$/, '')}/auth/callback`;
}

/**
 * oauth4webapi fetches with `redirect: 'manual'`, so a 3xx surfaces as a
 * non-conforming response rather than being followed.
 *
 * Frappe needs it followed. Behind Frappe Cloud's nginx,
 * `/.well-known/openid-configuration` returns 200 directly; on a bench's own
 * dev server the same path 301s to
 * `/api/method/frappe.integrations.oauth2.openid_configuration`. Both are
 * legitimate, so discovery has to cope with either.
 *
 * This only ever applies to discovery, which is an unauthenticated GET of a
 * public document. The token exchange keeps the library's default handling,
 * where following a redirect could leak the code or client secret to whatever
 * host the redirect names.
 */
const followRedirects: typeof fetch = (input, init) =>
  fetch(input, { ...init, redirect: 'follow' });

/**
 * Register a studio.
 *
 * Called by the connector app on install so the owner never copies credentials
 * by hand — the zero-paste onboarding in Phase 8. Guarded by a shared secret,
 * because without one anybody could register a tenant and point StudioOS at a
 * site of their choosing.
 *
 * Compared with `timingSafeEqual`-style care elsewhere: this is a fixed-length
 * constant compared once per install, not per request, so a plain comparison
 * is not the weak link. It is still compared in full rather than by prefix.
 */
app.post('/register', async (c) => {
  const provided = c.req.header('x-connector-secret');
  if (!provided || provided !== c.env.CONNECTOR_SHARED_SECRET) {
    return c.json({ error: 'Not authorised to register a site.' }, 401);
  }

  const body = await c.req.json<{ host?: string; clientId?: string; clientSecret?: string }>();
  if (!body.host || !body.clientId || !body.clientSecret) {
    return c.json({ error: 'host, clientId and clientSecret are all required.' }, 400);
  }

  try {
    const tenant = await putTenant(c.env, {
      host: body.host,
      clientId: body.clientId,
      clientSecret: body.clientSecret,
    });
    // Deliberately does not echo the secret back.
    return c.json({ host: tenant.host, origin: tenant.origin, registered: true });
  } catch (err) {
    if (err instanceof InvalidDomainError) return c.json({ error: err.message }, 400);
    throw err;
  }
});

/**
 * Begin sign-in: `GET /auth/start?site=moonlightfilms.erpnext.com`
 *
 * Reads the site's own OIDC discovery document rather than assuming endpoint
 * paths, so a self-hosted ERPNext on a different version works through the
 * same code path as Frappe Cloud.
 */
app.get('/start', async (c) => {
  /**
   * Failures here go back to the sign-in screen, not out as JSON. This endpoint
   * is only ever reached by a browser navigation, so a JSON body would be a
   * dead end with no way back -- the person would be staring at
   * `{"error":…}` with nothing to click.
   */
  const backToSignIn = (error: string, hint?: string, site?: string) => {
    const q = new URLSearchParams({ error });
    if (hint) q.set('hint', hint);
    if (site) q.set('site', site);
    return c.redirect(`${c.env.APP_UI_ORIGIN.replace(/\/$/, '')}/sign-in?${q}`, 302);
  };

  const site = c.req.query('site');
  if (!site) return backToSignIn('Enter your ERPNext site address.');

  let host: string;
  try {
    host = normaliseHost(site);
  } catch (err) {
    if (err instanceof InvalidDomainError) return backToSignIn(err.message, undefined, site);
    throw err;
  }

  const tenant = await getTenant(c.env, host);
  if (!tenant) {
    return backToSignIn(
      `${host} is not connected to StudioOS yet.`,
      'Install the StudioOS connector on that site, then try again.',
      site,
    );
  }

  const issuer = new URL(tenant.origin);

  /**
   * oauth4webapi refuses plain HTTP, which is correct: an authorization code
   * exchange in clear text hands the session to anyone on the path. The local
   * dev bench genuinely is HTTP, so the refusal is waived for it alone --
   * decided by the fixed host list in lib/tenants.ts, never inferred from the
   * URL, so a real customer site can never end up here.
   */
  const insecureOk = allowsInsecureTransport(host);
  const discovered = await oauth.discoveryRequest(issuer, {
    algorithm: 'oidc',
    [oauth.allowInsecureRequests]: insecureOk,
    [oauth.customFetch]: followRedirects,
  });
  const as = await oauth.processDiscoveryResponse(issuer, discovered);

  if (!as.authorization_endpoint) {
    return c.json({ error: `${host} does not advertise an authorization endpoint.` }, 502);
  }

  // PKCE: the code alone is useless without the verifier, so an intercepted
  // code cannot be redeemed by whoever intercepted it.
  const verifier = oauth.generateRandomCodeVerifier();
  const challenge = await oauth.calculatePKCECodeChallenge(verifier);
  const state = oauth.generateRandomState();

  const authUrl = new URL(as.authorization_endpoint);
  authUrl.searchParams.set('client_id', tenant.clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri(c.env));
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', SCOPE);
  authUrl.searchParams.set('code_challenge', challenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  authUrl.searchParams.set('state', state);

  const sealed = await sealAuthState({ host, state, verifier }, c.env.SESSION_KEY);
  c.header('Set-Cookie', authStateCookie(sealed, c.env.APP_ORIGIN.startsWith('https://')));

  return c.redirect(authUrl.toString(), 302);
});

/**
 * Return from the studio's ERPNext: `GET /auth/callback?code=…&state=…`
 *
 * The `state` check is what makes this safe. Without it, an attacker could hand
 * a victim's browser an authorization code of their choosing and have StudioOS
 * sign that victim into the attacker's account.
 */
app.get('/callback', async (c) => {
  const secure = c.env.APP_ORIGIN.startsWith('https://');

  let saved: AuthState;
  try {
    saved = await openAuthState(getCookie(c.req.header('cookie'), AUTH_STATE_COOKIE), c.env.SESSION_KEY);
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Sign-in failed.' }, 400);
  }

  // Clear the round-trip cookie whatever happens next: it is single-use, and
  // leaving it live would allow a second attempt with the same verifier.
  c.header('Set-Cookie', clearAuthStateCookie(secure), { append: true });

  const tenant = await getTenant(c.env, saved.host);
  if (!tenant) return c.json({ error: `${saved.host} is no longer connected.` }, 404);

  const insecureOk = allowsInsecureTransport(saved.host);
  const issuer = new URL(tenant.origin);
  const as = await oauth.processDiscoveryResponse(
    issuer,
    await oauth.discoveryRequest(issuer, {
      algorithm: 'oidc',
      [oauth.allowInsecureRequests]: insecureOk,
      [oauth.customFetch]: followRedirects,
    }),
  );

  const client: oauth.Client = { client_id: tenant.clientId };
  const clientAuth = oauth.ClientSecretPost(tenant.clientSecret);

  let params: URLSearchParams;
  try {
    params = oauth.validateAuthResponse(as, client, new URL(c.req.url), saved.state);
  } catch (err) {
    return c.json({ error: `${saved.host} refused the sign-in.`, detail: String(err) }, 400);
  }

  const tokenResponse = await oauth.authorizationCodeGrantRequest(
    as,
    client,
    clientAuth,
    params,
    redirectUri(c.env),
    saved.verifier,
    { [oauth.allowInsecureRequests]: insecureOk },
  );

  const tokens = await oauth.processAuthorizationCodeResponse(as, client, tokenResponse);

  const user = await whoami(tenant.origin, tokens.access_token);
  if (!user) return c.json({ error: 'Signed in, but the site would not say who you are.' }, 502);

  const session: Session = {
    host: tenant.host,
    user,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    accessExpiresAt: Math.floor(Date.now() / 1000) + (tokens.expires_in ?? 3600),
  };
  c.header('Set-Cookie', sessionCookie(await sealSession(session, c.env.SESSION_KEY), secure), {
    append: true,
  });

  return c.redirect(`${c.env.APP_UI_ORIGIN.replace(/\/$/, '')}/projects`, 302);
});

/** Who the access token belongs to, according to the site that issued it. */
async function whoami(origin: string, accessToken: string): Promise<string | null> {
  const res = await fetch(`${origin}/api/method/frappe.auth.get_logged_user`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { message?: string };
  return body.message && body.message !== 'Guest' ? body.message : null;
}

/** Who am I, for the frontend. 401 when not signed in. */
app.get('/me', async (c) => {
  try {
    const session = await openSession(
      getCookie(c.req.header('cookie'), SESSION_COOKIE),
      c.env.SESSION_KEY,
    );
    return c.json({ host: session.host, user: session.user });
  } catch {
    return c.json({ error: 'Not signed in.' }, 401);
  }
});

/**
 * Sign out. Revokes the token at the studio's own site as well as dropping our
 * cookie -- otherwise the token stays valid there until it expires, and
 * "signed out" would be true only in this browser.
 */
app.post('/logout', async (c) => {
  const secure = c.env.APP_ORIGIN.startsWith('https://');
  c.header('Set-Cookie', clearSessionCookie(secure), { append: true });

  try {
    const session = await openSession(
      getCookie(c.req.header('cookie'), SESSION_COOKIE),
      c.env.SESSION_KEY,
    );
    const tenant = await getTenant(c.env, session.host);
    if (tenant) {
      // Best effort. A failed revocation must not leave the user unable to
      // sign out of StudioOS itself.
      await fetch(`${tenant.origin}/api/method/frappe.integrations.oauth2.revoke_token`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: session.accessToken }),
      }).catch(() => undefined);
    }
  } catch {
    // Not signed in, or an unreadable cookie. Clearing it is still correct.
  }

  return c.json({ signedOut: true });
});

/** Minimal cookie reader -- Hono's helper is not worth a dependency here. */
function getCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return rest.join('=') || undefined;
  }
  return undefined;
}

export default app;
