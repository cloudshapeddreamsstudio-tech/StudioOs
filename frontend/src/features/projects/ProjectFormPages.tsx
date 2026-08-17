import { useParams } from 'react-router-dom';
import { ProjectForm } from './ProjectForm';
import { useCreateProject, useUpdateProject } from './formApi';
import { useProjectDetail } from './detailApi';
import type { ProjectFormValues } from './projectSchema';

/** New project. */
export function ProjectCreatePage() {
  const create = useCreateProject();
  return (
    <ProjectForm
      mode="create"
      cancelTo="/projects"
      onSubmit={(values) => create.mutateAsync(values)}
    />
  );
}

/**
 * Edit an existing project.
 *
 * Reuses the detail aggregate rather than fetching the project again, so the
 * form is never populated from data that disagrees with the page the person
 * just came from.
 */
export function ProjectEditPage() {
  const { name = '' } = useParams();
  const { data, isPending, error } = useProjectDetail(name);
  const update = useUpdateProject(name);

  if (isPending) return <p className="text-sm text-gray-400">Loading…</p>;

  if (error || !data) {
    return (
      <p className="text-sm text-red-500">
        Couldn&apos;t load this project to edit: {error?.message ?? 'not found'}
      </p>
    );
  }

  const p = data.project as Record<string, unknown>;

  return (
    <ProjectForm
      mode="edit"
      subtitle={`${data.project.project_name} · ${name}`}
      cancelTo={`/projects/${encodeURIComponent(name)}`}
      defaultValues={toFormValues(p)}
      onSubmit={(values) => update.mutateAsync(values)}
    />
  );
}

/**
 * ERPNext's own field names differ from the form's, because the API takes the
 * friendlier ones and maps them (`sanctioned_amount` -> `custom_sanction_amount`).
 * This is the other half of that mapping.
 */
function toFormValues(p: Record<string, unknown>): Partial<ProjectFormValues> {
  const text = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
  const num = (v: unknown) =>
    v === null || v === undefined || v === '' ? undefined : String(v);

  return {
    project_name: text(p.project_name) ?? '',
    customer: text(p.customer) ?? '',
    // A project already Completed keeps that status; the form just cannot set it.
    status: text(p.status) ?? 'Open',
    expected_start_date: text(p.expected_start_date),
    expected_end_date: text(p.expected_end_date),
    project_type: text(p.project_type),
    sales_person: text(p.custom_sales_person),
    commission_percent: num(p.custom_commission_percent),
    sanctioned_amount: num(p.custom_sanction_amount),
    brand: text(p.custom_brand),
    ad_agency: text(p.custom_ad_agency),
    production_house: text(p.custom_production_house),
    poc: text(p.custom_poc),
    shoot_date: text(p.custom_shoot_date),
  };
}
