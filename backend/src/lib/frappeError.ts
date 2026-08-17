/**
 * ERPNext validation errors (e.g. "task due date can't be after the project's
 * end date") arrive as an HTML-laced exception string buried in the response
 * body. A generic "ERPNext API error 417" is useless to whoever is adding a
 * task, so this digs out the real reason.
 *
 * Ported from `cleanErrorMessage` in `server/routes/tasks.js`. Two transforms,
 * in order:
 *   1. strip a leading exception class path — `frappe.exceptions.ValidationError: `
 *   2. strip HTML tags, which Frappe embeds in user-facing messages
 */
export function cleanFrappeError(err: unknown): string {
  const e = err as { data?: { exception?: string }; message?: string };
  const raw = e?.data?.exception || e?.message || '';

  const cleaned = String(raw)
    .replace(/^\w+(\.\w+)*:\s*/, '')
    .replace(/<[^>]*>/g, '')
    .trim();

  return cleaned || e?.message || 'Unknown ERPNext error';
}
