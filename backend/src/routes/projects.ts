import { Hono } from 'hono';
import type { FrappeClient } from '../lib/frappe';
import { computeSmartAction } from '../lib/smartAction';
import {
  PROJECT_LIST_FIELDS,
  createProjectSchema,
  updateProjectSchema,
} from '../schemas/project';
import type { AppEnv } from '../types';

/**
 * Projects. Ported from the old `server/routes/projects.js` -- same queries,
 * same enrichment, same ERPNext quirks, same behaviour.
 */

const app = new Hono<AppEnv>();

/**
 * Resolve a customer name typed into the project form to an existing
 * Customer's docname, or create a new Customer on the fly if it doesn't match
 * one. The studio adds new clients often enough that requiring a separate
 * "add customer first" step would just be friction.
 */
async function resolveCustomer(frappe: FrappeClient, customerName: string): Promise<string> {
  const existing = await frappe.getList<{ name: string }>('Customer', {
    fields: ['name', 'customer_name'],
    filters: [['customer_name', '=', customerName]],
    limit: 1,
  });
  if (existing.length && existing[0]) return existing[0].name;
  const created = await frappe.createDoc<{ name: string }>('Customer', {
    customer_name: customerName,
    customer_type: 'Company',
  });
  return created.name;
}

/**
 * Same on-the-fly-create pattern, but for Sales Person -- "who brought this
 * project in" can be a crew member, an agency, a middleman, or the studio
 * itself, so typing a new name just creates the record.
 */
async function resolveSalesPerson(frappe: FrappeClient, salesPersonName: string): Promise<string> {
  const existing = await frappe.getList<{ name: string }>('Sales Person', {
    fields: ['name', 'sales_person_name'],
    filters: [['sales_person_name', '=', salesPersonName]],
    limit: 1,
  });
  if (existing.length && existing[0]) return existing[0].name;
  const created = await frappe.createDoc<{ name: string }>('Sales Person', {
    sales_person_name: salesPersonName,
    is_group: 0,
    enabled: 1,
  });
  return created.name;
}

/** And again for Project Type -- a handful exist (Corporate, Documentary,
 *  Short Film) but typing a new category shouldn't be blocked on setup. */
async function resolveProjectType(frappe: FrappeClient, projectTypeName: string): Promise<string> {
  const existing = await frappe.getList<{ name: string }>('Project Type', {
    fields: ['name', 'project_type'],
    filters: [['project_type', '=', projectTypeName]],
    limit: 1,
  });
  if (existing.length && existing[0]) return existing[0].name;
  const created = await frappe.createDoc<{ name: string }>('Project Type', {
    project_type: projectTypeName,
  });
  return created.name;
}

/**
 * A row from the Project list query. The named fields are the ones the
 * enrichment below actually reads; the index signature carries the rest of
 * PROJECT_LIST_FIELDS through to the response untouched.
 */
type ProjectRow = Record<string, unknown> & {
  name: string;
  status?: string;
  total_billed_amount?: number | null;
};

interface TaskRow {
  project: string;
  status: string;
  is_group: number;
  subject: string;
  lft: number;
}

interface SalesRow {
  project: string;
  outstanding_amount: number;
  status: string;
}

/**
 * GET /api/projects
 *
 * Lists projects, each enriched with checklist progress, the current phase,
 * and a deterministic "smart" next-step action. The enrichment uses two
 * batched queries (all tasks and all sales invoices for the listed projects at
 * once) rather than N per-project calls, so the list stays a small, fixed
 * number of round-trips. That mattered on Node and matters more on Workers,
 * where each subrequest counts against a per-request cap.
 */
