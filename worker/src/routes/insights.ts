import { Hono } from 'hono';
import { getListTolerant, SchemaGapError } from '../lib/optionalFields';
import type { AppEnv } from '../types';

/**
 * GET /api/insights — rule-based "what needs attention" alerts, computed
 * directly from ERPNext. No AI: four independent queries, each turned into a
 * plain-language alert card.
 *
 * Ported from `server/routes/insights.js`. One necessary change: the old cards
 * linked to page filenames (`tasks-kanban.html`, `invoices.html`), which do not
 * exist in an SPA. Links are now StudioOS routes. Cards whose destination has
 * not been built yet still carry the route — the router will 404 rather than
 * silently doing nothing, which is the more honest failure.
 */

const app = new Hono<AppEnv>();

interface Insight {
  severity: 'critical' | 'warning' | 'info';
  title: string;
  detail: string;
  count: number;
  link: string | null;
}

/** Pluralises without the `${n === 1 ? '' : 's'}` repeated at every call site. */
function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

app.get('/', async (c) => {
  const frappe = c.get('frappe');
  const insights: Insight[] = [];

  // The four queries are independent, so fetch them together rather than in
  // series as the original did.
  const [overdueTasks, overdueInvoices, openProjects, outOfServiceEquipment] = await Promise.all([
    frappe.getList<{ project?: string | null }>('Task', {
      fields: ['name', 'subject', 'project', 'exp_end_date'],
      filters: [
        ['status', '=', 'Overdue'],
        ['is_template', '=', 0],
        ['is_group', '=', 0],
      ],
      limit: 500,
    }),
    frappe.getList<{
      name: string; customer?: string; due_date?: string | null; outstanding_amount?: number | null;
    }>('Sales Invoice', {
      fields: ['name', 'customer', 'project', 'due_date', 'outstanding_amount'],
      filters: [['status', '=', 'Overdue']],
      limit: 500,
      orderBy: 'due_date asc',
    }),
    frappe.getList<{ name: string; project_name?: string; expected_end_date?: string | null }>(
      'Project',
      {
        fields: ['name', 'project_name', 'expected_end_date'],
        filters: [['status', '=', 'Open']],
        limit: 500,
      },
    ),
    /**
     * `equipment_status` is a CSDS custom field. On a site without it this
     * query cannot be answered at all — the filter is what makes it mean
     * "broken gear", so there is no degraded version to fall back to.
     *
     * `null` therefore means "this site cannot say", which is deliberately not
     * the same as an empty list. Before this, the raw 417 escaped and took the
     * three unrelated insight cards down with it.
     */
    getListTolerant<{ item_name: string; equipment_status: string }>(frappe, 'Item', {
      fields: ['item_code', 'item_name', 'equipment_status'],
      filters: [
        ['item_group', '=', 'In-House Equipment'],
        ['equipment_status', 'in', ['In Repair', 'In Maintenance']],
      ],
      limit: 500,
    })
      .then((r) => r.rows)
      .catch((err: unknown) => {
        if (err instanceof SchemaGapError) return null;
        throw err;
      }),
  ]);

  // 1. Overdue tasks, with the worst-affected projects named.
  if (overdueTasks.length) {
    const byProject: Record<string, number> = {};
    for (const t of overdueTasks) {
      const key = t.project || 'Unassigned';
      byProject[key] = (byProject[key] ?? 0) + 1;
    }
    const projectList = Object.entries(byProject)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([p, n]) => `${p} (${n})`)
      .join(', ');

    insights.push({
      severity: 'critical',
      title: plural(overdueTasks.length, 'overdue task'),
      detail: `Across: ${projectList}`,
      count: overdueTasks.length,
      link: '/tasks',
    });
  }

  // 2. Invoice aging.
  if (overdueInvoices.length) {
    const totalOutstanding = overdueInvoices.reduce(
      (s, i) => s + Number(i.outstanding_amount || 0),
      0,
    );
    const oldest = overdueInvoices[0];
    insights.push({
      severity: 'critical',
      title: `${plural(overdueInvoices.length, 'overdue invoice')}, ₹${totalOutstanding.toLocaleString('en-IN')} outstanding`,
      detail: oldest
        ? `Oldest: ${oldest.name} (${oldest.customer}), due ${oldest.due_date || '—'}`
        : '',
      count: overdueInvoices.length,
      link: '/invoices',
    });
  }

  // 3. Open projects past their expected end date.
  const today = new Date().toISOString().slice(0, 10);
  const staleProjects = openProjects.filter(
    (p) => p.expected_end_date && p.expected_end_date < today,
  );
  if (staleProjects.length) {
    insights.push({
      severity: 'warning',
      title: `${plural(staleProjects.length, 'open project')} past its expected end date`,
      detail: staleProjects.slice(0, 5).map((p) => p.project_name || p.name).join(', '),
      count: staleProjects.length,
      link: '/projects',
    });
  }

  // 4. In-house gear out of service — only if this site tracks that at all.
  if (outOfServiceEquipment?.length) {
    insights.push({
      severity: 'info',
      title: `${plural(outOfServiceEquipment.length, 'in-house item')} out of service`,
      detail: outOfServiceEquipment
        .slice(0, 5)
        .map((i) => `${i.item_name} (${i.equipment_status})`)
        .join(', '),
      count: outOfServiceEquipment.length,
      link: '/inventory',
    });
  }

  /**
   * "All clear" has to be true of what was actually checked. On a site with no
   * `equipment_status` field, gear was never examined, and listing it as
   * available would be the vacuous truth this codebase keeps guarding against
   * -- the same shape as `noCrewAssigned` on project detail.
   */
  if (!insights.length) {
    const checked = ['No overdue tasks', 'no overdue invoices', 'no stale projects'];
    insights.push({
      severity: 'info',
      title: 'All clear',
      detail:
        outOfServiceEquipment === null
          ? `${checked.join(', ')}. Gear condition is not tracked on this site, so it was not checked.`
          : `${checked.join(', ')}, all in-house gear available.`,
      count: 0,
      link: null,
    });
  }

  return c.json(insights);
});

export default app;
