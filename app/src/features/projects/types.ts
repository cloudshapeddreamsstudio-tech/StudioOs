/**
 * The shape /api/projects returns.
 *
 * One field is custom: `custom_sanction_amount`. It is not stock ERPNext. A
 * site gets it from erpnext/schema/0001, and a site that does not have it
 * sends rows without that key. ADR-0005.
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

  /**
   * The one custom field. Absent from the row, not null, when the ERPNext site
   * does not have it: read it as "not available", never as 0.
   */
  custom_sanction_amount?: number | null;

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