app.get('/', async (c) => {
  const frappe = c.get('frappe');

  const data = await frappe.getList<ProjectRow>('Project', {
    fields: [...PROJECT_LIST_FIELDS],
    limit: 200,
    orderBy: 'creation desc',
  });
  const names = data.map((p) => p.name);

  const tasksByProject: Record<string, TaskRow[]> = {};
  const salesByProject: Record<string, SalesRow[]> = {};

  if (names.length) {
    const [allTasks, allSales] = await Promise.all([
      frappe
        .getList<TaskRow>('Task', {
          fields: ['project', 'status', 'is_group', 'subject', 'lft'],
          filters: [
            ['project', 'in', names],
            ['is_template', '=', 0],
          ],
          limit: 2000,
          orderBy: 'lft asc',
        })
        .catch(() => [] as TaskRow[]),
      frappe
        .getList<SalesRow>('Sales Invoice', {
          fields: ['project', 'outstanding_amount', 'status'],
          filters: [['project', 'in', names]],
          limit: 500,
        })
        .catch(() => [] as SalesRow[]),
    ]);

    for (const t of allTasks) (tasksByProject[t.project] ||= []).push(t);
    for (const s of allSales) (salesByProject[s.project] ||= []).push(s);
  }

  const enriched = data.map((p) => {
    const tasks = tasksByProject[p.name] || [];
    const actionable = tasks.filter((t) => !t.is_group);
    const completed = actionable.filter((t) => t.status === 'Completed').length;
    const progress = actionable.length ? Math.round((completed / actionable.length) * 100) : 0;

    // Current phase = the phase header (is_group row) that precedes the first
    // not-yet-completed task, walking the tree in lft order.
    let phase: string | null = null;
    let lastGroup: string | null = null;
    let foundOpen = false;
    for (const t of tasks) {
      if (t.is_group) {
        lastGroup = t.subject;
        continue;
      }
      if (t.status !== 'Completed' && t.status !== 'Cancelled') {
        phase = lastGroup;
        foundOpen = true;
        break;
      }
    }
    if (!foundOpen && lastGroup) phase = lastGroup; // all done -> last phase

    const sales = salesByProject[p.name] || [];
    // A Draft hasn't been sent to the client, so its outstanding_amount isn't
    // real money owed yet -- only submitted-but-unpaid counts.
    const salesOutstanding = sales
      .filter((s) => s.status !== 'Cancelled' && s.status !== 'Draft')
      .reduce((sum, s) => sum + Number(s.outstanding_amount || 0), 0);
    const hasDraft = sales.some((s) => s.status === 'Draft');

    const smartAction = computeSmartAction(p, {
      progress,
      phase,
      actionableCount: actionable.length,
      salesOutstanding,
      hasDraft,
    });

    return { ...p, progress, phase, smartAction };
  });

  return c.json(enriched);
});

/** GET /api/projects/:name -- single project detail. */
app.get('/:name', async (c) => {
  const frappe = c.get('frappe');
  const data = await frappe.getDoc('Project', c.req.param('name'));
  return c.json(data);
});

/**
 * POST /api/projects -- create a project.
 *
 * Setting `project_template` is enough to get a full checklist of real Task
 * docs for free: ERPNext copies the template's tasks (with phase grouping and
 * relative dates) onto the new project automatically on insert.
 */
