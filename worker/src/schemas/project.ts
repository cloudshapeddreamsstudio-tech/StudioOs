import { z } from 'zod';

/**
 * Fields pulled for the project list. Kept in one place so the list query and
 * the frontend's Project type can't drift.
 *
 * One custom field is here: `custom_sanction_amount`, which ADR-0005 permits
 * (erpnext/schema/0001). The list had seven more. ADR-0005 does not permit them
 * in release 1, so StudioOS does not read them and does not write them. Each
 * one returns as a file in erpnext/schema/ when a screen needs it.
 */
export const PROJECT_LIST_FIELDS = [
  'name',
  'project_name',
  'customer',
  'status',
  'project_type',
  'project_template',
  'custom_sanction_amount',
  'expected_start_date',
  'expected_end_date',
  'total_billed_amount',
  'total_purchase_cost',
  'gross_margin',
  'per_gross_margin',
] as const;

export const createProjectSchema = z.object({
  project_name: z.string().min(1, 'project_name is required'),
  customer: z.string().min(1, 'customer is required'),
  status: z.string().optional(),
  expected_start_date: z.string().nullable().optional(),
  expected_end_date: z.string().nullable().optional(),
  project_type: z.string().optional(),
  project_template: z.string().nullable().optional(),
  sanctioned_amount: z.coerce.number().nullable().optional(),
});

export const updateProjectSchema = z
  .object({
    project_name: z.string(),
    customer: z.string(),
    status: z.string(),
    expected_start_date: z.string().nullable(),
    expected_end_date: z.string().nullable(),
    project_type: z.string().nullable(),
    sanctioned_amount: z.coerce.number().nullable(),
    notes: z.string(),
  })
  .partial();

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
