/**
 * The shape /api/projects returns.
 *
 * Fields prefixed `custom_` are ERPNext custom fields added to the Project
 * doctype on this site -- they are not stock ERPNext, so they will not exist
 * on a fresh instance.
 */

export type SmartActionKind =
  | 'reopen'
  | 'invoice'
  | 'payment'
  | 'portfolio'
  | 'update'
  | 'equipment';

export interface SmartAction {
  label: string;
  kind: SmartActionKind;
  tab: string;
}

export interface Project {
  name: string;
  project_name: string;
  customer: string | null;
  status: string;
  project_type: string | null;
  project_template: string | null;

  custom_sales_person: string | null;
  custom_commission_percent: number | null;
  custom_sanction_amount: number | null;
  custom_shoot_date: string | null;
  custom_brand: string | null;
  custom_ad_agency: string | null;
  custom_production_house: string | null;
  custom_poc: string | null;

  expected_start_date: string | null;
  expected_end_date: string | null;

  total_billed_amount: number | null;
  total_purchase_cost: number | null;
  gross_margin: number | null;
  per_gross_margin: number | null;

  /** Computed server-side by the enrichment in routes/projects.ts. */
  progress: number;
  phase: string | null;
  smartAction: SmartAction;
}
