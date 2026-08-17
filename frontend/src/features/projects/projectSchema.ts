import { z } from 'zod';

/**
 * The project form's rules.
 *
 * Deliberately mirrors `backend/src/schemas/project.ts`. The server still
 * validates everything — this is not a substitute for that, and must never
 * become one. What it buys is the difference between "the field goes red as
 * you leave it" and "you press Save, wait for a round trip, and get told".
 *
 * The two are checked against each other by an actual create in the browser,
 * not by a shared package: sharing types across a Worker and a Vite build
 * would mean a build step between them, which is a lot of machinery for
 * fifteen fields.
 */

/** Empty text inputs arrive as '' and mean "not set", not "empty string". */
const optionalText = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v === '' ? undefined : v));

/**
 * Money and percentages come out of `<input type="number">` as strings.
 * An empty field is *unset*, which is different from zero — and on a
 * sanctioned amount that difference decides whether the margin model has
 * anything to measure against.
 */
const optionalNumber = z
  .union([z.string(), z.number()])
  .optional()
  .transform((v) => (v === '' || v === undefined || v === null ? undefined : Number(v)))
  .refine((v) => v === undefined || Number.isFinite(v), 'Enter a number')
  .refine((v) => v === undefined || v >= 0, 'Cannot be negative');

export const projectFormSchema = z.object({
  project_name: z.string().trim().min(1, 'Give the project a name'),
  customer: z.string().trim().min(1, 'Choose a client'),
  status: z.string().optional(),
  expected_start_date: optionalText,
  expected_end_date: optionalText,
  project_type: optionalText,
  /** Only offered when creating: ERPNext copies its tasks in on insert. */
  project_template: optionalText,
  sales_person: optionalText,
  commission_percent: optionalNumber.refine(
    (v) => v === undefined || v <= 100,
    'Commission is a percentage, so it cannot exceed 100',
  ),
  sanctioned_amount: optionalNumber,
  brand: optionalText,
  ad_agency: optionalText,
  production_house: optionalText,
  poc: optionalText,
  shoot_date: optionalText,
});

export type ProjectFormValues = z.input<typeof projectFormSchema>;
export type ProjectFormOutput = z.output<typeof projectFormSchema>;

/**
 * Statuses a person may choose.
 *
 * "Completed" is absent on purpose. It is derived from the checklist and from
 * whether everyone has been paid — offering it here would let someone declare
 * a project finished while the client still owes money, and the server drops
 * it anyway. See the PUT handler in backend/src/routes/projects.ts.
 */
export const SELECTABLE_STATUSES = ['Open', 'Cancelled'] as const;
