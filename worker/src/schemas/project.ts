import { z } from 'zod';

/** Fields pulled for the project list. Kept in one place so the list query and
 *  the frontend's Project type can't drift. */
export const PROJECT_LIST_FIELDS = [
  'name',
  'project_name',
  'customer',
  'status',
  'project_type',
  'project_template',
  'custom_sales_person',
  'custom_commission_percent',
  'custom_sanction_amount',
  'custom_shoot_date',
  'custom_brand',
  'custom_ad_agency',
  'custom_production_house',
  'custom_poc',
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
  sales_person: z.string().optional(),
  commission_percent: z.coerce.number().nullable().optional(),
  sanctioned_amount: z.coerce.number().nullable().optional(),
  brand: z.string().nullable().optional(),
  ad_agency: z.string().nullable().optional(),
  production_house: z.string().nullable().optional(),
  poc: z.string().nullable().optional(),
  shoot_date: z.string().nullable().optional(),
});

export const updateProjectSchema = z
  .object({
    project_name: z.string(),
    customer: z.string(),
    status: z.string(),
    expected_start_date: z.string().nullable(),
    expected_end_date: z.string().nullable(),
    project_type: z.string().nullable(),
    sales_person: z.string().nullable(),
    commission_percent: z.coerce.number().nullable(),
    sanctioned_amount: z.coerce.number().nullable(),
    notes: z.string(),
    brand: z.string().nullable(),
    ad_agency: z.string().nullable(),
    production_house: z.string().nullable(),
    poc: z.string().nullable(),
    shoot_date: z.string().nullable(),
  })
  .partial();

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
