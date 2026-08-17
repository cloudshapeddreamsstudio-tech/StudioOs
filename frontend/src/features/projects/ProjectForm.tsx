import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from 'react-router-dom';
import {
  projectFormSchema,
  SELECTABLE_STATUSES,
  type ProjectFormValues,
  type ProjectFormOutput,
} from './projectSchema';
import {
  useCustomers,
  useProjectTypes,
  useProjectTemplates,
  useSalesPersons,
  describeSaveError,
} from './formApi';

/**
 * The first form in this codebase, so it sets the pattern for the rest.
 *
 * Three decisions worth keeping:
 *
 *  - Validation lives in one schema shared with the server's rules, not
 *    scattered across inputs.
 *  - A refusal from ERPNext is shown as a refusal, not as a crash. The studio's
 *    own permissions saying no is a correct outcome.
 *  - The Save button reports what is happening. A form that silently does
 *    nothing for two seconds gets clicked again, and a double-submitted create
 *    is two projects.
 */

interface Props {
  mode: 'create' | 'edit';
  defaultValues?: Partial<ProjectFormValues>;
  /** Shown above the form when editing, so it is obvious what is being changed. */
  subtitle?: string;
  onSubmit: (values: ProjectFormOutput) => Promise<{ name: string }>;
  cancelTo: string;
}

export function ProjectForm({ mode, defaultValues, subtitle, onSubmit, cancelTo }: Props) {
  const navigate = useNavigate();
  const customers = useCustomers();
  const projectTypes = useProjectTypes();
  const templates = useProjectTemplates();
  const salesPersons = useSalesPersons();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ProjectFormValues, unknown, ProjectFormOutput>({
    resolver: zodResolver(projectFormSchema),
    defaultValues: { status: 'Open', ...defaultValues },
  });

  const rootError = errors.root?.message;
  const denied = errors.root?.type === 'denied';

  const submit = handleSubmit(async (values) => {
    try {
      const created = await onSubmit(values);
      navigate(`/projects/${encodeURIComponent(created.name)}`);
    } catch (err) {
      const { message, kind } = describeSaveError(err);
      // Reported on the form rather than thrown, so the person keeps what they
      // typed. Losing a filled-in form to an error dialog is its own bug.
      setError('root', { type: kind, message });
    }
  });

  return (
    <form onSubmit={submit} className="max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">
          {mode === 'create' ? 'New project' : 'Edit project'}
        </h1>
        {subtitle && <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{subtitle}</p>}
      </div>

      {rootError && (
        <div
          role="alert"
          className={`mb-5 rounded-lg px-4 py-3 text-sm ${
            denied
              ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
              : 'bg-red-500/10 text-red-600 dark:text-red-400'
          }`}
        >
          {rootError}
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 rounded-lg p-5 grid gap-4 sm:grid-cols-2">
        <Field label="Project name" error={errors.project_name?.message} required span>
          <input {...register('project_name')} className={inputClass} autoFocus />
        </Field>

        <Field label="Client" error={errors.customer?.message} required>
          {/* A free-text list: an unknown name creates the Customer, which is
              how the old app behaved and how a studio actually works. */}
          <input {...register('customer')} list="customer-options" className={inputClass} />
          <datalist id="customer-options">
            {(customers.data ?? []).map((c) => (
              <option key={c.name} value={c.name}>
                {c.customer_name && c.customer_name !== c.name ? c.customer_name : ''}
              </option>
            ))}
          </datalist>
        </Field>

        <Field label="Status" error={errors.status?.message}>
          <select {...register('status')} className={inputClass}>
            {SELECTABLE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-400">
            &ldquo;Completed&rdquo; isn&apos;t offered — it&apos;s worked out from the checklist and
            whether everyone has been paid.
          </p>
        </Field>

        <Field label="Sanctioned amount" error={errors.sanctioned_amount?.message}>
          <input type="number" step="1" min="0" {...register('sanctioned_amount')} className={inputClass} />
        </Field>

        <Field label="Commission %" error={errors.commission_percent?.message}>
          <input
            type="number"
            step="0.1"
            min="0"
            max="100"
            {...register('commission_percent')}
            className={inputClass}
          />
        </Field>

        <Field label="Sales person (referred by)" error={errors.sales_person?.message}>
          <input {...register('sales_person')} list="sales-person-options" className={inputClass} />
          <datalist id="sales-person-options">
            {(salesPersons.data ?? []).map((s) => (
              <option key={s.name} value={s.name} />
            ))}
          </datalist>
        </Field>

        <Field label="Project type" error={errors.project_type?.message}>
          <input {...register('project_type')} list="project-type-options" className={inputClass} />
          <datalist id="project-type-options">
            {(projectTypes.data ?? []).map((t) => (
              <option key={t.name} value={t.name} />
            ))}
          </datalist>
        </Field>

        {mode === 'create' && (
          <Field label="Checklist template" error={errors.project_template?.message}>
            <select {...register('project_template')} className={inputClass}>
              <option value="">None</option>
              {(templates.data ?? []).map((t) => (
                <option key={t.name} value={t.name}>
                  {t.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-400">
              ERPNext copies the template&apos;s tasks onto the project when it&apos;s created. It
              can&apos;t be applied afterwards.
            </p>
          </Field>
        )}

        <Field label="Shoot / event date" error={errors.shoot_date?.message}>
          <input type="date" {...register('shoot_date')} className={inputClass} />
        </Field>

        <Field label="Expected start" error={errors.expected_start_date?.message}>
          <input type="date" {...register('expected_start_date')} className={inputClass} />
        </Field>

        <Field label="Expected end" error={errors.expected_end_date?.message}>
          <input type="date" {...register('expected_end_date')} className={inputClass} />
        </Field>

        <Field label="Brand" error={errors.brand?.message}>
          <input {...register('brand')} className={inputClass} />
        </Field>

        <Field label="Ad agency" error={errors.ad_agency?.message}>
          <input {...register('ad_agency')} className={inputClass} />
        </Field>

        <Field label="Production house" error={errors.production_house?.message}>
          <input {...register('production_house')} className={inputClass} />
        </Field>

        <Field label="Point of contact" error={errors.poc?.message}>
          <input {...register('poc')} className={inputClass} />
        </Field>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-md bg-violet-500 hover:bg-violet-600 disabled:opacity-60
                     disabled:cursor-not-allowed px-4 py-2 text-sm font-semibold text-white"
        >
          {isSubmitting
            ? mode === 'create'
              ? 'Creating…'
              : 'Saving…'
            : mode === 'create'
              ? 'Create project'
              : 'Save changes'}
        </button>
        <button
          type="button"
          onClick={() => navigate(cancelTo)}
          className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

const inputClass =
  'w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 ' +
  'px-3 py-2 text-sm text-gray-800 dark:text-gray-100 ' +
  'focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500';

function Field({
  label,
  error,
  required,
  span,
  children,
}: {
  label: string;
  error?: string;
  required?: boolean;
  span?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={span ? 'sm:col-span-2' : undefined}>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}
