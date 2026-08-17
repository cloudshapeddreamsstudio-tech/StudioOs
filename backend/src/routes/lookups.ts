import { Hono } from 'hono';
import type { AppEnv } from '../types';

/**
 * The three picker endpoints that populate dropdowns on the project form.
 *
 * In the old app these were three separate ~20-line files (`salesPersons.js`,
 * `projectTypes.js`, `projectTemplates.js`) that differed only in doctype and
 * field list. Consolidated here since they are one concern — reference data for
 * form pickers — while keeping their original mount paths so the API contract
 * is unchanged.
 */

/**
 * GET /api/sales-persons — populates the "Referred By" picker.
 * `is_group = 0` excludes the tree's parent nodes, which aren't selectable.
 */
export const salesPersons = new Hono<AppEnv>().get('/', async (c) => {
  const frappe = c.get('frappe');
  const data = await frappe.getList('Sales Person', {
    fields: ['name', 'sales_person_name', 'commission_rate'],
    filters: [['is_group', '=', 0]],
    limit: 500,
    orderBy: 'sales_person_name asc',
  });
  return c.json(data);
});

/** GET /api/project-types — populates the "Project Type" picker. */
export const projectTypes = new Hono<AppEnv>().get('/', async (c) => {
  const frappe = c.get('frappe');
  const data = await frappe.getList('Project Type', {
    fields: ['name', 'project_type'],
    limit: 200,
    orderBy: 'project_type asc',
  });
  return c.json(data);
});

/**
 * GET /api/project-templates — ERPNext Project Templates (e.g. "Ad Film
 * Production", "Workshop / Education"), each with its task count.
 *
 * Setting a template on a new project makes ERPNext copy its full task
 * checklist onto the project automatically. This just surfaces what is already
 * in ERPNext; it is not a separate templating system.
 *
 * The task counts need one getDoc per template, so this is N+1 by nature. It is
 * bounded (the studio has a handful of templates) and the calls run in
 * parallel, but it is the one endpoint here worth watching if the template list
 * ever grows — Workers cap subrequests per invocation.
 */
export const projectTemplates = new Hono<AppEnv>().get('/', async (c) => {
  const frappe = c.get('frappe');

  /**
   * `disabled` is not a stock field on Project Template.
   *
   * It exists on the CSDS site and not on a plain ERPNext v15, so asking for it
   * unconditionally fails there with "Field not permitted in query: disabled"
   * and the template picker breaks entirely. Asking for it and falling back is
   * what lets one build serve sites whose schemas differ — the general form of
   * the problem Phase 8 has to solve properly.
   *
   * The order matters: try the richer query first, so a site that *does* track
   * disabled templates keeps hiding them.
   */
  const templates = await frappe
    .getList<{ name: string }>('Project Template', {
      fields: ['name', 'project_type', 'disabled'],
      filters: [['disabled', '=', 0]],
      limit: 100,
      orderBy: 'name asc',
    })
    .catch(() =>
      frappe.getList<{ name: string }>('Project Template', {
        fields: ['name', 'project_type'],
        limit: 100,
        orderBy: 'name asc',
      }),
    );

  const withTaskCounts = await Promise.all(
    templates.map(async (t) => {
      const doc = await frappe.getDoc<{ tasks?: { subject: string }[] }>(
        'Project Template',
        t.name,
      );
      const tasks = doc.tasks ?? [];
      return {
        id: t.name,
        name: t.name,
        task_count: tasks.length,
        tasks: tasks.map((task) => task.subject),
      };
    }),
  );

  return c.json(withTaskCounts);
});
