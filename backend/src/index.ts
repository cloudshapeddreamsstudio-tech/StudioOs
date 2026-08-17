import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { errorHandler } from './middleware/errorHandler';
import projects from './routes/projects';
import auth from './routes/auth';
import type { AppEnv, Env } from './types';

/**
 * StudioOS API.
 *
 * The Worker equivalent of the old `server/index.js`. Two differences worth
 * knowing:
 *
 *  - It no longer serves static files. The React app is deployed separately to
 *    Cloudflare Pages, which proxies /api/* here. In dev, Vite's proxy does the
 *    same, so the browser still sees one origin.
 *  - There is no per-route try/catch. `app.onError` handles every thrown error
 *    once, in middleware/errorHandler.ts.
 *
 * ## Only the Projects surface is mounted (Phase 6a)
 *
 * Every other route file is finished, tested work that stays in the repo
 * unmounted until Phase 10 widens the surface — see docs/PLAN-v2.md. Do not
 * delete them, and do not re-mount one without doing its phase.
 *
 * The ones that read or write D1 (`brand`, `projectCrew`, `projectExpenses`,
 * `projectDetail`, `studioRental`, `subscriptions`, `transactions`) cannot be
 * mounted at all right now: the D1 binding is gone, because ERPNext is the only
 * database. They are excluded from type-checking in tsconfig.json for the same
 * reason.
 *
 * ## Auth
 *
 * Still absent from the code at 6a. The original design put Cloudflare Access
 * in front of the Worker, which only ever worked for a single known user.
 * Phase 6b replaces it with per-user sign-in against each studio's own ERPNext,
 * after which no admin key exists anywhere.
 */

const app = new Hono<AppEnv>();

app.use('*', logger());

/**
 * Dev only in practice -- in production the SPA is served from the same
 * hostname, so requests are same-origin and this never fires.
 */
app.use(
  '/api/*',
  cors({
    origin: ['http://localhost:5173'],
    credentials: true,
  }),
);

app.onError(errorHandler);

// Not under /api: these are browser navigations, not XHR. The redirect URI is
// registered on every customer's ERPNext, so this path is effectively frozen.
app.route('/auth', auth);

app.route('/api/projects', projects);

app.get('/api/health', (c) =>
  c.json({
    ok: true,
    frappeConfigured: Boolean(c.env.FRAPPE_URL && c.env.FRAPPE_API_KEY && c.env.FRAPPE_API_SECRET),
  }),
);

app.notFound((c) => c.json({ error: 'Not found' }, 404));

export default {
  fetch: app.fetch,
} satisfies ExportedHandler<Env>;
