import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { errorHandler } from './middleware/errorHandler';
import { requireSession } from './middleware/requireSession';
import projects from './routes/projects';
import projectDetail from './routes/projectDetail';
import projectCrew from './routes/projectCrew';
import customers from './routes/customers';
import { salesPersons, projectTypes, projectTemplates } from './routes/lookups';
import dashboard from './routes/dashboard';
import insights from './routes/insights';
import payables from './routes/payables';
import tasks from './routes/tasks';
import clients from './routes/clients';
import vendors from './routes/vendors';
import equipment from './routes/equipment';
import inventory from './routes/inventory';
import invoices from './routes/invoices';
import payments from './routes/payments';
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
 * ## What is mounted, and what is still waiting (Phase 10a)
 *
 * Projects, plus the pure-ERPNext read surface that 6a had withdrawn:
 * dashboard, insights, payables, tasks, clients, vendors, equipment and
 * inventory. Every one of them runs on the signed-in user's token, which is
 * not what they were originally built against — so each was re-verified rather
 * than assumed to still work.
 *
 * Still unmounted, and why:
 *
 *  - `brand`, `projectExpenses`, `studioRental`, `subscriptions`,
 *    `transactions` — all read D1, and the binding is gone because ERPNext is
 *    the only database. Phase 10f decides where that data actually belongs
 *    before any of them come back. They are excluded from type-checking in
 *    tsconfig.json for the same reason.
 *
 *  - `projectCrew` is mounted: Phase 10f decided the crew/vendor roster maps
 *    onto a Draft `Purchase Order` per member (native ERPNext, no D1), so it
 *    no longer belongs on the D1-blocked list above.
 *
 * Do not delete them, and do not re-mount one without doing its phase.
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
app.route('/api/project-crew', projectCrew);

// Pickers for the project form (Phase 7c). Read-only lists; each runs on the
// signed-in user's token like everything else, so a user who cannot read
// Customers simply gets an empty picker rather than someone else's data.
app.route('/api/customers', customers);
app.route('/api/sales-persons', salesPersons);
app.route('/api/project-types', projectTypes);
app.route('/api/project-templates', projectTemplates);

// Phase 10a. All read-only against ERPNext apart from `tasks`, which the Kanban
// writes to.
app.route('/api/dashboard', dashboard);
app.route('/api/insights', insights);
app.route('/api/payables', payables);
app.route('/api/tasks', tasks);
app.route('/api/vendors', vendors);
app.route('/api/equipment', equipment);
app.route('/api/inventory', inventory);
// Mounted twice, as in the old app: `/api/clients` is the list, `/api/client`
// is one client's aggregate. Same router, and the paths are part of the
// contract the pages were written against.
app.route('/api/clients', clients);
app.route('/api/client', clients);

// Phase 10c. Invoices write to a real accounting system, so two rules hold:
// creation is always a DRAFT and submitting is a separate deliberate call, and
// every account posted to is read from the studio's own Company record rather
// than named here -- see lib/companyProfile.ts.
app.route('/api/invoices', invoices);
app.route('/api/payments', payments);

app.notFound((c) => c.json({ error: 'Not found' }, 404));

export default {
  fetch: app.fetch,
} satisfies ExportedHandler<Env>;
