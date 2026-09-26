import type { FrappeClient, ListOptions } from './frappe';

/**
 * Surviving a customer's ERPNext not having a field we ask for.
 *
 * Every studio's site is a different shape. The custom fields CSDS added to
 * `Item` and `Project` exist nowhere else, and asking for one on a site that
 * lacks it is not a soft failure — Frappe rejects the **whole query** with
 * `DataError: Field not permitted in query: <name>`, so one absent column takes
 * a working page down entirely. That is how the Inventory page and one of the
 * insight cards broke the moment they were pointed at a plain ERPNext v15.
 *
 * The field list is not knowable in advance and reading `DocField` needs
 * permissions an ordinary studio user does not have. But the error **names the
 * field**, so the site can simply be asked: run the query, and if it comes back
 * naming a column, drop that column and run it again.
 *
 * ## The distinction that matters
 *
 * Dropping a field from `fields` is safe — a column we cannot read renders as
 * blank, and blank is true.
 *
 * Dropping it from `filters` is **not**. `equipment_status in ('In Repair',
 * 'In Maintenance')` is what narrows a list to broken gear; without it every
 * in-house item comes back and the caller reports all of it as out of service.
 * So a missing field used in a filter raises {@link SchemaGapError}, which the
 * caller has to answer deliberately — on this project always by saying the
 * figure is unavailable, never by computing one from data we do not have.
 *
 * Left alone, such a query simply keeps failing: the field goes out of
 * `fields`, ERPNext rejects it again for the filter, and the 417 surfaces
 * whole. That is what took `/api/insights` down and with it the three insight
 * cards that had nothing to do with equipment. The typed refusal exists so one
 * absent column costs one card rather than the endpoint.
 */

/** The site does not have a field the query genuinely depends on. */
export class SchemaGapError extends Error {
  readonly doctype: string;
  readonly field: string;

  constructor(doctype: string, field: string) {
    super(`${doctype} on this site has no field "${field}"`);
    this.name = 'SchemaGapError';
    this.doctype = doctype;
    this.field = field;
  }
}

const MISSING_FIELD = /Field not permitted in query:\s*([A-Za-z0-9_]+)/;

/**
 * The field name Frappe complained about, or null if this is some other error.
 *
 * Frappe puts it in `exception` on the response body. The stringified fallback
 * covers the shapes where it arrives under `_server_messages` or as the bare
 * message instead; the phrase is specific enough that a false positive would
 * have to be someone naming a field in prose.
 */
export function missingFieldFrom(err: unknown): string | null {
  const e = err as { details?: { exception?: unknown }; message?: string };

  const direct = e?.details?.exception;
  if (typeof direct === 'string') {
    const m = MISSING_FIELD.exec(direct);
    if (m?.[1]) return m[1];
  }

  const haystack = `${e?.message ?? ''} ${safeStringify(e?.details)}`;
  return MISSING_FIELD.exec(haystack)?.[1] ?? null;
}

function safeStringify(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
}

export interface TolerantList<T> {
  rows: T[];
  /**
   * Fields this site does not have.
   *
   * Non-empty means the rows are missing a column, **not** that the column is
   * empty. Callers that show the value must say so rather than render a
   * default.
   */
  missingFields: string[];
}

/** True if any filter is on this field, so dropping it would change the answer. */
function filtersOn(filters: unknown[][] | undefined, field: string): boolean {
  return (filters ?? []).some((f) => Array.isArray(f) && f[0] === field);
}

/**
 * `getList`, minus whichever of the requested fields this site does not have.
 *
 * Retries are bounded by the number of fields asked for: each round either
 * drops one or throws, so it cannot spin. If ERPNext names a field that was
 * never requested, the error is rethrown untouched — that is a real fault, and
 * quietly swallowing it would hide a genuine bug.
 */
export async function getListTolerant<T = Record<string, unknown>>(
  frappe: Pick<FrappeClient, 'getList'>,
  doctype: string,
  opts: ListOptions = {},
): Promise<TolerantList<T>> {
  let fields = [...(opts.fields ?? ['name'])];
  const missingFields: string[] = [];
  // Fixed before the loop: `fields` shrinks as fields are dropped, so reading
  // its length in the condition would cut the retries short.
  const maxAttempts = fields.length + 1;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return { rows: await frappe.getList<T>(doctype, { ...opts, fields }), missingFields };
    } catch (err) {
      const field = missingFieldFrom(err);
      if (!field) throw err;

      // Checked before the `fields` list, because a field used in both is
      // reported once and the filter is the half that changes the meaning.
      if (filtersOn(opts.filters, field)) throw new SchemaGapError(doctype, field);

      if (!fields.includes(field)) throw err;

      fields = fields.filter((f) => f !== field);
      missingFields.push(field);
    }
  }

  throw new Error(`Gave up resolving fields on ${doctype}`);
}
