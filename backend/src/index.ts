import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { errorHandler } from './middleware/errorHandler';
import { requireSession } from './middleware/requireSession';
import projects from './routes/projects';
import projectDetail from './routes/projectDetail';
import customers from './routes/customers';
import { salesPersons, projectTypes, projectTemplates } from './routes/lookups';
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
 * `/auth/*` signs a person in against their own studio's ERPNext. Everything
 * under `/api/*` then runs **as that person**, on their token.
 *
 * There is no admin key and no fallback to one. That is the point: StudioOS
 * cannot read a studio's books on its own authority, so a leak of anything
 * StudioOS holds does not expose them. ERPNext decides what each request may
 * see, which is also why StudioOS contains no permission logic.
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

// Health is deliberately outside the session gate: an uptime check must not
// need credentials.
app.get('/api/health', (c) =>
  c.json({
    ok: true,
    registryBound: Boolean(c.env.TENANTS),
    appOrigin: c.env.APP_ORIGIN,
  }),
);

/**
 * Everything else under /api requires a signed-in person, and runs as them.
 * There is no admin key to fall back to -- see middleware/requireSession.ts.
 */
app.use('/api/*', requireSession);

app.route('/api/projects', projects);
// Mirrors the old app's /api/project (singular, one aggregate) vs
// /api/projects (plural, the list) split.
app.route('/api/project', projectDetail);

// Pickers for the project form (Phase 7c). Read-only lists; each runs on the
// signed-in user's token like everything else, so a user who cannot read
// Customers simply gets an empty picker rather than someone else's data.
app.route('/api/customers', customers);
app.route('/api/sales-persons', salesPersons);
app.route('/api/project-types', projectTypes);
app.route('/api/project-templates', projectTemplates);

app.notFound((c) => c.json({ error: 'Not found' }, 404));

export default {
  fetch: app.fetch,
} satisfies ExportedHandler<Env>;