app.post('/', async (c) => {
  const frappe = c.get('frappe');
  const body = createProjectSchema.parse(await c.req.json());

  const customerName = await resolveCustomer(frappe, body.customer);
  const projectTypeName = body.project_type
    ? await resolveProjectType(frappe, body.project_type)
    : undefined;
  const salesPersonName = body.sales_person
    ? await resolveSalesPerson(frappe, body.sales_person)
    : undefined;

  const data = await frappe.createDoc<{ name: string }>('Project', {
    naming_series: 'PROJ-.####',
    project_name: body.project_name,
    company: c.env.COMPANY,
    customer: customerName,
    status: body.status || 'Open',
    expected_start_date: body.expected_start_date || null,
    expected_end_date: body.expected_end_date || null,
    project_type: projectTypeName || null,
    project_template: body.project_template || null,
    custom_sales_person: salesPersonName || null,
    custom_commission_percent: body.commission_percent || null,
    custom_sanction_amount: body.sanctioned_amount || null,
    custom_brand: body.brand || null,
    custom_ad_agency: body.ad_agency || null,
    custom_production_house: body.production_house || null,
    custom_poc: body.poc || null,
    custom_shoot_date: body.shoot_date || null,
  });

  /**
   * Every new project gets supplementary default checklist tasks, on top of
   * whatever the chosen Project Template already added. These fold the payment
   * milestones INTO the checklist so progress can't reach 100% while money is
   * still outstanding.
   *
   * Each default task carries an invisible HTML-comment marker in its
   * description so the auto-tick sync can find it by TYPE, not by exact
   * subject text -- that is what lets the milestone task be renamed (e.g.
   * "Shoot Date" -> "Edit Days") without breaking auto-complete.
   *
   * "Vendor Payment Made" is intentionally NOT added here: a brand new project
   * has no roster yet, so it is added later by the idempotent sync once a
   * Vendor roster entry actually exists.
   */
  try {
    const existingTasks = await frappe
      .getList<{ name: string; subject: string }>('Task', {
        fields: ['name', 'subject'],
        filters: [['project', '=', data.name]],
        limit: 100,
      })
      .catch(() => [] as { name: string; subject: string }[]);

    const existingSubjects = new Set(
      existingTasks.map((t) => String(t.subject || '').trim().toLowerCase()),
    );

    const defaultTasks = [
      { subject: 'Shoot Date', marker: 'milestone-primary' },
      { subject: 'Invoice Mailed', marker: 'milestone-invoice-mailed' },
      { subject: 'Invoice Cleared', marker: 'milestone-invoice-cleared' },
      { subject: 'Crew Payment Made', marker: 'milestone-crew-paid' },
    ];

    for (const { subject, marker } of defaultTasks) {
      if (existingSubjects.has(subject.toLowerCase())) continue;
      await frappe
        .createDoc('Task', {
          project: data.name,
          subject,
          status: 'Open',
          description: `<!--${marker}-->`,
        })
        .catch((err: Error) =>
          console.error(`default task "${subject}" creation failed for ${data.name}:`, err.message),
        );
    }
  } catch (err) {
    console.error(`default task setup failed for ${data.name}:`, (err as Error).message);
  }

  return c.json(data);
});

/**
 * PUT /api/projects/:name -- update project fields. A full edit and a
 * quick status-only change both come through here.
 */
app.put('/:name', async (c) => {
  const frappe = c.get('frappe');
  const body = updateProjectSchema.parse(await c.req.json());
  const patch: Record<string, unknown> = {};

  if (body.project_name !== undefined) patch.project_name = body.project_name;
  if (body.notes !== undefined) patch.notes = body.notes;

  /**
   * "Completed" is a derived status, not a manual choice -- a project is only
   * done once every task is checked off AND every crew/vendor bill is fully
   * paid. This route silently drops an incoming "Completed" rather than
   * writing it. That is harmless when it is just the current value passing
   * through on an unrelated edit (e.g. changing Brand on an already-completed
   * project), and it can't be used to force completion manually.
   */
  if (body.status !== undefined && body.status !== 'Completed') patch.status = body.status;

  if (body.expected_start_date !== undefined) patch.expected_start_date = body.expected_start_date;
  if (body.expected_end_date !== undefined) patch.expected_end_date = body.expected_end_date;
  if (body.customer !== undefined) patch.customer = await resolveCustomer(frappe, body.customer);
  if (body.project_type !== undefined) {
    patch.project_type = body.project_type
      ? await resolveProjectType(frappe, body.project_type)
      : null;
  }
  if (body.sales_person !== undefined) {
    patch.custom_sales_person = body.sales_person
      ? await resolveSalesPerson(frappe, body.sales_person)
      : null;
  }
  if (body.commission_percent !== undefined) {
    patch.custom_commission_percent = body.commission_percent || null;
  }
  if (body.sanctioned_amount !== undefined) {
    patch.custom_sanction_amount = body.sanctioned_amount || null;
  }
  if (body.brand !== undefined) patch.custom_brand = body.brand || null;
  if (body.production_house !== undefined) {
    patch.custom_production_house = body.production_house || null;
  }
  if (body.poc !== undefined) patch.custom_poc = body.poc || null;
  if (body.ad_agency !== undefined) patch.custom_ad_agency = body.ad_agency || null;
  if (body.shoot_date !== undefined) patch.custom_shoot_date = body.shoot_date || null;

  const data = await frappe.updateDoc('Project', c.req.param('name'), patch);
  return c.json(data);
});

export default app;
